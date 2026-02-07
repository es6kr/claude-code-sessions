import { describe, it, expect } from 'vitest'
import {
  validateChain,
  validateToolUseResult,
  validateProgressMessages,
  deleteMessageWithChainRepair,
  repairParentUuidChain,
} from '../session/validation.js'

describe('validateChain', () => {
  // Real-world scenario: assistant -> file-history-snapshot -> user(tool_result) -> progress -> assistant
  // file-history-snapshot is skipped (has no uuid)
  const messages = [
    {
      type: 'assistant',
      uuid: '42a525c3-9656-4619-b0f7-f3099a3082ec',
      parentUuid: null, // First message can have null parentUuid
      timestamp: '2026-01-20T04:35:23.280Z',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_01L9za', name: 'Write' }],
      },
    },
    {
      type: 'file-history-snapshot',
      messageId: '42a525c3-9656-4619-b0f7-f3099a3082ec',
      timestamp: '2026-01-20T04:35:23.300Z',
      snapshot: { trackedFileBackups: {} },
    },
    {
      type: 'user',
      uuid: 'da7e4183-fedd-4075-81ca-7ba40aa162e8',
      parentUuid: '42a525c3-9656-4619-b0f7-f3099a3082ec',
      timestamp: '2026-01-20T04:35:23.332Z',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01L9za' }] },
    },
    {
      type: 'progress',
      uuid: '30e9bb84-a7b8-4e56-9f0b-01b00541b3e9',
      parentUuid: 'da7e4183-fedd-4075-81ca-7ba40aa162e8',
      timestamp: '2026-01-20T04:35:23.354Z',
      data: { type: 'hook_progress', hookEvent: 'PostToolUse' },
    },
    {
      type: 'assistant',
      uuid: '05aa9fcd-674e-4945-80db-e8e1c5eeea44',
      parentUuid: '30e9bb84-a7b8-4e56-9f0b-01b00541b3e9',
      timestamp: '2026-01-20T04:35:27.376Z',
      message: { role: 'assistant', content: [{ type: 'thinking', thinking: '...' }] },
    },
  ]

  it('should validate a correct parentUuid chain', () => {
    const result = validateChain(messages)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should detect broken chain when parentUuid is null for non-first message', () => {
    const brokenMessages = [
      { ...messages[0] },
      { ...messages[1] },
      { ...messages[2], parentUuid: null }, // broken - should reference messages[0].uuid
      { ...messages[3] },
      { ...messages[4] },
    ]

    const result = validateChain(brokenMessages)

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toMatchObject({
      type: 'broken_chain',
      uuid: 'da7e4183-fedd-4075-81ca-7ba40aa162e8',
    })
  })

  it('should detect orphan parentUuid pointing to non-existent uuid', () => {
    const orphanMessages = [
      { ...messages[0] },
      { ...messages[1] },
      { ...messages[2], parentUuid: 'non-existent-uuid' }, // orphan
      { ...messages[3] },
      { ...messages[4] },
    ]

    const result = validateChain(orphanMessages)

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.type === 'orphan_parent')).toBe(true)
  })

  it('should not error when parentUuid is null but logicalParentUuid exists', () => {
    const compactBoundary = [
      {
        type: 'user',
        uuid: 'first-user',
        parentUuid: null,
        timestamp: '2026-01-20T04:35:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        parentUuid: 'first-user',
        timestamp: '2026-01-20T04:35:01.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      },
      {
        type: 'system',
        subtype: 'compact_boundary',
        uuid: 'compact-1',
        parentUuid: null, // null but has logicalParentUuid
        logicalParentUuid: 'assistant-1',
        timestamp: '2026-01-20T04:36:00.000Z',
        content: 'Conversation compacted',
      },
      {
        type: 'user',
        uuid: 'user-after-compact',
        parentUuid: 'compact-1',
        timestamp: '2026-01-20T04:37:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Continue' }] },
      },
    ]

    const result = validateChain(compactBoundary)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should skip file-history-snapshot in chain validation', () => {
    // file-history-snapshot has no uuid
    const result = validateChain(messages)

    // Should not error on file-history-snapshot
    expect(result.valid).toBe(true)
  })

  it('should allow null parentUuid for first message', () => {
    const firstMessageNull = [
      {
        type: 'user',
        uuid: 'first-user',
        parentUuid: null, // OK for first message
        timestamp: '2026-01-20T04:35:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'assistant',
        uuid: 'second-assistant',
        parentUuid: 'first-user',
        timestamp: '2026-01-20T04:35:01.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      },
    ]

    const result = validateChain(firstMessageNull)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should detect undefined parentUuid as broken chain even for first message', () => {
    const undefinedParent = [
      {
        type: 'user',
        uuid: 'first-user',
        // parentUuid is undefined (missing)
        timestamp: '2026-01-20T04:35:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'assistant',
        uuid: 'second-assistant',
        parentUuid: 'first-user',
        timestamp: '2026-01-20T04:35:01.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      },
    ]

    const result = validateChain(undefinedParent)

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatchObject({
      type: 'broken_chain',
      uuid: 'first-user',
    })
  })

  it('should skip file-history-snapshot even if placed first', () => {
    const snapshotFirst = [
      {
        type: 'file-history-snapshot',
        messageId: 'some-id',
        timestamp: '2026-01-20T04:35:00.000Z',
        snapshot: { trackedFileBackups: {} },
      },
      {
        type: 'user',
        uuid: 'first-user',
        parentUuid: null, // OK - this is the first message with uuid
        timestamp: '2026-01-20T04:35:01.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'assistant',
        uuid: 'second-assistant',
        parentUuid: 'first-user',
        timestamp: '2026-01-20T04:35:02.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      },
    ]

    const result = validateChain(snapshotFirst)

    expect(result.valid).toBe(true)
  })
})

describe('validateToolUseResult', () => {
  const messages = [
    {
      type: 'assistant',
      uuid: '42a525c3-9656-4619-b0f7-f3099a3082ec',
      parentUuid: null, // First message can have null parentUuid
      timestamp: '2026-01-20T04:35:23.280Z',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_01L9za', name: 'Write' }],
      },
    },
    {
      type: 'file-history-snapshot',
      messageId: '42a525c3-9656-4619-b0f7-f3099a3082ec',
      timestamp: '2026-01-20T04:35:23.300Z',
      snapshot: { trackedFileBackups: {} },
    },
    {
      type: 'user',
      uuid: 'da7e4183-fedd-4075-81ca-7ba40aa162e8',
      parentUuid: '42a525c3-9656-4619-b0f7-f3099a3082ec',
      timestamp: '2026-01-20T04:35:23.332Z',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01L9za' }] },
    },
    {
      type: 'progress',
      uuid: '30e9bb84-a7b8-4e56-9f0b-01b00541b3e9',
      parentUuid: 'da7e4183-fedd-4075-81ca-7ba40aa162e8',
      timestamp: '2026-01-20T04:35:23.354Z',
      data: { type: 'hook_progress', hookEvent: 'PostToolUse' },
    },
    {
      type: 'assistant',
      uuid: '05aa9fcd-674e-4945-80db-e8e1c5eeea44',
      parentUuid: '30e9bb84-a7b8-4e56-9f0b-01b00541b3e9',
      timestamp: '2026-01-20T04:35:27.376Z',
      message: { role: 'assistant', content: [{ type: 'thinking', thinking: '...' }] },
    },
  ]

  it('should validate matching tool_use_id and tool_result', () => {
    const result = validateToolUseResult(messages)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should detect orphan tool_result with no matching tool_use', () => {
    const orphanMessages = [
      { ...messages[0] },
      { ...messages[1] },
      {
        ...messages[2],
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'non_existent_tool_id' }],
        },
      },
      { ...messages[3] },
      { ...messages[4] },
    ]

    const result = validateToolUseResult(orphanMessages)

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.type === 'orphan_tool_result')).toBe(true)
    expect(result.errors[0]).toMatchObject({
      type: 'orphan_tool_result',
      uuid: 'da7e4183-fedd-4075-81ca-7ba40aa162e8',
      toolUseId: 'non_existent_tool_id',
    })
  })

  it('should handle multiple tool_use and tool_result in same session', () => {
    const multiToolMessages = [
      {
        type: 'assistant',
        uuid: 'assistant-1',
        parentUuid: null,
        timestamp: '2026-01-20T04:35:00.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool_1', name: 'Read' },
            { type: 'tool_use', id: 'tool_2', name: 'Write' },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'user-1',
        parentUuid: 'assistant-1',
        timestamp: '2026-01-20T04:35:01.000Z',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tool_1' },
            { type: 'tool_result', tool_use_id: 'tool_2' },
          ],
        },
      },
    ]

    const result = validateToolUseResult(multiToolMessages)

    expect(result.valid).toBe(true)
  })

  it('should detect partial orphan when one tool_result has no matching tool_use', () => {
    const partialOrphan = [
      {
        type: 'assistant',
        uuid: 'assistant-1',
        parentUuid: null,
        timestamp: '2026-01-20T04:35:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tool_1', name: 'Read' }],
        },
      },
      {
        type: 'user',
        uuid: 'user-1',
        parentUuid: 'assistant-1',
        timestamp: '2026-01-20T04:35:01.000Z',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tool_1' },
            { type: 'tool_result', tool_use_id: 'tool_orphan' }, // orphan
          ],
        },
      },
    ]

    const result = validateToolUseResult(partialOrphan)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ toolUseId: 'tool_orphan' })
  })

  it('should handle messages without tool_use or tool_result', () => {
    const noToolMessages = [
      {
        type: 'user',
        uuid: 'user-1',
        parentUuid: null,
        timestamp: '2026-01-20T04:35:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        parentUuid: 'user-1',
        timestamp: '2026-01-20T04:35:01.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      },
    ]

    const result = validateToolUseResult(noToolMessages)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})

describe('validateProgressMessages', () => {
  it('should detect Stop hookEvent as error', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      { type: 'progress', uuid: 'p1', parentUuid: 'u1', hookEvent: 'Stop' },
      { type: 'assistant', uuid: 'a1', parentUuid: 'p1' },
    ]

    const result = validateProgressMessages(messages)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({
      type: 'unwanted_progress',
      line: 2,
      hookEvent: 'Stop',
    })
  })

  it('should ignore non-Stop and non-SessionStart:resume progress messages', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      {
        type: 'progress',
        uuid: 'p1',
        parentUuid: 'u1',
        hookEvent: 'SessionStart',
        hookName: 'SessionStart:init', // not :resume
      },
      { type: 'assistant', uuid: 'a1', parentUuid: 'p1' },
      { type: 'progress', uuid: 'p2', parentUuid: 'a1', hookEvent: 'PostToolUse' },
    ]

    const result = validateProgressMessages(messages)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should not treat SessionStart:resume as error', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      {
        type: 'progress',
        uuid: 'p1',
        parentUuid: 'u1',
        hookEvent: 'SessionStart',
        hookName: 'SessionStart:resume',
      },
    ]

    const result = validateProgressMessages(messages)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should only count Stop among multiple progress messages', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      { type: 'progress', uuid: 'p1', parentUuid: 'u1', hookEvent: 'SessionStart' },
      { type: 'progress', uuid: 'p2', parentUuid: 'p1', hookEvent: 'Stop' },
      { type: 'assistant', uuid: 'a1', parentUuid: 'p2' },
    ]

    const result = validateProgressMessages(messages)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].hookEvent).toBe('Stop')
  })

  it('should return valid when no progress messages', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      { type: 'assistant', uuid: 'a1', parentUuid: 'u1' },
    ]

    const result = validateProgressMessages(messages)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should handle empty messages array', () => {
    const result = validateProgressMessages([])

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should detect Stop in nested data.hookEvent format', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      {
        type: 'progress',
        uuid: 'p1',
        parentUuid: 'u1',
        data: { type: 'hook_progress', hookEvent: 'Stop' },
      },
      { type: 'assistant', uuid: 'a1', parentUuid: 'p1' },
    ]

    const result = validateProgressMessages(messages)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({
      type: 'unwanted_progress',
      line: 2,
      hookEvent: 'Stop',
    })
  })
})

describe('deleteMessageWithChainRepair', () => {
  it('should delete progress message and repair parentUuid chain', () => {
    // assistant -> user -> progress -> assistant
    const messages = [
      {
        type: 'assistant',
        uuid: 'assistant-1',
        parentUuid: null,
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'user',
        uuid: 'user-1',
        parentUuid: 'assistant-1',
        message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      },
      {
        type: 'progress',
        uuid: 'progress-1',
        parentUuid: 'user-1',
        data: { type: 'hook_progress' },
      },
      {
        type: 'assistant',
        uuid: 'assistant-2',
        parentUuid: 'progress-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
      },
    ]

    const result = deleteMessageWithChainRepair(messages, 'progress-1')

    expect(result.deleted?.uuid).toBe('progress-1')
    expect(messages).toHaveLength(3)
    // assistant-2's parentUuid should now point to user-1
    expect(messages[2].parentUuid).toBe('user-1')
    // Chain should be valid
    expect(validateChain(messages).valid).toBe(true)
  })

  it('should delete file-history-snapshot by messageId with targetType', () => {
    const messages = [
      {
        type: 'assistant',
        uuid: 'shared-id',
        parentUuid: null,
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tool-1', name: 'Write' }],
        },
      },
      {
        type: 'file-history-snapshot',
        messageId: 'shared-id',
        snapshot: { trackedFileBackups: {} },
      },
    ]

    const result = deleteMessageWithChainRepair(messages, 'shared-id', 'file-history-snapshot')

    expect(result.deleted?.type).toBe('file-history-snapshot')
    expect(messages).toHaveLength(1)
    expect(messages[0].type).toBe('assistant')
  })

  it('should delete tool_use and corresponding tool_result', () => {
    const messages = [
      {
        type: 'user',
        uuid: 'user-1',
        parentUuid: null,
        message: { role: 'user', content: [{ type: 'text', text: 'Do it' }] },
      },
      {
        type: 'assistant',
        uuid: 'assistant-tool',
        parentUuid: 'user-1',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tool-123', name: 'Read' }],
        },
      },
      {
        type: 'user',
        uuid: 'user-tool-result',
        parentUuid: 'assistant-tool',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-123', content: 'result' }],
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-final',
        parentUuid: 'user-tool-result',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
      },
    ]

    const result = deleteMessageWithChainRepair(messages, 'assistant-tool')

    expect(result.deleted?.uuid).toBe('assistant-tool')
    expect(result.alsoDeleted).toHaveLength(1)
    expect(result.alsoDeleted[0].uuid).toBe('user-tool-result')
    expect(messages).toHaveLength(2)
    // assistant-final's parentUuid should now point to user-1
    expect(messages[1].parentUuid).toBe('user-1')
    // Chain and tool validation should be valid
    expect(validateChain(messages).valid).toBe(true)
    expect(validateToolUseResult(messages).valid).toBe(true)
  })

  it('should prioritize uuid over messageId when no targetType specified', () => {
    const messages = [
      {
        type: 'assistant',
        uuid: 'shared-id',
        parentUuid: null,
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'file-history-snapshot',
        messageId: 'shared-id',
        snapshot: { trackedFileBackups: {} },
      },
    ]

    // Without targetType, should delete by uuid (assistant), not messageId (snapshot)
    const result = deleteMessageWithChainRepair(messages, 'shared-id')

    expect(result.deleted?.type).toBe('assistant')
    expect(messages).toHaveLength(1)
    expect(messages[0].type).toBe('file-history-snapshot')
  })

  it('should return null when message not found', () => {
    const messages = [
      {
        type: 'user',
        uuid: 'user-1',
        parentUuid: null,
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
    ]

    const result = deleteMessageWithChainRepair(messages, 'non-existent')

    expect(result.deleted).toBeNull()
    expect(result.alsoDeleted).toHaveLength(0)
    expect(messages).toHaveLength(1)
  })
})

describe('repairParentUuidChain', () => {
  it('should repair chain when progress message is removed', () => {
    // assistant -> user -> progress -> assistant
    // After removing progress: assistant -> user -> assistant
    const messages = [
      { type: 'assistant', uuid: 'a1', parentUuid: null },
      { type: 'user', uuid: 'u1', parentUuid: 'a1' },
      { type: 'assistant', uuid: 'a2', parentUuid: 'p1' }, // was pointing to progress
    ]
    const removed = [{ type: 'progress', uuid: 'p1', parentUuid: 'u1' }]

    repairParentUuidChain(messages, removed)

    expect(messages[2].parentUuid).toBe('u1')
    expect(validateChain(messages).valid).toBe(true)
  })

  it('should repair chain when multiple messages are removed', () => {
    // a1 -> u1 -> p1 -> p2 -> a2
    // Remove p1 and p2: a1 -> u1 -> a2
    const messages = [
      { type: 'assistant', uuid: 'a1', parentUuid: null },
      { type: 'user', uuid: 'u1', parentUuid: 'a1' },
      { type: 'assistant', uuid: 'a2', parentUuid: 'p2' },
    ]
    const removed = [
      { type: 'progress', uuid: 'p1', parentUuid: 'u1' },
      { type: 'progress', uuid: 'p2', parentUuid: 'p1' },
    ]

    repairParentUuidChain(messages, removed)

    expect(messages[2].parentUuid).toBe('u1')
    expect(validateChain(messages).valid).toBe(true)
  })

  it('should skip file-history-snapshot in removed messages', () => {
    const messages = [
      { type: 'assistant', uuid: 'a1', parentUuid: null },
      { type: 'user', uuid: 'u1', parentUuid: 'a1' },
    ]
    // file-history-snapshot has messageId instead of uuid - skipped in repair
    const removed = [{ type: 'file-history-snapshot', messageId: 'a1' }]

    // Should not throw and messages should be unchanged
    repairParentUuidChain(messages, removed as unknown as typeof messages)

    expect(messages[0].parentUuid).toBe(null)
    expect(messages[1].parentUuid).toBe('a1')
  })

  it('should handle removed message without uuid', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      { type: 'assistant', uuid: 'a1', parentUuid: 'u1' },
    ]
    // Message without uuid - skipped in repair
    const removed = [{ type: 'progress' }]

    // Should not throw
    repairParentUuidChain(messages, removed as unknown as typeof messages)

    expect(messages[1].parentUuid).toBe('u1')
  })

  it('should handle empty removed array', () => {
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null },
      { type: 'assistant', uuid: 'a1', parentUuid: 'u1' },
    ]

    repairParentUuidChain(messages, [])

    expect(messages[0].parentUuid).toBe(null)
    expect(messages[1].parentUuid).toBe('u1')
  })
})
