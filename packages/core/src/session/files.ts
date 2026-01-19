/**
 * Session file tracking operations
 */
import { Effect } from 'effect'
import { readSession } from './crud.js'
import type { FileChange, SessionFilesSummary } from '../types.js'

// Get files changed in a session (from file-history-snapshot and tool_use)
export const getSessionFiles = (projectName: string, sessionId: string) =>
  Effect.gen(function* () {
    const messages = yield* readSession(projectName, sessionId)
    const fileChanges: FileChange[] = []
    const seenFiles = new Set<string>()

    for (const msg of messages) {
      // Check file-history-snapshot type
      if (msg.type === 'file-history-snapshot') {
        const snapshot = msg as unknown as {
          type: string
          messageId?: string
          snapshot?: {
            trackedFileBackups?: Record<string, unknown>
            timestamp?: string
          }
        }
        const backups = snapshot.snapshot?.trackedFileBackups
        if (backups && typeof backups === 'object') {
          for (const filePath of Object.keys(backups)) {
            if (!seenFiles.has(filePath)) {
              seenFiles.add(filePath)
              fileChanges.push({
                path: filePath,
                action: 'modified',
                timestamp: snapshot.snapshot?.timestamp,
                messageUuid: snapshot.messageId ?? msg.uuid,
              })
            }
          }
        }
      }

      // Check tool_use for Write/Edit operations
      if (msg.type === 'assistant' && msg.message?.content) {
        const content = msg.message.content
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item && typeof item === 'object' && 'type' in item && item.type === 'tool_use') {
              const toolUse = item as { name?: string; input?: { file_path?: string } }
              if (
                (toolUse.name === 'Write' || toolUse.name === 'Edit') &&
                toolUse.input?.file_path
              ) {
                const filePath = toolUse.input.file_path
                if (!seenFiles.has(filePath)) {
                  seenFiles.add(filePath)
                  fileChanges.push({
                    path: filePath,
                    action: toolUse.name === 'Write' ? 'created' : 'modified',
                    timestamp: msg.timestamp,
                    messageUuid: msg.uuid,
                  })
                }
              }
            }
          }
        }
      }
    }

    return {
      sessionId,
      projectName,
      files: fileChanges,
      totalChanges: fileChanges.length,
    } satisfies SessionFilesSummary
  })
