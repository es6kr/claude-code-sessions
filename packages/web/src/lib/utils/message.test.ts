import { describe, it, expect } from 'vitest'
import { maskHomePaths } from './message'

describe('maskHomePaths', () => {
  it('should replace /Users/username with ~ when followed by /', () => {
    expect(maskHomePaths('/Users/david/projects/test')).toBe('~/projects/test')
  })

  it('should handle different usernames', () => {
    expect(maskHomePaths('/Users/john/work/file.ts')).toBe('~/work/file.ts')
  })

  it('should handle multiple paths in text', () => {
    const input = 'Check /Users/david/foo and /Users/david/bar'
    expect(maskHomePaths(input)).toBe('Check ~/foo and ~/bar')
  })

  it('should handle Windows paths', () => {
    expect(maskHomePaths('C:\\Users\\david\\projects')).toBe('~\\projects')
  })

  it('should not modify paths without /Users prefix', () => {
    expect(maskHomePaths('/home/user/project')).toBe('/home/user/project')
  })

  it('should handle path at end of sentence', () => {
    expect(maskHomePaths('Located at /Users/david/work.')).toBe('Located at ~/work.')
  })

  it('should handle path in quotes', () => {
    expect(maskHomePaths('Path: "/Users/david/test"')).toBe('Path: "~/test"')
  })

  it('should handle path followed by colon', () => {
    expect(maskHomePaths('/Users/david/project: error')).toBe('~/project: error')
  })

  it('should preserve text without paths', () => {
    expect(maskHomePaths('Hello world')).toBe('Hello world')
  })

  it('should handle empty string', () => {
    expect(maskHomePaths('')).toBe('')
  })
})
