import { describe, it, expect } from 'vitest'
import { maskHomePath } from '$lib/stores/config'

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
