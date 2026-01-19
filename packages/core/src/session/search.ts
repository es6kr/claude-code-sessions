/**
 * Session search operations
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir } from '../paths.js'
import { extractTextContent, extractTitle } from '../utils.js'
import { listProjects } from './projects.js'
import { listSessions } from './crud.js'
import type { Message, SearchResult } from '../types.js'

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
