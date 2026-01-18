/**
 * Agent file management utilities
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir } from './paths.js'
import type { Message } from './types.js'

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

// Internal type for orphan agents with file path and line count
type OrphanAgentWithPath = {
  agentId: string
  sessionId: string
  filePath: string
  lineCount: number
}

// Internal function to find orphan agents with file paths (used by delete)
const findOrphanAgentsWithPaths = (projectName: string) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))

    // Collect session IDs from .jsonl files (excluding agent files)
    const sessionIds = new Set(
      files
        .filter((f) => !f.startsWith('agent-') && f.endsWith('.jsonl'))
        .map((f) => f.replace('.jsonl', ''))
    )

    const orphanAgents: OrphanAgentWithPath[] = []

    // Helper to check if an agent file is orphan
    const checkAgentFile = async (
      filePath: string
    ): Promise<{ agentId: string; sessionId: string; lineCount: number } | null> => {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        const lines = content.split('\n').filter((l) => l.trim())
        const firstLine = lines[0]
        if (!firstLine) return null

        const parsed = JSON.parse(firstLine) as { sessionId?: string }
        if (parsed.sessionId && !sessionIds.has(parsed.sessionId)) {
          const fileName = path.basename(filePath)
          return {
            agentId: fileName.replace('.jsonl', ''),
            sessionId: parsed.sessionId,
            lineCount: lines.length,
          }
        }
      } catch {
        // Skip invalid files
      }
      return null
    }

    // 1. Check agent files in project root
    const rootAgentFiles = files.filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'))
    for (const agentFile of rootAgentFiles) {
      const filePath = path.join(projectPath, agentFile)
      const orphan = yield* Effect.tryPromise(() => checkAgentFile(filePath))
      if (orphan) {
        orphanAgents.push({ ...orphan, filePath })
      }
    }

    // 2. Check subagents folders inside session directories
    for (const entry of files) {
      // Check if it's a directory (potential session folder)
      const entryPath = path.join(projectPath, entry)
      const stat = yield* Effect.tryPromise(() => fs.stat(entryPath).catch(() => null))

      if (stat?.isDirectory() && !entry.startsWith('.')) {
        // Check for subagents folder
        const subagentsPath = path.join(entryPath, 'subagents')
        const subagentsExists = yield* Effect.tryPromise(() =>
          fs
            .stat(subagentsPath)
            .then(() => true)
            .catch(() => false)
        )

        if (subagentsExists) {
          const subagentFiles = yield* Effect.tryPromise(() =>
            fs.readdir(subagentsPath).catch(() => [])
          )

          for (const subagentFile of subagentFiles) {
            if (subagentFile.startsWith('agent-') && subagentFile.endsWith('.jsonl')) {
              const filePath = path.join(subagentsPath, subagentFile)
              const orphan = yield* Effect.tryPromise(() => checkAgentFile(filePath))
              if (orphan) {
                orphanAgents.push({ ...orphan, filePath })
              }
            }
          }
        }
      }
    }

    return orphanAgents
  })

// Find orphan agent files (agents whose parent session no longer exists)
// Checks both:
// 1. agent-*.jsonl files in project root
// 2. agent-*.jsonl files in <session-id>/subagents/ folders
export const findOrphanAgents = (projectName: string) =>
  Effect.gen(function* () {
    const orphans = yield* findOrphanAgentsWithPaths(projectName)
    // Return without filePath for API compatibility
    return orphans.map(({ agentId, sessionId }) => ({ agentId, sessionId }))
  })

// Delete orphan agent files
// - Files with ≤2 lines (warmup only): permanently delete
// - Files with >2 lines: move to .bak for recovery
// - Clean up empty subagents folders and empty session folders
export const deleteOrphanAgents = (projectName: string) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    const orphans = yield* findOrphanAgentsWithPaths(projectName)

    const deletedAgents: string[] = []
    const backedUpAgents: string[] = []
    const cleanedFolders: string[] = []
    let backupDirCreated = false

    // Track folders that might become empty
    const foldersToCheck = new Set<string>()

    for (const orphan of orphans) {
      // Track parent folders for cleanup
      const parentDir = path.dirname(orphan.filePath)
      if (parentDir.endsWith('/subagents') || parentDir.endsWith('\\subagents')) {
        foldersToCheck.add(parentDir)
      }

      if (orphan.lineCount <= 2) {
        // Warmup-only files: permanently delete
        yield* Effect.tryPromise(() => fs.unlink(orphan.filePath))
        deletedAgents.push(orphan.agentId)
      } else {
        // Files with actual data: move to .bak
        if (!backupDirCreated) {
          const backupDir = path.join(projectPath, '.bak')
          yield* Effect.tryPromise(() => fs.mkdir(backupDir, { recursive: true }))
          backupDirCreated = true
        }
        const backupDir = path.join(projectPath, '.bak')
        const agentBackupPath = path.join(backupDir, `${orphan.agentId}.jsonl`)
        yield* Effect.tryPromise(() => fs.rename(orphan.filePath, agentBackupPath))
        backedUpAgents.push(orphan.agentId)
      }
    }

    // Clean up empty subagents folders and their parent session folders
    for (const subagentsDir of foldersToCheck) {
      const isEmpty = yield* Effect.tryPromise(async () => {
        const files = await fs.readdir(subagentsDir)
        return files.length === 0
      })

      if (isEmpty) {
        // Remove empty subagents folder
        yield* Effect.tryPromise(() => fs.rmdir(subagentsDir))
        cleanedFolders.push(subagentsDir)

        // Check if parent session folder is also empty
        const sessionDir = path.dirname(subagentsDir)
        const sessionDirEmpty = yield* Effect.tryPromise(async () => {
          const files = await fs.readdir(sessionDir)
          return files.length === 0
        })

        if (sessionDirEmpty) {
          yield* Effect.tryPromise(() => fs.rmdir(sessionDir))
          cleanedFolders.push(sessionDir)
        }
      }
    }

    return {
      success: true,
      deletedAgents,
      backedUpAgents,
      cleanedFolders,
      deletedCount: deletedAgents.length,
      backedUpCount: backedUpAgents.length,
      cleanedFolderCount: cleanedFolders.length,
      count: deletedAgents.length + backedUpAgents.length,
    }
  })

// Load agent messages from agent session file
export const loadAgentMessages = (
  projectName: string,
  _sessionId: string, // Reserved for future validation
  agentId: string
) =>
  Effect.gen(function* () {
    const projectPath = path.join(getSessionsDir(), projectName)
    // Agent files are stored as agent-<agentId>.jsonl in project directory
    const agentFilePath = path.join(projectPath, `${agentId}.jsonl`)

    const content = yield* Effect.tryPromise(() => fs.readFile(agentFilePath, 'utf-8'))

    const lines = content.split('\n').filter((line) => line.trim())
    const messages: Message[] = []

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Message
        // Skip header line (contains sessionId)
        if ('sessionId' in parsed && !('type' in parsed)) {
          continue
        }
        messages.push(parsed)
      } catch {
        // Skip invalid JSON lines
      }
    }

    return messages
  })
