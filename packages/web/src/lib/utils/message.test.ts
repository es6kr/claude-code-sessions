import { describe, it, expect } from 'vitest'
import { maskHomePath } from '$lib/stores/config'
import {
  parseCommandMessage,
  parseProgress,
  parseStopHookSummary,
  parseTurnDuration,
} from './message'

describe('maskHomePath', () => {
  const homeDir = '/Users/david'

  it('should replace current user home with ~ when followed by /', () => {
    expect(maskHomePath('/Users/david/projects/test', homeDir)).toBe('~/projects/test')
  })

  it('should NOT mask other users home directories', () => {
    expect(maskHomePath('/Users/john/work/file.ts', homeDir)).toBe('/Users/john/work/file.ts')
  })

  it('should handle multiple paths - only current user masked', () => {
    const input = 'Check /Users/david/foo and /Users/john/bar'
    expect(maskHomePath(input, homeDir)).toBe('Check ~/foo and /Users/john/bar')
  })

  it('should handle Windows paths for current user', () => {
    const winHome = 'C:\\Users\\david'
    expect(maskHomePath('C:\\Users\\david\\projects', winHome)).toBe('~\\projects')
  })

  it('should not modify paths without /Users prefix', () => {
    expect(maskHomePath('/home/user/project', homeDir)).toBe('/home/user/project')
  })

  it('should handle path at end of sentence', () => {
    expect(maskHomePath('Located at /Users/david/work.', homeDir)).toBe('Located at ~/work.')
  })

  it('should handle path in quotes', () => {
    expect(maskHomePath('Path: "/Users/david/test"', homeDir)).toBe('Path: "~/test"')
  })

  it('should handle path followed by colon', () => {
    expect(maskHomePath('/Users/david/project: error', homeDir)).toBe('~/project: error')
  })

  it('should preserve text without paths', () => {
    expect(maskHomePath('Hello world', homeDir)).toBe('Hello world')
  })

  it('should handle empty string', () => {
    expect(maskHomePath('', homeDir)).toBe('')
  })

  // Fallback behavior when no homeDir is provided
  describe('fallback (no homeDir)', () => {
    it('should mask any /Users/username pattern', () => {
      expect(maskHomePath('/Users/anyone/projects/test')).toBe('~/projects/test')
    })

    it('should mask different usernames', () => {
      expect(maskHomePath('/Users/john/work/file.ts')).toBe('~/work/file.ts')
    })
  })
})

describe('parseCommandMessage', () => {
  it('should parse command-name and command-message tags', () => {
    const content = '<command-message>vsix</command-message>\n<command-name>/vsix</command-name>'
    const result = parseCommandMessage(content)
    expect(result.name).toBe('/vsix')
    expect(result.message).toBe('vsix')
  })

  it('should handle real message data format', () => {
    // Real data from session
    const content = '<command-message>vsix</command-message>\n<command-name>/vsix</command-name>'
    const result = parseCommandMessage(content)
    expect(result).toEqual({ name: '/vsix', message: 'vsix', args: '' })
  })

  it('should return empty strings when tags are missing', () => {
    const result = parseCommandMessage('plain text without tags')
    expect(result.name).toBe('')
    expect(result.message).toBe('')
  })

  it('should handle undefined content', () => {
    const result = parseCommandMessage(undefined)
    expect(result.name).toBe('')
    expect(result.message).toBe('')
  })

  it('should handle empty string', () => {
    const result = parseCommandMessage('')
    expect(result.name).toBe('')
    expect(result.message).toBe('')
  })

  it('should handle only command-name tag', () => {
    const content = '<command-name>/commit</command-name>'
    const result = parseCommandMessage(content)
    expect(result.name).toBe('/commit')
    expect(result.message).toBe('')
  })

  it('should handle only command-message tag', () => {
    const content = '<command-message>build and test</command-message>'
    const result = parseCommandMessage(content)
    expect(result.name).toBe('')
    expect(result.message).toBe('build and test')
  })

  it('should handle different command names', () => {
    const content =
      '<command-message>commit changes</command-message>\n<command-name>/commit</command-name>'
    const result = parseCommandMessage(content)
    expect(result.name).toBe('/commit')
    expect(result.message).toBe('commit changes')
  })
})

describe('parseStopHookSummary', () => {
  it('should parse real stop_hook_summary message', () => {
    const msg = {
      type: 'system',
      subtype: 'stop_hook_summary',
      hookCount: 1,
      hookInfos: [{ command: 'callback' }],
      hookErrors: [],
      preventedContinuation: false,
      stopReason: '',
      hasOutput: false,
      level: 'suggestion',
    }
    const result = parseStopHookSummary(msg)
    expect(result).toEqual({
      hookCount: 1,
      hookInfos: [{ command: 'callback' }],
      hookErrors: [],
      preventedContinuation: false,
      stopReason: '',
      hasOutput: false,
      level: 'suggestion',
    })
  })

  it('should return null for non stop_hook_summary messages', () => {
    const msg = { type: 'system', subtype: 'local_command' }
    expect(parseStopHookSummary(msg)).toBeNull()
  })

  it('should return null for messages without subtype', () => {
    const msg = { type: 'user' }
    expect(parseStopHookSummary(msg)).toBeNull()
  })

  it('should handle missing optional fields with defaults', () => {
    const msg = { subtype: 'stop_hook_summary' }
    const result = parseStopHookSummary(msg)
    expect(result).toEqual({
      hookCount: 0,
      hookInfos: [],
      hookErrors: [],
      preventedContinuation: false,
      stopReason: '',
      hasOutput: false,
      level: 'info',
    })
  })

  it('should handle hook errors', () => {
    const msg = {
      subtype: 'stop_hook_summary',
      hookCount: 2,
      hookInfos: [{ command: 'test1' }, { command: 'test2' }],
      hookErrors: ['Error in hook 1'],
      preventedContinuation: true,
      level: 'error',
    }
    const result = parseStopHookSummary(msg)
    expect(result?.hookErrors).toEqual(['Error in hook 1'])
    expect(result?.preventedContinuation).toBe(true)
    expect(result?.level).toBe('error')
  })
})

describe('parseTurnDuration', () => {
  it('should parse real turn_duration message', () => {
    const msg = {
      type: 'system',
      subtype: 'turn_duration',
      durationMs: 59851,
    }
    const result = parseTurnDuration(msg)
    expect(result).toEqual({
      durationMs: 59851,
      durationFormatted: '1m 0s',
    })
  })

  it('should return null for non turn_duration messages', () => {
    const msg = { type: 'system', subtype: 'stop_hook_summary' }
    expect(parseTurnDuration(msg)).toBeNull()
  })

  it('should handle seconds only (less than 1 minute)', () => {
    const msg = { subtype: 'turn_duration', durationMs: 45000 }
    const result = parseTurnDuration(msg)
    expect(result?.durationFormatted).toBe('45s')
  })

  it('should handle minutes and seconds', () => {
    const msg = { subtype: 'turn_duration', durationMs: 125000 }
    const result = parseTurnDuration(msg)
    expect(result?.durationFormatted).toBe('2m 5s')
  })

  it('should handle zero duration', () => {
    const msg = { subtype: 'turn_duration', durationMs: 0 }
    const result = parseTurnDuration(msg)
    expect(result?.durationFormatted).toBe('0s')
  })

  it('should handle missing durationMs with default', () => {
    const msg = { subtype: 'turn_duration' }
    const result = parseTurnDuration(msg)
    expect(result?.durationMs).toBe(0)
    expect(result?.durationFormatted).toBe('0s')
  })
})

describe('parseProgress', () => {
  it('should parse real hook_progress message', () => {
    const msg = {
      type: 'progress',
      data: {
        type: 'hook_progress',
        hookEvent: 'PostToolUse',
        hookName: 'PostToolUse:Edit',
        command: 'some command',
      },
    }
    const result = parseProgress(msg)
    expect(result).toEqual({
      type: 'hook_progress',
      hookEvent: 'PostToolUse',
      hookName: 'PostToolUse:Edit',
      command: 'some command',
    })
  })

  it('should return null for non progress messages', () => {
    const msg = { type: 'system', subtype: 'turn_duration' }
    expect(parseProgress(msg)).toBeNull()
  })

  it('should return null for progress without data', () => {
    const msg = { type: 'progress' }
    expect(parseProgress(msg)).toBeNull()
  })

  it('should handle missing optional fields', () => {
    const msg = {
      type: 'progress',
      data: { type: 'some_progress' },
    }
    const result = parseProgress(msg)
    expect(result).toEqual({
      type: 'some_progress',
      hookEvent: undefined,
      hookName: undefined,
      command: undefined,
    })
  })
})
