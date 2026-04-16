/**
 * Streaming session metadata - bounded memory for large files
 * Separated from crud.ts to avoid pulling node:fs and node:readline into browser bundles
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { getSessionsDir } from '../paths.js'
import { extractTitle, FileReadError } from '../utils.js'
import { filterSessionFiles, buildSessionMeta, sortSessionsByDate } from './crud-helpers.js'
import type { Message, SessionMeta } from '../types.js'

const log = { warn: (msg: string) => console.warn(msg) }

/** Stream a single JSONL file and extract session metadata without loading full content */
const streamSessionMeta = async (
  filePath: string,
  sessionId: string,
  projectName: string
): Promise<SessionMeta> => {
  let userAssistantCount = 0
  let hasSummary = false
  let title: string | undefined
  let customTitle: string | undefined
  let currentSummary: string | undefined
  let firstTimestamp: string | undefined
  let lastTimestamp: string | undefined

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      const msg = JSON.parse(line) as Message & { customTitle?: string }
      if (msg.type === 'user' || msg.type === 'assistant') {
        userAssistantCount++
        if (msg.timestamp) {
          if (!firstTimestamp) firstTimestamp = msg.timestamp
          lastTimestamp = msg.timestamp
        }
        if (msg.type === 'user' && title === undefined) {
          title = extractTitle(msg.message)
        }
      } else if (msg.type === 'summary' && !hasSummary) {
        hasSummary = true
        currentSummary = msg.summary as string
      } else if (msg.type === 'custom-title' && !customTitle) {
        customTitle = msg.customTitle
      }
    } catch {
      /* skip malformed line */
    }
  }

  return buildSessionMeta(sessionId, projectName, {
    title,
    customTitle,
    currentSummary,
    userAssistantCount,
    hasSummary,
    firstTimestamp,
    lastTimestamp,
  })
}

/** List sessions with streaming — bounded memory for large files */
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
            streamSessionMeta(
              path.join(projectPath, file),
              file.replace('.jsonl', ''),
              projectName
            ),
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
