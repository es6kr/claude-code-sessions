/**
 * Session cleanup and maintenance operations
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir } from '../paths.js'
import { isInvalidApiKeyMessage, parseJsonlLines, FileReadError, FileWriteError } from '../utils.js'
import { findLinkedAgents, findOrphanAgents, deleteOrphanAgents } from '../agents.js'
import { sessionHasTodos, findOrphanTodos, deleteOrphanTodos } from '../todos.js'
import { listProjects } from './projects.js'
import { listSessions, deleteSession } from './crud.js'
import { listSessionsMeta } from './crud-streaming.js'
import { filterSessionFiles } from './crud-helpers.js'
import type { Message, CleanupPreview, ClearSessionsResult } from '../types.js'

// Remove invalid API key messages from a session, returns remaining message count
const cleanInvalidMessages = (projectName: string, sessionId: string) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise({
      try: () => fs.readFile(filePath, 'utf-8'),
      catch: (error) => new FileReadError({ filePath, cause: error }),
    })
    const lines = content.trim().split('\n').filter(Boolean)

    if (lines.length === 0) return { removedCount: 0, remainingCount: 0 }

    const messages = parseJsonlLines<Message>(lines, filePath)
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

    yield* Effect.tryPromise({
      try: () => fs.writeFile(filePath, newContent, 'utf-8'),
      catch: (error) => new FileWriteError({ filePath, cause: error }),
    })

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
          const sessions = yield* listSessionsMeta(project.name)
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

// Regex to extract "type" field from JSONL line without full parse
const TITLE_TYPE_RE = /^{"type":"(agent-name|custom-title)"/

/** Remove duplicate agent-name and custom-title records, keeping only the last of each type */
export const deduplicateTitleRecords = (projectName: string, sessionId: string) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise({
      try: () => fs.readFile(filePath, 'utf-8'),
      catch: (error) => new FileReadError({ filePath, cause: error }),
    })
    const lines = content.trim().split('\n').filter(Boolean)

    if (lines.length === 0) return { removedCount: 0 }

    // Find last index for each title type
    let lastAgentNameIdx = -1
    let lastCustomTitleIdx = -1
    let agentNameCount = 0
    let customTitleCount = 0

    for (let i = 0; i < lines.length; i++) {
      const match = TITLE_TYPE_RE.exec(lines[i])
      if (!match) continue
      if (match[1] === 'agent-name') {
        lastAgentNameIdx = i
        agentNameCount++
      } else if (match[1] === 'custom-title') {
        lastCustomTitleIdx = i
        customTitleCount++
      }
    }

    // Only duplicates if count > 1 for either type
    const agentNameDuplicates = agentNameCount > 1 ? agentNameCount - 1 : 0
    const customTitleDuplicates = customTitleCount > 1 ? customTitleCount - 1 : 0
    const totalDuplicates = agentNameDuplicates + customTitleDuplicates

    if (totalDuplicates === 0) return { removedCount: 0 }

    // Build filtered lines — remove all but the last of each type
    const filtered = lines.filter((line, idx) => {
      const match = TITLE_TYPE_RE.exec(line)
      if (!match) return true
      if (match[1] === 'agent-name' && idx !== lastAgentNameIdx) return false
      if (match[1] === 'custom-title' && idx !== lastCustomTitleIdx) return false
      return true
    })

    const newContent = filtered.join('\n') + '\n'
    yield* Effect.tryPromise({
      try: () => fs.writeFile(filePath, newContent, 'utf-8'),
      catch: (error) => new FileWriteError({ filePath, cause: error }),
    })

    return { removedCount: totalDuplicates }
  })

// Clear sessions
export const clearSessions = (options: {
  projectName?: string
  clearEmpty?: boolean
  clearInvalid?: boolean
  skipWithTodos?: boolean
  clearOrphanAgents?: boolean
  clearOrphanTodos?: boolean
  deduplicateTitles?: boolean
}) =>
  Effect.gen(function* () {
    const {
      projectName,
      clearEmpty = true,
      clearInvalid = true,
      skipWithTodos = true,
      clearOrphanAgents = true,
      clearOrphanTodos = false,
      deduplicateTitles = false,
    } = options
    const projects = yield* listProjects
    const targetProjects = projectName ? projects.filter((p) => p.name === projectName) : projects

    let deletedSessionCount = 0
    let removedMessageCount = 0
    let deduplicatedRecordCount = 0
    let deletedOrphanAgentCount = 0
    let deletedOrphanTodoCount = 0
    const sessionsToDelete: { project: string; sessionId: string }[] = []

    // Step 1: Clean invalid API key messages from all sessions (if clearInvalid)
    if (clearInvalid) {
      for (const project of targetProjects) {
        const projectPath = path.join(getSessionsDir(), project.name)
        const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))
        const sessionFiles = filterSessionFiles(files)

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

    // Step 6: Deduplicate title records (agent-name, custom-title) if requested
    if (deduplicateTitles) {
      for (const project of targetProjects) {
        const projectPath = path.join(getSessionsDir(), project.name)
        const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))
        const sessionFiles = filterSessionFiles(files)

        for (const file of sessionFiles) {
          const sessionId = file.replace('.jsonl', '')
          // Skip sessions marked for deletion
          if (sessionsToDelete.some((s) => s.project === project.name && s.sessionId === sessionId))
            continue
          const result = yield* deduplicateTitleRecords(project.name, sessionId)
          deduplicatedRecordCount += result.removedCount
        }
      }
    }

    return {
      success: true,
      deduplicatedRecordCount,
      deletedCount: deletedSessionCount,
      deletedOrphanAgentCount,
      deletedOrphanTodoCount,
      removedMessageCount,
    } satisfies ClearSessionsResult
  })
