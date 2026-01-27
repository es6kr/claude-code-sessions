/**
 * Re-export all session management functions from @claude-sessions/core
 * This maintains backward compatibility with existing API routes
 */
export * from '@claude-sessions/core'

// Additional web-specific functions
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  getSessionsDir,
  autoRepairChain,
  validateChain,
  getLogger,
  type Message,
} from '@claude-sessions/core'

export const updateCustomTitle = (
  projectName: string,
  sessionId: string,
  messageUuid: string,
  newTitle: string
) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = lines.map((line) => JSON.parse(line) as Message)

    const targetIndex = messages.findIndex((m) => m.uuid === messageUuid)
    if (targetIndex === -1) {
      return { success: false, error: 'Message not found' }
    }

    const msg = messages[targetIndex]
    if (msg.type !== 'custom-title') {
      return { success: false, error: 'Message is not a custom-title type' }
    }

    // Update customTitle field
    ;(msg as Message & { customTitle?: string }).customTitle = newTitle

    const newContent = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))

    return { success: true }
  })

/**
 * Repair broken parentUuid chain in a session
 * Returns number of repairs made
 */
export const repairChain = (projectName: string, sessionId: string) =>
  Effect.gen(function* () {
    const logger = getLogger()
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = lines.map((line) => JSON.parse(line) as Message)

    logger.info(`[repairChain] ${sessionId}: ${messages.length} messages`)

    // Log validation errors before repair
    const beforeResult = validateChain(messages)
    logger.info(
      `[repairChain] validateChain: valid=${beforeResult.valid}, errors=${beforeResult.errors.length}`
    )
    for (const e of beforeResult.errors) {
      logger.warn(`[repairChain] error: ${JSON.stringify(e)}`)
    }

    const repairCount = autoRepairChain(messages)
    logger.info(`[repairChain] autoRepairChain returned: ${repairCount}`)

    if (repairCount > 0) {
      const newContent = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
      yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))
      logger.info(`[repairChain] ${sessionId}: Repaired ${repairCount} chain error(s)`)
    } else {
      logger.info(`[repairChain] ${sessionId}: No repairs needed`)
    }

    return { success: true, repairCount }
  })
