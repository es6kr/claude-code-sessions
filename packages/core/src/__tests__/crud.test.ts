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

import { deleteMessage, readSession } from '../session.js'
import { getSessionsDir } from '../paths.js'

describe('deleteMessage', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-test-crud'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-session-crud-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should delete file-history-snapshot by messageId with targetType parameter', async () => {
    const sessionId = 'test-session'
    const sharedId = 'shared-uuid-123'

    // Create session with:
    // 1. user message with uuid = sharedId
    // 2. file-history-snapshot with messageId = sharedId (references the user message)
    const messages = [
      {
        type: 'user',
        uuid: sharedId,
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'User message' }] },
      },
      {
        type: 'file-history-snapshot',
        messageId: sharedId,
        timestamp: '2025-12-19T01:00:01.000Z',
        snapshot: { trackedFileBackups: {} },
      },
    ]

    const sessionFile = path.join(projectDir, `${sessionId}.jsonl`)
    await fs.writeFile(sessionFile, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

    // Delete the file-history-snapshot by specifying targetType
    const result = await Effect.runPromise(
      deleteMessage(projectName, sessionId, sharedId, 'file-history-snapshot')
    )

    expect(result.success).toBe(true)
    expect(result.deletedMessage?.type).toBe('file-history-snapshot')

    // Verify user message still exists
    const remainingMessages = await Effect.runPromise(readSession(projectName, sessionId))
    expect(remainingMessages).toHaveLength(1)
    expect(remainingMessages[0].type).toBe('user')
    expect(remainingMessages[0].uuid).toBe(sharedId)
  })

  it('should delete user message by uuid', async () => {
    const sessionId = 'test-session'
    const userUuid = 'user-uuid-456'

    const messages = [
      {
        type: 'user',
        uuid: userUuid,
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'User message' }] },
      },
      {
        type: 'assistant',
        uuid: 'assistant-uuid',
        parentUuid: userUuid,
        timestamp: '2025-12-19T01:00:01.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Response' }] },
      },
    ]

    const sessionFile = path.join(projectDir, `${sessionId}.jsonl`)
    await fs.writeFile(sessionFile, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

    const result = await Effect.runPromise(deleteMessage(projectName, sessionId, userUuid))

    expect(result.success).toBe(true)
    expect(result.deletedMessage?.type).toBe('user')

    // Verify assistant message's parentUuid is updated
    const remainingMessages = await Effect.runPromise(readSession(projectName, sessionId))
    expect(remainingMessages).toHaveLength(1)
    expect(remainingMessages[0].type).toBe('assistant')
    expect(remainingMessages[0].parentUuid).toBeUndefined()
  })

  it('should delete summary by leafUuid', async () => {
    const sessionId = 'test-session'
    const leafUuid = 'leaf-uuid-789'

    const messages = [
      {
        type: 'user',
        uuid: 'user-uuid',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'User message' }] },
      },
      {
        type: 'summary',
        uuid: 'summary-uuid',
        leafUuid: leafUuid,
        summary: 'This is a summary',
      },
    ]

    const sessionFile = path.join(projectDir, `${sessionId}.jsonl`)
    await fs.writeFile(sessionFile, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

    const result = await Effect.runPromise(deleteMessage(projectName, sessionId, leafUuid))

    expect(result.success).toBe(true)
    expect(result.deletedMessage?.type).toBe('summary')

    const remainingMessages = await Effect.runPromise(readSession(projectName, sessionId))
    expect(remainingMessages).toHaveLength(1)
    expect(remainingMessages[0].type).toBe('user')
  })

  it('should delete user message by uuid without affecting file-history-snapshot with matching messageId', async () => {
    const sessionId = 'test-session'
    const sharedId = 'shared-uuid-456'

    // Create session with:
    // 1. user message with uuid = sharedId
    // 2. file-history-snapshot with messageId = sharedId (references the user message)
    // When user wants to delete the USER message, it should NOT delete the snapshot instead
    const messages = [
      {
        type: 'user',
        uuid: sharedId,
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'User message to delete' }] },
      },
      {
        type: 'file-history-snapshot',
        messageId: sharedId,
        timestamp: '2025-12-19T01:00:01.000Z',
        snapshot: { trackedFileBackups: {} },
      },
      {
        type: 'assistant',
        uuid: 'assistant-uuid',
        parentUuid: sharedId,
        timestamp: '2025-12-19T01:00:02.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Response' }] },
      },
    ]

    const sessionFile = path.join(projectDir, `${sessionId}.jsonl`)
    await fs.writeFile(sessionFile, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

    // The deleteMessage function should be smart enough to delete USER message, not the snapshot
    // This requires the caller to specify they want to delete the message with uuid (not messageId)
    const result = await Effect.runPromise(deleteMessage(projectName, sessionId, sharedId))

    expect(result.success).toBe(true)
    // Should delete user message, not snapshot
    expect(result.deletedMessage?.type).toBe('user')

    // Verify file-history-snapshot still exists
    const remainingMessages = await Effect.runPromise(readSession(projectName, sessionId))
    expect(remainingMessages).toHaveLength(2)
    expect(remainingMessages.find((m) => m.type === 'file-history-snapshot')).toBeDefined()
    expect(remainingMessages.find((m) => m.type === 'assistant')).toBeDefined()
    // User message should be gone
    expect(remainingMessages.find((m) => m.type === 'user')).toBeUndefined()
  })

  it('should maintain parentUuid chain when deleting file-history-snapshot and progress messages', async () => {
    const sessionId = 'test-session'

    // Real-world scenario: assistant -> file-history-snapshot -> user(tool_result) -> progress -> assistant
    // When deleting snapshot and progress, the chain should remain intact
    const messages = [
      {
        type: 'assistant',
        uuid: '42a525c3-9656-4619-b0f7-f3099a3082ec',
        parentUuid: '65c60b85-1a61-4c9b-bd55-0ec5dc218a37',
        timestamp: '2026-01-20T04:35:23.280Z',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_01L9za', name: 'Write' }],
        },
      },
      {
        type: 'file-history-snapshot',
        messageId: '42a525c3-9656-4619-b0f7-f3099a3082ec',
        timestamp: '2026-01-20T04:35:23.300Z',
        snapshot: { trackedFileBackups: {} },
      },
      {
        type: 'user',
        uuid: 'da7e4183-fedd-4075-81ca-7ba40aa162e8',
        parentUuid: '42a525c3-9656-4619-b0f7-f3099a3082ec',
        timestamp: '2026-01-20T04:35:23.332Z',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01L9za' }] },
      },
      {
        type: 'progress',
        uuid: '30e9bb84-a7b8-4e56-9f0b-01b00541b3e9',
        parentUuid: 'da7e4183-fedd-4075-81ca-7ba40aa162e8',
        timestamp: '2026-01-20T04:35:23.354Z',
        data: { type: 'hook_progress', hookEvent: 'PostToolUse' },
      },
      {
        type: 'assistant',
        uuid: '05aa9fcd-674e-4945-80db-e8e1c5eeea44',
        parentUuid: '30e9bb84-a7b8-4e56-9f0b-01b00541b3e9',
        timestamp: '2026-01-20T04:35:27.376Z',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: '...' }] },
      },
    ]

    const sessionFile = path.join(projectDir, `${sessionId}.jsonl`)
    await fs.writeFile(sessionFile, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

    // Delete file-history-snapshot first
    const result1 = await Effect.runPromise(
      deleteMessage(
        projectName,
        sessionId,
        '42a525c3-9656-4619-b0f7-f3099a3082ec',
        'file-history-snapshot'
      )
    )
    expect(result1.success).toBe(true)
    expect(result1.deletedMessage?.type).toBe('file-history-snapshot')

    // Delete progress message
    const result2 = await Effect.runPromise(
      deleteMessage(projectName, sessionId, '30e9bb84-a7b8-4e56-9f0b-01b00541b3e9')
    )
    expect(result2.success).toBe(true)
    expect(result2.deletedMessage?.type).toBe('progress')

    // Verify chain is intact
    const remainingMessages = await Effect.runPromise(readSession(projectName, sessionId))
    expect(remainingMessages).toHaveLength(3)

    // Chain should be: assistant(42a5) -> user(da7e) -> assistant(05aa)
    const firstAssistant = remainingMessages.find(
      (m) => m.uuid === '42a525c3-9656-4619-b0f7-f3099a3082ec'
    )
    const user = remainingMessages.find((m) => m.uuid === 'da7e4183-fedd-4075-81ca-7ba40aa162e8')
    const lastAssistant = remainingMessages.find(
      (m) => m.uuid === '05aa9fcd-674e-4945-80db-e8e1c5eeea44'
    )

    expect(firstAssistant).toBeDefined()
    expect(user).toBeDefined()
    expect(lastAssistant).toBeDefined()

    // user's parent should still be first assistant
    expect(user?.parentUuid).toBe('42a525c3-9656-4619-b0f7-f3099a3082ec')
    // last assistant's parent should now be user (was progress, but progress deleted)
    expect(lastAssistant?.parentUuid).toBe('da7e4183-fedd-4075-81ca-7ba40aa162e8')
  })

  it('should delete tool_result message when corresponding tool_use message is deleted', async () => {
    const sessionId = 'test-session'
    const toolUseId = 'toolu_01HEmsbRyLP8bTyZPHq5uLHT'

    // assistant with tool_use -> user with tool_result -> assistant response
    const messages = [
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2026-01-20T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Do something' }] },
      },
      {
        type: 'assistant',
        uuid: 'assistant-tool-use',
        parentUuid: 'user-1',
        timestamp: '2026-01-20T01:00:01.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: toolUseId, name: 'Read', input: {} }],
        },
      },
      {
        type: 'user',
        uuid: 'user-tool-result',
        parentUuid: 'assistant-tool-use',
        timestamp: '2026-01-20T01:00:02.000Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'File contents' }],
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-final',
        parentUuid: 'user-tool-result',
        timestamp: '2026-01-20T01:00:03.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
      },
    ]

    const sessionFile = path.join(projectDir, `${sessionId}.jsonl`)
    await fs.writeFile(sessionFile, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

    // Delete the assistant message with tool_use
    const result = await Effect.runPromise(
      deleteMessage(projectName, sessionId, 'assistant-tool-use')
    )

    expect(result.success).toBe(true)
    expect(result.deletedMessage?.uuid).toBe('assistant-tool-use')

    // Verify tool_result message is also deleted
    const remainingMessages = await Effect.runPromise(readSession(projectName, sessionId))
    expect(remainingMessages).toHaveLength(2)

    // Should only have user-1 and assistant-final
    expect(remainingMessages.find((m) => m.uuid === 'user-1')).toBeDefined()
    expect(remainingMessages.find((m) => m.uuid === 'assistant-final')).toBeDefined()
    // tool_use and tool_result should be gone
    expect(remainingMessages.find((m) => m.uuid === 'assistant-tool-use')).toBeUndefined()
    expect(remainingMessages.find((m) => m.uuid === 'user-tool-result')).toBeUndefined()

    // parentUuid chain should be repaired: assistant-final -> user-1
    const finalAssistant = remainingMessages.find((m) => m.uuid === 'assistant-final')
    expect(finalAssistant?.parentUuid).toBe('user-1')
  })
})
