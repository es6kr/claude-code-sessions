/**
 * Agent file management utilities
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir } from './paths.js'

// Find agent files linked to a session
export const findLinkedAgents = (projectName: string, sessionId: string) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))
    const agentFiles = files.filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'))

    const linkedAgents: string[] = []

    for (const agentFile of agentFiles) {
      const filePath = path.join(projectPath, agentFile)
      const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
      const firstLine = content.split('\n')[0]

      if (firstLine) {
        try {
          const parsed = JSON.parse(firstLine) as { sessionId?: string }
          if (parsed.sessionId === sessionId) {
            linkedAgents.push(agentFile.replace('.jsonl', ''))
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    return linkedAgents
  })

// Find orphan agent files (agents whose parent session no longer exists)
export const findOrphanAgents = (projectName: string) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))

    const sessionIds = new Set(
      files
        .filter((f) => !f.startsWith('agent-') && f.endsWith('.jsonl'))
        .map((f) => f.replace('.jsonl', ''))
    )

    const agentFiles = files.filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'))
    const orphanAgents: Array<{ agentId: string; sessionId: string }> = []

    for (const agentFile of agentFiles) {
      const filePath = path.join(projectPath, agentFile)
      const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
      const firstLine = content.split('\n')[0]

      if (firstLine) {
        try {
          const parsed = JSON.parse(firstLine) as { sessionId?: string }
          if (parsed.sessionId && !sessionIds.has(parsed.sessionId)) {
            orphanAgents.push({
              agentId: agentFile.replace('.jsonl', ''),
              sessionId: parsed.sessionId,
            })
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    return orphanAgents
  })

// Delete orphan agent files (move to .bak)
export const deleteOrphanAgents = (projectName: string) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    const orphans = yield* findOrphanAgents(projectName)

    // Create backup directory
    const backupDir = path.join(projectPath, '.bak')
    yield* Effect.tryPromise(() => fs.mkdir(backupDir, { recursive: true }))

    const deletedAgents: string[] = []

    for (const orphan of orphans) {
      const agentPath = path.join(projectPath, `${orphan.agentId}.jsonl`)
      const agentBackupPath = path.join(backupDir, `${orphan.agentId}.jsonl`)
      yield* Effect.tryPromise(() => fs.rename(agentPath, agentBackupPath))
      deletedAgents.push(orphan.agentId)
    }

    return { success: true, deletedAgents, count: deletedAgents.length }
  })
