/**
 * TDD: Chain repair functionality tests
 *
 * Scenario: User sees broken chain in web UI and clicks "Repair" button
 * Expected: Chain is automatically repaired by linking messages sequentially
 */

import { describe, it, expect } from 'vitest'
import { validateChain, autoRepairChain } from '../session/validation.js'

interface TestMessage {
  type: string
  uuid?: string
  messageId?: string
  parentUuid?: string | null
}

describe('autoRepairChain', () => {
  it('should repair broken_chain by linking to previous message', () => {
    // Given: Messages with broken chain (null parentUuid in middle)
    const messages: TestMessage[] = [
      { type: 'user', uuid: 'msg-1', parentUuid: null },
      { type: 'assistant', uuid: 'msg-2', parentUuid: 'msg-1' },
      { type: 'user', uuid: 'msg-3', parentUuid: null }, // BROKEN: should be msg-2
      { type: 'assistant', uuid: 'msg-4', parentUuid: 'msg-3' },
    ]

    // Verify it's broken before repair
    const beforeResult = validateChain(messages)
    expect(beforeResult.valid).toBe(false)
    expect(beforeResult.errors).toHaveLength(1)
    expect(beforeResult.errors[0].type).toBe('broken_chain')
    expect(beforeResult.errors[0].uuid).toBe('msg-3')

    // When: Auto repair chain
    autoRepairChain(messages)

    // Then: Chain should be valid
    const afterResult = validateChain(messages)
    expect(afterResult.valid).toBe(true)
    expect(messages[2].parentUuid).toBe('msg-2')
  })

  it('should repair orphan_parent by linking to previous message', () => {
    // Given: Messages with orphan parent (points to non-existent uuid)
    const messages: TestMessage[] = [
      { type: 'user', uuid: 'msg-1', parentUuid: null },
      { type: 'assistant', uuid: 'msg-2', parentUuid: 'msg-1' },
      { type: 'user', uuid: 'msg-3', parentUuid: 'deleted-msg' }, // ORPHAN: points to deleted message
      { type: 'assistant', uuid: 'msg-4', parentUuid: 'msg-3' },
    ]

    // Verify it's broken before repair
    const beforeResult = validateChain(messages)
    expect(beforeResult.valid).toBe(false)
    expect(beforeResult.errors).toHaveLength(1)
    expect(beforeResult.errors[0].type).toBe('orphan_parent')
    expect(beforeResult.errors[0].uuid).toBe('msg-3')

    // When: Auto repair chain
    autoRepairChain(messages)

    // Then: Chain should be valid
    const afterResult = validateChain(messages)
    expect(afterResult.valid).toBe(true)
    expect(messages[2].parentUuid).toBe('msg-2')
  })

  it('should repair multiple chain errors', () => {
    // Given: Messages with multiple errors
    const messages: TestMessage[] = [
      { type: 'user', uuid: 'msg-1', parentUuid: null },
      { type: 'assistant', uuid: 'msg-2', parentUuid: 'deleted-1' }, // ORPHAN
      { type: 'user', uuid: 'msg-3', parentUuid: null }, // BROKEN
      { type: 'assistant', uuid: 'msg-4', parentUuid: 'deleted-2' }, // ORPHAN
    ]

    const beforeResult = validateChain(messages)
    expect(beforeResult.valid).toBe(false)
    expect(beforeResult.errors).toHaveLength(3)

    // When: Auto repair chain
    autoRepairChain(messages)

    // Then: All errors should be fixed
    const afterResult = validateChain(messages)
    expect(afterResult.valid).toBe(true)
    expect(messages[1].parentUuid).toBe('msg-1')
    expect(messages[2].parentUuid).toBe('msg-2')
    expect(messages[3].parentUuid).toBe('msg-3')
  })

  it('should skip file-history-snapshot messages when finding previous', () => {
    // Given: Messages with file-history-snapshot in between
    const messages: TestMessage[] = [
      { type: 'user', uuid: 'msg-1', parentUuid: null },
      { type: 'assistant', uuid: 'msg-2', parentUuid: 'msg-1' },
      { type: 'file-history-snapshot', messageId: 'fhs-1' }, // No uuid, should be skipped
      { type: 'user', uuid: 'msg-3', parentUuid: null }, // BROKEN: should link to msg-2
    ]

    // When: Auto repair chain
    autoRepairChain(messages)

    // Then: msg-3 should link to msg-2 (skipping file-history-snapshot)
    expect(messages[3].parentUuid).toBe('msg-2')
  })

  it('should return repair count', () => {
    const messages: TestMessage[] = [
      { type: 'user', uuid: 'msg-1', parentUuid: null },
      { type: 'assistant', uuid: 'msg-2', parentUuid: null }, // BROKEN
      { type: 'user', uuid: 'msg-3', parentUuid: null }, // BROKEN
    ]

    // When: Auto repair chain
    const repairCount = autoRepairChain(messages)

    // Then: Should return number of repairs made
    expect(repairCount).toBe(2)
  })

  it('should do nothing if chain is already valid', () => {
    const messages: TestMessage[] = [
      { type: 'user', uuid: 'msg-1', parentUuid: null },
      { type: 'assistant', uuid: 'msg-2', parentUuid: 'msg-1' },
      { type: 'user', uuid: 'msg-3', parentUuid: 'msg-2' },
    ]

    // Verify it's already valid
    const beforeResult = validateChain(messages)
    expect(beforeResult.valid).toBe(true)

    // When: Auto repair chain
    const repairCount = autoRepairChain(messages)

    // Then: No repairs needed
    expect(repairCount).toBe(0)
  })

  it('should treat first message with orphan_parent as valid (compacted session)', () => {
    // Given: First message with uuid has orphan_parent (pointing to deleted message)
    // This is valid for compacted/continued sessions
    const messages: TestMessage[] = [
      { type: 'file-history-snapshot', messageId: 'fhs-1' },
      { type: 'user', uuid: 'msg-1', parentUuid: 'deleted-original-msg' }, // Orphan but valid as first
      { type: 'assistant', uuid: 'msg-2', parentUuid: 'msg-1' },
    ]

    // Then: Should be valid (orphan_parent is OK for first message)
    const result = validateChain(messages)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should not repair orphan_parent for first message', () => {
    // Given: First message with uuid has orphan_parent
    const messages: TestMessage[] = [
      { type: 'file-history-snapshot', messageId: 'fhs-1' },
      { type: 'user', uuid: 'msg-1', parentUuid: 'deleted-original-msg' }, // Should NOT be repaired
      { type: 'assistant', uuid: 'msg-2', parentUuid: 'msg-1' },
    ]

    // When: Auto repair chain
    const repairCount = autoRepairChain(messages)

    // Then: No repairs should be made (orphan_parent for first message is valid)
    expect(repairCount).toBe(0)
    expect(messages[1].parentUuid).toBe('deleted-original-msg') // Unchanged
  })
})
