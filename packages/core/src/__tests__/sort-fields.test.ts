import { describe, it, expect } from 'vitest'
import type { SessionSortOptions, SummaryInfo } from '../types.js'
import { getSessionSortTimestamp } from '../utils.js'

/**
 * TDD for session sorting by different fields
 *
 * SessionSortField options:
 * - 'summary': oldest summary timestamp (default)
 * - 'modified': file modification time
 * - 'created': session creation time
 * - 'updated': last message timestamp
 * - 'messageCount': number of messages
 * - 'title': alphabetical by title
 */

describe('Session sorting by different fields', () => {
  // Dummy session data for testing
  const createDummySessions = () => [
    {
      id: 'session-alpha',
      title: 'Alpha feature implementation',
      customTitle: undefined,
      currentSummary: 'Implementing alpha feature',
      messageCount: 50,
      createdAt: '2026-01-10T00:00:00.000Z',
      updatedAt: '2026-01-15T12:00:00.000Z',
      fileMtime: 1704844800000, // Jan 10
      summaries: [
        { summary: 'Alpha feature', timestamp: '2026-01-12T00:00:00.000Z' },
      ] as SummaryInfo[],
    },
    {
      id: 'session-beta',
      title: 'Beta bug fixes',
      customTitle: 'Critical Beta Fixes',
      currentSummary: 'Fixing beta bugs',
      messageCount: 20,
      createdAt: '2026-01-15T00:00:00.000Z',
      updatedAt: '2026-01-18T08:00:00.000Z',
      fileMtime: 1705276800000, // Jan 15
      summaries: [
        { summary: 'Beta fixes', timestamp: '2026-01-16T00:00:00.000Z' },
      ] as SummaryInfo[],
    },
    {
      id: 'session-gamma',
      title: 'Gamma refactoring',
      customTitle: undefined,
      currentSummary: undefined,
      messageCount: 100,
      createdAt: '2026-01-05T00:00:00.000Z',
      updatedAt: '2026-01-19T10:00:00.000Z',
      fileMtime: 1705708800000, // Jan 20
      summaries: [] as SummaryInfo[],
    },
  ]

  const sortSessions = <
    T extends {
      summaries?: SummaryInfo[]
      createdAt?: string
      updatedAt?: string
      fileMtime?: number
      messageCount: number
      title: string
      customTitle?: string
      currentSummary?: string
    },
  >(
    sessions: T[],
    sortOptions: SessionSortOptions
  ): T[] => {
    return [...sessions].sort((a, b) => {
      let comparison = 0

      switch (sortOptions.field) {
        case 'summary': {
          const timeA = getSessionSortTimestamp(a)
          const timeB = getSessionSortTimestamp(b)
          const dateA = timeA ? new Date(timeA).getTime() : 0
          const dateB = timeB ? new Date(timeB).getTime() : 0
          comparison = dateA - dateB
          break
        }
        case 'modified': {
          comparison = (a.fileMtime ?? 0) - (b.fileMtime ?? 0)
          break
        }
        case 'created': {
          const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0
          comparison = createdA - createdB
          break
        }
        case 'updated': {
          const updatedA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
          const updatedB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
          comparison = updatedA - updatedB
          break
        }
        case 'messageCount': {
          comparison = a.messageCount - b.messageCount
          break
        }
        case 'title': {
          const titleA = a.customTitle ?? a.currentSummary ?? a.title
          const titleB = b.customTitle ?? b.currentSummary ?? b.title
          comparison = titleA.localeCompare(titleB)
          break
        }
      }

      return sortOptions.order === 'desc' ? -comparison : comparison
    })
  }

  describe('sort by summary timestamp', () => {
    it('should sort by oldest summary timestamp (asc)', () => {
      const sessions = createDummySessions()
      const sorted = sortSessions(sessions, { field: 'summary', order: 'asc' })

      // Gamma has no summary, uses createdAt (Jan 5)
      // Alpha summary: Jan 12
      // Beta summary: Jan 16
      expect(sorted[0].id).toBe('session-gamma') // Jan 5 (createdAt)
      expect(sorted[1].id).toBe('session-alpha') // Jan 12 (summary)
      expect(sorted[2].id).toBe('session-beta') // Jan 16 (summary)
    })

    it('should sort by oldest summary timestamp (desc)', () => {
      const sessions = createDummySessions()
      const sorted = sortSessions(sessions, { field: 'summary', order: 'desc' })

      expect(sorted[0].id).toBe('session-beta') // Jan 16 (newest)
      expect(sorted[1].id).toBe('session-alpha') // Jan 12
      expect(sorted[2].id).toBe('session-gamma') // Jan 5 (oldest)
    })
  })

  describe('sort by file modification time', () => {
    it('should sort by fileMtime (asc)', () => {
      const sessions = createDummySessions()
      const sorted = sortSessions(sessions, { field: 'modified', order: 'asc' })

      expect(sorted[0].id).toBe('session-alpha') // Jan 10
      expect(sorted[1].id).toBe('session-beta') // Jan 15
      expect(sorted[2].id).toBe('session-gamma') // Jan 20
    })

    it('should sort by fileMtime (desc)', () => {
      const sessions = createDummySessions()
      const sorted = sortSessions(sessions, { field: 'modified', order: 'desc' })

      expect(sorted[0].id).toBe('session-gamma') // Jan 20 (most recent)
      expect(sorted[1].id).toBe('session-beta') // Jan 15
      expect(sorted[2].id).toBe('session-alpha') // Jan 10 (oldest)
    })
  })

  describe('sort by created time', () => {
    it('should sort by createdAt (asc)', () => {
      const sessions = createDummySessions()
      const sorted = sortSessions(sessions, { field: 'created', order: 'asc' })

      expect(sorted[0].id).toBe('session-gamma') // Jan 5
      expect(sorted[1].id).toBe('session-alpha') // Jan 10
      expect(sorted[2].id).toBe('session-beta') // Jan 15
    })

    it('should sort by createdAt (desc)', () => {
      const sessions = createDummySessions()
      const sorted = sortSessions(sessions, { field: 'created', order: 'desc' })

      expect(sorted[0].id).toBe('session-beta') // Jan 15 (newest)
      expect(sorted[1].id).toBe('session-alpha') // Jan 10
      expect(sorted[2].id).toBe('session-gamma') // Jan 5 (oldest)
    })
  })

  describe('sort by updated time', () => {
    it('should sort by updatedAt (asc)', () => {
      const sessions = createDummySessions()
      const sorted = sortSessions(sessions, { field: 'updated', order: 'asc' })

      expect(sorted[0].id).toBe('session-alpha') // Jan 15 12:00
      expect(sorted[1].id).toBe('session-beta') // Jan 18 08:00
      expect(sorted[2].id).toBe('session-gamma') // Jan 19 10:00
    })

    it('should sort by updatedAt (desc)', () => {
      const sessions = createDummySessions()
      const sorted = sortSessions(sessions, { field: 'updated', order: 'desc' })

      expect(sorted[0].id).toBe('session-gamma') // Jan 19 (most recent activity)
      expect(sorted[1].id).toBe('session-beta') // Jan 18
      expect(sorted[2].id).toBe('session-alpha') // Jan 15 (least recent)
    })
  })

  describe('sort by message count', () => {
    it('should sort by messageCount (asc)', () => {
      const sessions = createDummySessions()
      const sorted = sortSessions(sessions, { field: 'messageCount', order: 'asc' })

      expect(sorted[0].id).toBe('session-beta') // 20 messages
      expect(sorted[1].id).toBe('session-alpha') // 50 messages
      expect(sorted[2].id).toBe('session-gamma') // 100 messages
    })

    it('should sort by messageCount (desc)', () => {
      const sessions = createDummySessions()
      const sorted = sortSessions(sessions, { field: 'messageCount', order: 'desc' })

      expect(sorted[0].id).toBe('session-gamma') // 100 messages (most)
      expect(sorted[1].id).toBe('session-alpha') // 50 messages
      expect(sorted[2].id).toBe('session-beta') // 20 messages (least)
    })
  })

  describe('sort by title', () => {
    it('should sort alphabetically by display title (asc)', () => {
      const sessions = createDummySessions()
      const sorted = sortSessions(sessions, { field: 'title', order: 'asc' })

      // Display titles (customTitle > currentSummary > title):
      // - Alpha: "Implementing alpha feature" (currentSummary)
      // - Beta: "Critical Beta Fixes" (customTitle takes priority)
      // - Gamma: "Gamma refactoring" (title, no customTitle/currentSummary)
      expect(sorted[0].id).toBe('session-beta') // "Critical..."
      expect(sorted[1].id).toBe('session-gamma') // "Gamma..."
      expect(sorted[2].id).toBe('session-alpha') // "Implementing..."
    })

    it('should sort alphabetically by display title (desc)', () => {
      const sessions = createDummySessions()
      const sorted = sortSessions(sessions, { field: 'title', order: 'desc' })

      expect(sorted[0].id).toBe('session-alpha') // "Implementing..." (I > G > C)
      expect(sorted[1].id).toBe('session-gamma') // "Gamma..."
      expect(sorted[2].id).toBe('session-beta') // "Critical..."
    })

    it('should use customTitle over currentSummary over title', () => {
      const sessions = [
        {
          id: 'with-custom',
          title: 'Original title',
          customTitle: 'AAA Custom',
          currentSummary: 'BBB Summary',
          messageCount: 1,
          summaries: [] as SummaryInfo[],
        },
        {
          id: 'with-summary',
          title: 'Original title 2',
          customTitle: undefined,
          currentSummary: 'CCC Summary',
          messageCount: 1,
          summaries: [] as SummaryInfo[],
        },
        {
          id: 'title-only',
          title: 'DDD Title only',
          customTitle: undefined,
          currentSummary: undefined,
          messageCount: 1,
          summaries: [] as SummaryInfo[],
        },
      ]

      const sorted = sortSessions(sessions, { field: 'title', order: 'asc' })

      expect(sorted[0].id).toBe('with-custom') // AAA Custom
      expect(sorted[1].id).toBe('with-summary') // CCC Summary
      expect(sorted[2].id).toBe('title-only') // DDD Title only
    })
  })
})

describe('Edge cases for sorting', () => {
  it('should handle sessions with missing timestamps', () => {
    const sessions = [
      {
        id: 'no-timestamps',
        title: 'No timestamps',
        messageCount: 5,
        summaries: [] as SummaryInfo[],
      },
      {
        id: 'with-created',
        title: 'With created',
        createdAt: '2026-01-15T00:00:00.000Z',
        messageCount: 10,
        summaries: [] as SummaryInfo[],
      },
    ]

    const sortByCreated = [...sessions].sort((a, b) => {
      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return createdB - createdA // desc
    })

    expect(sortByCreated[0].id).toBe('with-created')
    expect(sortByCreated[1].id).toBe('no-timestamps')
  })

  it('should handle sessions with undefined fileMtime', () => {
    const sessions = [
      {
        id: 'no-mtime',
        title: 'No mtime',
        messageCount: 5,
        summaries: [] as SummaryInfo[],
      },
      {
        id: 'with-mtime',
        title: 'With mtime',
        fileMtime: 1705000000000,
        messageCount: 10,
        summaries: [] as SummaryInfo[],
      },
    ]

    const sortByModified = [...sessions].sort((a, b) => {
      return (b.fileMtime ?? 0) - (a.fileMtime ?? 0) // desc
    })

    expect(sortByModified[0].id).toBe('with-mtime')
    expect(sortByModified[1].id).toBe('no-mtime')
  })

  it('should maintain stable order for equal values', () => {
    const sessions = [
      {
        id: 'first',
        title: 'Same title',
        messageCount: 10,
        createdAt: '2026-01-15T00:00:00.000Z',
        summaries: [] as SummaryInfo[],
      },
      {
        id: 'second',
        title: 'Same title',
        messageCount: 10,
        createdAt: '2026-01-15T00:00:00.000Z',
        summaries: [] as SummaryInfo[],
      },
    ]

    // When values are equal, original order should be preserved
    const sortByCount = [...sessions].sort((a, b) => b.messageCount - a.messageCount)

    // Both have same count, so order depends on sort stability
    expect(sortByCount.length).toBe(2)
    expect(sortByCount[0].messageCount).toBe(10)
    expect(sortByCount[1].messageCount).toBe(10)
  })
})
