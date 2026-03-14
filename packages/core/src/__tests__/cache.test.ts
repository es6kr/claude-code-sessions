import { describe, it, expect } from 'vitest'
import { validateCache, type TreeCache } from '../session/cache.js'
import type { SessionTreeData } from '../types.js'

describe('validateCache', () => {
  const makeCache = (sessions: Record<string, number>): TreeCache => ({
    version: 1,
    globalUuidMap: {},
    allSummaries: [],
    sessions: Object.fromEntries(
      Object.entries(sessions).map(([id, mtime]) => [
        id,
        { fileMtime: mtime, data: { id } as unknown as SessionTreeData },
      ])
    ),
  })

  it('should report full hit when all mtimes match', () => {
    const cache = makeCache({ 'session-1': 1000, 'session-2': 2000 })
    const mtimes = new Map([
      ['session-1', 1000],
      ['session-2', 2000],
    ])
    const result = validateCache(cache, ['session-1', 'session-2'], mtimes)

    expect(result.isFullHit).toBe(true)
    expect(result.changedSessionIds).toEqual([])
    expect(result.newSessionIds).toEqual([])
    expect(result.deletedSessionIds).toEqual([])
  })

  it('should detect changed sessions by mtime difference', () => {
    const cache = makeCache({ 'session-1': 1000 })
    const mtimes = new Map([['session-1', 5000]])
    const result = validateCache(cache, ['session-1'], mtimes)

    expect(result.isFullHit).toBe(false)
    expect(result.changedSessionIds).toEqual(['session-1'])
  })

  it('should allow 1ms mtime tolerance', () => {
    const cache = makeCache({ 'session-1': 1000 })
    const mtimes = new Map([['session-1', 1001]])
    const result = validateCache(cache, ['session-1'], mtimes)

    expect(result.isFullHit).toBe(true)
    expect(result.unchangedSessionIds).toEqual(['session-1'])
  })

  it('should detect new sessions not in cache', () => {
    const cache = makeCache({ 'session-1': 1000 })
    const mtimes = new Map([
      ['session-1', 1000],
      ['session-2', 2000],
    ])
    const result = validateCache(cache, ['session-1', 'session-2'], mtimes)

    expect(result.isFullHit).toBe(false)
    expect(result.newSessionIds).toEqual(['session-2'])
  })

  it('should detect deleted sessions no longer on disk', () => {
    const cache = makeCache({ 'session-1': 1000, 'session-2': 2000 })
    const mtimes = new Map([['session-1', 1000]])
    const result = validateCache(cache, ['session-1'], mtimes)

    expect(result.isFullHit).toBe(false)
    expect(result.deletedSessionIds).toEqual(['session-2'])
  })
})
