/**
 * Session management operations
 */
import { Effect, pipe, Array as A, Option as O } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir, folderNameToPath } from './paths.js'
import {
  extractTextContent,
  extractTitle,
  isInvalidApiKeyMessage,
  isContinuationSummary,
  cleanupSplitFirstMessage,
  isErrorSessionTitle,
} from './utils.js'
import { findLinkedAgents, findOrphanAgents, deleteOrphanAgents } from './agents.js'
import {
  findLinkedTodos,
  deleteLinkedTodos,
  sessionHasTodos,
  findOrphanTodos,
  deleteOrphanTodos,
} from './todos.js'
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
  SearchResult,
  SessionTreeData,
  SummaryInfo,
  AgentInfo,
  ProjectTreeData,
  JsonlRecord,
  SessionAnalysis,
  CompressSessionOptions,
  CompressSessionResult,
  ProjectKnowledge,
  ConversationLine,
  SummarizeSessionOptions,
  SummarizeSessionResult,
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

    // Find by uuid, messageId (for file-history-snapshot type), or leafUuid (for summary type)
    const targetIndex = messages.findIndex(
      (m) => m.uuid === messageUuid || m.messageId === messageUuid || m.leafUuid === messageUuid
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

    return { success: true, deletedMessage: deletedMsg }
  })

// Restore a deleted message at a specific index
export const restoreMessage = (
  projectName: string,
  sessionId: string,
  message: Record<string, unknown>,
  index: number
) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = lines.map((line) => JSON.parse(line) as Record<string, unknown>)

    const msgUuid = message.uuid ?? message.messageId
    if (!msgUuid) {
      return { success: false, error: 'Message has no uuid or messageId' }
    }

    // Find the message that currently has parentUuid pointing to restored message's parent
    // and update it to point to the restored message instead
    const restoredParentUuid = message.parentUuid as string | undefined
    for (const msg of messages) {
      if (msg.parentUuid === restoredParentUuid) {
        // This message was previously pointing to the deleted message's parent
        // Now it should point to the restored message
        msg.parentUuid = msgUuid
        break // Only one message should be affected
      }
    }

    // Insert message at the specified index (or at end if index is out of bounds)
    const insertIndex = Math.min(index, messages.length)
    messages.splice(insertIndex, 0, message)

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

// Rename session by updating custom-title and first summary
// custom-title is stored in this session file
// summary is stored in OTHER session files (where leafUuid points to this session's messages)
export const renameSession = (projectName: string, sessionId: string, newTitle: string) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    const filePath = path.join(projectPath, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)

    if (lines.length === 0) {
      return { success: false, error: 'Empty session' } satisfies RenameSessionResult
    }

    const messages = lines.map((line) => JSON.parse(line) as Record<string, unknown>)

    // Build uuid set for this session's messages
    const sessionUuids = new Set<string>()
    for (const msg of messages) {
      if (msg.uuid && typeof msg.uuid === 'string') {
        sessionUuids.add(msg.uuid)
      }
    }

    // Update or add custom-title in this session file
    const customTitleIdx = messages.findIndex((m) => m.type === 'custom-title')
    const customTitleRecord = {
      type: 'custom-title',
      customTitle: newTitle,
      sessionId,
    }
    if (customTitleIdx >= 0) {
      messages[customTitleIdx] = customTitleRecord
    } else {
      messages.unshift(customTitleRecord)
    }

    const newContent = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))

    // Find and update first summary in OTHER session files
    // Summary's leafUuid points to a message in THIS session
    const projectFiles = yield* Effect.tryPromise(() => fs.readdir(projectPath))
    const allJsonlFiles = projectFiles.filter((f) => f.endsWith('.jsonl'))

    // Collect all summaries targeting this session with their file info
    const summariesTargetingThis: {
      file: string
      idx: number
      timestamp?: string
    }[] = []

    for (const file of allJsonlFiles) {
      const otherFilePath = path.join(projectPath, file)
      try {
        const otherContent = yield* Effect.tryPromise(() => fs.readFile(otherFilePath, 'utf-8'))
        const otherLines = otherContent.trim().split('\n').filter(Boolean)
        const otherMessages = otherLines.map((l) => JSON.parse(l) as Record<string, unknown>)

        for (let i = 0; i < otherMessages.length; i++) {
          const msg = otherMessages[i]
          if (
            msg.type === 'summary' &&
            typeof msg.leafUuid === 'string' &&
            sessionUuids.has(msg.leafUuid)
          ) {
            // Find target message timestamp
            const targetMsg = messages.find((m) => m.uuid === msg.leafUuid)
            summariesTargetingThis.push({
              file,
              idx: i,
              timestamp: (targetMsg?.timestamp as string) ?? (msg.timestamp as string | undefined),
            })
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    if (summariesTargetingThis.length > 0) {
      // Sort by timestamp ascending (oldest first), update the first one
      summariesTargetingThis.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''))
      const firstSummary = summariesTargetingThis[0]

      const summaryFilePath = path.join(projectPath, firstSummary.file)
      const summaryContent = yield* Effect.tryPromise(() => fs.readFile(summaryFilePath, 'utf-8'))
      const summaryLines = summaryContent.trim().split('\n').filter(Boolean)
      const summaryMessages = summaryLines.map((l) => JSON.parse(l) as Record<string, unknown>)

      summaryMessages[firstSummary.idx] = {
        ...summaryMessages[firstSummary.idx],
        summary: newTitle,
      }

      const newSummaryContent = summaryMessages.map((m) => JSON.stringify(m)).join('\n') + '\n'
      yield* Effect.tryPromise(() => fs.writeFile(summaryFilePath, newSummaryContent, 'utf-8'))
    } else {
      // No summary exists - use legacy method: add title prefix to first user message content
      // This is recognized by Claude Code extension
      const currentContent = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
      const currentLines = currentContent.trim().split('\n').filter(Boolean)
      const currentMessages = currentLines.map((l) => JSON.parse(l) as Record<string, unknown>)

      const firstUserIdx = currentMessages.findIndex((m) => m.type === 'user')
      if (firstUserIdx >= 0) {
        const firstMsg = currentMessages[firstUserIdx] as JsonlRecord
        const msgPayload = firstMsg.message as { content?: unknown } | undefined
        if (msgPayload?.content && Array.isArray(msgPayload.content)) {
          // Find first non-IDE text content
          const textIdx = (msgPayload.content as Array<{ type?: string; text?: string }>).findIndex(
            (item) =>
              typeof item === 'object' &&
              item?.type === 'text' &&
              !item.text?.trim().startsWith('<ide_')
          )

          if (textIdx >= 0) {
            const item = (msgPayload.content as Array<{ type?: string; text?: string }>)[textIdx]
            const oldText = item.text ?? ''
            // Remove existing title pattern (first line ending with \n\n)
            const cleanedText = oldText.replace(/^[^\n]+\n\n/, '')
            item.text = `${newTitle}\n\n${cleanedText}`

            const updatedContent = currentMessages.map((m) => JSON.stringify(m)).join('\n') + '\n'
            yield* Effect.tryPromise(() => fs.writeFile(filePath, updatedContent, 'utf-8'))
          }
        }
      }
    }

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

// Analyze session for optimization insights
export const analyzeSession = (projectName: string, sessionId: string) =>
  Effect.gen(function* () {
    const messages = yield* readSession(projectName, sessionId)

    // Initialize counters
    let userMessages = 0
    let assistantMessages = 0
    let summaryCount = 0
    let snapshotCount = 0
    const toolUsageMap = new Map<string, { count: number; errorCount: number }>()
    const filesChanged = new Set<string>()
    const patterns: { type: string; description: string; count: number }[] = []
    const milestones: { timestamp?: string; description: string; messageUuid?: string }[] = []

    // Track timestamps for duration
    let firstTimestamp: string | undefined
    let lastTimestamp: string | undefined

    for (const msg of messages) {
      // Track timestamps
      if (msg.timestamp) {
        if (!firstTimestamp) firstTimestamp = msg.timestamp
        lastTimestamp = msg.timestamp
      }

      // Count message types
      if (msg.type === 'user') {
        userMessages++
        // Check for milestone indicators in user messages
        const content = typeof msg.content === 'string' ? msg.content : ''
        if (content.toLowerCase().includes('commit') || content.toLowerCase().includes('완료')) {
          milestones.push({
            timestamp: msg.timestamp,
            description: `User checkpoint: ${content.slice(0, 50)}...`,
            messageUuid: msg.uuid,
          })
        }
      } else if (msg.type === 'assistant') {
        assistantMessages++

        // Track tool usage
        if (msg.message?.content && Array.isArray(msg.message.content)) {
          for (const item of msg.message.content) {
            if (item && typeof item === 'object' && 'type' in item && item.type === 'tool_use') {
              const toolUse = item as { name?: string; input?: { file_path?: string } }
              const toolName = toolUse.name ?? 'unknown'
              const existing = toolUsageMap.get(toolName) ?? { count: 0, errorCount: 0 }
              existing.count++
              toolUsageMap.set(toolName, existing)

              // Track file changes
              if ((toolName === 'Write' || toolName === 'Edit') && toolUse.input?.file_path) {
                filesChanged.add(toolUse.input.file_path)
              }
            }
          }
        }
      } else if (msg.type === 'summary') {
        summaryCount++
        // Extract milestone from summary
        if (msg.summary) {
          milestones.push({
            timestamp: msg.timestamp,
            description: `Summary: ${msg.summary.slice(0, 100)}...`,
            messageUuid: msg.uuid,
          })
        }
      } else if (msg.type === 'file-history-snapshot') {
        snapshotCount++
        // Track files from snapshots
        const snapshot = msg as unknown as {
          snapshot?: { trackedFileBackups?: Record<string, unknown> }
        }
        if (snapshot.snapshot?.trackedFileBackups) {
          for (const filePath of Object.keys(snapshot.snapshot.trackedFileBackups)) {
            filesChanged.add(filePath)
          }
        }
      }
    }

    // Track tool errors from tool_result messages
    for (const msg of messages) {
      if (msg.type === 'user' && msg.content && Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (
            item &&
            typeof item === 'object' &&
            'type' in item &&
            item.type === 'tool_result' &&
            'is_error' in item &&
            item.is_error
          ) {
            // Find the corresponding tool_use to get the tool name
            const toolResultItem = item as { tool_use_id?: string }
            const toolUseId = toolResultItem.tool_use_id
            if (toolUseId) {
              // Search for the tool_use with this ID
              for (const prevMsg of messages) {
                if (prevMsg.message?.content && Array.isArray(prevMsg.message.content)) {
                  for (const prevItem of prevMsg.message.content) {
                    if (
                      prevItem &&
                      typeof prevItem === 'object' &&
                      'type' in prevItem &&
                      prevItem.type === 'tool_use' &&
                      'id' in prevItem &&
                      prevItem.id === toolUseId
                    ) {
                      const toolName = (prevItem as { name?: string }).name ?? 'unknown'
                      const existing = toolUsageMap.get(toolName)
                      if (existing) {
                        existing.errorCount++
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Calculate duration
    let durationMinutes = 0
    if (firstTimestamp && lastTimestamp) {
      const first = new Date(firstTimestamp).getTime()
      const last = new Date(lastTimestamp).getTime()
      durationMinutes = Math.round((last - first) / 1000 / 60)
    }

    // Detect patterns
    const toolUsageArray = Array.from(toolUsageMap.entries()).map(([name, stats]) => ({
      name,
      count: stats.count,
      errorCount: stats.errorCount,
    }))

    // Pattern: High error rate
    for (const tool of toolUsageArray) {
      if (tool.count >= 3 && tool.errorCount / tool.count > 0.3) {
        patterns.push({
          type: 'high_error_rate',
          description: `${tool.name} had ${tool.errorCount}/${tool.count} errors (${Math.round((tool.errorCount / tool.count) * 100)}%)`,
          count: tool.errorCount,
        })
      }
    }

    // Pattern: Many snapshots (potential for compression)
    if (snapshotCount > 10) {
      patterns.push({
        type: 'many_snapshots',
        description: `${snapshotCount} file-history-snapshots could be compressed`,
        count: snapshotCount,
      })
    }

    return {
      sessionId,
      projectName,
      durationMinutes,
      stats: {
        totalMessages: messages.length,
        userMessages,
        assistantMessages,
        summaryCount,
        snapshotCount,
      },
      toolUsage: toolUsageArray.sort((a, b) => b.count - a.count),
      filesChanged: Array.from(filesChanged),
      patterns,
      milestones,
    } satisfies SessionAnalysis
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
// Original session keeps the ID and contains messages FROM splitAtMessageUuid onwards (newer messages)
// New session gets a new ID and contains messages BEFORE splitAtMessageUuid (older messages)
export const splitSession = (projectName: string, sessionId: string, splitAtMessageUuid: string) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    const filePath = path.join(projectPath, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)

    // Parse all messages preserving their full structure
    const allMessages = lines.map((line) => JSON.parse(line) as Message)

    // Find the split point
    const splitIndex = allMessages.findIndex((m) => m.uuid === splitAtMessageUuid)
    if (splitIndex === -1) {
      return { success: false, error: 'Message not found' } satisfies SplitSessionResult
    }

    if (splitIndex === 0) {
      return { success: false, error: 'Cannot split at first message' } satisfies SplitSessionResult
    }

    // Generate new session ID for the OLD messages (before split point)
    const newSessionId = crypto.randomUUID()

    // Find all summary messages and get the last (most recent) one
    const summaryMessages = allMessages.filter((m) => m.type === 'summary')
    const summaryMessage =
      summaryMessages.length > 0 ? summaryMessages[summaryMessages.length - 1] : null

    // Check if the split message is a continuation summary
    const splitMessage = allMessages[splitIndex]
    const shouldDuplicate = isContinuationSummary(splitMessage)

    // Split messages:
    // - keptMessages: from splitIndex onwards (stays in original session with original ID) - NEW messages
    // - movedMessages: before splitIndex (goes to new session with new ID) - OLD messages
    let keptMessages = allMessages.slice(splitIndex)
    let movedMessages: Message[]

    if (shouldDuplicate) {
      // Create a copy of the continuation message with new UUID for the new (old messages) session
      const duplicatedMessage: Message = {
        ...splitMessage,
        uuid: crypto.randomUUID(),
        sessionId: newSessionId,
      }
      movedMessages = [...allMessages.slice(0, splitIndex), duplicatedMessage]
    } else {
      movedMessages = allMessages.slice(0, splitIndex)
    }

    // Update kept messages: fix first message's parentUuid
    keptMessages = keptMessages.map((msg, index) => {
      let updated: Message = { ...msg }
      if (index === 0) {
        // First message of kept session should have no parent
        updated.parentUuid = null
        // Clean up first message content if it's a tool_result rejection
        updated = cleanupSplitFirstMessage(updated)
      }
      return updated
    })

    // Update moved messages with new sessionId
    const updatedMovedMessages: Message[] = movedMessages.map((msg) => ({
      ...msg,
      sessionId: newSessionId,
    }))

    // Clone summary message to new session (old messages) if exists
    if (summaryMessage) {
      const clonedSummary = {
        ...summaryMessage,
        sessionId: newSessionId,
        leafUuid: updatedMovedMessages[0]?.uuid ?? null,
      } as Message
      // Add summary at the beginning of moved messages
      updatedMovedMessages.unshift(clonedSummary)
    }

    // Write kept messages (newer) to original file (keeps original ID)
    const keptContent = keptMessages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(filePath, keptContent, 'utf-8'))

    // Write moved messages (older) to new session file
    const newFilePath = path.join(projectPath, `${newSessionId}.jsonl`)
    const newContent = updatedMovedMessages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(newFilePath, newContent, 'utf-8'))

    // Update linked agent files that reference the old sessionId
    // Agents related to OLD messages should be moved to new session
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
        // Check if any message in MOVED (old) messages is related to this agent
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
      clearOrphanAgents = true,
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
                  title:
                    extractTitle(extractTextContent(msg.message)) ||
                    `Session ${sessionId.slice(0, 8)}`,
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

// Internal version that accepts summaries targeting this session
const loadSessionTreeDataInternal = (
  projectName: string,
  sessionId: string,
  summariesByTargetSession?: Map<string, SummaryInfo[]>
) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    const filePath = path.join(projectPath, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = lines.map((line) => JSON.parse(line) as JsonlRecord)

    // Get summaries that TARGET this session (by leafUuid pointing to messages in this session)
    let summaries: SummaryInfo[]
    if (summariesByTargetSession) {
      // Project-wide loading: use pre-computed summaries targeting this session
      // Sort by timestamp ascending (oldest first, current/first summary at index 0)
      summaries = [...(summariesByTargetSession.get(sessionId) ?? [])].sort((a, b) =>
        (a.timestamp ?? '').localeCompare(b.timestamp ?? '')
      )
    } else {
      // Single session loading: need to search the entire project for summaries targeting this session
      summaries = []
      // Build uuid set for this session's messages
      const sessionUuids = new Set<string>()
      for (const msg of messages) {
        if (msg.uuid && typeof msg.uuid === 'string') {
          sessionUuids.add(msg.uuid)
        }
      }
      // Search all session files in the project for summaries with leafUuid pointing to this session
      const projectFiles = yield* Effect.tryPromise(() => fs.readdir(projectPath))
      const allJsonlFiles = projectFiles.filter((f) => f.endsWith('.jsonl'))
      for (const file of allJsonlFiles) {
        try {
          const otherFilePath = path.join(projectPath, file)
          const otherContent = yield* Effect.tryPromise(() => fs.readFile(otherFilePath, 'utf-8'))
          const otherLines = otherContent.trim().split('\n').filter(Boolean)
          for (const line of otherLines) {
            try {
              const msg = JSON.parse(line) as JsonlRecord
              if (
                msg.type === 'summary' &&
                typeof msg.summary === 'string' &&
                typeof msg.leafUuid === 'string' &&
                sessionUuids.has(msg.leafUuid)
              ) {
                // This summary's leafUuid points to a message in THIS session
                const targetMsg = messages.find((m) => m.uuid === msg.leafUuid)
                summaries.push({
                  summary: msg.summary as string,
                  leafUuid: msg.leafUuid,
                  timestamp:
                    (targetMsg?.timestamp as string) ?? (msg.timestamp as string | undefined),
                })
              }
            } catch {
              // Skip invalid JSON
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
    // Sort by timestamp ascending (oldest first, current/first summary at index 0)
    summaries.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''))

    // Find last compact_boundary
    let lastCompactBoundaryUuid: string | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.type === 'system' && msg.subtype === 'compact_boundary') {
        lastCompactBoundaryUuid = msg.uuid as string
        break
      }
    }

    // Get first user message
    const firstUserMsg = messages.find((m) => m.type === 'user') as Message | undefined

    // customTitle is stored as separate custom-title type line
    const customTitleMsg = messages.find((m) => m.type === 'custom-title') as
      | { type: 'custom-title'; customTitle?: string }
      | undefined
    const customTitle = customTitleMsg?.customTitle

    // Get title from first user message
    const title = firstUserMsg
      ? extractTitle(extractTextContent(firstUserMsg.message))
      : summaries.length > 0
        ? '[Summary Only]'
        : `Session ${sessionId.slice(0, 8)}`

    // Count user/assistant messages
    const userAssistantMessages = messages.filter(
      (m) => m.type === 'user' || m.type === 'assistant'
    )
    const firstMessage = userAssistantMessages[0]
    const lastMessage = userAssistantMessages[userAssistantMessages.length - 1]

    // Find linked agents
    const linkedAgentIds = yield* findLinkedAgents(projectName, sessionId)

    // Load agent info (message counts)
    const agents: AgentInfo[] = []
    for (const agentId of linkedAgentIds) {
      const agentPath = path.join(projectPath, `${agentId}.jsonl`)
      try {
        const agentContent = yield* Effect.tryPromise(() => fs.readFile(agentPath, 'utf-8'))
        const agentLines = agentContent.trim().split('\n').filter(Boolean)
        const agentMsgs = agentLines.map((l) => JSON.parse(l) as JsonlRecord)
        const agentUserAssistant = agentMsgs.filter(
          (m) => m.type === 'user' || m.type === 'assistant'
        )

        // Try to extract agent name from first message
        let agentName: string | undefined
        const firstAgentMsg = agentMsgs.find((m) => m.type === 'user')
        if (firstAgentMsg) {
          const text = extractTextContent(firstAgentMsg.message as Message['message'])
          if (text) {
            agentName = extractTitle(text)
          }
        }

        agents.push({
          id: agentId,
          name: agentName,
          messageCount: agentUserAssistant.length,
        })
      } catch {
        // Agent file might not exist or be readable
        agents.push({
          id: agentId,
          messageCount: 0,
        })
      }
    }

    // Load todos
    const todos = yield* findLinkedTodos(sessionId, linkedAgentIds)

    return {
      id: sessionId,
      projectName,
      title,
      customTitle,
      currentSummary: summaries[0]?.summary,
      messageCount:
        userAssistantMessages.length > 0
          ? userAssistantMessages.length
          : summaries.length > 0
            ? 1
            : 0,
      createdAt: (firstMessage?.timestamp as string) ?? undefined,
      updatedAt: (lastMessage?.timestamp as string) ?? undefined,
      summaries,
      agents,
      todos,
      lastCompactBoundaryUuid,
    } satisfies SessionTreeData
  })

// Public wrapper for single session (without global uuid map, leafUuid lookup is limited)
export const loadSessionTreeData = (projectName: string, sessionId: string) =>
  loadSessionTreeDataInternal(projectName, sessionId, undefined)

// Load all sessions tree data for a project
export const loadProjectTreeData = (projectName: string) =>
  Effect.gen(function* () {
    const project = (yield* listProjects).find((p) => p.name === projectName)
    if (!project) {
      return null
    }

    const projectPath = path.join(getSessionsDir(), projectName)
    const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))

    // Phase 1: Build global uuid map + collect all summaries from ALL sessions
    // This is needed because leafUuid can reference messages in other sessions
    const globalUuidMap = new Map<string, { sessionId: string; timestamp?: string }>()
    const allSummaries: Array<{ summary: string; leafUuid?: string; timestamp?: string }> = []

    // Read all .jsonl files (sessions + agents) to build uuid map and collect summaries
    const allJsonlFiles = files.filter((f) => f.endsWith('.jsonl'))
    yield* Effect.all(
      allJsonlFiles.map((file) =>
        Effect.gen(function* () {
          const filePath = path.join(projectPath, file)
          const fileSessionId = file.replace('.jsonl', '')
          try {
            const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
            const lines = content.trim().split('\n').filter(Boolean)
            for (const line of lines) {
              try {
                const msg = JSON.parse(line) as JsonlRecord
                if (msg.uuid && typeof msg.uuid === 'string') {
                  globalUuidMap.set(msg.uuid, {
                    sessionId: fileSessionId,
                    timestamp: msg.timestamp as string | undefined,
                  })
                }
                // Also check messageId for file-history-snapshot type
                if (msg.messageId && typeof msg.messageId === 'string') {
                  globalUuidMap.set(msg.messageId, {
                    sessionId: fileSessionId,
                    timestamp: (msg.snapshot as Record<string, unknown> | undefined)?.timestamp as
                      | string
                      | undefined,
                  })
                }
                // Collect summaries
                if (msg.type === 'summary' && typeof msg.summary === 'string') {
                  allSummaries.push({
                    summary: msg.summary as string,
                    leafUuid: msg.leafUuid as string | undefined,
                    timestamp: msg.timestamp as string | undefined,
                  })
                }
              } catch {
                // Skip invalid JSON lines
              }
            }
          } catch {
            // Skip unreadable files
          }
        })
      ),
      { concurrency: 20 }
    )

    // Phase 1.5: Build summariesByTargetSession map
    // Each summary's leafUuid points to a message in some session - that's the TARGET session
    const summariesByTargetSession = new Map<string, SummaryInfo[]>()
    for (const summaryData of allSummaries) {
      if (summaryData.leafUuid) {
        const targetInfo = globalUuidMap.get(summaryData.leafUuid)
        if (targetInfo) {
          const targetSessionId = targetInfo.sessionId
          if (!summariesByTargetSession.has(targetSessionId)) {
            summariesByTargetSession.set(targetSessionId, [])
          }
          summariesByTargetSession.get(targetSessionId)!.push({
            summary: summaryData.summary,
            leafUuid: summaryData.leafUuid,
            timestamp: targetInfo.timestamp ?? summaryData.timestamp,
          })
        }
      }
    }

    // Phase 2: Load session tree data with summaries targeting each session
    const sessions = yield* Effect.all(
      sessionFiles.map((file) => {
        const sessionId = file.replace('.jsonl', '')
        return loadSessionTreeDataInternal(projectName, sessionId, summariesByTargetSession)
      }),
      { concurrency: 10 }
    )

    // Sort by newest first
    const sortedSessions = sessions.sort((a, b) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return dateB - dateA
    })

    // Filter out error sessions (API errors, authentication errors, etc.)
    const filteredSessions = sortedSessions.filter((s) => {
      // Check all possible title/summary fields for error patterns
      if (isErrorSessionTitle(s.title)) return false
      if (isErrorSessionTitle(s.customTitle)) return false
      if (isErrorSessionTitle(s.currentSummary)) return false
      return true
    })

    return {
      name: project.name,
      displayName: project.displayName,
      path: project.path,
      sessionCount: filteredSessions.length,
      sessions: filteredSessions,
    } satisfies ProjectTreeData
  })

// Update summary message in session
export const updateSessionSummary = (projectName: string, sessionId: string, newSummary: string) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = lines.map((line) => JSON.parse(line) as Record<string, unknown>)

    // Find existing summary message
    const summaryIdx = messages.findIndex((m) => m.type === 'summary')

    if (summaryIdx >= 0) {
      // Update existing summary
      messages[summaryIdx] = { ...messages[summaryIdx], summary: newSummary }
    } else {
      // Add new summary at the beginning
      const firstUserMsg = messages.find((m) => m.type === 'user')
      const summaryMsg = {
        type: 'summary',
        summary: newSummary,
        leafUuid: (firstUserMsg as Message | undefined)?.uuid ?? null,
      }
      messages.unshift(summaryMsg)
    }

    const newContent = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))

    return { success: true }
  })

// Compress session by removing redundant data
export const compressSession = (
  projectName: string,
  sessionId: string,
  options: CompressSessionOptions = {}
) =>
  Effect.gen(function* () {
    const { keepSnapshots = 'first_last', maxToolOutputLength = 5000 } = options
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)

    // Read original file
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const originalSize = Buffer.byteLength(content, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = lines.map((line) => JSON.parse(line) as Record<string, unknown>)

    let removedSnapshots = 0
    let truncatedOutputs = 0

    // Find snapshot indices
    const snapshotIndices: number[] = []
    messages.forEach((msg, idx) => {
      if (msg.type === 'file-history-snapshot') {
        snapshotIndices.push(idx)
      }
    })

    // Filter messages based on keepSnapshots option
    const filteredMessages = messages.filter((msg, idx) => {
      if (msg.type === 'file-history-snapshot') {
        if (keepSnapshots === 'none') {
          removedSnapshots++
          return false
        }
        if (keepSnapshots === 'first_last') {
          const isFirst = idx === snapshotIndices[0]
          const isLast = idx === snapshotIndices[snapshotIndices.length - 1]
          if (!isFirst && !isLast) {
            removedSnapshots++
            return false
          }
        }
      }
      return true
    })

    // Truncate long tool outputs
    for (const msg of filteredMessages) {
      if (msg.type === 'user' && Array.isArray(msg.content)) {
        for (const item of msg.content as Array<Record<string, unknown>>) {
          if (item.type === 'tool_result' && typeof item.content === 'string') {
            if (maxToolOutputLength > 0 && item.content.length > maxToolOutputLength) {
              item.content = item.content.slice(0, maxToolOutputLength) + '\n... [truncated]'
              truncatedOutputs++
            }
          }
        }
      }
    }

    // Write compressed file
    const newContent = filteredMessages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    const compressedSize = Buffer.byteLength(newContent, 'utf-8')

    yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))

    return {
      success: true,
      originalSize,
      compressedSize,
      removedSnapshots,
      truncatedOutputs,
    } satisfies CompressSessionResult
  })

// Extract knowledge from multiple sessions in a project
export const extractProjectKnowledge = (projectName: string, sessionIds?: string[]) =>
  Effect.gen(function* () {
    const sessionsDir = getSessionsDir()
    const projectDir = path.join(sessionsDir, projectName)

    // Get all session files if not specified
    let targetSessionIds = sessionIds
    if (!targetSessionIds) {
      const files = yield* Effect.tryPromise(() => fs.readdir(projectDir))
      targetSessionIds = files
        .filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))
        .map((f) => f.replace('.jsonl', ''))
    }

    // Aggregate data across sessions
    const fileModifyCount = new Map<string, { count: number; lastModified?: string }>()
    const toolSequences: string[][] = []
    const decisions: { context: string; decision: string; sessionId: string }[] = []

    for (const sessionId of targetSessionIds) {
      try {
        const messages = yield* readSession(projectName, sessionId)

        // Track file modifications
        for (const msg of messages) {
          if (msg.type === 'file-history-snapshot') {
            const snapshot = msg as unknown as {
              snapshot?: { trackedFileBackups?: Record<string, unknown>; timestamp?: string }
            }
            if (snapshot.snapshot?.trackedFileBackups) {
              for (const filePath of Object.keys(snapshot.snapshot.trackedFileBackups)) {
                const existing = fileModifyCount.get(filePath) ?? { count: 0 }
                existing.count++
                existing.lastModified = snapshot.snapshot.timestamp
                fileModifyCount.set(filePath, existing)
              }
            }
          }

          // Track tool sequences
          if (
            msg.type === 'assistant' &&
            msg.message?.content &&
            Array.isArray(msg.message.content)
          ) {
            const tools: string[] = []
            for (const item of msg.message.content) {
              if (item && typeof item === 'object' && 'type' in item && item.type === 'tool_use') {
                const toolUse = item as { name?: string }
                if (toolUse.name) tools.push(toolUse.name)
              }
            }
            if (tools.length > 1) {
              toolSequences.push(tools)
            }
          }

          // Extract decisions from summaries
          if (msg.type === 'summary' && msg.summary) {
            decisions.push({
              context: 'Session summary',
              decision: msg.summary.slice(0, 200),
              sessionId,
            })
          }
        }
      } catch {
        // Skip sessions that fail to read
        continue
      }
    }

    // Build hot files list
    const hotFiles = Array.from(fileModifyCount.entries())
      .map(([filePath, data]) => ({
        path: filePath,
        modifyCount: data.count,
        lastModified: data.lastModified,
      }))
      .sort((a, b) => b.modifyCount - a.modifyCount)
      .slice(0, 20)

    // Build workflow patterns
    const workflowMap = new Map<string, number>()
    for (const seq of toolSequences) {
      const key = seq.join(' -> ')
      workflowMap.set(key, (workflowMap.get(key) ?? 0) + 1)
    }
    const workflows = Array.from(workflowMap.entries())
      .filter(([, count]) => count >= 2)
      .map(([sequence, count]) => ({
        sequence: sequence.split(' -> '),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      projectName,
      patterns: [],
      hotFiles,
      workflows,
      decisions: decisions.slice(0, 20),
    } satisfies ProjectKnowledge
  })

// Summarize session into user/assistant conversation format
export const summarizeSession = (
  projectName: string,
  sessionId: string,
  options: SummarizeSessionOptions = {}
) =>
  Effect.gen(function* () {
    const { limit = 50, maxLength = 100 } = options
    const messages = yield* readSession(projectName, sessionId)

    const lines: ConversationLine[] = []
    let count = 0

    for (const msg of messages) {
      if (count >= limit) break

      if (msg.type === 'user' || msg.type === 'human') {
        // Extract timestamp for user messages using locale-based formatting
        let timeStr: string | undefined
        if (msg.timestamp) {
          try {
            const dt = new Date(msg.timestamp)
            timeStr = dt.toLocaleString('ko-KR', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
          } catch {
            // Skip timestamp on error
          }
        }

        const text = extractTextContent(msg.message)
        if (text) {
          const truncated = truncateText(text, maxLength)
          lines.push({ role: 'user', content: truncated, timestamp: timeStr })
          count++
        }
      } else if (msg.type === 'assistant') {
        const text = extractTextContent(msg.message)
        if (text) {
          const truncated = truncateText(text, maxLength)
          lines.push({ role: 'assistant', content: truncated })
          count++
        }
      }
    }

    // Build formatted string
    const formatted = lines
      .map((line) => {
        if (line.role === 'user') {
          return line.timestamp
            ? `user [${line.timestamp}]: ${line.content}`
            : `user: ${line.content}`
        }
        return `assistant: ${line.content}`
      })
      .join('\n')

    return {
      sessionId,
      projectName,
      lines,
      formatted,
    } satisfies SummarizeSessionResult
  })

// Helper to truncate text and replace newlines
function truncateText(text: string, maxLen: number): string {
  const cleaned = text.replace(/\n/g, ' ')
  if (cleaned.length > maxLen) {
    return cleaned.slice(0, maxLen) + '...'
  }
  return cleaned
}
