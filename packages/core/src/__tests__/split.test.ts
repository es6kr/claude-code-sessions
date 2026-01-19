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

import { splitSession, readSession } from '../session.js'
import { getSessionsDir } from '../paths.js'

describe('splitSession - ID assignment', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-test-split'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-session-split-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should keep original session ID for NEWER messages (from split point onwards)', async () => {
    const originalSessionId = 'original-session-id'
    const splitAtUuid = 'msg-3-uuid'

    // Create session with 5 messages
    const messages = [
      {
        type: 'user',
        uuid: 'msg-1-uuid',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Message 1 - OLD' }] },
      },
      {
        type: 'assistant',
        uuid: 'msg-2-uuid',
        parentUuid: 'msg-1-uuid',
        timestamp: '2025-12-19T02:00:00.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Response 1' }] },
      },
      {
        type: 'user',
        uuid: 'msg-3-uuid', // SPLIT POINT - this message stays in original session
        parentUuid: 'msg-2-uuid',
        timestamp: '2025-12-19T03:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Message 2 - NEW' }] },
      },
      {
        type: 'assistant',
        uuid: 'msg-4-uuid',
        parentUuid: 'msg-3-uuid',
        timestamp: '2025-12-19T04:00:00.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Response 2' }] },
      },
      {
        type: 'user',
        uuid: 'msg-5-uuid',
        parentUuid: 'msg-4-uuid',
        timestamp: '2025-12-19T05:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Message 3 - NEW' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${originalSessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    // Split at msg-3-uuid
    const result = await Effect.runPromise(
      splitSession(projectName, originalSessionId, splitAtUuid)
    )

    expect(result.success).toBe(true)
    expect(result.newSessionId).toBeDefined()

    // Read original session - should contain NEWER messages (from split point onwards)
    const originalMessages = await Effect.runPromise(readSession(projectName, originalSessionId))
    expect(originalMessages).toHaveLength(3) // msg-3, msg-4, msg-5
    expect(originalMessages[0].uuid).toBe('msg-3-uuid')
    expect(originalMessages[1].uuid).toBe('msg-4-uuid')
    expect(originalMessages[2].uuid).toBe('msg-5-uuid')

    // First message of original session should have no parent after split
    expect(originalMessages[0].parentUuid).toBeNull()

    // Read new session - should contain OLDER messages (before split point)
    const newMessages = await Effect.runPromise(readSession(projectName, result.newSessionId!))

    // Find non-summary messages
    const newUserAssistantMsgs = newMessages.filter(
      (m) => m.type === 'user' || m.type === 'assistant'
    )
    expect(newUserAssistantMsgs).toHaveLength(2) // msg-1, msg-2
    expect(newUserAssistantMsgs[0].uuid).toBe('msg-1-uuid')
    expect(newUserAssistantMsgs[1].uuid).toBe('msg-2-uuid')

    // Old messages should have new sessionId
    expect(newUserAssistantMsgs[0].sessionId).toBe(result.newSessionId)
  })

  it('should assign new session ID to OLDER messages (before split point)', async () => {
    const originalSessionId = 'test-session-2'
    const splitAtUuid = 'second-msg'

    const messages = [
      {
        type: 'user',
        uuid: 'first-msg',
        timestamp: '2025-12-20T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'First' }] },
      },
      {
        type: 'user',
        uuid: 'second-msg', // SPLIT POINT
        parentUuid: 'first-msg',
        timestamp: '2025-12-20T02:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Second' }] },
      },
      {
        type: 'user',
        uuid: 'third-msg',
        parentUuid: 'second-msg',
        timestamp: '2025-12-20T03:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Third' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${originalSessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(
      splitSession(projectName, originalSessionId, splitAtUuid)
    )

    expect(result.success).toBe(true)

    // Original session keeps new messages (2 messages from split point)
    const originalMessages = await Effect.runPromise(readSession(projectName, originalSessionId))
    expect(originalMessages).toHaveLength(2)
    expect(originalMessages[0].uuid).toBe('second-msg')
    expect(originalMessages[1].uuid).toBe('third-msg')

    // New session gets old messages (1 message before split)
    const newMessages = await Effect.runPromise(readSession(projectName, result.newSessionId!))
    const newUserMsgs = newMessages.filter((m) => m.type === 'user')
    expect(newUserMsgs).toHaveLength(1)
    expect(newUserMsgs[0].uuid).toBe('first-msg')

    // Old messages should have the new sessionId
    expect(newUserMsgs[0].sessionId).toBe(result.newSessionId)
  })

  it('should fail when trying to split at first message', async () => {
    const sessionId = 'cannot-split-first'

    const messages = [
      {
        type: 'user',
        uuid: 'only-msg',
        timestamp: '2025-12-20T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Only message' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(splitSession(projectName, sessionId, 'only-msg'))

    expect(result.success).toBe(false)
    expect(result.error).toBe('Cannot split at first message')
  })

  it('should fail when message uuid not found', async () => {
    const sessionId = 'msg-not-found'

    const messages = [
      {
        type: 'user',
        uuid: 'existing-msg',
        timestamp: '2025-12-20T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Existing' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(
      splitSession(projectName, sessionId, 'non-existent-uuid')
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Message not found')
  })

  it('should clone summary to new session', async () => {
    const sessionId = 'with-summary'
    const splitAtUuid = 'msg-2'

    const messages = [
      {
        type: 'summary',
        summary: 'Test summary',
        leafUuid: 'msg-1',
      },
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-12-20T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'First' }] },
      },
      {
        type: 'user',
        uuid: 'msg-2', // SPLIT POINT
        parentUuid: 'msg-1',
        timestamp: '2025-12-20T02:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Second' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(splitSession(projectName, sessionId, splitAtUuid))

    expect(result.success).toBe(true)

    // New session should have cloned summary
    const newMessages = await Effect.runPromise(readSession(projectName, result.newSessionId!))
    const summaryMsg = newMessages.find((m) => m.type === 'summary')
    expect(summaryMsg).toBeDefined()
    expect(summaryMsg!.summary).toBe('Test summary')
    expect(summaryMsg!.sessionId).toBe(result.newSessionId)
  })
})
