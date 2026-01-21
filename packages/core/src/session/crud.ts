/**
 * Session CRUD operations
 */
import { Effect, pipe, Array as A, Option as O } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { getSessionsDir } from '../paths.js'
import {
  extractTextContent,
  extractTitle,
  isContinuationSummary,
  cleanupSplitFirstMessage,
} from '../utils.js'
import { findLinkedAgents } from '../agents.js'
import { deleteLinkedTodos } from '../todos.js'
import type {
  Message,
  SessionMeta,
  DeleteSessionResult,
  RenameSessionResult,
  SplitSessionResult,
  MoveSessionResult,
  JsonlRecord,
} from '../types.js'

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

          // Extract currentSummary from first summary message
          const currentSummary = pipe(
            messages,
            A.findFirst((m) => m.type === 'summary'),
            O.map((m) => m.summary as string),
            O.getOrUndefined
          )

          // Extract customTitle from custom-title message
          const customTitle = pipe(
            messages,
            A.findFirst((m) => m.type === 'custom-title'),
            O.map((m) => (m as { customTitle?: string }).customTitle),
            O.flatMap(O.fromNullable),
            O.getOrUndefined
          )

          return {
            id: sessionId,
            projectName,
            title,
            customTitle,
            currentSummary,
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

import { deleteMessageWithChainRepair } from './validation.js'

// Delete a message from session and repair parentUuid chain
// Optional targetType parameter to specify which type to delete when uuid/messageId collision exists
export const deleteMessage = (
  projectName: string,
  sessionId: string,
  messageUuid: string,
  targetType?: 'file-history-snapshot' | 'summary'
) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = lines.map((line) => JSON.parse(line) as Record<string, unknown>)

    // Use the pure function for chain repair
    const result = deleteMessageWithChainRepair(messages, messageUuid, targetType)

    if (!result.deleted) {
      return { success: false, error: 'Message not found' }
    }

    const newContent = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))

    return { success: true, deletedMessage: result.deleted }
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

// Move session from one project to another
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
