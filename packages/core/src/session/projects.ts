/**
 * Project listing operations
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir, folderNameToPath } from '../paths.js'
import type { Project } from '../types.js'
import { fileExists } from '../utils.js'

// List all project directories
export const listProjects = Effect.gen(function* () {
  const sessionsDir = getSessionsDir()

  const exists = yield* Effect.tryPromise(() => fileExists(sessionsDir))

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
          const displayName = yield* Effect.tryPromise(() => folderNameToPath(entry.name))

          // Get newest file mtime for project-level sorting
          let lastModified = 0
          if (sessionFiles.length > 0) {
            const stats = yield* Effect.all(
              sessionFiles.map((f) =>
                Effect.tryPromise(() =>
                  fs.stat(path.join(projectPath, f)).then((s) => s.mtimeMs)
                ).pipe(Effect.orElseSucceed(() => 0))
              ),
              { concurrency: 20 }
            )
            lastModified = stats.reduce((max, value) => (value > max ? value : max), 0)
          }

          return {
            name: entry.name,
            displayName,
            path: projectPath,
            sessionCount: sessionFiles.length,
            lastModified,
          } satisfies Project
        })
      ),
    { concurrency: 10 }
  )

  return projects
})
