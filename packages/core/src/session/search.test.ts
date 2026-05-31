import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'

vi.mock('../paths.js', async () => {
  const actual = await vi.importActual<typeof import('../paths.js')>('../paths.js')
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  }
})

import { extractSnippet, findContentMatch, searchSessions } from './search.js'
import { getSessionsDir } from '../paths.js'

// ---------------------------------------------------------------------------
// Pure function tests (no mocking, no filesystem)
// ---------------------------------------------------------------------------

describe('extractSnippet', () => {
  it('returns the full text trimmed when match sits at index 0 and text is short', () => {
    const text = 'hello world'
    expect(extractSnippet(text, 0, 5)).toBe('hello world')
  })

  it('omits the leading ellipsis when start is 0 (matchIndex within 50 chars)', () => {
    const text = 'hello world plus some trailing context that is longer than fifty chars'
    const result = extractSnippet(text, 0, 5)
    expect(result.startsWith('...')).toBe(false)
    expect(result.startsWith('hello')).toBe(true)
  })

  it('adds leading and trailing ellipsis when match is in the middle of long text', () => {
    const prefix = 'a'.repeat(80)
    const suffix = 'b'.repeat(80)
    const text = `${prefix}NEEDLE${suffix}`
    const matchIndex = prefix.length
    const result = extractSnippet(text, matchIndex, 6)
    expect(result.startsWith('...')).toBe(true)
    expect(result.endsWith('...')).toBe(true)
    expect(result).toContain('NEEDLE')
  })

  it('omits the trailing ellipsis when end reaches text.length', () => {
    const prefix = 'a'.repeat(80)
    const text = `${prefix}NEEDLE`
    const matchIndex = prefix.length
    const result = extractSnippet(text, matchIndex, 6)
    expect(result.startsWith('...')).toBe(true)
    expect(result.endsWith('...')).toBe(false)
    expect(result.endsWith('NEEDLE')).toBe(true)
  })
})

describe('findContentMatch', () => {
  const filePath = '/tmp/test-session.jsonl'

  function makeUserMessage(uuid: string, text: string, timestamp = '2026-01-01T00:00:00.000Z') {
    return JSON.stringify({
      type: 'user',
      uuid,
      timestamp,
      message: { role: 'user', content: [{ type: 'text', text }] },
    })
  }

  function makeAssistantMessage(
    uuid: string,
    text: string,
    timestamp = '2026-01-01T00:00:00.000Z'
  ) {
    return JSON.stringify({
      type: 'assistant',
      uuid,
      timestamp,
      message: { role: 'assistant', content: [{ type: 'text', text }] },
    })
  }

  function makeSummary(leafUuid: string) {
    return JSON.stringify({ type: 'summary', summary: 'irrelevant', leafUuid })
  }

  it('returns the matching user message with a snippet', () => {
    const lines = [
      makeUserMessage('u-1', 'first message without the keyword'),
      makeUserMessage('u-2', 'second message contains NEEDLE inside it'),
    ]
    const result = findContentMatch(lines, 'needle', filePath)
    expect(result).not.toBeNull()
    expect(result?.msg.uuid).toBe('u-2')
    expect(result?.snippet).toContain('NEEDLE')
  })

  it('matches assistant messages too', () => {
    const lines = [makeAssistantMessage('a-1', 'assistant says NEEDLE here')]
    const result = findContentMatch(lines, 'needle', filePath)
    expect(result?.msg.uuid).toBe('a-1')
  })

  it('skips non-user/non-assistant message types', () => {
    const lines = [makeSummary('leaf-1'), makeUserMessage('u-1', 'plain user content with NEEDLE')]
    const result = findContentMatch(lines, 'needle', filePath)
    expect(result?.msg.uuid).toBe('u-1')
  })

  it('is case-insensitive on the query side (caller passes lowercased query)', () => {
    const lines = [makeUserMessage('u-1', 'mixed Case NeEdLe here')]
    const result = findContentMatch(lines, 'needle', filePath)
    expect(result?.msg.uuid).toBe('u-1')
  })

  it('returns null when no message contains the query', () => {
    const lines = [
      makeUserMessage('u-1', 'no match here'),
      makeUserMessage('u-2', 'still no match'),
    ]
    expect(findContentMatch(lines, 'needle', filePath)).toBeNull()
  })

  it('skips invalid JSON lines and continues searching', () => {
    const lines = ['{ not valid json', makeUserMessage('u-1', 'real message with NEEDLE')]
    const result = findContentMatch(lines, 'needle', filePath)
    expect(result?.msg.uuid).toBe('u-1')
  })
})

// ---------------------------------------------------------------------------
// Effect-based integration tests (uses a real temp directory + mocked paths.js)
// ---------------------------------------------------------------------------

describe('searchSessions', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-test-'))
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  async function writeSessionFile(
    projectName: string,
    sessionId: string,
    userText: string,
    timestamp = '2026-01-01T00:00:00.000Z'
  ) {
    const projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    const content =
      JSON.stringify({
        type: 'user',
        uuid: `msg-${sessionId}`,
        timestamp,
        message: { role: 'user', content: [{ type: 'text', text: userText }] },
      }) + '\n'
    await fs.writeFile(path.join(projectDir, `${sessionId}.jsonl`), content, 'utf-8')
  }

  // Write a session whose first user message (title source) differs from a later
  // user message that contains the search query. Used to verify the title vs
  // content phase distinction.
  async function writeSessionWithDistinctTitleAndContent(
    projectName: string,
    sessionId: string,
    firstUserText: string,
    laterUserText: string,
    timestamp = '2026-01-01T00:00:00.000Z'
  ) {
    const projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    const lines = [
      JSON.stringify({
        type: 'user',
        uuid: `msg-${sessionId}-1`,
        timestamp,
        message: { role: 'user', content: [{ type: 'text', text: firstUserText }] },
      }),
      JSON.stringify({
        type: 'user',
        uuid: `msg-${sessionId}-2`,
        timestamp,
        message: { role: 'user', content: [{ type: 'text', text: laterUserText }] },
      }),
    ]
    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      lines.join('\n') + '\n',
      'utf-8'
    )
  }

  it('finds sessions whose title matches the query (title-only phase)', async () => {
    await writeSessionFile('-Users-test-project-a', 'sess-1', 'NEEDLE in title')
    await writeSessionFile('-Users-test-project-a', 'sess-2', 'unrelated content')

    const results = await Effect.runPromise(searchSessions('needle'))

    expect(results.map((r) => r.sessionId)).toContain('sess-1')
    expect(results.map((r) => r.sessionId)).not.toContain('sess-2')
    expect(results[0].matchType).toBe('title')
  })

  it('finds sessions by content when searchContent is true', async () => {
    await writeSessionFile('-Users-test-project-a', 'sess-1', 'plain title')
    await writeSessionWithDistinctTitleAndContent(
      '-Users-test-project-a',
      'sess-2',
      'innocuous opening line',
      'this later message has NEEDLE inside'
    )

    const titleOnly = await Effect.runPromise(searchSessions('needle'))
    expect(titleOnly).toHaveLength(0)

    const withContent = await Effect.runPromise(searchSessions('needle', { searchContent: true }))
    const ids = withContent.map((r) => r.sessionId)
    expect(ids).toContain('sess-2')
    expect(withContent.find((r) => r.sessionId === 'sess-2')?.matchType).toBe('content')
  })

  it('narrows results when projectName filter is provided', async () => {
    await writeSessionFile('-Users-test-project-a', 'sess-a', 'NEEDLE here')
    await writeSessionFile('-Users-test-project-b', 'sess-b', 'NEEDLE there')

    const all = await Effect.runPromise(searchSessions('needle'))
    expect(all.map((r) => r.sessionId).sort()).toEqual(['sess-a', 'sess-b'])

    const filtered = await Effect.runPromise(
      searchSessions('needle', { projectName: '-Users-test-project-a' })
    )
    expect(filtered.map((r) => r.sessionId)).toEqual(['sess-a'])
  })

  it('sorts results by timestamp newest first', async () => {
    await writeSessionFile(
      '-Users-test-project-a',
      'sess-old',
      'NEEDLE old',
      '2026-01-01T00:00:00.000Z'
    )
    await writeSessionFile(
      '-Users-test-project-a',
      'sess-new',
      'NEEDLE new',
      '2026-06-01T00:00:00.000Z'
    )

    const results = await Effect.runPromise(searchSessions('needle'))
    expect(results.map((r) => r.sessionId)).toEqual(['sess-new', 'sess-old'])
  })

  it('returns an empty array when no projects exist', async () => {
    // tempDir is empty (no project directories)
    const results = await Effect.runPromise(searchSessions('needle'))
    expect(results).toEqual([])
  })
})
