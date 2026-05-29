import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cleanupSplitFirstMessage,
  extractTextContent,
  extractTitle,
  fileExists,
  getDisplayTitle,
  getSecondaryInfo,
  maskHomePath,
  parseJsonlLines,
  readJsonlFile,
} from './utils.js'
import type { Message } from './types.js'
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'

vi.mock('node:fs/promises')

describe('extractTitle', () => {
  it('should extract command name from slash command message', () => {
    const text =
      '<command-message>session</command-message>\n<command-name>/session</command-name>\n<command-args> repair --dry-run e15f9f9a-db7a-4729-965c-c0beb8d75039</command-args>'
    expect(extractTitle(text)).toBe(
      '/session repair --dry-run e15f9f9a-db7a-4729-965c-c0beb8d75039'
    )
  })

  it('should return first line as title for normal text', () => {
    expect(extractTitle('Hello World\n\nThird line')).toBe('Hello World')
  })

  it('should return Untitled for empty text', () => {
    expect(extractTitle('')).toBe('Untitled')
  })

  it('should not parse command tags from embedded JSON after first paragraph', () => {
    const message = {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: 'Fix display title parsing\n\n{"message":{"content":"<command-name>/session</command-name>\\n<command-args>repair</command-args>"}}',
        },
      ],
    }
    expect(extractTitle(message)).toBe('Fix display title parsing')
  })

  it('should strip IDE tags when stripIdeTags option is true', () => {
    const message = {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: "<ide_selection>The user selected the lines ... '<command-message>test</command-message>\\n<command-name>/test</command-name>\\n<command-args></command-args>'</ide_selection>",
        },
        { type: 'text' as const, text: 'Fix incorrect test case TDD' },
      ],
    }
    expect(extractTitle(message)).toBe('Fix incorrect test case TDD')
  })
})

describe('extractTextContent', () => {
  it('should return string content directly', () => {
    const message = { role: 'user' as const, content: 'Hello world' }
    expect(extractTextContent(message)).toBe('Hello world')
  })

  it('should join multiple text content items', () => {
    // Real data: two separate text objects in content array
    const message = {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: '<ide_selection>Selected code...</ide_selection>' },
        { type: 'text' as const, text: 'Fix incorrect test case TDD' },
      ],
    }
    // extractTextContent joins all text, IDE tag removal is done by extractTitle
    expect(extractTextContent(message)).toBe(
      '<ide_selection>Selected code...</ide_selection>Fix incorrect test case TDD'
    )
  })

  it('should return empty string for undefined message', () => {
    expect(extractTextContent(undefined)).toBe('')
  })
})

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

describe('getDisplayTitle', () => {
  it('should return title when only title is provided', () => {
    expect(getDisplayTitle(undefined, 'My Title')).toBe('My Title')
  })

  it('should return fallback when nothing is provided', () => {
    expect(getDisplayTitle(undefined, undefined)).toBe('Untitled')
  })

  it('should use custom fallback when provided via options', () => {
    expect(getDisplayTitle({ fallback: 'Empty Session' })).toBe('Empty Session')
  })

  it('should skip empty string values', () => {
    expect(getDisplayTitle('', 'Title')).toBe('Title')
    expect(getDisplayTitle('', '')).toBe('Untitled')
  })

  it('should not parse command tags from embedded JSON in title', () => {
    const title =
      'Fix display title parsing\n\n{"message":{"content":"<command-name>/session</command-name>\\n<command-args>repair</command-args>"}}'
    expect(getDisplayTitle(undefined, title)).toBe('Fix display title parsing')
  })

  it('should parse command from first paragraph of title', () => {
    const title =
      '<command-message>session</command-message>\n<command-name>/session</command-name>\n<command-args>  repair --dry-run</command-args>'
    expect(getDisplayTitle(undefined, title)).toBe('/session repair --dry-run')
  })

  it('should prioritize customTitle > title', () => {
    expect(
      getDisplayTitle({
        customTitle: 'Custom',
        title: 'Title',
      })
    ).toBe('Custom')

    expect(getDisplayTitle({ title: 'Title' })).toBe('Title')
  })

  it('should ignore empty customTitle and fall through to title', () => {
    expect(
      getDisplayTitle({
        customTitle: '',
        title: 'Title',
      })
    ).toBe('Title')
  })
})

describe('getSecondaryInfo', () => {
  // Fixed reference instant for deterministic relative-time assertions
  const NOW = new Date('2026-05-25T12:00:00.000Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty string when no fields provided', () => {
    expect(getSecondaryInfo({})).toBe('')
  })

  it('renders agentName alone', () => {
    expect(getSecondaryInfo({ agentName: 'Researcher' })).toBe('Researcher')
  })

  it('renders relative time alone from ISO string', () => {
    const fiveMinAgo = new Date(NOW - 5 * 60_000).toISOString()
    expect(getSecondaryInfo({ updatedAt: fiveMinAgo })).toBe('5m ago')
  })

  it('renders relative time alone from Unix ms number', () => {
    expect(getSecondaryInfo({ updatedAt: NOW - 3 * 3600_000 })).toBe('3h ago')
  })

  it('renders message count alone', () => {
    expect(getSecondaryInfo({ messageCount: 42 })).toBe('💬 42')
  })

  it('joins all three parts with default separator " · " — time, count, agentName order', () => {
    const twoHoursAgo = new Date(NOW - 2 * 3600_000).toISOString()
    expect(
      getSecondaryInfo({
        agentName: 'Coder',
        updatedAt: twoHoursAgo,
        messageCount: 121,
      })
    ).toBe('2h ago · 💬 121 · Coder')
  })

  it('skips agentName when empty string', () => {
    expect(
      getSecondaryInfo({
        agentName: '',
        messageCount: 7,
      })
    ).toBe('💬 7')
  })

  it('skips updatedAt when empty string', () => {
    expect(
      getSecondaryInfo({
        agentName: 'Agent',
        updatedAt: '',
        messageCount: 1,
      })
    ).toBe('💬 1 · Agent')
  })

  it('treats messageCount=0 as a renderable value (not skipped)', () => {
    expect(getSecondaryInfo({ messageCount: 0 })).toBe('💬 0')
  })

  it('supports a custom separator', () => {
    expect(
      getSecondaryInfo({
        agentName: 'Agent',
        messageCount: 5,
        separator: ' | ',
      })
    ).toBe('💬 5 | Agent')
  })
})

describe('maskHomePath', () => {
  it('should mask current user home directory with ~', () => {
    expect(maskHomePath('/Users/david/projects/app', '/Users/david')).toBe('~/projects/app')
  })

  it('should not mask other users home directories', () => {
    expect(maskHomePath('/Users/alice/projects/app', '/Users/david')).toBe(
      '/Users/alice/projects/app'
    )
  })

  it('should mask multiple occurrences', () => {
    expect(maskHomePath('/Users/david/a and /Users/david/b', '/Users/david')).toBe('~/a and ~/b')
  })

  it('should handle Windows paths', () => {
    expect(maskHomePath('C:\\Users\\david\\projects', 'C:\\Users\\david')).toBe('~\\projects')
  })

  it('should return original text if homeDir is empty', () => {
    expect(maskHomePath('/Users/david/projects', '')).toBe('/Users/david/projects')
  })

  it('should mask exact home directory path', () => {
    expect(maskHomePath('/Users/david', '/Users/david')).toBe('~')
  })

  it('should not mask partial matches', () => {
    // /Users/davidsmith should not be masked when homeDir is /Users/david
    expect(maskHomePath('/Users/davidsmith/projects', '/Users/david')).toBe(
      '/Users/davidsmith/projects'
    )
  })
})

describe('parseJsonlLines', () => {
  it('should parse valid JSONL lines', () => {
    const lines = ['{"type":"user","uuid":"1"}', '{"type":"assistant","uuid":"2"}']
    const result = parseJsonlLines(lines, '/test/file.jsonl')

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'user', uuid: '1' })
    expect(result[1]).toEqual({ type: 'assistant', uuid: '2' })
  })

  it('should skip malformed lines and return valid ones', () => {
    const lines = ['{"valid":"json"}', 'invalid json here', '{"also":"valid"}']

    const result = parseJsonlLines(lines, '/path/to/session.jsonl')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ valid: 'json' })
    expect(result[1]).toEqual({ also: 'valid' })
  })

  it('should return empty array when all lines are malformed', () => {
    const lines = ['not valid json']

    const result = parseJsonlLines(lines, '/test.jsonl')
    expect(result).toEqual([])
  })

  it('should handle empty lines array', () => {
    const result = parseJsonlLines([], '/empty.jsonl')
    expect(result).toEqual([])
  })

  it('should preserve type information with generic parameter', () => {
    const lines = ['{"type":"user","uuid":"1","timestamp":"2025-01-01"}']
    const result = parseJsonlLines<Message>(lines, '/test.jsonl')

    expect(result[0].type).toBe('user')
    expect(result[0].uuid).toBe('1')
  })

  it('should throw on malformed lines when strict: true', () => {
    const lines = ['{"valid":"json"}', 'invalid json', '{"also":"valid"}']

    expect(() => parseJsonlLines(lines, '/test.jsonl', { strict: true })).toThrow(
      'Failed to parse line 2 in /test.jsonl'
    )
  })

  it('should skip malformed lines when strict: false (default)', () => {
    const lines = ['{"valid":"json"}', 'invalid json', '{"also":"valid"}']

    const result = parseJsonlLines(lines, '/test.jsonl')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ valid: 'json' })
    expect(result[1]).toEqual({ also: 'valid' })
  })
})

describe('readJsonlFile', () => {
  const mockedFs = vi.mocked(fs)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should read and parse JSONL file', async () => {
    const fileContent = '{"type":"user","uuid":"1"}\n{"type":"assistant","uuid":"2"}\n'
    mockedFs.readFile.mockResolvedValue(fileContent)

    const result = await Effect.runPromise(readJsonlFile('/test/session.jsonl'))

    expect(mockedFs.readFile).toHaveBeenCalledWith('/test/session.jsonl', 'utf-8')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'user', uuid: '1' })
  })

  it('should filter out empty lines', async () => {
    // filter(Boolean) filters truly empty strings but not whitespace-only
    // This test verifies actual behavior - whitespace lines are parsed (and fail)
    const fileContent = '{"a":1}\n\n{"b":2}\n{"c":3}'
    mockedFs.readFile.mockResolvedValue(fileContent)

    const result = await Effect.runPromise(readJsonlFile('/test.jsonl'))

    expect(result).toHaveLength(3)
  })

  it('should skip malformed lines in file', async () => {
    const fileContent = '{"valid":true}\ninvalid line\n'
    mockedFs.readFile.mockResolvedValue(fileContent)

    const result = await Effect.runPromise(readJsonlFile('/broken/file.jsonl'))
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ valid: true })
  })

  it('should handle file read errors', async () => {
    mockedFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'))

    // Effect.tryPromise wraps the error, so we check that it rejects
    await expect(Effect.runPromise(readJsonlFile('/nonexistent.jsonl'))).rejects.toThrow()
  })
})

describe('fileExists', () => {
  const mockedFs = vi.mocked(fs)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return true when file is accessible', async () => {
    mockedFs.access.mockResolvedValue(undefined)

    const result = await fileExists('/tmp/existing-file.txt')

    expect(result).toBe(true)
    expect(mockedFs.access).toHaveBeenCalledWith('/tmp/existing-file.txt')
  })

  it('should return false when file does not exist', async () => {
    mockedFs.access.mockRejectedValue(new Error('ENOENT: no such file or directory'))

    const result = await fileExists('/tmp/nonexistent-file.txt')

    expect(result).toBe(false)
  })

  it('should return false when permission is denied', async () => {
    mockedFs.access.mockRejectedValue(new Error('EACCES: permission denied'))

    const result = await fileExists('/tmp/restricted-file.txt')

    expect(result).toBe(false)
  })
})
