import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'

// Mock the paths module to use temp directory
vi.mock('./paths.js', async () => {
  const actual = await vi.importActual('./paths.js')
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  }
})

import { loadProjectTreeData, loadSessionTreeData } from './session.js'
import { getSessionsDir } from './paths.js'

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
    await fs.rm(tempDir, { recursive: true, force: true })
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
    await fs.rm(tempDir, { recursive: true, force: true })
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
