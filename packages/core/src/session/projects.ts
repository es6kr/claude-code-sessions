/**
 * Project listing operations
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir, folderNameToPath } from '../paths.js'
import type { Project } from '../types.js'
import { fileExists } from '../utils.js'
import { createLogger } from '../logger.js'

const log = createLogger('projects')

// List all project directories
export const listProjects = Effect.gen(function* () {
  const sessionsDir = getSessionsDir()

  const exists = yield* Effect.tryPromise(() => fileExists(sessionsDir))

  if (!exists) {
    return [] as Project[]
  }

  const entries = yield* Effect.tryPromise(() => fs.readdir(sessionsDir, { withFileTypes: true }))

  const results = yield* Effect.all(
    entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((entry) =>
        Effect.gen(function* () {
          const projectPath = path.join(sessionsDir, entry.name)
          const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))
          // Exclude agent- files (subagent logs)
          const sessionFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))
          const displayName = yield* Effect.tryPromise(() => folderNameToPath(entry.name))

          return {
            name: entry.name,
            displayName,
            path: projectPath,
            sessionCount: sessionFiles.length,
          } satisfies Project
        }).pipe(
          // Guard against TOCTOU: an entry's folder may vanish between the top-level
          // readdir and this per-entry readdir (cross-PC sync, manual deletion).
          // A single ENOENT must not abort enumeration of healthy projects.
          // See Issue #103.
          Effect.catchAll((error) => {
            log.debug(`listProjects: skipping unreadable project ${entry.name}`, error)
            return Effect.succeed(null as Project | null)
          })
        )
      ),
    { concurrency: 10 }
  )

  return results.filter((p): p is Project => p !== null)
})
