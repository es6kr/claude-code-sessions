import { describe, it, expect } from 'vitest'
import type { SummaryInfo, SessionIndexEntry } from '../types.js'
import { getSessionSortTimestamp } from '../utils.js'
import { getIndexEntryDisplayTitle, sortIndexEntriesByModified } from '../session/index-file.js'

/**
 * TDD for session sorting and display
 *
 * CRITICAL ARCHITECTURE (from official Claude Code extension):
 * - Summary records have `leafUuid` pointing to a message in ANOTHER session
 * - The timestamp for sorting comes from the TARGET message's timestamp
 * - Official extension uses oldest summary timestamp for sorting
 * - sessions-index.json provides quick access to metadata
 */

describe('getSessionSortTimestamp', () => {
  // Pre-calculated Unix timestamps for test data
  const TIMESTAMP_2025_12_26 = 1766753590763 // '2025-12-26T12:53:10.763Z'
  const TIMESTAMP_2025_12_25 = 1766659320000 // '2025-12-25T10:42:00.000Z'

  describe('basic priority logic', () => {
    it('should return summaries[0].timestamp when available', () => {
      const session = {
        summaries: [
          { summary: 'Test summary', leafUuid: 'abc123', timestamp: '2025-12-26T12:53:10.763Z' },
        ],
        createdAt: '2025-12-25T10:42:00.000Z',
      }

      expect(getSessionSortTimestamp(session)).toBe(TIMESTAMP_2025_12_26)
    })

    it('should return createdAt when no summaries', () => {
      const session = {
        summaries: [],
        createdAt: '2025-12-25T10:42:00.000Z',
      }

      expect(getSessionSortTimestamp(session)).toBe(TIMESTAMP_2025_12_25)
    })

    it('should return createdAt when summaries is undefined', () => {
      const session = {
        createdAt: '2025-12-25T10:42:00.000Z',
      }

      expect(getSessionSortTimestamp(session)).toBe(TIMESTAMP_2025_12_25)
    })

    it('should return createdAt when summaries[0] has no timestamp', () => {
      const session = {
        summaries: [{ summary: 'Test summary', leafUuid: 'abc123' }],
        createdAt: '2025-12-25T10:42:00.000Z',
      }

      expect(getSessionSortTimestamp(session)).toBe(TIMESTAMP_2025_12_25)
    })

    it('should return 0 when no timestamps available', () => {
      const session = {
        summaries: [],
      }

      expect(getSessionSortTimestamp(session)).toBe(0)
    })
  })

  describe('dummy data scenarios', () => {
    // Reference time for relative calculations
    const REFERENCE_TIME = new Date('2026-01-19T05:26:00.000Z')
    const REFERENCE_TIME_MS = REFERENCE_TIME.getTime()

    const getRelativeTime = (timestampMs: number) => {
      if (!timestampMs) return '?'
      const diffMs = REFERENCE_TIME_MS - timestampMs
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffHours / 24)
      if (diffDays >= 1) return `${diffDays}d`
      return `${diffHours}h`
    }

    it('should calculate 23d for session with summary timestamp 23 days ago', () => {
      const session = {
        summaries: [
          {
            summary: 'Add Session Resume Feature',
            leafUuid: '516b2e53-xxxx',
            timestamp: '2025-12-26T12:53:10.763Z', // ~23d from reference
          },
        ],
        createdAt: '2025-12-25T10:42:00.000Z', // ~24d (older)
      }

      const sortTimestamp = getSessionSortTimestamp(session)
      expect(sortTimestamp).toBe(TIMESTAMP_2025_12_26)
      expect(getRelativeTime(sortTimestamp)).toBe('23d')
    })

    it('should use createdAt for sessions without summaries', () => {
      const timestamp = new Date('2026-01-18T09:26:00.000Z').getTime()
      const session = {
        summaries: [],
        createdAt: '2026-01-18T09:26:00.000Z', // 20h from reference
      }

      const sortTimestamp = getSessionSortTimestamp(session)
      expect(sortTimestamp).toBe(timestamp)
      expect(getRelativeTime(sortTimestamp)).toBe('20h')
    })

    it('should prioritize summary timestamp over createdAt even if older', () => {
      const oldTimestamp = new Date('2025-12-01T00:00:00.000Z').getTime()
      const session = {
        summaries: [
          {
            summary: 'Old summary',
            leafUuid: 'target-uuid',
            timestamp: '2025-12-01T00:00:00.000Z', // Very old summary
          },
        ],
        createdAt: '2026-01-15T00:00:00.000Z', // Recent creation
      }

      const sortTimestamp = getSessionSortTimestamp(session)
      expect(sortTimestamp).toBe(oldTimestamp)
    })
  })

  describe('sorting behavior with dummy sessions', () => {
    const sortSessions = <T extends { summaries?: SummaryInfo[]; createdAt?: string }>(
      sessions: T[]
    ): T[] => {
      return [...sessions].sort((a, b) => {
        const timeA = getSessionSortTimestamp(a)
        const timeB = getSessionSortTimestamp(b)
        return timeB - timeA // Newest first (desc)
      })
    }

    it('should sort sessions by summary timestamp when available', () => {
      const sessions = [
        {
          id: 'old-created-new-summary',
          summaries: [{ summary: 'S1', timestamp: '2026-01-19T00:00:00.000Z' }],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'new-created-no-summary',
          summaries: [],
          createdAt: '2026-01-18T00:00:00.000Z',
        },
      ]

      const sorted = sortSessions(sessions)

      // Session with newer summary timestamp should come first
      expect(sorted[0].id).toBe('old-created-new-summary')
      expect(sorted[1].id).toBe('new-created-no-summary')
    })

    it('should order by createdAt when all sessions lack summaries', () => {
      const sessions = [
        {
          id: 'search-session',
          title: 'Search sessions',
          summaries: [],
          createdAt: '2026-01-18T05:00:00.000Z', // ~24h = oldest
        },
        {
          id: 'commit-session',
          title: 'Commit changes',
          summaries: [],
          createdAt: '2026-01-18T09:26:00.000Z', // ~20h = newest
        },
        {
          id: 'orphan-session',
          title: 'Orphan agents',
          summaries: [],
          createdAt: '2026-01-18T07:26:00.000Z', // ~22h = middle
        },
      ]

      const sorted = sortSessions(sessions)

      // Expected order: newest first (commit 20h → orphan 22h → search 24h)
      expect(sorted[0].id).toBe('commit-session')
      expect(sorted[1].id).toBe('orphan-session')
      expect(sorted[2].id).toBe('search-session')
    })

    it('should handle mixed sessions with and without summaries', () => {
      const sessions = [
        {
          id: 'session-with-old-summary',
          summaries: [{ summary: 'Old', timestamp: '2025-12-01T00:00:00.000Z' }],
          createdAt: '2026-01-10T00:00:00.000Z',
        },
        {
          id: 'session-without-summary',
          summaries: [],
          createdAt: '2026-01-15T00:00:00.000Z',
        },
        {
          id: 'session-with-new-summary',
          summaries: [{ summary: 'New', timestamp: '2026-01-18T00:00:00.000Z' }],
          createdAt: '2026-01-05T00:00:00.000Z',
        },
      ]

      const sorted = sortSessions(sessions)

      // Order by effective timestamp: new-summary (Jan 18) → without (Jan 15) → old-summary (Dec 1)
      expect(sorted[0].id).toBe('session-with-new-summary')
      expect(sorted[1].id).toBe('session-without-summary')
      expect(sorted[2].id).toBe('session-with-old-summary')
    })
  })
})

describe('sessions-index.json utilities', () => {
  // Helper to create SessionIndexEntry with required fields
  const createEntry = (
    overrides: Partial<SessionIndexEntry> & { sessionId: string }
  ): SessionIndexEntry => ({
    fullPath: `/path/${overrides.sessionId}.jsonl`,
    fileMtime: 1234567890,
    firstPrompt: 'Default prompt',
    messageCount: 1,
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-02T00:00:00.000Z',
    gitBranch: 'main',
    projectPath: '/test/project',
    isSidechain: false,
    ...overrides,
  })

  describe('getIndexEntryDisplayTitle', () => {
    it('should prioritize customTitle over summary', () => {
      const entry = createEntry({
        sessionId: 'test-123',
        firstPrompt: 'Initial prompt',
        messageCount: 10,
        customTitle: 'My Custom Title',
        summary: 'Auto-generated summary',
      })

      expect(getIndexEntryDisplayTitle(entry)).toBe('My Custom Title')
    })

    it('should use summary when no customTitle', () => {
      const entry = createEntry({
        sessionId: 'test-456',
        firstPrompt: 'Initial prompt',
        messageCount: 5,
        summary: 'Session about feature implementation',
      })

      expect(getIndexEntryDisplayTitle(entry)).toBe('Session about feature implementation')
    })

    it('should clean and truncate firstPrompt when no customTitle or summary', () => {
      const entry = createEntry({
        sessionId: 'test-789',
        firstPrompt: 'Help me implement a very long feature that requires extensive coding',
        messageCount: 3,
      })

      const title = getIndexEntryDisplayTitle(entry)
      expect(title.length).toBeLessThanOrEqual(60)
      expect(title).toContain('Help me implement')
    })

    it('should return Untitled for "No prompt"', () => {
      const entry = createEntry({
        sessionId: 'test-empty',
        firstPrompt: 'No prompt',
        messageCount: 0,
      })

      expect(getIndexEntryDisplayTitle(entry)).toBe('Untitled')
    })

    it('should return Untitled for interrupted requests', () => {
      const entry = createEntry({
        sessionId: 'test-interrupted',
        firstPrompt: '[Request interrupted by user]',
      })

      expect(getIndexEntryDisplayTitle(entry)).toBe('Untitled')
    })

    it('should strip IDE tags from firstPrompt', () => {
      const entry = createEntry({
        sessionId: 'test-ide-tags',
        firstPrompt: '<ide_selection>selected code</ide_selection>Fix this bug',
        messageCount: 2,
      })

      const title = getIndexEntryDisplayTitle(entry)
      expect(title).toBe('Fix this bug')
      expect(title).not.toContain('ide_selection')
    })
  })

  describe('sortIndexEntriesByModified', () => {
    it('should sort entries by modified time (newest first)', () => {
      const entries: SessionIndexEntry[] = [
        createEntry({
          sessionId: 'oldest',
          fileMtime: 100,
          firstPrompt: 'First',
          created: '2026-01-01T00:00:00.000Z',
          modified: '2026-01-01T00:00:00.000Z',
        }),
        createEntry({
          sessionId: 'newest',
          fileMtime: 300,
          firstPrompt: 'Third',
          messageCount: 3,
          created: '2026-01-03T00:00:00.000Z',
          modified: '2026-01-03T00:00:00.000Z',
        }),
        createEntry({
          sessionId: 'middle',
          fileMtime: 200,
          firstPrompt: 'Second',
          messageCount: 2,
          created: '2026-01-02T00:00:00.000Z',
          modified: '2026-01-02T00:00:00.000Z',
        }),
      ]

      const sorted = sortIndexEntriesByModified(entries)

      expect(sorted[0].sessionId).toBe('newest')
      expect(sorted[1].sessionId).toBe('middle')
      expect(sorted[2].sessionId).toBe('oldest')
    })

    it('should not mutate original array', () => {
      const entries: SessionIndexEntry[] = [
        createEntry({
          sessionId: 'a',
          fileMtime: 100,
          firstPrompt: 'A',
          modified: '2026-01-01T00:00:00.000Z',
        }),
        createEntry({
          sessionId: 'b',
          fileMtime: 200,
          firstPrompt: 'B',
          messageCount: 2,
          modified: '2026-01-02T00:00:00.000Z',
        }),
      ]

      const sorted = sortIndexEntriesByModified(entries)

      expect(entries[0].sessionId).toBe('a') // Original unchanged
      expect(sorted[0].sessionId).toBe('b') // Sorted result different
    })
  })
})

describe('summary sorting (oldest first)', () => {
  it('should select oldest summary as currentSummary', () => {
    const summaries: SummaryInfo[] = [
      { summary: 'Second summary', leafUuid: 'uuid-2', timestamp: '2026-01-02T00:00:00.000Z' },
      { summary: 'First summary', leafUuid: 'uuid-1', timestamp: '2026-01-01T00:00:00.000Z' },
      { summary: 'Third summary', leafUuid: 'uuid-3', timestamp: '2026-01-03T00:00:00.000Z' },
    ]

    // Sort by timestamp ascending (oldest first)
    const sorted = [...summaries].sort((a, b) => {
      return (a.timestamp ?? '').localeCompare(b.timestamp ?? '')
    })

    expect(sorted[0].summary).toBe('First summary')
    expect(sorted[0].timestamp).toBe('2026-01-01T00:00:00.000Z')
  })

  it('should use sourceFile as tiebreaker when timestamps match', () => {
    const summaries: SummaryInfo[] = [
      {
        summary: 'From smaller file',
        leafUuid: 'uuid-1',
        timestamp: '2026-01-01T00:00:00.000Z',
        sourceFile: '355e3718.jsonl',
      },
      {
        summary: 'From larger file',
        leafUuid: 'uuid-2',
        timestamp: '2026-01-01T00:00:00.000Z',
        sourceFile: 'b878041c.jsonl',
      },
    ]

    // Sort by timestamp ascending, then sourceFile descending
    const sorted = [...summaries].sort((a, b) => {
      const timestampCmp = (a.timestamp ?? '').localeCompare(b.timestamp ?? '')
      if (timestampCmp !== 0) return timestampCmp
      return (b.sourceFile ?? '').localeCompare(a.sourceFile ?? '')
    })

    // Larger sourceFile (b878041c) should come first when timestamps match
    expect(sorted[0].summary).toBe('From larger file')
    expect(sorted[0].sourceFile).toBe('b878041c.jsonl')
  })
})
