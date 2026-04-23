import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'
import { sortSessions, buildProjectTreeResult } from '../session/tree.js'
import type { SessionTreeData, SessionSortOptions } from '../types.js'

// Mock the paths module to use temp directory
vi.mock('../paths.js', async () => {
  const actual = await vi.importActual('../paths.js')
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  }
})

import { getCachePath, loadProjectTreeData, loadSessionTreeData } from '../session.js'
import { getSessionsDir } from '../paths.js'

describe('loadProjectTreeData - cross-session leafUuid lookup', () => {
  let tempDir: string
  let projectDir: string

  beforeEach(async () => {
    // Create temp directory for test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-session-test-'))
    projectDir = path.join(tempDir, '-Users-david-works--vscode')
    await fs.mkdir(projectDir, { recursive: true })

    // Mock getSessionsDir to return temp directory
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    vi.clearAllMocks()
  })

  it('should display summary in the session containing the leafUuid message', async () => {
    // Test case from real data:
    // - Session 68a1f272-... has a summary with leafUuid "49d8f572-..."
    // - The message with uuid "49d8f572-..." is in a DIFFERENT session a566fb30-...
    // - The summary should be displayed in a566fb30-... (the target session), NOT in 68a1f272-...

    const summarySessionId = '68a1f272-d401-4458-a35d-dd4dd6429911'
    const targetSessionId = 'a566fb30-4254-4a32-bb0e-875febb504e0'
    const leafUuid = '49d8f572-8ffb-4675-a267-2c879e7453ca'
    const expectedTimestamp = '2025-12-19T04:15:46.643Z'

    // Session that CONTAINS the summary (NOT where it will be displayed)
    const summarySession = [
      {
        type: 'summary',
        summary: 'VSCode Extension Web Server Startup Timing Fix',
        leafUuid: leafUuid, // Points to target session's message
      },
      {
        type: 'user',
        uuid: 'first-user-msg',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Test message' }] },
      },
    ]

    // Target session: contains the message that summary's leafUuid points to
    // The summary will be DISPLAYED here
    const targetSession = [
      {
        type: 'user',
        uuid: 'some-other-uuid',
        timestamp: '2025-12-19T04:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Start' }] },
      },
      {
        type: 'user',
        uuid: leafUuid, // This is the uuid the summary's leafUuid points to
        timestamp: expectedTimestamp,
        message: { role: 'user', content: [{ type: 'text', text: 'Tool result' }] },
      },
    ]

    // Write session files
    await fs.writeFile(
      path.join(projectDir, `${summarySessionId}.jsonl`),
      summarySession.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )
    await fs.writeFile(
      path.join(projectDir, `${targetSessionId}.jsonl`),
      targetSession.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    // Load project tree data
    const result = await Effect.runPromise(loadProjectTreeData('-Users-david-works--vscode'))

    expect(result).not.toBeNull()
    expect(result!.sessions).toHaveLength(2)

    // The session containing the summary should NOT have the summary displayed
    const sessionWithSummaryFile = result!.sessions.find((s) => s.id === summarySessionId)
    expect(sessionWithSummaryFile).toBeDefined()
    expect(sessionWithSummaryFile!.summaries).toHaveLength(0) // No summaries displayed here!

    // The TARGET session (where leafUuid message is) SHOULD have the summary displayed
    const targetSessionWithSummary = result!.sessions.find((s) => s.id === targetSessionId)
    expect(targetSessionWithSummary).toBeDefined()
    expect(targetSessionWithSummary!.summaries).toHaveLength(1)

    const summary = targetSessionWithSummary!.summaries[0]
    expect(summary.summary).toBe('VSCode Extension Web Server Startup Timing Fix')
    expect(summary.leafUuid).toBe(leafUuid)
    expect(summary.timestamp).toBe(expectedTimestamp)
  })

  it('should handle summary with leafUuid in same session', async () => {
    const sessionId = 'same-session-test'
    const leafUuid = 'local-message-uuid'
    const expectedTimestamp = '2025-12-19T05:00:00.000Z'

    // Summary and referenced message in same session
    const session = [
      {
        type: 'summary',
        summary: 'Local summary test',
        leafUuid: leafUuid,
      },
      {
        type: 'user',
        uuid: leafUuid,
        timestamp: expectedTimestamp,
        message: { role: 'user', content: [{ type: 'text', text: 'Referenced message' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      session.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(loadProjectTreeData('-Users-david-works--vscode'))

    expect(result).not.toBeNull()
    const foundSession = result!.sessions.find((s) => s.id === sessionId)
    expect(foundSession).toBeDefined()
    expect(foundSession!.summaries[0].timestamp).toBe(expectedTimestamp)
  })

  it('should not display summary when leafUuid points to non-existent message', async () => {
    const sessionId = 'missing-leafuuid-test'

    // Summary points to non-existent uuid - should not be displayed anywhere
    const session = [
      {
        type: 'summary',
        summary: 'Missing leaf test',
        leafUuid: 'non-existent-uuid', // This uuid doesn't exist in any session
        timestamp: '2025-12-19T06:00:00.000Z',
      },
      {
        type: 'user',
        uuid: 'user-msg',
        timestamp: '2025-12-19T06:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Test' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      session.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(loadProjectTreeData('-Users-david-works--vscode'))

    expect(result).not.toBeNull()
    const foundSession = result!.sessions.find((s) => s.id === sessionId)
    expect(foundSession).toBeDefined()
    // Summary should NOT be displayed since leafUuid doesn't point to any existing message
    expect(foundSession!.summaries).toHaveLength(0)
  })

  it('should display summary in the target session (session containing the leafUuid message)', async () => {
    const sourceSessionId = 'source-session' // Session that contains the summary
    const targetSessionId = 'target-session' // Session that contains the message leafUuid points to
    const leafUuid = 'target-message-uuid'
    const expectedTimestamp = '2025-12-19T07:00:00.000Z'

    // Source session: contains the summary that points to target session
    const sourceSession = [
      {
        type: 'summary',
        summary: 'Summary about target session',
        leafUuid: leafUuid, // Points to target session's message
      },
      {
        type: 'user',
        uuid: 'source-msg',
        timestamp: '2025-12-19T06:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Source session' }] },
      },
    ]

    // Target session: contains the message that summary's leafUuid points to
    const targetSession = [
      {
        type: 'user',
        uuid: leafUuid, // This is what the summary points to
        timestamp: expectedTimestamp,
        message: { role: 'user', content: [{ type: 'text', text: 'Target message' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sourceSessionId}.jsonl`),
      sourceSession.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )
    await fs.writeFile(
      path.join(projectDir, `${targetSessionId}.jsonl`),
      targetSession.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(loadProjectTreeData('-Users-david-works--vscode'))

    expect(result).not.toBeNull()

    // Source session should NOT have the summary (it's displayed in target)
    const foundSourceSession = result!.sessions.find((s) => s.id === sourceSessionId)
    expect(foundSourceSession).toBeDefined()
    expect(foundSourceSession!.summaries).toHaveLength(0)

    // Target session SHOULD have the summary (because leafUuid points to its message)
    const foundTargetSession = result!.sessions.find((s) => s.id === targetSessionId)
    expect(foundTargetSession).toBeDefined()
    expect(foundTargetSession!.summaries).toHaveLength(1)
    expect(foundTargetSession!.summaries[0].summary).toBe('Summary about target session')
    expect(foundTargetSession!.summaries[0].timestamp).toBe(expectedTimestamp)
  })

  it('should handle multiple summaries with different leafUuid sources', async () => {
    const sessionId1 = 'session-1'
    const sessionId2 = 'session-2'
    const msgUuidInSession1 = 'msg-in-session-1'
    const msgUuidInSession2 = 'msg-in-session-2'
    const timestampInSession1 = '2025-12-19T08:00:00.000Z'
    const timestampInSession2 = '2025-12-19T09:00:00.000Z'

    // Session 1: has a message, and a summary pointing to session 2's message
    const session1 = [
      {
        type: 'summary',
        summary: 'Summary FROM session 1 pointing TO session 2',
        leafUuid: msgUuidInSession2, // Points to session 2's message
      },
      {
        type: 'user',
        uuid: msgUuidInSession1, // This message is in session 1
        timestamp: timestampInSession1,
        message: { role: 'user', content: [{ type: 'text', text: 'Session 1 user' }] },
      },
    ]

    // Session 2: has a message, and a summary pointing to session 1's message
    const session2 = [
      {
        type: 'summary',
        summary: 'Summary FROM session 2 pointing TO session 1',
        leafUuid: msgUuidInSession1, // Points to session 1's message
      },
      {
        type: 'user',
        uuid: msgUuidInSession2, // This message is in session 2
        timestamp: timestampInSession2,
        message: { role: 'user', content: [{ type: 'text', text: 'Session 2 user' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId1}.jsonl`),
      session1.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )
    await fs.writeFile(
      path.join(projectDir, `${sessionId2}.jsonl`),
      session2.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(loadProjectTreeData('-Users-david-works--vscode'))

    expect(result).not.toBeNull()

    const foundSession1 = result!.sessions.find((s) => s.id === sessionId1)
    const foundSession2 = result!.sessions.find((s) => s.id === sessionId2)

    // Session 1 receives summary FROM session 2 (because session 2's summary points to session 1's message)
    expect(foundSession1!.summaries).toHaveLength(1)
    expect(foundSession1!.summaries[0].summary).toBe('Summary FROM session 2 pointing TO session 1')
    expect(foundSession1!.summaries[0].timestamp).toBe(timestampInSession1)

    // Session 2 receives summary FROM session 1 (because session 1's summary points to session 2's message)
    expect(foundSession2!.summaries).toHaveLength(1)
    expect(foundSession2!.summaries[0].summary).toBe('Summary FROM session 1 pointing TO session 2')
    expect(foundSession2!.summaries[0].timestamp).toBe(timestampInSession2)
  })
})

describe('loadProjectTreeData - cache behavior', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-test-cache-project'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-cache-test-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    vi.clearAllMocks()
  })

  const writeSession = async (id: string, messages: object[]) => {
    await fs.writeFile(
      path.join(projectDir, `${id}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )
  }

  const cachePath = () => getCachePath(projectName)

  const cacheExists = async () => {
    try {
      await fs.access(cachePath())
      return true
    } catch {
      return false
    }
  }

  const readCacheFile = async () => {
    const raw = await fs.readFile(cachePath(), 'utf-8')
    return JSON.parse(raw)
  }

  /** Poll until cache file appears (max 2s) */
  const waitForCache = async (timeoutMs = 2000) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (await cacheExists()) return
      await new Promise((r) => setTimeout(r, 20))
    }
    throw new Error(`Cache file did not appear within ${timeoutMs}ms`)
  }

  it('should write cache file after first load', async () => {
    await writeSession('session-a', [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T00:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
    ])

    expect(await cacheExists()).toBe(false)

    await Effect.runPromise(loadProjectTreeData(projectName))

    // Cache write is async (fire-and-forget), poll until file appears
    await waitForCache()

    expect(await cacheExists()).toBe(true)
    const cache = await readCacheFile()
    expect(cache.version).toBe(1)
    expect(cache.sessions['session-a']).toBeDefined()
  })

  it('should return cached data on second call with unchanged files', async () => {
    await writeSession('session-b', [
      {
        type: 'user',
        uuid: 'msg-2',
        timestamp: '2025-01-02T00:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Cached test' }] },
      },
    ])

    // First call: full load + cache write
    const result1 = await Effect.runPromise(loadProjectTreeData(projectName))
    await waitForCache()

    // Record cache file mtime before second call
    const cacheMtimeBefore = (await fs.stat(cachePath())).mtimeMs

    // Second call: should use cache (no file changes)
    const result2 = await Effect.runPromise(loadProjectTreeData(projectName))

    // Prove cache hit: cache file was NOT rewritten (mtime unchanged)
    const cacheMtimeAfter = (await fs.stat(cachePath())).mtimeMs
    expect(cacheMtimeAfter).toBe(cacheMtimeBefore)

    expect(result1!.sessions).toHaveLength(1)
    expect(result2!.sessions).toHaveLength(1)
    expect(result2!.sessions[0].title).toBe(result1!.sessions[0].title)
  })

  it('should incrementally rebuild when a subset of sessions change', async () => {
    // Create 3 sessions
    for (const id of ['s1', 's2', 's3']) {
      await writeSession(id, [
        {
          type: 'user',
          uuid: `${id}-msg`,
          timestamp: '2025-01-01T00:00:00.000Z',
          message: { role: 'user', content: [{ type: 'text', text: `Session ${id}` }] },
        },
      ])
    }

    // First call: full load
    await Effect.runPromise(loadProjectTreeData(projectName))
    await waitForCache()

    const cacheBeforeUpdate = await readCacheFile()
    const s2MtimeBefore = cacheBeforeUpdate.sessions['s2']?.mtimeMs

    // Modify only s1 (touch to update mtime)
    await writeSession('s1', [
      {
        type: 'user',
        uuid: 's1-msg',
        timestamp: '2025-01-01T00:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Session s1 updated' }] },
      },
    ])

    // Second call: should take incremental path (1 changed < 3/2)
    const result = await Effect.runPromise(loadProjectTreeData(projectName))
    await waitForCache()

    // Verify incremental: unchanged session s2 keeps same mtime in cache
    const cacheAfterUpdate = await readCacheFile()
    expect(cacheAfterUpdate.sessions['s2']?.mtimeMs).toBe(s2MtimeBefore)

    expect(result!.sessions).toHaveLength(3)
    const s1 = result!.sessions.find((s) => s.id === 's1')
    expect(s1!.title).toBe('Session s1 updated')
  })

  it('should handle new session added after cache was written', async () => {
    await writeSession('existing', [
      {
        type: 'user',
        uuid: 'e-msg',
        timestamp: '2025-01-01T00:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Existing session' }] },
      },
    ])

    await Effect.runPromise(loadProjectTreeData(projectName))
    await waitForCache()

    // Add new session
    await writeSession('brand-new', [
      {
        type: 'user',
        uuid: 'n-msg',
        timestamp: '2025-01-02T00:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'New session' }] },
      },
    ])

    const result = await Effect.runPromise(loadProjectTreeData(projectName))
    expect(result!.sessions).toHaveLength(2)
    expect(result!.sessions.find((s) => s.id === 'brand-new')).toBeDefined()
  })
})

describe('loadSessionTreeData - single session (no global map)', () => {
  let tempDir: string
  let projectDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-session-test-'))
    projectDir = path.join(tempDir, '-Users-test-project')
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    vi.clearAllMocks()
  })

  it('should load single session with summary from another session targeting it', async () => {
    const targetSessionId = 'target-session'
    const summarySessionId = 'summary-session'

    // Target session: has the message that summary's leafUuid points to
    const targetSession = [
      {
        type: 'user',
        uuid: 'target-uuid',
        timestamp: '2025-12-19T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Target message' }] },
      },
    ]

    // Summary session: has the summary with leafUuid pointing to target session
    const summarySession = [
      {
        type: 'summary',
        summary: 'Summary pointing to target',
        leafUuid: 'target-uuid', // Points to target session's message
        timestamp: '2025-12-19T11:00:00.000Z',
      },
      {
        type: 'user',
        uuid: 'summary-uuid',
        timestamp: '2025-12-19T11:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Summary session message' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${targetSessionId}.jsonl`),
      targetSession.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )
    await fs.writeFile(
      path.join(projectDir, `${summarySessionId}.jsonl`),
      summarySession.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    // loadSessionTreeData should find summary from other session targeting this session
    const result = await Effect.runPromise(
      loadSessionTreeData('-Users-test-project', targetSessionId)
    )

    expect(result).toBeDefined()
    expect(result.id).toBe(targetSessionId)
    expect(result.summaries).toHaveLength(1)
    expect(result.summaries[0].summary).toBe('Summary pointing to target')
    // Timestamp should be from the target message
    expect(result.summaries[0].timestamp).toBe('2025-12-19T10:00:00.000Z')
  })

  it('should have no summaries when no summary targets this session', async () => {
    const sessionId = 'session-without-summary'

    // This session has no summaries targeting it
    const session = [
      {
        type: 'user',
        uuid: 'local-uuid',
        timestamp: '2025-12-19T11:30:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Test' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      session.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(loadSessionTreeData('-Users-test-project', sessionId))

    // No summaries should be found since no summary's leafUuid points to this session
    expect(result.summaries).toHaveLength(0)
  })
})

// ============================================================================
// Pure function tests (no I/O, no mocking required)
// ============================================================================

const makeSession = (overrides: Partial<SessionTreeData> & { id: string }): SessionTreeData => ({
  projectName: 'test-project',
  title: `Session ${overrides.id}`,
  messageCount: 10,
  sortTimestamp: Date.now(),
  summaries: [],
  agents: [],
  todos: { sessionId: overrides.id, sessionTodos: [], agentTodos: [], hasTodos: false },
  ...overrides,
})

describe('sortSessions', () => {
  const sessionA = makeSession({
    id: 'a',
    title: 'Alpha',
    sortTimestamp: 1000,
    fileMtime: 5000,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-03T00:00:00.000Z',
    messageCount: 5,
  })
  const sessionB = makeSession({
    id: 'b',
    title: 'Beta',
    sortTimestamp: 2000,
    fileMtime: 3000,
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    messageCount: 15,
  })
  const sessionC = makeSession({
    id: 'c',
    title: 'Charlie',
    sortTimestamp: 3000,
    fileMtime: 1000,
    createdAt: '2025-01-03T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    messageCount: 10,
  })

  it('should return empty array for empty input', () => {
    expect(sortSessions([], { field: 'summary', order: 'asc' })).toEqual([])
  })

  it('should return single element unchanged', () => {
    const result = sortSessions([sessionA], { field: 'summary', order: 'asc' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })

  it('should sort by summary (sortTimestamp) ascending', () => {
    const result = sortSessions([sessionC, sessionA, sessionB], { field: 'summary', order: 'asc' })
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('should sort by summary (sortTimestamp) descending', () => {
    const result = sortSessions([sessionA, sessionB, sessionC], {
      field: 'summary',
      order: 'desc',
    })
    expect(result.map((s) => s.id)).toEqual(['c', 'b', 'a'])
  })

  it('should sort by modified (fileMtime) ascending', () => {
    const result = sortSessions([sessionA, sessionB, sessionC], {
      field: 'modified',
      order: 'asc',
    })
    expect(result.map((s) => s.id)).toEqual(['c', 'b', 'a'])
  })

  it('should sort by modified (fileMtime) descending', () => {
    const result = sortSessions([sessionA, sessionB, sessionC], {
      field: 'modified',
      order: 'desc',
    })
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('should sort by created ascending', () => {
    const result = sortSessions([sessionC, sessionA, sessionB], {
      field: 'created',
      order: 'asc',
    })
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('should sort by created descending', () => {
    const result = sortSessions([sessionA, sessionB, sessionC], {
      field: 'created',
      order: 'desc',
    })
    expect(result.map((s) => s.id)).toEqual(['c', 'b', 'a'])
  })

  it('should sort by updated ascending', () => {
    const result = sortSessions([sessionA, sessionB, sessionC], {
      field: 'updated',
      order: 'asc',
    })
    expect(result.map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('should sort by updated descending', () => {
    const result = sortSessions([sessionA, sessionB, sessionC], {
      field: 'updated',
      order: 'desc',
    })
    expect(result.map((s) => s.id)).toEqual(['a', 'c', 'b'])
  })

  it('should sort by messageCount ascending', () => {
    const result = sortSessions([sessionB, sessionA, sessionC], {
      field: 'messageCount',
      order: 'asc',
    })
    expect(result.map((s) => s.id)).toEqual(['a', 'c', 'b'])
  })

  it('should sort by messageCount descending', () => {
    const result = sortSessions([sessionA, sessionB, sessionC], {
      field: 'messageCount',
      order: 'desc',
    })
    expect(result.map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('should sort by title alphabetically ascending', () => {
    const result = sortSessions([sessionC, sessionA, sessionB], {
      field: 'title',
      order: 'asc',
    })
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('should sort by title alphabetically descending', () => {
    const result = sortSessions([sessionA, sessionB, sessionC], {
      field: 'title',
      order: 'desc',
    })
    expect(result.map((s) => s.id)).toEqual(['c', 'b', 'a'])
  })

  it('should use customTitle over currentSummary and title for title sort', () => {
    const s1 = makeSession({ id: 's1', title: 'Zebra', customTitle: 'Aardvark' })
    const s2 = makeSession({ id: 's2', title: 'Apple', currentSummary: 'Mango' })
    const s3 = makeSession({ id: 's3', title: 'Banana' })

    const result = sortSessions([s1, s2, s3], { field: 'title', order: 'asc' })
    // Aardvark (customTitle) < Banana (title) < Mango (currentSummary)
    expect(result.map((s) => s.id)).toEqual(['s1', 's3', 's2'])
  })

  it('should handle null/undefined timestamps without crashing', () => {
    const s1 = makeSession({ id: 's1', fileMtime: undefined, createdAt: undefined })
    const s2 = makeSession({ id: 's2', fileMtime: 1000, createdAt: '2025-01-01T00:00:00.000Z' })

    expect(() => sortSessions([s1, s2], { field: 'modified', order: 'asc' })).not.toThrow()
    expect(() => sortSessions([s1, s2], { field: 'created', order: 'asc' })).not.toThrow()
    expect(() => sortSessions([s1, s2], { field: 'updated', order: 'asc' })).not.toThrow()
  })
})

describe('buildProjectTreeResult', () => {
  const project = {
    name: 'test-proj',
    displayName: '/home/user/projects/test',
    path: '/home/user/projects/test',
  }
  const sort: SessionSortOptions = { field: 'summary', order: 'desc' }

  it('should wrap sessions into ProjectTreeData with correct shape', () => {
    const sessions = [
      makeSession({ id: 's1', sortTimestamp: 1000 }),
      makeSession({ id: 's2', sortTimestamp: 2000 }),
    ]

    const result = buildProjectTreeResult(project, sessions, sort)

    expect(result.name).toBe('test-proj')
    expect(result.displayName).toBe('/home/user/projects/test')
    expect(result.path).toBe('/home/user/projects/test')
    expect(result.sessionCount).toBe(2)
    expect(result.sessions).toHaveLength(2)
  })

  it('should filter sessions with error title', () => {
    const sessions = [
      makeSession({ id: 'good', title: 'Valid session' }),
      makeSession({ id: 'bad-title', title: 'API Error: unauthorized' }),
    ]

    const result = buildProjectTreeResult(project, sessions, sort)
    expect(result.sessionCount).toBe(1)
    expect(result.sessions[0].id).toBe('good')
  })

  it('should filter sessions with error in customTitle', () => {
    const sessions = [
      makeSession({ id: 'good', title: 'Valid' }),
      makeSession({ id: 'bad-custom', title: 'Valid', customTitle: 'API Error: invalid request' }),
    ]

    const result = buildProjectTreeResult(project, sessions, sort)
    expect(result.sessionCount).toBe(1)
    expect(result.sessions[0].id).toBe('good')
  })

  it('should filter sessions with error in currentSummary', () => {
    const sessions = [
      makeSession({ id: 'good', title: 'Valid' }),
      makeSession({
        id: 'bad-summary',
        title: 'Valid',
        currentSummary: 'API Error: timeout',
      }),
    ]

    const result = buildProjectTreeResult(project, sessions, sort)
    expect(result.sessionCount).toBe(1)
    expect(result.sessions[0].id).toBe('good')
  })

  it('should sort sessions according to sort options', () => {
    const sessions = [
      makeSession({ id: 'old', sortTimestamp: 1000 }),
      makeSession({ id: 'new', sortTimestamp: 3000 }),
      makeSession({ id: 'mid', sortTimestamp: 2000 }),
    ]

    const result = buildProjectTreeResult(project, sessions, { field: 'summary', order: 'desc' })
    expect(result.sessions.map((s) => s.id)).toEqual(['new', 'mid', 'old'])
  })

  it('should return empty sessions list when all are filtered', () => {
    const sessions = [
      makeSession({ id: 'err1', title: 'API Error: config failed' }),
      makeSession({ id: 'err2', title: 'authentication_error: invalid credentials' }),
    ]

    const result = buildProjectTreeResult(project, sessions, sort)
    expect(result.sessionCount).toBe(0)
    expect(result.sessions).toEqual([])
  })

  it('should handle empty input', () => {
    const result = buildProjectTreeResult(project, [], sort)
    expect(result.sessionCount).toBe(0)
    expect(result.sessions).toEqual([])
  })
})
