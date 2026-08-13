import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const readdirMock = vi.fn(actual.readdir)
  return {
    ...actual,
    readdir: readdirMock,
    default: { ...actual, readdir: readdirMock },
  }
})

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
    // Restore readdir to the real implementation; individual tests may override.
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fs.readdir).mockImplementation(actual.readdir as typeof fs.readdir)

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

  // searchProjectContent TOCTOU guard — a project's folder may vanish between
  // listProjects() returning it and searchProjectContent's own readdir (cross-PC
  // sync, manual deletion). Mirrors listProjects' own guard, see Issue #103.
  describe('searchProjectContent TOCTOU safety', () => {
    function makeEnoent(p: string): NodeJS.ErrnoException {
      const err = new Error(
        `ENOENT: no such file or directory, scandir '${p}'`
      ) as NodeJS.ErrnoException
      err.code = 'ENOENT'
      return err
    }

    it("skips a project whose folder vanishes mid-content-search, keeping other projects' results", async () => {
      const projGone = '-Users-test-search-gone'
      const projKeep = '-Users-test-search-keep'
      await writeSessionWithDistinctTitleAndContent(
        projGone,
        'sess-gone',
        'plain title',
        'this has NEEDLE inside'
      )
      await writeSessionWithDistinctTitleAndContent(
        projKeep,
        'sess-keep',
        'plain title',
        'this also has NEEDLE inside'
      )

      // listProjects() also readdirs each project folder (for sessionCount) before
      // searchProjectContent gets a turn. Succeed on that first call so projGone
      // survives into targetProjects, then fail with ENOENT on the *next* readdir
      // for the same path — simulating the folder vanishing between the two reads
      // (the actual TOCTOU window this guard protects, not a same-instant miss).
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      let goneCallCount = 0
      vi.mocked(fs.readdir).mockImplementation(((p: unknown, opts: unknown) => {
        if (typeof p === 'string' && p.endsWith(projGone)) {
          goneCallCount += 1
          if (goneCallCount > 1) {
            return Promise.reject(makeEnoent(p))
          }
        }
        return (actual.readdir as typeof fs.readdir)(
          p as Parameters<typeof fs.readdir>[0],
          opts as Parameters<typeof fs.readdir>[1]
        )
      }) as typeof fs.readdir)

      // Before fix: the whole searchSessions Effect would die on projGone's ENOENT.
      // After fix: projGone is skipped, projKeep's content match still returned.
      const results = await Effect.runPromise(searchSessions('needle', { searchContent: true }))
      const ids = results.map((r) => r.sessionId)
      expect(ids).toContain('sess-keep')
      expect(ids).not.toContain('sess-gone')
    })

    it('propagates a non-ENOENT readdir error (EACCES) instead of silently skipping', async () => {
      const projDenied = '-Users-test-search-eacces'
      await writeSessionWithDistinctTitleAndContent(
        projDenied,
        'sess-denied',
        'plain title',
        'this has NEEDLE inside'
      )

      // Same call-count trick as above, but this project sees *three* readdir
      // calls before searchProjectContent's own turn: (1) listProjects' own
      // readdir (for sessionCount), (2) Phase 1 title search's listSessions()
      // readdir, (3) searchProjectContent's own readdir. Let the first two
      // succeed so projDenied reaches Phase 2, then fail with EACCES
      // specifically on call 3 — isolating this test to *searchProjectContent's*
      // non-ENOENT passthrough. (Failing at call 2 instead would have the
      // title-search phase's own catchAll re-throw the EACCES and abort
      // Effect.all before Phase 2 is ever entered — see the dedicated
      // "searchSessions title-search TOCTOU safety" block below, which
      // exercises exactly that call-2 case.)
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      let deniedCallCount = 0
      vi.mocked(fs.readdir).mockImplementation(((p: unknown, opts: unknown) => {
        if (typeof p === 'string' && p.endsWith(projDenied)) {
          deniedCallCount += 1
          if (deniedCallCount > 2) {
            const err = new Error(
              `EACCES: permission denied, scandir '${p}'`
            ) as NodeJS.ErrnoException
            err.code = 'EACCES'
            return Promise.reject(err)
          }
        }
        return (actual.readdir as typeof fs.readdir)(
          p as Parameters<typeof fs.readdir>[0],
          opts as Parameters<typeof fs.readdir>[1]
        )
      }) as typeof fs.readdir)

      await expect(
        Effect.runPromise(searchSessions('needle', { searchContent: true }))
      ).rejects.toThrow()
    })
  })

  // Phase 1 (title search) TOCTOU guard — a project's folder may vanish
  // between listProjects() returning it and listSessions()'s own readdir.
  // listSessions() intentionally throws on a missing project (see the guard's
  // comment at its Effect.catchAll call site in search.ts), so non-ENOENT
  // errors (EACCES, etc.) must still propagate here too, distinct from the
  // ENOENT/ENOTDIR skip case. This coverage was previously only accidental
  // (the searchProjectContent EACCES test above used to fail one readdir call
  // too early and exercise this path instead of its own) — now isolated into
  // its own test so it isn't lost if the call-count fix above ever changes.
  describe('searchSessions title-search TOCTOU safety', () => {
    it('propagates a non-ENOENT readdir error (EACCES) from the title-search phase', async () => {
      const projDenied = '-Users-test-search-title-eacces'
      await writeSessionFile(projDenied, 'sess-denied', 'plain title')

      // listProjects() readdirs each project folder once (for sessionCount);
      // let that succeed so projDenied reaches Phase 1, then fail with EACCES
      // specifically on listSessions' own readdir (call 2) — isolating this
      // test to the title-search guard, before Phase 2 (searchProjectContent)
      // is ever entered.
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      let deniedCallCount = 0
      vi.mocked(fs.readdir).mockImplementation(((p: unknown, opts: unknown) => {
        if (typeof p === 'string' && p.endsWith(projDenied)) {
          deniedCallCount += 1
          if (deniedCallCount > 1) {
            const err = new Error(
              `EACCES: permission denied, scandir '${p}'`
            ) as NodeJS.ErrnoException
            err.code = 'EACCES'
            return Promise.reject(err)
          }
        }
        return (actual.readdir as typeof fs.readdir)(
          p as Parameters<typeof fs.readdir>[0],
          opts as Parameters<typeof fs.readdir>[1]
        )
      }) as typeof fs.readdir)

      await expect(Effect.runPromise(searchSessions('needle'))).rejects.toThrow()
    })
  })
})
