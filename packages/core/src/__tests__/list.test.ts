import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'

// Mock the paths module to use temp directory
vi.mock('../paths.js', async () => {
  const actual = await vi.importActual('../paths.js')
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  }
})

import { listSessions } from '../session.js'
import { getSessionsDir } from '../paths.js'

describe('listSessions - should include currentSummary and customTitle', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-test-listsessions'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-session-list-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should return currentSummary from the first summary message', async () => {
    const sessionId = 'session-with-summary'

    const messages = [
      {
        type: 'summary',
        summary: 'This is the current summary text',
        leafUuid: 'msg-1',
        timestamp: '2025-12-20T01:00:00.000Z',
      },
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-12-20T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello world' }] },
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2025-12-20T01:01:00.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const sessions = await Effect.runPromise(listSessions(projectName))

    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(sessionId)
    expect(sessions[0].currentSummary).toBe('This is the current summary text')
    expect(sessions[0].title).toBe('Hello world')
  })

  it('should return customTitle when set via custom-title message', async () => {
    const sessionId = 'session-with-custom-title'

    const messages = [
      {
        type: 'custom-title',
        customTitle: 'My Custom Session Title',
      },
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-12-20T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Original first message' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const sessions = await Effect.runPromise(listSessions(projectName))

    expect(sessions).toHaveLength(1)
    expect(sessions[0].customTitle).toBe('My Custom Session Title')
    expect(sessions[0].title).toBe('Original first message')
  })

  it('should return both currentSummary and customTitle when both exist', async () => {
    const sessionId = 'session-with-both'

    const messages = [
      {
        type: 'custom-title',
        customTitle: 'Custom Title Here',
      },
      {
        type: 'summary',
        summary: 'Summary text here',
        leafUuid: 'msg-1',
        timestamp: '2025-12-20T01:00:00.000Z',
      },
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-12-20T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'First user message' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const sessions = await Effect.runPromise(listSessions(projectName))

    expect(sessions).toHaveLength(1)
    expect(sessions[0].customTitle).toBe('Custom Title Here')
    expect(sessions[0].currentSummary).toBe('Summary text here')
    expect(sessions[0].title).toBe('First user message')
  })

  it('should sort sessions by updatedAt descending (newest first)', async () => {
    // Create 3 sessions with different timestamps
    const sessions = [
      {
        id: 'oldest-session',
        updatedAt: '2025-12-18T01:00:00.000Z',
      },
      {
        id: 'newest-session',
        updatedAt: '2025-12-20T01:00:00.000Z',
      },
      {
        id: 'middle-session',
        updatedAt: '2025-12-19T01:00:00.000Z',
      },
    ]

    for (const s of sessions) {
      const messages = [
        {
          type: 'user',
          uuid: 'msg-1',
          timestamp: s.updatedAt,
          message: { role: 'user', content: [{ type: 'text', text: `Session ${s.id}` }] },
        },
      ]
      await fs.writeFile(
        path.join(projectDir, `${s.id}.jsonl`),
        messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
      )
    }

    const result = await Effect.runPromise(listSessions(projectName))

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('newest-session')
    expect(result[1].id).toBe('middle-session')
    expect(result[2].id).toBe('oldest-session')
  })

  it('should return undefined for currentSummary and customTitle when not present', async () => {
    const sessionId = 'session-without-extras'

    const messages = [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-12-20T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Just a plain session' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const sessions = await Effect.runPromise(listSessions(projectName))

    expect(sessions).toHaveLength(1)
    expect(sessions[0].currentSummary).toBeUndefined()
    expect(sessions[0].customTitle).toBeUndefined()
    expect(sessions[0].title).toBe('Just a plain session')
  })
})
