/**
 * Session search operations
 */
import { Effect, pipe } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir } from '../paths.js'
import { extractTextContent, extractTitle, tryParseJsonLine } from '../utils.js'
import { listProjects } from './projects.js'
import { listSessions } from './crud.js'
import type { Message, SearchResult, Project } from '../types.js'

// Pure function: extract snippet around match
const extractSnippet = (text: string, matchIndex: number, queryLength: number): string => {
  const start = Math.max(0, matchIndex - 50)
  const end = Math.min(text.length, matchIndex + queryLength + 50)
  return (start > 0 ? '...' : '') + text.slice(start, end).trim() + (end < text.length ? '...' : '')
}

// Pure function: find first matching message in session content
const findContentMatch = (
  lines: string[],
  queryLower: string,
  filePath: string
): { msg: Message; snippet: string } | null => {
  for (let i = 0; i < lines.length; i++) {
    const msg = tryParseJsonLine<Message>(lines[i], i + 1, filePath)
    if (!msg) continue
    if (msg.type !== 'user' && msg.type !== 'assistant') continue

    const text = extractTextContent(msg.message)
    const textLower = text.toLowerCase()
    const matchIndex = textLower.indexOf(queryLower)

    if (matchIndex !== -1) {
      return {
        msg,
        snippet: extractSnippet(text, matchIndex, queryLower.length),
      }
    }
  }
  return null
}

// Search single session for content match
const searchSessionContent = (
  projectName: string,
  sessionId: string,
  filePath: string,
  queryLower: string
) =>
  pipe(
    Effect.tryPromise(() => fs.readFile(filePath, 'utf-8')),
    Effect.map((content) => {
      const lines = content.trim().split('\n').filter(Boolean)
      const match = findContentMatch(lines, queryLower, filePath)

      if (!match) return null

      return {
        sessionId,
        projectName,
        title: extractTitle(match.msg.message) || `Session ${sessionId.slice(0, 8)}`,
        matchType: 'content' as const,
        snippet: match.snippet,
        messageUuid: match.msg.uuid,
        timestamp: match.msg.timestamp,
      } satisfies SearchResult
    }),
    Effect.catchAll(() => Effect.succeed(null))
  )

// Search all sessions in a project for content matches
const searchProjectContent = (project: Project, queryLower: string, alreadyFoundIds: Set<string>) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), project.name)
    const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))

    // Filter out already found sessions and create search effects
    const searchEffects = sessionFiles
      .map((file) => ({
        sessionId: file.replace('.jsonl', ''),
        filePath: path.join(projectPath, file),
      }))
      .filter(({ sessionId }) => !alreadyFoundIds.has(`${project.name}:${sessionId}`))
      .map(({ sessionId, filePath }) =>
        searchSessionContent(project.name, sessionId, filePath, queryLower)
      )

    const results = yield* Effect.all(searchEffects, { concurrency: 10 })
    return results.filter((r): r is NonNullable<typeof r> => r !== null)
  })

// Pattern to detect potential session ID queries (hex chars and hyphens, 8+ chars)
const SESSION_ID_PATTERN = /^[a-f0-9][a-f0-9-]{7,}$/i

// Search sessions by partial session ID (file name prefix matching)
export const searchBySessionId = (partialId: string, options: { projectName?: string } = {}) =>
  Effect.gen(function* () {
    const partialIdLower = partialId.toLowerCase()
    const projects = yield* listProjects
    const targetProjects = options.projectName
      ? projects.filter((p) => p.name === options.projectName)
      : projects

    const scanEffects = targetProjects.map((project) =>
      pipe(
        Effect.tryPromise(() => fs.readdir(path.join(getSessionsDir(), project.name))),
        Effect.map((files) =>
          files
            .filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))
            .map((f) => f.replace('.jsonl', ''))
            .filter((id) => id.toLowerCase().startsWith(partialIdLower))
            .map((sessionId) => ({ sessionId, projectName: project.name }))
        ),
        Effect.catchAll(() => Effect.succeed([] as { sessionId: string; projectName: string }[]))
      )
    )

    const matchesNested = yield* Effect.all(scanEffects, { concurrency: 10 })
    const matches = matchesNested.flat()

    // Resolve titles for matched sessions
    const resultEffects = matches.map(({ sessionId, projectName }) =>
      pipe(
        listSessions(projectName),
        Effect.map((sessions) => {
          const session = sessions.find((s) => s.id === sessionId)
          return {
            sessionId,
            projectName,
            title: session?.title ?? session?.customTitle ?? `Session ${sessionId.slice(0, 8)}`,
            matchType: 'sessionId' as const,
            timestamp: session?.updatedAt,
          } satisfies SearchResult
        }),
        Effect.catchAll(() =>
          Effect.succeed({
            sessionId,
            projectName,
            title: `Session ${sessionId.slice(0, 8)}`,
            matchType: 'sessionId' as const,
            timestamp: undefined,
          } satisfies SearchResult)
        )
      )
    )

    const results = yield* Effect.all(resultEffects, { concurrency: 10 })
    return results.sort((a, b) => {
      const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return dateB - dateA
    })
  })

// Search sessions - two-phase: title search (fast) then content search (slow)
export const searchSessions = (
  query: string,
  options: { projectName?: string; searchContent?: boolean } = {}
) =>
  Effect.gen(function* () {
    const { projectName, searchContent = false } = options
    const queryLower = query.toLowerCase()

    // Phase 0: Session ID detection — if query looks like a session ID, search by ID first
    if (SESSION_ID_PATTERN.test(query)) {
      const idResults = yield* searchBySessionId(query, { projectName })
      if (idResults.length > 0) {
        return idResults
      }
    }

    const projects = yield* listProjects
    const targetProjects = projectName ? projects.filter((p) => p.name === projectName) : projects

    // Phase 1: Title search (fast) - using Effect.all for parallel execution
    const titleSearchEffects = targetProjects.map((project) =>
      pipe(
        listSessions(project.name),
        Effect.map((sessions) =>
          sessions
            .filter(
              (session) =>
                (session.title ?? '').toLowerCase().includes(queryLower) ||
                project.name.toLowerCase().includes(queryLower)
            )
            .map(
              (session) =>
                ({
                  sessionId: session.id,
                  projectName: project.name,
                  title: session.title ?? 'Untitled',
                  matchType: 'title' as const,
                  timestamp: session.updatedAt,
                }) satisfies SearchResult
            )
        )
      )
    )

    const titleResultsNested = yield* Effect.all(titleSearchEffects, { concurrency: 10 })
    const titleResults = titleResultsNested.flat()

    // Phase 2: Content search (slow, optional)
    let contentResults: SearchResult[] = []
    if (searchContent) {
      const alreadyFoundIds = new Set(titleResults.map((r) => `${r.projectName}:${r.sessionId}`))

      const contentSearchEffects = targetProjects.map((project) =>
        searchProjectContent(project, queryLower, alreadyFoundIds)
      )

      const contentResultsNested = yield* Effect.all(contentSearchEffects, { concurrency: 5 })
      contentResults = contentResultsNested.flat()
    }

    // Combine and sort by timestamp (newest first)
    const allResults = [...titleResults, ...contentResults]
    return allResults.sort((a, b) => {
      const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return dateB - dateA
    })
  })
