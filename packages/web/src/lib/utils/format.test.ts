import { describe, it, expect } from 'vitest'
import { truncate, formatDate } from './format'
import { maskHomePath } from '$lib/stores/config'

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

describe('maskHomePath for project names', () => {
  const homeDir = '/Users/david'

  it('should replace current user home with ~', () => {
    expect(maskHomePath('/Users/david/projects/test', homeDir)).toBe('~/projects/test')
  })

  it('should NOT mask other users paths', () => {
    expect(maskHomePath('/Users/john/work', homeDir)).toBe('/Users/john/work')
  })

  it('should not modify paths without /Users prefix', () => {
    expect(maskHomePath('/home/user/project', homeDir)).toBe('/home/user/project')
  })

  it('should handle root user folder', () => {
    expect(maskHomePath('/Users/david', homeDir)).toBe('~')
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
