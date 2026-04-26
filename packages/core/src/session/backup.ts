/**
 * Session backup listing and restore operations
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir } from '../paths.js'
import { fileExists } from '../utils.js'
import type { BackupSessionInfo, RestoreSessionResult } from '../types.js'
import { createLogger } from '../logger.js'

const log = createLogger('backup')

/** Parse backup filename into project name and session ID */
const parseBackupFilename = (
  filename: string
): { projectName: string; sessionId: string } | null => {
  if (!filename.endsWith('.jsonl')) return null
  const base = filename.slice(0, -'.jsonl'.length)
  const lastUnderscore = base.lastIndexOf('_')
  if (lastUnderscore <= 0 || lastUnderscore >= base.length - 1) return null
  return {
    projectName: base.slice(0, lastUnderscore),
    sessionId: base.slice(lastUnderscore + 1),
  }
}

/** Extract title from backup file with tiered fallback: customTitle → summary → first user message */
const extractBackupTitle = (lines: string[]): string => {
  let latestSummary: string | undefined
  let firstUserMessage: string | undefined

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>
      if (parsed.type === 'custom-title' && typeof parsed.customTitle === 'string') {
        return parsed.customTitle
      }
      if (parsed.type === 'summary' && typeof parsed.summary === 'string') {
        latestSummary = parsed.summary
      }
      if (
        parsed.type === 'user' &&
        typeof parsed.text === 'string' &&
        firstUserMessage === undefined
      ) {
        firstUserMessage = parsed.text
      }
    } catch {
      // skip invalid lines
    }
  }
  return latestSummary ?? firstUserMessage ?? 'Untitled'
}

/** List all backed-up sessions from the .bak directory */
export const listBackupSessions = () =>
  Effect.gen(function* () {
    const sessionsDir = getSessionsDir()
    const backupDir = path.join(sessionsDir, '.bak')

    const exists = yield* Effect.tryPromise(() => fileExists(backupDir))
    if (!exists) return [] as BackupSessionInfo[]

    const files = yield* Effect.tryPromise(() => fs.readdir(backupDir))
    const results: BackupSessionInfo[] = []

    for (const file of files) {
      const parsed = parseBackupFilename(file)
      if (!parsed) continue

      const filePath = path.join(backupDir, file)
      try {
        const [stat, content] = yield* Effect.all([
          Effect.tryPromise(() => fs.stat(filePath)),
          Effect.tryPromise(() => fs.readFile(filePath, 'utf-8')),
        ])

        const lines = content.trim().split('\n').filter(Boolean)
        const title = extractBackupTitle(lines)

        results.push({
          id: parsed.sessionId,
          projectName: parsed.projectName,
          title,
          messageCount: lines.length,
          backupDate: stat.mtimeMs,
          fileSize: stat.size,
        })
      } catch {
        log.debug(`Skipping unreadable backup file: ${file}`)
      }
    }

    return results
  })

/** Find linked agent backup files for a session in the project's .bak directory */
const findLinkedAgentBackups = (projectBackupDir: string, sessionId: string) =>
  Effect.gen(function* () {
    const exists = yield* Effect.tryPromise(() => fileExists(projectBackupDir))
    if (!exists) return [] as string[]

    const files = yield* Effect.tryPromise(() => fs.readdir(projectBackupDir))
    const agentFiles = files.filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'))
    const linked: string[] = []

    for (const agentFile of agentFiles) {
      const filePath = path.join(projectBackupDir, agentFile)
      try {
        const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
        const firstLine = content.split('\n')[0]
        if (firstLine) {
          const parsed = JSON.parse(firstLine) as { sessionId?: string }
          if (parsed.sessionId === sessionId) {
            linked.push(agentFile)
          }
        }
      } catch {
        log.debug(`Skipping unreadable agent backup: ${agentFile}`)
      }
    }

    return linked
  })

/** Restore a backed-up session to its original location */
export const restoreSession = (projectName: string, sessionId: string) =>
  Effect.gen(function* () {
    const sessionsDir = getSessionsDir()
    const backupDir = path.join(sessionsDir, '.bak')
    const backupPath = path.join(backupDir, `${projectName}_${sessionId}.jsonl`)

    // Verify backup exists
    const backupExists = yield* Effect.tryPromise(() => fileExists(backupPath))
    if (!backupExists) {
      return {
        success: false,
        error: `Backup not found: ${projectName}/${sessionId}`,
      } satisfies RestoreSessionResult
    }

    // Check target doesn't already exist
    const projectDir = path.join(sessionsDir, projectName)
    const targetPath = path.join(projectDir, `${sessionId}.jsonl`)
    const targetExists = yield* Effect.tryPromise(() => fileExists(targetPath))
    if (targetExists) {
      return {
        success: false,
        error: `Session already exists: ${projectName}/${sessionId}. Cannot overwrite.`,
      } satisfies RestoreSessionResult
    }

    // Create project directory if needed
    yield* Effect.tryPromise(() => fs.mkdir(projectDir, { recursive: true }))

    // Move session backup to original location
    yield* Effect.tryPromise(() => fs.rename(backupPath, targetPath))

    // Restore linked agent backups with per-file error handling
    const projectBackupDir = path.join(projectDir, '.bak')
    const linkedAgents = yield* findLinkedAgentBackups(projectBackupDir, sessionId)
    let restoredAgents = 0

    for (const agentFile of linkedAgents) {
      const agentBackupPath = path.join(projectBackupDir, agentFile)
      const agentTargetPath = path.join(projectDir, agentFile)
      const agentRestoreResult = yield* Effect.either(
        Effect.gen(function* () {
          const agentExists = yield* Effect.tryPromise(() => fileExists(agentTargetPath))
          if (!agentExists) {
            yield* Effect.tryPromise(() => fs.rename(agentBackupPath, agentTargetPath))
            return true
          }
          return false
        })
      )

      if (agentRestoreResult._tag === 'Right') {
        if (agentRestoreResult.right) {
          restoredAgents++
        }
      } else {
        log.warn(
          `Failed to restore linked agent backup ${agentFile} for session ${projectName}/${sessionId}: ${String(agentRestoreResult.left)}`
        )
      }
    }

    return {
      success: true,
      restoredPath: targetPath,
      restoredAgents,
    } satisfies RestoreSessionResult
  })
