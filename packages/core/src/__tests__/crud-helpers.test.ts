import { describe, it, expect } from 'vitest'
import {
  filterSessionFiles,
  buildSessionMeta,
  sortSessionsByDate,
} from '../session/crud-helpers.js'

describe('filterSessionFiles', () => {
  it('should include .jsonl files', () => {
    const files = ['session-abc.jsonl', 'session-def.jsonl']
    expect(filterSessionFiles(files)).toEqual(files)
  })

  it('should exclude agent files', () => {
    const files = ['session-abc.jsonl', 'agent-xyz.jsonl', 'agent-123.jsonl']
    expect(filterSessionFiles(files)).toEqual(['session-abc.jsonl'])
  })

  it('should exclude non-jsonl files', () => {
    const files = ['session-abc.jsonl', 'sessions-index.json', 'README.md', '.DS_Store']
    expect(filterSessionFiles(files)).toEqual(['session-abc.jsonl'])
  })

  it('should return empty array when no session files', () => {
    const files = ['agent-xyz.jsonl', 'sessions-index.json']
    expect(filterSessionFiles(files)).toEqual([])
  })

  it('should handle empty input', () => {
    expect(filterSessionFiles([])).toEqual([])
  })
})

describe('buildSessionMeta', () => {
  it('should build metadata with explicit title', () => {
    const meta = buildSessionMeta('session-id', 'project-name', {
      title: 'My Session',
      userAssistantCount: 10,
      hasSummary: false,
      firstTimestamp: '2026-01-01T00:00:00.000Z',
      lastTimestamp: '2026-01-02T00:00:00.000Z',
    })

    expect(meta).toEqual({
      id: 'session-id',
      projectName: 'project-name',
      title: 'My Session',
      agentName: undefined,
      customTitle: undefined,
      currentSummary: undefined,
      messageCount: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
  })

  it('should use "[Summary Only]" title when no title but has summary', () => {
    const meta = buildSessionMeta('session-id', 'project-name', {
      userAssistantCount: 0,
      hasSummary: true,
    })

    expect(meta.title).toBe('[Summary Only]')
    expect(meta.messageCount).toBe(1)
  })

  it('should use truncated session ID as fallback title', () => {
    const meta = buildSessionMeta('abcdef12-3456-7890-abcd-ef1234567890', 'project-name', {
      userAssistantCount: 0,
      hasSummary: false,
    })

    expect(meta.title).toBe('Session abcdef12')
    expect(meta.messageCount).toBe(0)
  })

  it('should pass through agentName and customTitle', () => {
    const meta = buildSessionMeta('session-id', 'project-name', {
      title: 'Title',
      agentName: 'My Agent',
      customTitle: 'Custom Title',
      currentSummary: 'Summary text',
      userAssistantCount: 5,
      hasSummary: false,
    })

    expect(meta.agentName).toBe('My Agent')
    expect(meta.customTitle).toBe('Custom Title')
    expect(meta.currentSummary).toBe('Summary text')
  })

  it('should count summary-only sessions as 1 message', () => {
    const meta = buildSessionMeta('session-id', 'project-name', {
      userAssistantCount: 0,
      hasSummary: true,
    })

    expect(meta.messageCount).toBe(1)
  })

  it('should use userAssistantCount when messages exist', () => {
    const meta = buildSessionMeta('session-id', 'project-name', {
      userAssistantCount: 42,
      hasSummary: true,
    })

    expect(meta.messageCount).toBe(42)
  })
})

describe('sortSessionsByDate', () => {
  it('should sort sessions newest first', () => {
    const sessions = [
      buildSessionMeta('old', 'proj', {
        userAssistantCount: 1,
        hasSummary: false,
        lastTimestamp: '2026-01-01T00:00:00.000Z',
      }),
      buildSessionMeta('new', 'proj', {
        userAssistantCount: 1,
        hasSummary: false,
        lastTimestamp: '2026-01-03T00:00:00.000Z',
      }),
      buildSessionMeta('mid', 'proj', {
        userAssistantCount: 1,
        hasSummary: false,
        lastTimestamp: '2026-01-02T00:00:00.000Z',
      }),
    ]

    const sorted = sortSessionsByDate(sessions)

    expect(sorted[0].id).toBe('new')
    expect(sorted[1].id).toBe('mid')
    expect(sorted[2].id).toBe('old')
  })

  it('should handle sessions without updatedAt', () => {
    const sessions = [
      buildSessionMeta('with-date', 'proj', {
        userAssistantCount: 1,
        hasSummary: false,
        lastTimestamp: '2026-01-01T00:00:00.000Z',
      }),
      buildSessionMeta('no-date', 'proj', { userAssistantCount: 1, hasSummary: false }),
    ]

    const sorted = sortSessionsByDate(sessions)

    expect(sorted[0].id).toBe('with-date')
    expect(sorted[1].id).toBe('no-date')
  })

  it('should handle empty array', () => {
    expect(sortSessionsByDate([])).toEqual([])
  })
})
