/**
 * Session message chain validation utilities
 *
 * Validates:
 * 1. parentUuid chain integrity (skip file-history-snapshot)
 * 2. tool_use_id / tool_result matching
 */

export interface ChainError {
  type: 'broken_chain' | 'orphan_parent'
  uuid: string
  line: number
  parentUuid: string | null
  expectedParent?: string
}

export interface ToolUseResultError {
  type: 'orphan_tool_result'
  uuid: string
  line: number
  toolUseId: string
}

export interface ProgressError {
  type: 'unwanted_progress'
  line: number
  hookEvent?: string
  hookName?: string
}

export interface ValidationResult {
  valid: boolean
  errors: (ChainError | ToolUseResultError | ProgressError)[]
}

interface MessageContent {
  type?: string
  id?: string
  tool_use_id?: string
}

interface MessagePayload {
  role?: string
  content?: unknown // Can be string | MessageContent[] | etc.
}

export interface GenericMessage {
  type?: string
  uuid?: string
  parentUuid?: string | null
  message?: MessagePayload
  messageId?: string
}

/**
 * Validate parentUuid chain for messages
 *
 * Rules:
 * - Skip file-history-snapshot type (has no uuid, uses messageId instead)
 * - Skip messages without uuid
 * - First message can have null parentUuid
 * - Subsequent messages must have valid parentUuid pointing to existing uuid
 */
export function validateChain(
  messages: readonly GenericMessage[]
): ValidationResult & { errors: ChainError[] } {
  const errors: ChainError[] = []

  // Collect all uuids for validation
  const uuids = new Set<string>()
  for (const msg of messages) {
    if (msg.uuid) {
      uuids.add(msg.uuid)
    }
  }

  // Track first message with uuid
  let foundFirstMessage = false

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    // Skip file-history-snapshot and summary (no uuid chain participation)
    if (msg.type === 'file-history-snapshot' || msg.type === 'summary') {
      continue
    }

    // Skip messages without uuid
    if (!msg.uuid) {
      continue
    }

    // First message can have null parentUuid or orphan_parent (compacted session)
    // Only undefined is an error for first message
    if (!foundFirstMessage) {
      foundFirstMessage = true
      // undefined is an error
      if (msg.parentUuid === undefined) {
        errors.push({
          type: 'broken_chain',
          uuid: msg.uuid,
          line: i + 1,
          parentUuid: null,
        })
        continue
      }
      // null or orphan_parent is OK for first message
      continue
    }

    // Check for broken chain (null/undefined parentUuid for non-first message)
    if (msg.parentUuid === null || msg.parentUuid === undefined) {
      errors.push({
        type: 'broken_chain',
        uuid: msg.uuid,
        line: i + 1,
        parentUuid: null,
      })
      continue
    }

    // Check for orphan parent (parentUuid pointing to non-existent uuid)
    if (!uuids.has(msg.parentUuid)) {
      errors.push({
        type: 'orphan_parent',
        uuid: msg.uuid,
        line: i + 1,
        parentUuid: msg.parentUuid,
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate for unwanted progress messages (hook outputs)
 *
 * Only 'Stop' hookEvent is treated as an error (should be removed)
 */
export function validateProgressMessages(
  messages: readonly GenericMessage[]
): ValidationResult & { errors: ProgressError[] } {
  const errors: ProgressError[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.type === 'progress') {
      const progressMsg = msg as GenericMessage & {
        hookEvent?: string
        hookName?: string
        data?: { hookEvent?: string; hookName?: string }
      }
      // Support both flat (hookEvent) and nested (data.hookEvent) formats
      const hookEvent = progressMsg.hookEvent ?? progressMsg.data?.hookEvent
      const hookName = progressMsg.hookName ?? progressMsg.data?.hookName

      // 'Stop' hookEvent or 'SessionStart:resume' hookName is an error
      if (hookEvent === 'Stop' || hookName === 'SessionStart:resume') {
        errors.push({
          type: 'unwanted_progress',
          line: i + 1,
          hookEvent,
          hookName,
        })
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate tool_use_id / tool_result matching
 *
 * Rules:
 * - All tool_result blocks must have a corresponding tool_use block in the session
 * - tool_use blocks are collected from all messages (not just previous)
 */
export function validateToolUseResult(
  messages: readonly GenericMessage[]
): ValidationResult & { errors: ToolUseResultError[] } {
  const errors: ToolUseResultError[] = []

  // Collect all tool_use IDs
  const toolUseIds = new Set<string>()
  for (const msg of messages) {
    const content = msg.message?.content
    if (Array.isArray(content)) {
      for (const item of content as MessageContent[]) {
        if (item.type === 'tool_use' && item.id) {
          toolUseIds.add(item.id)
        }
      }
    }
  }

  // Check all tool_result blocks have matching tool_use
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const content = msg.message?.content
    if (!Array.isArray(content)) {
      continue
    }

    for (const item of content as MessageContent[]) {
      if (item.type === 'tool_result' && item.tool_use_id) {
        if (!toolUseIds.has(item.tool_use_id)) {
          errors.push({
            type: 'orphan_tool_result',
            uuid: msg.uuid || '',
            line: i + 1,
            toolUseId: item.tool_use_id,
          })
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Auto-repair chain errors by linking messages to their previous message
 *
 * Fixes:
 * - broken_chain: Sets parentUuid to the previous message's uuid
 * - orphan_parent: Sets parentUuid to the previous message's uuid
 *
 * @param messages - Array of messages (will be mutated)
 * @returns Number of repairs made
 */
export function autoRepairChain<T extends GenericMessage>(messages: T[]): number {
  let repairCount = 0

  // Build uuid set for validation
  const uuids = new Set<string>()
  for (const msg of messages) {
    if (msg.uuid) {
      uuids.add(msg.uuid)
    }
  }

  // Track last valid uuid and state
  let lastUuid: string | null = null
  let isFirstWithUuid = true

  for (const msg of messages) {
    // Skip file-history-snapshot and summary (no uuid chain participation)
    if (msg.type === 'file-history-snapshot' || msg.type === 'summary') {
      continue
    }

    // Skip messages without uuid
    if (!msg.uuid) {
      continue
    }

    // First message with uuid: only fix undefined -> null
    // null and orphan_parent are valid for first message (compacted session)
    if (isFirstWithUuid) {
      isFirstWithUuid = false
      if (msg.parentUuid === undefined) {
        msg.parentUuid = null
        repairCount++
      }
      lastUuid = msg.uuid
      continue
    }

    // Check for broken_chain (null/undefined parentUuid)
    if (msg.parentUuid === null || msg.parentUuid === undefined) {
      if (lastUuid) {
        msg.parentUuid = lastUuid
        repairCount++
      }
    }
    // Check for orphan_parent (parentUuid points to non-existent uuid)
    else if (!uuids.has(msg.parentUuid)) {
      if (lastUuid) {
        msg.parentUuid = lastUuid
        repairCount++
      }
    }

    lastUuid = msg.uuid
  }

  return repairCount
}

/**
 * Repair parentUuid chain after removing messages
 *
 * When a message is removed, any message that had the removed message as its
 * parentUuid needs to be updated to point to the removed message's parentUuid.
 * Handles chained removals (e.g., a -> p1 -> p2 -> b, removing p1 and p2 should result in a -> b).
 *
 * @param messages - Array of messages (will be mutated)
 * @param removedMessages - Messages that were removed (need uuid and parentUuid)
 */
export function repairParentUuidChain<T extends GenericMessage>(
  messages: T[],
  removedMessages: T[]
): void {
  // Build a map of removed uuid -> parentUuid for chain resolution
  const removedMap = new Map<string, string | null | undefined>()
  for (const removed of removedMessages) {
    if (removed.uuid && removed.type !== 'file-history-snapshot') {
      removedMap.set(removed.uuid, removed.parentUuid)
    }
  }

  // Resolve final parent by following the chain through removed messages
  const resolveParent = (parentUuid: string | null | undefined): string | null | undefined => {
    let current = parentUuid
    while (current && removedMap.has(current)) {
      current = removedMap.get(current)
    }
    return current
  }

  // Update all messages pointing to removed messages
  for (const msg of messages) {
    if (msg.parentUuid && removedMap.has(msg.parentUuid)) {
      msg.parentUuid = resolveParent(msg.parentUuid)
    }
  }
}

/**
 * Delete a message and repair the parentUuid chain
 *
 * This is a pure function for client-side use (without file I/O)
 * Server-side deleteMessage in crud.ts uses similar logic with file operations
 *
 * @param messages - Array of messages (will be mutated)
 * @param targetId - uuid, messageId, or leafUuid of message to delete
 * @param targetType - Optional: 'file-history-snapshot' or 'summary' to disambiguate collisions
 * @returns Object with deleted message and messages to also delete (orphan tool_results)
 */
export function deleteMessageWithChainRepair<T extends GenericMessage>(
  messages: T[],
  targetId: string,
  targetType?: 'file-history-snapshot' | 'summary'
): { deleted: T | null; alsoDeleted: T[] } {
  let targetIndex = -1

  // Find target message
  if (targetType === 'file-history-snapshot') {
    targetIndex = messages.findIndex(
      (m) => m.type === 'file-history-snapshot' && m.messageId === targetId
    )
  } else if (targetType === 'summary') {
    targetIndex = messages.findIndex(
      (m) => (m as GenericMessage & { leafUuid?: string }).leafUuid === targetId
    )
  } else {
    // Priority: uuid > leafUuid > messageId
    targetIndex = messages.findIndex((m) => m.uuid === targetId)
    if (targetIndex === -1) {
      targetIndex = messages.findIndex(
        (m) => (m as GenericMessage & { leafUuid?: string }).leafUuid === targetId
      )
    }
    if (targetIndex === -1) {
      targetIndex = messages.findIndex(
        (m) => m.type === 'file-history-snapshot' && m.messageId === targetId
      )
    }
  }

  if (targetIndex === -1) {
    return { deleted: null, alsoDeleted: [] }
  }

  const deletedMsg = messages[targetIndex]

  // Collect tool_use IDs from deleted message
  const toolUseIds: string[] = []
  if (deletedMsg.type === 'assistant') {
    const content = deletedMsg.message?.content
    if (Array.isArray(content)) {
      for (const item of content as MessageContent[]) {
        if (item.type === 'tool_use' && item.id) {
          toolUseIds.push(item.id)
        }
      }
    }
  }

  // Find orphan tool_result messages
  const toolResultIndices: number[] = []
  if (toolUseIds.length > 0) {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (msg.type === 'user') {
        const content = msg.message?.content
        if (Array.isArray(content)) {
          for (const item of content as MessageContent[]) {
            if (
              item.type === 'tool_result' &&
              item.tool_use_id &&
              toolUseIds.includes(item.tool_use_id)
            ) {
              toolResultIndices.push(i)
              break
            }
          }
        }
      }
    }
  }

  // All indices to delete (sorted descending for safe splice)
  const indicesToDelete = [targetIndex, ...toolResultIndices].sort((a, b) => b - a)

  // Collect messages to delete before removing
  const messagesToDelete = indicesToDelete.map((i) => messages[i])
  const alsoDeleted = toolResultIndices.map((i) => messages[i])

  // Repair parentUuid chain using the extracted utility
  repairParentUuidChain(messages, messagesToDelete)

  // Remove messages in reverse order
  for (const idx of indicesToDelete) {
    messages.splice(idx, 1)
  }

  return { deleted: deletedMsg, alsoDeleted }
}
