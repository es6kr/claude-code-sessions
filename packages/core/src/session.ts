/**
 * Session management operations
 */
import { Effect, pipe, Array as A, Option as O } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir, folderNameToPath } from './paths.js'
import { extractTextContent, extractTitle, isInvalidApiKeyMessage, isContinuationSummary } from './utils.js'
import { findLinkedAgents, findOrphanAgents, deleteOrphanAgents } from './agents.js'
import { deleteLinkedTodos, sessionHasTodos, findOrphanTodos, deleteOrphanTodos } from './todos.js'
import type {
  Message,
  SessionMeta,
  Project,
  FileChange,
  SessionFilesSummary,
  DeleteSessionResult,
  RenameSessionResult,
  SplitSessionResult,
  MoveSessionResult,
  ClearSessionsResult,
  CleanupPreview,
  ContentItem,
  SearchResult,
} from './types.js'

// List all project directories
export const listProjects = Effect.gen(function* () {
  const sessionsDir = getSessionsDir()

  const exists = yield* Effect.tryPromise(() =>
    fs
      .access(sessionsDir)
      .then(() => true)
      .catch(() => false)
  )

  if (!exists) {
    return [] as Project[]
  }

  const entries = yield* Effect.tryPromise(() => fs.readdir(sessionsDir, { withFileTypes: true }))

  const projects = yield* Effect.all(
    entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((entry) =>
        Effect.gen(function* () {
          const projectPath = path.join(sessionsDir, entry.name)
          const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))
          // Exclude agent- files (subagent logs)
          const sessionFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))

          return {
            name: entry.name,
            displayName: folderNameToPath(entry.name),
            path: projectPath,
            sessionCount: sessionFiles.length,
          } satisfies Project
        })
      ),
    { concurrency: 10 }
  )

  return projects
})

// List sessions in a project
export const listSessions = (projectName: string) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))
    // Exclude agent- files (subagent logs)
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))

    const sessions = yield* Effect.all(
      sessionFiles.map((file) =>
        Effect.gen(function* () {
          const filePath = path.join(projectPath, file)
          const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
          const lines = content.trim().split('\n').filter(Boolean)
          const messages = lines.map((line) => JSON.parse(line) as Message)

          const sessionId = file.replace('.jsonl', '')

          // Filter only user/assistant messages for counting
          const userAssistantMessages = messages.filter(
            (m) => m.type === 'user' || m.type === 'assistant'
          )

          // Check if session has summary (for preserved sessions without user/assistant messages)
          const hasSummary = messages.some((m) => m.type === 'summary')

          const firstMessage = userAssistantMessages[0]
          const lastMessage = userAssistantMessages[userAssistantMessages.length - 1]

          // Extract title from first user message
          const title = pipe(
            messages,
            A.findFirst((m) => m.type === 'user'),
            O.map((m) => {
              const text = extractTextContent(m.message)
              return extractTitle(text)
            }),
            O.getOrElse(() => (hasSummary ? '[Summary Only]' : `Session ${sessionId.slice(0, 8)}`))
          )

          return {
            id: sessionId,
            projectName,
            title,
            // If session has summary but no user/assistant messages, count as 1
            messageCount:
              userAssistantMessages.length > 0 ? userAssistantMessages.length : hasSummary ? 1 : 0,
            createdAt: firstMessage?.timestamp,
            updatedAt: lastMessage?.timestamp,
          } satisfies SessionMeta
        })
      ),
      { concurrency: 10 }
    )

    // Sort by newest first
    return sessions.sort((a, b) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return dateB - dateA
    })
  })

// Read session messages
export const readSession = (projectName: string, sessionId: string) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    return lines.map((line) => JSON.parse(line) as Message)
  })

// Delete a message from session and repair parentUuid chain
export const deleteMessage = (projectName: string, sessionId: string, messageUuid: string) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = lines.map((line) => JSON.parse(line) as Record<string, unknown>)

    // Find by uuid or messageId (for file-history-snapshot type)
    const targetIndex = messages.findIndex(
      (m) => m.uuid === messageUuid || m.messageId === messageUuid
    )
    if (targetIndex === -1) {
      return { success: false, error: 'Message not found' }
    }

    // Get the deleted message's uuid and parentUuid
    const deletedMsg = messages[targetIndex]
    const deletedUuid = deletedMsg?.uuid ?? deletedMsg?.messageId
    const parentUuid = deletedMsg?.parentUuid

    // Find all messages that reference the deleted message as their parent
    // and update them to point to the deleted message's parent
    for (const msg of messages) {
      if (msg.parentUuid === deletedUuid) {
        msg.parentUuid = parentUuid
      }
    }

    // Remove the message
    messages.splice(targetIndex, 1)

    const newContent = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))

    return { success: true }
  })

// Delete a session and its linked agent/todo files
export const deleteSession = (projectName: string, sessionId: string) =>
  Effect.gen(function* () {
    const sessionsDir = getSessionsDir()
    const projectPath = path.join(sessionsDir, projectName)
    const filePath = path.join(projectPath, `${sessionId}.jsonl`)

    // Find linked agents first (before any deletion)
    const linkedAgents = yield* findLinkedAgents(projectName, sessionId)

    // Check file size - if empty (0 bytes), just delete without backup
    const stat = yield* Effect.tryPromise(() => fs.stat(filePath))
    if (stat.size === 0) {
      yield* Effect.tryPromise(() => fs.unlink(filePath))
      // Still delete linked agents and todos for empty sessions
      const agentBackupDir = path.join(projectPath, '.bak')
      yield* Effect.tryPromise(() => fs.mkdir(agentBackupDir, { recursive: true }))
      for (const agentId of linkedAgents) {
        const agentPath = path.join(projectPath, `${agentId}.jsonl`)
        const agentBackupPath = path.join(agentBackupDir, `${agentId}.jsonl`)
        yield* Effect.tryPromise(() => fs.rename(agentPath, agentBackupPath).catch(() => {}))
      }
      yield* deleteLinkedTodos(sessionId, linkedAgents)
      return { success: true, deletedAgents: linkedAgents.length } satisfies DeleteSessionResult
    }

    // Create backup directory
    const backupDir = path.join(sessionsDir, '.bak')
    yield* Effect.tryPromise(() => fs.mkdir(backupDir, { recursive: true }))

    // Delete linked agent files (move to .bak in project folder)
    const agentBackupDir = path.join(projectPath, '.bak')
    yield* Effect.tryPromise(() => fs.mkdir(agentBackupDir, { recursive: true }))
    for (const agentId of linkedAgents) {
      const agentPath = path.join(projectPath, `${agentId}.jsonl`)
      const agentBackupPath = path.join(agentBackupDir, `${agentId}.jsonl`)
      yield* Effect.tryPromise(() => fs.rename(agentPath, agentBackupPath).catch(() => {}))
    }

    // Delete linked todo files
    const todosResult = yield* deleteLinkedTodos(sessionId, linkedAgents)

    // Move session to backup (format: project_name_session_id.jsonl)
    const backupPath = path.join(backupDir, `${projectName}_${sessionId}.jsonl`)
    yield* Effect.tryPromise(() => fs.rename(filePath, backupPath))

    return {
      success: true,
      backupPath,
      deletedAgents: linkedAgents.length,
      deletedTodos: todosResult.deletedCount,
    } satisfies DeleteSessionResult
  })

// Rename session by adding title prefix
export const renameSession = (projectName: string, sessionId: string, newTitle: string) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)

    if (lines.length === 0) {
      return { success: false, error: 'Empty session' } satisfies RenameSessionResult
    }

    const messages = lines.map((line) => JSON.parse(line) as Message)

    // Find first user message
    const firstUserIdx = messages.findIndex((m) => m.type === 'user')
    if (firstUserIdx === -1) {
      return { success: false, error: 'No user message found' } satisfies RenameSessionResult
    }

    const firstMsg = messages[firstUserIdx]
    if (firstMsg?.message?.content && Array.isArray(firstMsg.message.content)) {
      // Find first non-IDE text content
      const textIdx = firstMsg.message.content.findIndex(
        (item): item is ContentItem =>
          typeof item === 'object' &&
          item?.type === 'text' &&
          !item.text?.trim().startsWith('<ide_')
      )

      if (textIdx >= 0) {
        const item = firstMsg.message.content[textIdx] as ContentItem
        const oldText = item.text ?? ''
        // Remove existing title pattern (first line ending with \n\n)
        const cleanedText = oldText.replace(/^[^\n]+\n\n/, '')
        item.text = `${newTitle}\n\n${cleanedText}`
      }
    }

    const newContent = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))

    return { success: true } satisfies RenameSessionResult
  })

// Get files changed in a session (from file-history-snapshot and tool_use)
export const getSessionFiles = (projectName: string, sessionId: string) =>
  Effect.gen(function* () {
    const messages = yield* readSession(projectName, sessionId)
    const fileChanges: FileChange[] = []
    const seenFiles = new Set<string>()

    for (const msg of messages) {
      // Check file-history-snapshot type
      if (msg.type === 'file-history-snapshot') {
        const snapshot = msg as unknown as {
          type: string
          messageId?: string
          snapshot?: {
            trackedFileBackups?: Record<string, unknown>
            timestamp?: string
          }
        }
        const backups = snapshot.snapshot?.trackedFileBackups
        if (backups && typeof backups === 'object') {
          for (const filePath of Object.keys(backups)) {
            if (!seenFiles.has(filePath)) {
              seenFiles.add(filePath)
              fileChanges.push({
                path: filePath,
                action: 'modified',
                timestamp: snapshot.snapshot?.timestamp,
                messageUuid: snapshot.messageId ?? msg.uuid,
              })
            }
          }
        }
      }

      // Check tool_use for Write/Edit operations
      if (msg.type === 'assistant' && msg.message?.content) {
        const content = msg.message.content
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item && typeof item === 'object' && 'type' in item && item.type === 'tool_use') {
              const toolUse = item as { name?: string; input?: { file_path?: string } }
              if (
                (toolUse.name === 'Write' || toolUse.name === 'Edit') &&
                toolUse.input?.file_path
              ) {
                const filePath = toolUse.input.file_path
                if (!seenFiles.has(filePath)) {
                  seenFiles.add(filePath)
                  fileChanges.push({
                    path: filePath,
                    action: toolUse.name === 'Write' ? 'created' : 'modified',
                    timestamp: msg.timestamp,
                    messageUuid: msg.uuid,
                  })
                }
              }
            }
          }
        }
      }
    }

    return {
      sessionId,
      projectName,
      files: fileChanges,
      totalChanges: fileChanges.length,
    } satisfies SessionFilesSummary
  })

// Move session to another project
export const moveSession = (
  sourceProject: string,
  sessionId: string,
  targetProject: string
): Effect.Effect<MoveSessionResult, Error> =>
  Effect.gen(function* () {
    const sessionsDir = getSessionsDir()
    const sourcePath = path.join(sessionsDir, sourceProject)
    const targetPath = path.join(sessionsDir, targetProject)

    const sourceFile = path.join(sourcePath, `${sessionId}.jsonl`)
    const targetFile = path.join(targetPath, `${sessionId}.jsonl`)

    // Check source file exists
    const sourceExists = yield* Effect.tryPromise(() =>
      fs
        .access(sourceFile)
        .then(() => true)
        .catch(() => false)
    )

    if (!sourceExists) {
      return { success: false, error: 'Source session not found' }
    }

    // Check target file does not exist
    const targetExists = yield* Effect.tryPromise(() =>
      fs
        .access(targetFile)
        .then(() => true)
        .catch(() => false)
    )

    if (targetExists) {
      return { success: false, error: 'Session already exists in target project' }
    }

    // Create target directory if needed
    yield* Effect.tryPromise(() => fs.mkdir(targetPath, { recursive: true }))

    // Find linked agents before moving
    const linkedAgents = yield* findLinkedAgents(sourceProject, sessionId)

    // Move session file
    yield* Effect.tryPromise(() => fs.rename(sourceFile, targetFile))

    // Move linked agent files
    for (const agentId of linkedAgents) {
      const sourceAgentFile = path.join(sourcePath, `${agentId}.jsonl`)
      const targetAgentFile = path.join(targetPath, `${agentId}.jsonl`)

      const agentExists = yield* Effect.tryPromise(() =>
        fs
          .access(sourceAgentFile)
          .then(() => true)
          .catch(() => false)
      )

      if (agentExists) {
        yield* Effect.tryPromise(() => fs.rename(sourceAgentFile, targetAgentFile))
      }
    }

    return { success: true }
  })

// Split session at a specific message
export const splitSession = (projectName: string, sessionId: string, splitAtMessageUuid: string) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    const filePath = path.join(projectPath, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)

    // Parse all messages preserving their full structure
    const allMessages = lines.map((line) => JSON.parse(line) as Record<string, unknown>)

    // Find the split point
    const splitIndex = allMessages.findIndex((m) => m.uuid === splitAtMessageUuid)
    if (splitIndex === -1) {
      return { success: false, error: 'Message not found' } satisfies SplitSessionResult
    }

    if (splitIndex === 0) {
      return { success: false, error: 'Cannot split at first message' } satisfies SplitSessionResult
    }

    // Generate new session ID
    const newSessionId = crypto.randomUUID()

    // Check if the split message is a continuation summary
    const splitMessage = allMessages[splitIndex]
    const shouldDuplicate = isContinuationSummary(splitMessage)

    // Split messages - if continuation summary, include it in both sessions
    let remainingMessages: Record<string, unknown>[]
    const movedMessages = allMessages.slice(splitIndex)

    if (shouldDuplicate) {
      // Create a copy of the continuation message with new UUID for the original session
      const duplicatedMessage: Record<string, unknown> = {
        ...splitMessage,
        uuid: crypto.randomUUID(),
        sessionId: sessionId, // Keep original session ID
      }
      remainingMessages = [...allMessages.slice(0, splitIndex), duplicatedMessage]
    } else {
      remainingMessages = allMessages.slice(0, splitIndex)
    }

    // Update moved messages with new sessionId and fix first message's parentUuid
    const updatedMovedMessages = movedMessages.map((msg, index) => {
      const updated: Record<string, unknown> = { ...msg, sessionId: newSessionId }
      if (index === 0) {
        // First message of new session should have no parent
        updated.parentUuid = null
      }
      return updated
    })

    // Write remaining messages to original file
    const remainingContent = remainingMessages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(filePath, remainingContent, 'utf-8'))

    // Write moved messages to new session file
    const newFilePath = path.join(projectPath, `${newSessionId}.jsonl`)
    const newContent = updatedMovedMessages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(newFilePath, newContent, 'utf-8'))

    // Update linked agent files that reference the old sessionId
    const agentFiles = yield* Effect.tryPromise(() => fs.readdir(projectPath))
    const agentJsonlFiles = agentFiles.filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'))

    for (const agentFile of agentJsonlFiles) {
      const agentPath = path.join(projectPath, agentFile)
      const agentContent = yield* Effect.tryPromise(() => fs.readFile(agentPath, 'utf-8'))
      const agentLines = agentContent.trim().split('\n').filter(Boolean)

      if (agentLines.length === 0) continue

      const firstAgentMsg = JSON.parse(agentLines[0]) as { sessionId?: string }

      // If this agent belongs to the original session, check if it should be moved
      if (firstAgentMsg.sessionId === sessionId) {
        // Check if any message in moved messages is related to this agent
        const agentId = agentFile.replace('agent-', '').replace('.jsonl', '')
        const isRelatedToMoved = movedMessages.some(
          (msg) => (msg as { agentId?: string }).agentId === agentId
        )

        if (isRelatedToMoved) {
          // Update all messages in this agent file to reference new sessionId
          const updatedAgentMessages = agentLines.map((line) => {
            const msg = JSON.parse(line) as Record<string, unknown>
            return JSON.stringify({ ...msg, sessionId: newSessionId })
          })
          const updatedAgentContent = updatedAgentMessages.join('\n') + '\n'
          yield* Effect.tryPromise(() => fs.writeFile(agentPath, updatedAgentContent, 'utf-8'))
        }
      }
    }

    return {
      success: true,
      newSessionId,
      newSessionPath: newFilePath,
      movedMessageCount: movedMessages.length,
      duplicatedSummary: shouldDuplicate,
    } satisfies SplitSessionResult
  })

// Remove invalid API key messages from a session, returns remaining message count
const cleanInvalidMessages = (projectName: string, sessionId: string) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)

    if (lines.length === 0) return { removedCount: 0, remainingCount: 0 }

    const messages = lines.map((line) => JSON.parse(line) as Message)
    const invalidIndices: number[] = []

    // Find all invalid API key messages
    messages.forEach((msg, idx) => {
      if (isInvalidApiKeyMessage(msg)) {
        invalidIndices.push(idx)
      }
    })

    if (invalidIndices.length === 0) {
      const userAssistantCount = messages.filter(
        (m) => m.type === 'user' || m.type === 'assistant'
      ).length
      const hasSummary = messages.some((m) => m.type === 'summary')
      // Count summary-only sessions as having 1 message
      const remainingCount = userAssistantCount > 0 ? userAssistantCount : hasSummary ? 1 : 0
      return { removedCount: 0, remainingCount }
    }

    // Remove invalid messages and fix parentUuid chain
    const filtered: Message[] = []
    let lastValidUuid: string | null = null

    for (let i = 0; i < messages.length; i++) {
      if (invalidIndices.includes(i)) {
        continue // Skip invalid message
      }

      const msg = messages[i]
      // Update parentUuid to point to last valid message
      if (msg.parentUuid && invalidIndices.some((idx) => messages[idx]?.uuid === msg.parentUuid)) {
        msg.parentUuid = lastValidUuid
      }
      filtered.push(msg)
      lastValidUuid = msg.uuid
    }

    const newContent =
      filtered.length > 0 ? filtered.map((m) => JSON.stringify(m)).join('\n') + '\n' : ''

    yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))

    const remainingUserAssistant = filtered.filter(
      (m) => m.type === 'user' || m.type === 'assistant'
    ).length
    const hasSummary = filtered.some((m) => m.type === 'summary')
    // Count summary-only sessions as having 1 message
    const remainingCount = remainingUserAssistant > 0 ? remainingUserAssistant : hasSummary ? 1 : 0
    return { removedCount: invalidIndices.length, remainingCount }
  })

// Preview cleanup - find empty and invalid sessions
export const previewCleanup = (projectName?: string) =>
  Effect.gen(function* () {
    const projects = yield* listProjects
    const targetProjects = projectName ? projects.filter((p) => p.name === projectName) : projects

    // Get orphan todos count (global, not per-project)
    const orphanTodos = yield* findOrphanTodos()
    const orphanTodoCount = orphanTodos.length

    const results = yield* Effect.all(
      targetProjects.map((project) =>
        Effect.gen(function* () {
          const sessions = yield* listSessions(project.name)
          const emptySessions = sessions.filter((s) => s.messageCount === 0)
          const invalidSessions = sessions.filter(
            (s) => s.title?.includes('Invalid API key') || s.title?.includes('API key')
          )

          // Count empty sessions that have todos
          let emptyWithTodosCount = 0
          for (const session of emptySessions) {
            const linkedAgents = yield* findLinkedAgents(project.name, session.id)
            const hasTodos = yield* sessionHasTodos(session.id, linkedAgents)
            if (hasTodos) {
              emptyWithTodosCount++
            }
          }

          // Count orphan agents
          const orphanAgents = yield* findOrphanAgents(project.name)

          return {
            project: project.name,
            emptySessions,
            invalidSessions,
            emptyWithTodosCount,
            orphanAgentCount: orphanAgents.length,
            orphanTodoCount: 0, // Will set for first project only
          } satisfies CleanupPreview
        })
      ),
      { concurrency: 5 }
    )

    // Add orphanTodoCount only to the first result to avoid double counting
    if (results.length > 0) {
      results[0] = { ...results[0], orphanTodoCount }
    }

    return results
  })

// Clear sessions
export const clearSessions = (options: {
  projectName?: string
  clearEmpty?: boolean
  clearInvalid?: boolean
  skipWithTodos?: boolean
  clearOrphanAgents?: boolean
  clearOrphanTodos?: boolean
}) =>
  Effect.gen(function* () {
    const {
      projectName,
      clearEmpty = true,
      clearInvalid = true,
      skipWithTodos = true,
      clearOrphanAgents = false,
      clearOrphanTodos = false,
    } = options
    const projects = yield* listProjects
    const targetProjects = projectName ? projects.filter((p) => p.name === projectName) : projects

    let deletedSessionCount = 0
    let removedMessageCount = 0
    let deletedOrphanAgentCount = 0
    let deletedOrphanTodoCount = 0
    const sessionsToDelete: { project: string; sessionId: string }[] = []

    // Step 1: Clean invalid API key messages from all sessions (if clearInvalid)
    if (clearInvalid) {
      for (const project of targetProjects) {
        const projectPath = path.join(getSessionsDir(), project.name)
        const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))
        const sessionFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))

        for (const file of sessionFiles) {
          const sessionId = file.replace('.jsonl', '')
          const result = yield* cleanInvalidMessages(project.name, sessionId)
          removedMessageCount += result.removedCount

          // Mark for deletion if now empty
          if (result.remainingCount === 0) {
            sessionsToDelete.push({ project: project.name, sessionId })
          }
        }
      }
    }

    // Step 2: Also find originally empty sessions (if clearEmpty is true)
    if (clearEmpty) {
      for (const project of targetProjects) {
        const sessions = yield* listSessions(project.name)
        for (const session of sessions) {
          if (session.messageCount === 0) {
            const alreadyMarked = sessionsToDelete.some(
              (s) => s.project === project.name && s.sessionId === session.id
            )
            if (!alreadyMarked) {
              // Skip sessions with todos if skipWithTodos is true
              if (skipWithTodos) {
                const linkedAgents = yield* findLinkedAgents(project.name, session.id)
                const hasTodos = yield* sessionHasTodos(session.id, linkedAgents)
                if (hasTodos) continue
              }
              sessionsToDelete.push({ project: project.name, sessionId: session.id })
            }
          }
        }
      }
    }

    // Step 3: Delete all empty sessions (this also deletes linked agents and todos)
    for (const { project, sessionId } of sessionsToDelete) {
      yield* deleteSession(project, sessionId)
      deletedSessionCount++
    }

    // Step 4: Delete orphan agents if requested
    if (clearOrphanAgents) {
      for (const project of targetProjects) {
        const result = yield* deleteOrphanAgents(project.name)
        deletedOrphanAgentCount += result.count
      }
    }

    // Step 5: Delete orphan todos if requested (global, not per-project)
    if (clearOrphanTodos) {
      const result = yield* deleteOrphanTodos()
      deletedOrphanTodoCount = result.deletedCount
    }

    return {
      success: true,
      deletedCount: deletedSessionCount,
      removedMessageCount,
      deletedOrphanAgentCount,
      deletedOrphanTodoCount,
    } satisfies ClearSessionsResult
  })

// Search sessions - two-phase: title search (fast) then content search (slow)
export const searchSessions = (
  query: string,
  options: { projectName?: string; searchContent?: boolean } = {}
) =>
  Effect.gen(function* () {
    const { projectName, searchContent = false } = options
    const results: SearchResult[] = []
    const queryLower = query.toLowerCase()

    const projects = yield* listProjects
    const targetProjects = projectName ? projects.filter((p) => p.name === projectName) : projects

    // Phase 1: Title search (fast)
    for (const project of targetProjects) {
      const sessions = yield* listSessions(project.name)

      for (const session of sessions) {
        const titleLower = (session.title ?? '').toLowerCase()
        if (titleLower.includes(queryLower)) {
          results.push({
            sessionId: session.id,
            projectName: project.name,
            title: session.title ?? 'Untitled',
            matchType: 'title',
            timestamp: session.updatedAt,
          })
        }
      }
    }

    // Phase 2: Content search (slow, optional)
    if (searchContent) {
      for (const project of targetProjects) {
        const projectPath = path.join(getSessionsDir(), project.name)
        const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))
        const sessionFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))

        for (const file of sessionFiles) {
          const sessionId = file.replace('.jsonl', '')

          // Skip if already found in title search
          if (results.some((r) => r.sessionId === sessionId && r.projectName === project.name)) {
            continue
          }

          const filePath = path.join(projectPath, file)
          const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
          const lines = content.trim().split('\n').filter(Boolean)

          for (const line of lines) {
            try {
              const msg = JSON.parse(line) as Message
              if (msg.type !== 'user' && msg.type !== 'assistant') continue

              const text = extractTextContent(msg.message)
              const textLower = text.toLowerCase()

              if (textLower.includes(queryLower)) {
                // Extract snippet around match
                const matchIndex = textLower.indexOf(queryLower)
                const start = Math.max(0, matchIndex - 50)
                const end = Math.min(text.length, matchIndex + query.length + 50)
                const snippet =
                  (start > 0 ? '...' : '') +
                  text.slice(start, end).trim() +
                  (end < text.length ? '...' : '')

                results.push({
                  sessionId,
                  projectName: project.name,
                  title: extractTitle(extractTextContent(msg.message)) || `Session ${sessionId.slice(0, 8)}`,
                  matchType: 'content',
                  snippet,
                  messageUuid: msg.uuid,
                  timestamp: msg.timestamp,
                })
                break // One match per session is enough
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    }

    // Sort by timestamp (newest first)
    return results.sort((a, b) => {
      const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return dateB - dateA
    })
  })
