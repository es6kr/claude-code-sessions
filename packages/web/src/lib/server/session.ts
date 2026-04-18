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

export const deleteTitleMessages = (
  projectName: string,
  sessionId: string,
  type: 'custom-title' | 'agent-name'
) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = lines.map((line) => JSON.parse(line) as Message)

    const filtered = messages.filter((m) => m.type !== type)
    if (filtered.length === messages.length) {
      return { success: false, error: `No ${type} messages found` }
    }

    const newContent = filtered.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))
    return { success: true, removed: messages.length - filtered.length }
  })

export const deleteTitleMessageByIndex = (
  projectName: string,
  sessionId: string,
  lineIndex: number
) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = lines.map((line) => JSON.parse(line) as Message)

    if (lineIndex < 0 || lineIndex >= messages.length) {
      return { success: false, error: 'Index out of bounds' }
    }

    const msg = messages[lineIndex]
    if (msg.type !== 'custom-title' && msg.type !== 'agent-name') {
      return {
        success: false,
        error: `Message at index ${lineIndex} is type ${msg.type}, not custom-title or agent-name`,
      }
    }

    const deleted = messages.splice(lineIndex, 1)[0]
    const newContent = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))
    return { success: true, deletedMessage: deleted }
  })

export const updateTitleMessageByIndex = (
  projectName: string,
  sessionId: string,
  lineIndex: number,
  newTitle: string
) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = lines.map((line) => JSON.parse(line) as Record<string, unknown>)

    if (lineIndex < 0 || lineIndex >= messages.length) {
      return { success: false, error: 'Index out of bounds' }
    }

    const msg = messages[lineIndex]
    if (msg.type === 'custom-title') {
      msg.customTitle = newTitle
    } else if (msg.type === 'agent-name') {
      msg.agentName = newTitle
    } else {
      return { success: false, error: `Message at index ${lineIndex} is type ${msg.type}` }
    }

    const newContent = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))
    return { success: true }
  })

export const updateAllTitleMessages = (projectName: string, sessionId: string, newTitle: string) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = lines.map((line) => JSON.parse(line) as Record<string, unknown>)

    let updated = 0
    for (const msg of messages) {
      if (msg.type === 'custom-title') {
        msg.customTitle = newTitle
        updated++
      } else if (msg.type === 'agent-name') {
        msg.agentName = newTitle
        updated++
      }
    }

    if (updated === 0) {
      return { success: true, updated: 0 }
    }

    const newContent = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))
    return { success: true, updated }
  })

export const addCustomTitle = (projectName: string, sessionId: string, title: string) =>
  Effect.gen(function* () {
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const record = JSON.stringify({ type: 'custom-title', customTitle: title, sessionId })
    const newContent = content.trimEnd() + '\n' + record + '\n'
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
