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
        title:
          extractTitle(extractTextContent(match.msg.message)) || `Session ${sessionId.slice(0, 8)}`,
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

// Search sessions - two-phase: title search (fast) then content search (slow)
export const searchSessions = (
  query: string,
  options: { projectName?: string; searchContent?: boolean } = {}
) =>
  Effect.gen(function* () {
    const { projectName, searchContent = false } = options
    const queryLower = query.toLowerCase()

    const projects = yield* listProjects
    const targetProjects = projectName ? projects.filter((p) => p.name === projectName) : projects

    // Phase 1: Title search (fast) - using Effect.all for parallel execution
    const titleSearchEffects = targetProjects.map((project) =>
      pipe(
        listSessions(project.name),
        Effect.map((sessions) =>
          sessions
            .filter((session) => (session.title ?? '').toLowerCase().includes(queryLower))
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
