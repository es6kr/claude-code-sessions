import { describe, it, expect } from 'vitest'
import { cleanupSplitFirstMessage } from './utils.js'
import type { Message } from './types.js'

describe('cleanupSplitFirstMessage', () => {
  it('should return message unchanged if no toolUseResult', () => {
    const msg: Message = {
      type: 'user',
      uuid: 'test-uuid',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    }

    const result = cleanupSplitFirstMessage(msg)
    expect(result).toEqual(msg)
  })

  it('should return message unchanged if toolUseResult has no rejection marker', () => {
    const msg: Message = {
      type: 'user',
      uuid: 'test-uuid',
      toolUseResult: 'Some other tool result without rejection',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'result' }],
      },
    }

    const result = cleanupSplitFirstMessage(msg)
    expect(result).toEqual(msg)
  })

  it('should extract user message from tool rejection', () => {
    const msg: Message = {
      type: 'user',
      uuid: 'test-uuid',
      toolUseResult:
        "Error: The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). The user provided the following reason for the rejection:  core의 변환함수가 미적용이라",
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            content:
              "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). The user provided the following reason for the rejection:  core의 변환함수가 미적용이라",
            is_error: true,
            tool_use_id: 'toolu_01HhwMx5SXcsJv96qa9TXrxu',
          },
        ],
      },
    }

    const result = cleanupSplitFirstMessage(msg)

    expect(result.toolUseResult).toBeUndefined()
    expect(result.message?.content).toEqual([
      { type: 'text', text: 'core의 변환함수가 미적용이라' },
    ])
    expect(result.uuid).toBe('test-uuid')
  })

  it('should handle rejection with empty reason', () => {
    const msg: Message = {
      type: 'user',
      uuid: 'test-uuid',
      toolUseResult:
        "Error: The user doesn't want to proceed with this tool use. The user provided the following reason for the rejection:  ",
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'result' }],
      },
    }

    const result = cleanupSplitFirstMessage(msg)
    // Empty reason after trim, should return original
    expect(result).toEqual(msg)
  })

  it('should preserve other message properties', () => {
    const msg: Message = {
      type: 'user',
      uuid: 'test-uuid',
      parentUuid: 'parent-uuid',
      sessionId: 'session-123',
      timestamp: '2025-01-01T00:00:00Z',
      toolUseResult: 'The user provided the following reason for the rejection: 이건 테스트입니다',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'result' }],
      },
    }

    const result = cleanupSplitFirstMessage(msg)

    expect(result.uuid).toBe('test-uuid')
    expect(result.parentUuid).toBe('parent-uuid')
    expect(result.sessionId).toBe('session-123')
    expect(result.timestamp).toBe('2025-01-01T00:00:00Z')
    expect(result.toolUseResult).toBeUndefined()
    expect(result.message?.content).toEqual([{ type: 'text', text: '이건 테스트입니다' }])
  })
})
