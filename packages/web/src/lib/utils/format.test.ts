import { describe, it, expect } from 'vitest'
import { truncate, formatProjectName, formatDate } from './format'

describe('truncate', () => {
  it('should return string unchanged if shorter than limit', () => {
    expect(truncate('Hello', 10)).toBe('Hello')
  })

  it('should truncate string with ellipsis if longer than limit', () => {
    expect(truncate('Hello World', 8)).toBe('Hello Wo...')
  })

  it('should handle exact length', () => {
    expect(truncate('Hello', 5)).toBe('Hello')
  })

  it('should handle empty string', () => {
    expect(truncate('', 10)).toBe('')
  })
})

describe('formatProjectName', () => {
  it('should replace /Users/username with ~', () => {
    expect(formatProjectName('/Users/david/projects/test')).toBe('~/projects/test')
  })

  it('should handle different usernames', () => {
    expect(formatProjectName('/Users/john/work')).toBe('~/work')
  })

  it('should not modify paths without /Users prefix', () => {
    expect(formatProjectName('/home/user/project')).toBe('/home/user/project')
  })

  it('should handle root user folder', () => {
    expect(formatProjectName('/Users/admin')).toBe('~')
  })
})

describe('formatDate', () => {
  it('should return dash for undefined', () => {
    expect(formatDate(undefined)).toBe('-')
  })

  it('should return dash for empty string', () => {
    expect(formatDate('')).toBe('-')
  })

  it('should format valid date string', () => {
    const result = formatDate('2025-01-15T10:30:00Z')
    // Just check it's not the fallback value - exact format depends on locale
    expect(result).not.toBe('-')
    expect(result.length).toBeGreaterThan(0)
  })
})
