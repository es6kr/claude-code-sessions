import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cleanupSplitFirstMessage,
  extractTextContent,
  extractTitle,
  getDisplayTitle,
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
  it('should return customTitle when provided', () => {
    expect(getDisplayTitle('Custom Title', 'Summary', 'Original Title')).toBe('Custom Title')
  })

  it('should return currentSummary when customTitle is undefined', () => {
    expect(getDisplayTitle(undefined, 'Summary Text', 'Original Title')).toBe('Summary Text')
  })

  it('should truncate currentSummary when exceeds maxLength', () => {
    const longSummary = 'A'.repeat(70) // 70 chars
    const result = getDisplayTitle(undefined, longSummary, 'Title')
    expect(result).toBe('A'.repeat(57) + '...')
    expect(result.length).toBe(60)
  })

  it('should return title when customTitle and currentSummary are undefined', () => {
    expect(getDisplayTitle(undefined, undefined, 'Original Title')).toBe('Original Title')
  })

  it('should return fallback when title is "Untitled"', () => {
    expect(getDisplayTitle(undefined, undefined, 'Untitled')).toBe('Untitled')
  })

  it('should return fallback when all are undefined', () => {
    expect(getDisplayTitle(undefined, undefined, undefined)).toBe('Untitled')
  })

  it('should use custom fallback when provided', () => {
    expect(getDisplayTitle(undefined, undefined, undefined, 60, 'No Title')).toBe('No Title')
  })

  it('should use custom maxLength for truncation', () => {
    const summary = 'A'.repeat(60) // 60 chars
    // With maxLength=50, should truncate at 47+...=50
    const result = getDisplayTitle(undefined, summary, undefined, 50)
    expect(result).toBe('A'.repeat(47) + '...')
    expect(result.length).toBe(50)
  })

  it('should not truncate currentSummary when exactly at maxLength', () => {
    const summary = 'A'.repeat(60) // Exactly 60 chars
    const result = getDisplayTitle(undefined, summary, undefined, 60)
    expect(result).toBe(summary)
  })

  it('should prefer customTitle over currentSummary even when both are provided', () => {
    expect(getDisplayTitle('Custom', 'Summary', 'Title')).toBe('Custom')
  })

  it('should skip empty string values', () => {
    // Empty string is falsy, so it should fall through to next option
    expect(getDisplayTitle('', 'Summary', 'Title')).toBe('Summary')
    expect(getDisplayTitle('', '', 'Title')).toBe('Title')
    expect(getDisplayTitle('', '', '')).toBe('Untitled')
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

  it('should throw error with file path and line number on parse failure', () => {
    const lines = ['{"valid":"json"}', 'invalid json here', '{"also":"valid"}']

    expect(() => parseJsonlLines(lines, '/path/to/session.jsonl')).toThrow(
      'Failed to parse line 2 in /path/to/session.jsonl:'
    )
  })

  it('should include original error message in thrown error', () => {
    const lines = ['not valid json']

    expect(() => parseJsonlLines(lines, '/test.jsonl')).toThrow('Unexpected token')
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

  it('should throw with file path on parse error', async () => {
    const fileContent = '{"valid":true}\ninvalid line\n'
    mockedFs.readFile.mockResolvedValue(fileContent)

    await expect(Effect.runPromise(readJsonlFile('/broken/file.jsonl'))).rejects.toThrow(
      'Failed to parse line 2 in /broken/file.jsonl:'
    )
  })

  it('should handle file read errors', async () => {
    mockedFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'))

    // Effect.tryPromise wraps the error, so we check that it rejects
    await expect(Effect.runPromise(readJsonlFile('/nonexistent.jsonl'))).rejects.toThrow()
  })
})
