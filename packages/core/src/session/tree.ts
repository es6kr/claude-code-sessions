/**
 * Session tree data operations for VSCode extension
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir, folderNameToPath } from '../paths.js'
import {
  extractTextContent,
  extractTitle,
  getDisplaySortTimestamp,
  getSummarySortTimestamp,
  isErrorSessionTitle,
  parseJsonlLines,
  fileExists,
  tryParseJsonLine,
} from '../utils.js'
import { findLinkedAgents } from '../agents.js'
import { findLinkedTodos } from '../todos.js'
import { loadTreeCache, writeTreeCache, validateCache, type TreeCache } from './cache.js'
import { createLogger } from '../logger.js'
import type {
  Message,
  SessionTreeData,
  SummaryInfo,
  SessionSortOptions,
  AgentInfo,
  ProjectTreeData,
  JsonlRecord,
} from '../types.js'

const log = createLogger('tree')

/**
 * Sort sessions based on sort options
 * Exported for testing purposes
 */
export const sortSessions = <T extends SessionTreeData>(
  sessions: T[],
  sort: SessionSortOptions
): T[] => {
  return sessions.sort((a, b) => {
    let comparison = 0

    switch (sort.field) {
      case 'summary': {
        // By pre-calculated sort timestamp (oldest summary timestamp, matches official extension)
        comparison = a.sortTimestamp - b.sortTimestamp
        break
      }
      case 'modified': {
        // By file modification time
        comparison = (a.fileMtime ?? 0) - (b.fileMtime ?? 0)
        break
      }
      case 'created': {
        // By session creation time
        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        comparison = createdA - createdB
        break
      }
      case 'updated': {
        // By last message timestamp
        const updatedA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const updatedB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        comparison = updatedA - updatedB
        break
      }
      case 'messageCount': {
        // By number of messages
        comparison = a.messageCount - b.messageCount
        break
      }
      case 'title': {
        // Alphabetical by display title (customTitle > currentSummary > title)
        const titleA = a.customTitle ?? a.currentSummary ?? a.title
        const titleB = b.customTitle ?? b.currentSummary ?? b.title
        comparison = titleA.localeCompare(titleB)
        break
      }
    }

    // Apply sort order (desc = newest/largest first)
    return sort.order === 'desc' ? -comparison : comparison
  })
}

// Internal helper for loading session tree data
const loadSessionTreeDataInternal = (
  projectName: string,
  sessionId: string,
  summariesByTargetSession?: Map<string, SummaryInfo[]>,
  fileMtime?: number
) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    const filePath = path.join(projectPath, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = parseJsonlLines<JsonlRecord>(lines, filePath)

    // Get summaries that TARGET this session (by leafUuid pointing to messages in this session)
    let summaries: SummaryInfo[]
    if (summariesByTargetSession) {
      // Project-wide loading: use pre-computed summaries targeting this session
      // Sort by timestamp ascending (oldest first), then by sourceFile descending (larger filename first)
      // Official extension shows the OLDEST summary as currentSummary, and prefers larger filenames when timestamps match
      summaries = [...(summariesByTargetSession.get(sessionId) ?? [])].sort((a, b) => {
        // 1. timestamp ascending (oldest first - official extension shows oldest as currentSummary)
        const timestampCmp = (a.timestamp ?? '').localeCompare(b.timestamp ?? '')
        if (timestampCmp !== 0) return timestampCmp
        // 2. sourceFile descending (larger filename first, e.g., b878041c > 355e3718)
        return (b.sourceFile ?? '').localeCompare(a.sourceFile ?? '')
      })
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
      yield* Effect.forEach(
        allJsonlFiles,
        (file) =>
          Effect.gen(function* () {
            const otherFilePath = path.join(projectPath, file)
            const otherContent = yield* Effect.tryPromise(() => fs.readFile(otherFilePath, 'utf-8'))
            const otherLines = otherContent.trim().split('\n').filter(Boolean)
            for (let i = 0; i < otherLines.length; i++) {
              const msg = tryParseJsonLine<JsonlRecord>(otherLines[i], i + 1, otherFilePath)
              if (!msg) continue
              if (
                msg.type === 'summary' &&
                typeof msg.summary === 'string' &&
                typeof msg.leafUuid === 'string' &&
                sessionUuids.has(msg.leafUuid)
              ) {
                const targetMsg = messages.find((m) => m.uuid === msg.leafUuid)
                summaries.push({
                  summary: msg.summary as string,
                  leafUuid: msg.leafUuid,
                  timestamp:
                    (targetMsg?.timestamp as string) ?? (msg.timestamp as string | undefined),
                  sourceFile: file,
                })
              }
            }
          }).pipe(
            Effect.catchAll((error) => {
              log.debug(`Skipping unreadable file: ${file}`, error)
              return Effect.void
            })
          ),
        { concurrency: 20 }
      )
    }
    // Sort by timestamp ascending (oldest first), then sourceFile descending
    // Official extension shows the OLDEST summary as currentSummary
    summaries.sort((a, b) => {
      const timestampCmp = (a.timestamp ?? '').localeCompare(b.timestamp ?? '')
      if (timestampCmp !== 0) return timestampCmp
      return (b.sourceFile ?? '').localeCompare(a.sourceFile ?? '')
    })

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

    // Scan from end: only titles after the last user/assistant message count
    let customTitle: string | undefined
    let agentName: string | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.type === 'user' || msg.type === 'assistant') break
      if (customTitle === undefined && msg.type === 'custom-title') {
        customTitle = (msg as { type: 'custom-title'; customTitle?: string }).customTitle
      } else if (agentName === undefined && msg.type === 'agent-name') {
        agentName = (msg as { type: 'agent-name'; agentName?: string }).agentName
      }
    }

    // Get title from first user message
    const title = firstUserMsg
      ? extractTitle(firstUserMsg.message)
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
    const agents = yield* Effect.forEach(
      linkedAgentIds,
      (agentId) => {
        const agentPath = path.join(projectPath, `${agentId}.jsonl`)
        return Effect.gen(function* () {
          const agentContent = yield* Effect.tryPromise(() => fs.readFile(agentPath, 'utf-8'))
          const agentLines = agentContent.trim().split('\n').filter(Boolean)
          const agentMsgs = agentLines.map((l) => JSON.parse(l) as JsonlRecord)
          const agentUserAssistant = agentMsgs.filter(
            (m) => m.type === 'user' || m.type === 'assistant'
          )

          let agentName: string | undefined
          const firstAgentMsg = agentMsgs.find((m) => m.type === 'user')
          if (firstAgentMsg) {
            const text = extractTextContent(firstAgentMsg.message as Message['message'])
            if (text) {
              agentName = extractTitle(text)
            }
          }

          return {
            id: agentId,
            name: agentName,
            messageCount: agentUserAssistant.length,
          } satisfies AgentInfo
        }).pipe(
          Effect.catchAll((error) => {
            log.debug(`Agent file not readable: ${agentId}`, error)
            return Effect.succeed({ id: agentId, messageCount: 0 } satisfies AgentInfo)
          })
        )
      },
      { concurrency: 20 }
    )

    // Load todos
    const todos = yield* findLinkedTodos(sessionId, linkedAgentIds)

    // Pre-calculate sort timestamp for 'summary' field
    const createdAt = (firstMessage?.timestamp as string) ?? undefined
    const sortTimestamp = getSummarySortTimestamp({ summaries, createdAt })

    return {
      id: sessionId,
      projectName,
      title,
      agentName,
      customTitle,
      currentSummary: summaries[0]?.summary,
      messageCount:
        userAssistantMessages.length > 0
          ? userAssistantMessages.length
          : summaries.length > 0
            ? 1
            : 0,
      createdAt,
      updatedAt: (lastMessage?.timestamp as string) ?? undefined,
      fileMtime,
      sortTimestamp,
      summaries,
      agents,
      todos,
      lastCompactBoundaryUuid,
    } satisfies SessionTreeData
  })

// Public wrapper for single session (without global uuid map, leafUuid lookup is limited)
export const loadSessionTreeData = (projectName: string, sessionId: string) =>
  loadSessionTreeDataInternal(projectName, sessionId, undefined)

/** Default sort: by latest message timestamp (matches official extension) */
const DEFAULT_SORT: SessionSortOptions = { field: 'updated', order: 'desc' }

// ============================================================================
// Phase 1 helpers (UUID map + summaries)
// ============================================================================

interface Phase1Result {
  globalUuidMap: Map<string, { sessionId: string; timestamp?: string }>
  allSummaries: Array<{
    summary: string
    leafUuid?: string
    timestamp?: string
    sourceFile: string
  }>
}

/** Build global UUID map and collect all summaries from all JSONL files in a project */
const buildPhase1 = (projectPath: string, allJsonlFiles: string[]) =>
  Effect.gen(function* () {
    const globalUuidMap = new Map<string, { sessionId: string; timestamp?: string }>()
    const allSummaries: Phase1Result['allSummaries'] = []

    yield* Effect.all(
      allJsonlFiles.map((file) => {
        const filePath = path.join(projectPath, file)
        const fileSessionId = file.replace('.jsonl', '')
        return Effect.gen(function* () {
          const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
          const lines = content.trim().split('\n').filter(Boolean)
          for (let i = 0; i < lines.length; i++) {
            const msg = tryParseJsonLine<JsonlRecord>(lines[i], i + 1, filePath)
            if (!msg) continue
            if (msg.uuid && typeof msg.uuid === 'string') {
              globalUuidMap.set(msg.uuid, {
                sessionId: fileSessionId,
                timestamp: msg.timestamp as string | undefined,
              })
            }
            if (msg.messageId && typeof msg.messageId === 'string') {
              globalUuidMap.set(msg.messageId, {
                sessionId: fileSessionId,
                timestamp: (msg.snapshot as Record<string, unknown> | undefined)?.timestamp as
                  | string
                  | undefined,
              })
            }
            if (msg.type === 'summary' && typeof msg.summary === 'string') {
              allSummaries.push({
                summary: msg.summary as string,
                leafUuid: msg.leafUuid as string | undefined,
                timestamp: msg.timestamp as string | undefined,
                sourceFile: file,
              })
            }
          }
        }).pipe(
          Effect.catchAll((error) => {
            log.debug(`Skipping unreadable file: ${file}`, error)
            return Effect.void
          })
        )
      }),
      { concurrency: 20 }
    )

    return { globalUuidMap, allSummaries } satisfies Phase1Result
  })

/** Build summariesByTargetSession map from Phase 1 output */
const buildSummariesByTargetSession = (
  globalUuidMap: Map<string, { sessionId: string; timestamp?: string }>,
  allSummaries: Phase1Result['allSummaries']
): Map<string, SummaryInfo[]> => {
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
          timestamp: summaryData.timestamp ?? targetInfo.timestamp,
          sourceFile: summaryData.sourceFile,
        })
      }
    }
  }
  return summariesByTargetSession
}

/** Sort summaries consistently (oldest first by timestamp, then sourceFile desc) */
const sortSummaries = (summaries: SummaryInfo[]): SummaryInfo[] => {
  return [...summaries].sort((a, b) => {
    const timestampCmp = (a.timestamp ?? '').localeCompare(b.timestamp ?? '')
    if (timestampCmp !== 0) return timestampCmp
    return (b.sourceFile ?? '').localeCompare(a.sourceFile ?? '')
  })
}

/** Apply sort, filter error sessions, and wrap as ProjectTreeData */
export const buildProjectTreeResult = (
  project: { name: string; displayName: string; path: string },
  sessions: SessionTreeData[],
  sort: SessionSortOptions
): ProjectTreeData => {
  const sortedSessions = sortSessions(sessions, sort)

  const filteredSessions = sortedSessions.filter((s) => {
    if (isErrorSessionTitle(s.title)) return false
    if (isErrorSessionTitle(s.customTitle)) return false
    if (isErrorSessionTitle(s.currentSummary)) return false
    return true
  })

  // Remap sortTimestamp to match active sort field for display
  const displaySessions = filteredSessions.map((s) => ({
    ...s,
    sortTimestamp: getDisplaySortTimestamp(s, sort.field),
  }))

  return {
    name: project.name,
    displayName: project.displayName,
    path: project.path,
    sessionCount: displaySessions.length,
    sessions: displaySessions,
  }
}

// ============================================================================
// Cache helpers
// ============================================================================

/** Serialize Phase 1 + Phase 2 results into a TreeCache */
const buildTreeCache = (
  globalUuidMap: Map<string, { sessionId: string; timestamp?: string }>,
  allSummaries: Phase1Result['allSummaries'],
  sessions: SessionTreeData[],
  fileMtimes: Map<string, number>
): TreeCache => {
  const uuidMapRecord: Record<string, { sessionId: string; timestamp?: string }> = {}
  for (const [key, val] of globalUuidMap) {
    uuidMapRecord[key] = val
  }

  const sessionsRecord: Record<string, { fileMtime: number; data: SessionTreeData }> = {}
  for (const s of sessions) {
    sessionsRecord[s.id] = {
      fileMtime: fileMtimes.get(s.id) ?? 0,
      data: s,
    }
  }

  return {
    version: 1,
    globalUuidMap: uuidMapRecord,
    allSummaries,
    sessions: sessionsRecord,
  }
}

/** Update an unchanged session's summaries from new Phase 1 data */
const updateSessionSummaries = (
  cached: SessionTreeData,
  summariesByTargetSession: Map<string, SummaryInfo[]>
): SessionTreeData => {
  const newSummaries = sortSummaries(summariesByTargetSession.get(cached.id) ?? [])

  // Check if summaries actually changed
  const oldJson = JSON.stringify(cached.summaries)
  const newJson = JSON.stringify(newSummaries)
  if (oldJson === newJson) return cached

  const newSortTimestamp = getSummarySortTimestamp({
    summaries: newSummaries,
    createdAt: cached.createdAt,
  })

  return {
    ...cached,
    summaries: newSummaries,
    currentSummary: newSummaries[0]?.summary,
    sortTimestamp: newSortTimestamp,
  }
}

// ============================================================================
// Main entry point
// ============================================================================

// Load all sessions tree data for a project (with caching)
export const loadProjectTreeData = (projectName: string, sortOptions?: SessionSortOptions) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)

    // Check project exists (fast: single stat instead of listing ALL projects)
    const exists = yield* Effect.tryPromise(() => fileExists(projectPath))
    if (!exists) return null

    // Resolve display name for this single project (avoids processing all projects)
    const displayName = yield* Effect.tryPromise(() => folderNameToPath(projectName))
    const project = { name: projectName, displayName, path: projectPath }

    const sort = sortOptions ?? DEFAULT_SORT
    const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))
    const sessionFileIds = sessionFiles.map((f) => f.replace('.jsonl', ''))

    // Step 1: Collect file modification times (cheap ~50ms for 57 files)
    const fileMtimes = new Map<string, number>()
    yield* Effect.all(
      sessionFiles.map((file) => {
        const filePath = path.join(projectPath, file)
        return Effect.tryPromise(() => fs.stat(filePath)).pipe(
          Effect.tap((stat) =>
            Effect.sync(() => fileMtimes.set(file.replace('.jsonl', ''), stat.mtimeMs))
          ),
          Effect.catchAll((error) => {
            log.debug(`Failed to stat file: ${file}`, error)
            return Effect.void
          })
        )
      }),
      { concurrency: 20 }
    )

    // Step 2: Try cache
    const cache = yield* Effect.tryPromise(() => loadTreeCache(projectName))

    if (cache) {
      const validation = validateCache(cache, sessionFileIds, fileMtimes)

      if (validation.isFullHit) {
        // Fast path: all files unchanged, return cached data directly
        log.debug(`cache hit for ${projectName} (${sessionFileIds.length} sessions)`)
        const sessions = sessionFileIds
          .map((id) => cache.sessions[id]?.data)
          .filter((s): s is SessionTreeData => s != null)
        return buildProjectTreeResult(project, sessions, sort)
      }

      const changedCount =
        validation.changedSessionIds.length +
        validation.newSessionIds.length +
        validation.deletedSessionIds.length
      log.debug(
        `cache partial miss for ${projectName}: ` +
          `${validation.changedSessionIds.length} changed, ` +
          `${validation.newSessionIds.length} new, ` +
          `${validation.deletedSessionIds.length} deleted, ` +
          `${validation.unchangedSessionIds.length} unchanged`
      )

      // Incremental path: rebuild Phase 1, then selectively reload Phase 2
      if (changedCount <= sessionFileIds.length / 2) {
        const result = yield* loadProjectTreeDataIncremental(
          projectName,
          projectPath,
          files,
          sessionFiles,
          fileMtimes,
          cache,
          validation,
          project,
          sort
        )
        return result
      }
      // If more than half changed, just do a full load (faster than incremental)
    }

    // Full load (no cache or too many changes)
    log.debug(`full load for ${projectName} (${sessionFileIds.length} sessions)`)
    return yield* loadProjectTreeDataFull(
      projectName,
      projectPath,
      files,
      sessionFiles,
      fileMtimes,
      project,
      sort
    )
  })

/** Full load: Phase 1 + Phase 2 on all files, then write cache */
const loadProjectTreeDataFull = (
  projectName: string,
  projectPath: string,
  files: string[],
  sessionFiles: string[],
  fileMtimes: Map<string, number>,
  project: { name: string; displayName: string; path: string },
  sort: SessionSortOptions
) =>
  Effect.gen(function* () {
    const allJsonlFiles = files.filter((f) => f.endsWith('.jsonl'))

    // Phase 1: Build global UUID map + collect all summaries
    const { globalUuidMap, allSummaries } = yield* buildPhase1(projectPath, allJsonlFiles)

    // Phase 1.5: Build summariesByTargetSession
    const summariesByTargetSession = buildSummariesByTargetSession(globalUuidMap, allSummaries)

    // Phase 2: Load all session tree data
    const sessions = yield* Effect.all(
      sessionFiles.map((file) => {
        const sessionId = file.replace('.jsonl', '')
        const mtime = fileMtimes.get(sessionId)
        return loadSessionTreeDataInternal(projectName, sessionId, summariesByTargetSession, mtime)
      }),
      { concurrency: 10 }
    )

    // Write cache in background (don't block return)
    const cacheData = buildTreeCache(globalUuidMap, allSummaries, sessions, fileMtimes)
    writeTreeCache(projectName, cacheData).catch((err) => {
      log.debug(`cache write failed for ${projectName}: ${err}`)
    })

    return buildProjectTreeResult(project, sessions, sort)
  })

/** Incremental load: Phase 1 on all files, Phase 2 only for changed sessions */
const loadProjectTreeDataIncremental = (
  projectName: string,
  projectPath: string,
  files: string[],
  sessionFiles: string[],
  fileMtimes: Map<string, number>,
  cache: TreeCache,
  validation: ReturnType<typeof validateCache>,
  project: { name: string; displayName: string; path: string },
  sort: SessionSortOptions
) =>
  Effect.gen(function* () {
    const allJsonlFiles = files.filter((f) => f.endsWith('.jsonl'))

    // Phase 1: Rebuild UUID map + summaries fully (fast: ~2-3s, just parsing)
    const { globalUuidMap, allSummaries } = yield* buildPhase1(projectPath, allJsonlFiles)
    const summariesByTargetSession = buildSummariesByTargetSession(globalUuidMap, allSummaries)

    // Phase 2: Only load changed + new sessions
    const sessionsToLoad = [...validation.changedSessionIds, ...validation.newSessionIds]
    const loadedSessions = yield* Effect.all(
      sessionsToLoad.map((sessionId) => {
        const mtime = fileMtimes.get(sessionId)
        return loadSessionTreeDataInternal(projectName, sessionId, summariesByTargetSession, mtime)
      }),
      { concurrency: 10 }
    )

    // Build loaded map for quick lookup
    const loadedMap = new Map<string, SessionTreeData>()
    for (const s of loadedSessions) {
      loadedMap.set(s.id, s)
    }

    // Merge: use loaded for changed/new, update summaries for unchanged, skip deleted
    const allSessions: SessionTreeData[] = []
    for (const file of sessionFiles) {
      const sessionId = file.replace('.jsonl', '')
      const loaded = loadedMap.get(sessionId)
      if (loaded) {
        allSessions.push(loaded)
      } else if (cache.sessions[sessionId]) {
        // Unchanged session: update summaries from new Phase 1 data
        const updated = updateSessionSummaries(
          cache.sessions[sessionId].data,
          summariesByTargetSession
        )
        // Update fileMtime from current stat
        allSessions.push({ ...updated, fileMtime: fileMtimes.get(sessionId) })
      }
      // deleted sessions are not in sessionFiles, so they're naturally excluded
    }

    // Write updated cache
    const cacheData = buildTreeCache(globalUuidMap, allSummaries, allSessions, fileMtimes)
    writeTreeCache(projectName, cacheData).catch((err) => {
      log.debug(`cache write failed for ${projectName}: ${err}`)
    })

    return buildProjectTreeResult(project, allSessions, sort)
  })
