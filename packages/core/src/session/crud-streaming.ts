/**
 * Lightweight session metadata extraction
 * Avoids full JSON.parse on every line — only parses lines needed for metadata
 * Uses node:fs/promises (not node:fs) to stay compatible with Vite browser bundles
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir } from '../paths.js'
import { extractTitle, FileReadError } from '../utils.js'
import { filterSessionFiles, buildSessionMeta, sortSessionsByDate } from './crud-helpers.js'
import { createLogger } from '../logger.js'
import type { Message, SessionMeta } from '../types.js'

const log = createLogger('crud-streaming')

// Quick regex to extract "type" field without full JSON.parse
const TYPE_RE = /"type"\s*:\s*"([^"]+)"/

/** Scan a JSONL file and extract session metadata with minimal parsing */
const scanSessionMeta = async (
  filePath: string,
  sessionId: string,
  projectName: string
): Promise<SessionMeta> => {
  const content = await fs.readFile(filePath, 'utf-8')
  const lines = content.split('\n')

  let userAssistantCount = 0
  let hasSummary = false
  let title: string | undefined
  let agentTitle: string | undefined
  let customTitle: string | undefined
  let currentSummary: string | undefined
  let firstTimestamp: string | undefined
  let lastTimestamp: string | undefined

  for (const line of lines) {
    if (!line.trim()) continue

    // Fast type check without full parse
    const typeMatch = TYPE_RE.exec(line)
    if (!typeMatch) continue
    const type = typeMatch[1]

    if (type === 'user' || type === 'assistant') {
      userAssistantCount++
      // Extract timestamp with regex (avoid full parse)
      const tsMatch = line.match(/"timestamp"\s*:\s*"([^"]+)"/)
      if (tsMatch) {
        if (!firstTimestamp) firstTimestamp = tsMatch[1]
        lastTimestamp = tsMatch[1]
      }
      // Full parse only for first user message (need extractTitle)
      if (type === 'user' && title === undefined) {
        try {
          const msg = JSON.parse(line) as Message
          title = extractTitle(msg.message)
        } catch {
          /* skip malformed */
        }
      }
    } else if (type === 'summary' && !hasSummary) {
      hasSummary = true
      try {
        const msg = JSON.parse(line) as Message
        currentSummary = msg.summary as string
      } catch {
        /* skip malformed */
      }
    } else if (type === 'custom-title') {
      try {
        const msg = JSON.parse(line) as { customTitle?: string }
        if (msg.customTitle) customTitle = msg.customTitle
      } catch {
        /* skip malformed */
      }
    } else if (type === 'agent-title') {
      try {
        const msg = JSON.parse(line) as { agentTitle?: string }
        if (msg.agentTitle) agentTitle = msg.agentTitle
      } catch {
        /* skip malformed */
      }
    }
  }

  return buildSessionMeta(sessionId, projectName, {
    title,
    agentTitle,
    customTitle,
    currentSummary,
    userAssistantCount,
    hasSummary,
    firstTimestamp,
    lastTimestamp,
  })
}

/** List sessions with lightweight metadata extraction — avoids full JSON.parse per line */
export const listSessionsMeta = (projectName: string) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    const files = yield* Effect.tryPromise({
      try: () => fs.readdir(projectPath),
      catch: (error) => new FileReadError({ filePath: projectPath, cause: error }),
    })

    const sessions = yield* Effect.all(
      filterSessionFiles(files).map((file) =>
        Effect.tryPromise({
          try: () =>
            scanSessionMeta(path.join(projectPath, file), file.replace('.jsonl', ''), projectName),
          catch: (error) =>
            new FileReadError({
              filePath: path.join(projectPath, file),
              cause: error,
            }),
        }).pipe(
          Effect.catchAll((error) => {
            log.warn(`listSessionsMeta: skipping ${file}: ${error}`)
            return Effect.succeed(null)
          })
        )
      ),
      { concurrency: 10 }
    )

    return sortSessionsByDate(sessions.filter((s): s is NonNullable<typeof s> => s !== null))
  })
