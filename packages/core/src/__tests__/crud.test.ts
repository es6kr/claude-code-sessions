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

import { deleteMessage, readSession, updateMessageContent, validateChain } from '../session.js'
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
        parentUuid: null,
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

    // Validate chain integrity using validateChain
    const chainResult = validateChain(remainingMessages)
    expect(chainResult.valid).toBe(true)
    expect(chainResult.errors).toHaveLength(0)
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

describe('updateMessageContent', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-test-update-content'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-session-update-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  const writeMessages = async (sessionId: string, messages: unknown[]) => {
    const filePath = path.join(projectDir, `${sessionId}.jsonl`)
    await fs.writeFile(filePath, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')
  }

  it('should replace text in user message with single text content', async () => {
    const sessionId = 'test-session'
    await writeMessages(sessionId, [
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Original' }] },
      },
    ])

    const result = await Effect.runPromise(
      updateMessageContent(projectName, sessionId, 'user-1', 'Updated text')
    )

    expect(result.success).toBe(true)
    const updated = await Effect.runPromise(readSession(projectName, sessionId))
    expect(updated[0].message?.content).toEqual([{ type: 'text', text: 'Updated text' }])
  })

  it('should preserve non-text blocks (tool_use) when replacing text', async () => {
    const sessionId = 'test-session'
    await writeMessages(sessionId, [
      {
        type: 'assistant',
        uuid: 'asst-1',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Original explanation' },
            { type: 'tool_use', id: 'tool-1', name: 'Read', input: { path: '/foo' } },
          ],
        },
      },
    ])

    const result = await Effect.runPromise(
      updateMessageContent(projectName, sessionId, 'asst-1', 'New explanation')
    )

    expect(result.success).toBe(true)
    const updated = await Effect.runPromise(readSession(projectName, sessionId))
    const content = updated[0].message?.content as Array<Record<string, unknown>>
    expect(content).toHaveLength(2)
    expect(content[0]).toEqual({ type: 'text', text: 'New explanation' })
    expect(content[1]).toEqual({
      type: 'tool_use',
      id: 'tool-1',
      name: 'Read',
      input: { path: '/foo' },
    })
  })

  it('should preserve order: replace first text but keep surrounding non-text blocks', async () => {
    const sessionId = 'test-session'
    await writeMessages(sessionId, [
      {
        type: 'assistant',
        uuid: 'asst-1',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} },
            { type: 'text', text: 'Original' },
            { type: 'thinking', text: 'thinking...' },
          ],
        },
      },
    ])

    const result = await Effect.runPromise(
      updateMessageContent(projectName, sessionId, 'asst-1', 'Updated')
    )

    expect(result.success).toBe(true)
    const updated = await Effect.runPromise(readSession(projectName, sessionId))
    const content = updated[0].message?.content as Array<Record<string, unknown>>
    expect(content).toHaveLength(3)
    expect(content[0]).toEqual({ type: 'tool_use', id: 'tool-1', name: 'Read', input: {} })
    expect(content[1]).toEqual({ type: 'text', text: 'Updated' })
    expect(content[2]).toEqual({ type: 'thinking', text: 'thinking...' })
  })

  it('should append text block when message has no text content', async () => {
    const sessionId = 'test-session'
    await writeMessages(sessionId, [
      {
        type: 'assistant',
        uuid: 'asst-1',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: {} }],
        },
      },
    ])

    const result = await Effect.runPromise(
      updateMessageContent(projectName, sessionId, 'asst-1', 'New text')
    )

    expect(result.success).toBe(true)
    const updated = await Effect.runPromise(readSession(projectName, sessionId))
    const content = updated[0].message?.content as Array<Record<string, unknown>>
    expect(content).toHaveLength(2)
    expect(content[0]).toEqual({ type: 'tool_use', id: 'tool-1', name: 'Read', input: {} })
    expect(content[1]).toEqual({ type: 'text', text: 'New text' })
  })

  it('should normalize string content to array on update', async () => {
    const sessionId = 'test-session'
    await writeMessages(sessionId, [
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: 'Plain string content' },
      },
    ])

    const result = await Effect.runPromise(
      updateMessageContent(projectName, sessionId, 'user-1', 'Updated')
    )

    expect(result.success).toBe(true)
    const updated = await Effect.runPromise(readSession(projectName, sessionId))
    expect(updated[0].message?.content).toEqual([{ type: 'text', text: 'Updated' }])
  })

  it('should accept human-type messages', async () => {
    const sessionId = 'test-session'
    await writeMessages(sessionId, [
      {
        type: 'human',
        uuid: 'human-1',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
    ])

    const result = await Effect.runPromise(
      updateMessageContent(projectName, sessionId, 'human-1', 'Hi there')
    )

    expect(result.success).toBe(true)
  })

  it('should reject non-editable message types (summary)', async () => {
    const sessionId = 'test-session'
    await writeMessages(sessionId, [
      {
        type: 'summary',
        uuid: 'sum-1',
        summary: 'Session summary',
        leafUuid: 'abc',
      },
    ])

    const result = await Effect.runPromise(
      updateMessageContent(projectName, sessionId, 'sum-1', 'Modified')
    )

    expect(result.success).toBe(false)
    expect((result as { error?: string }).error).toBeDefined()
  })

  it('should return error when uuid not found', async () => {
    const sessionId = 'test-session'
    await writeMessages(sessionId, [
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      },
    ])

    const result = await Effect.runPromise(
      updateMessageContent(projectName, sessionId, 'nonexistent', 'New')
    )

    expect(result.success).toBe(false)
    expect((result as { error?: string }).error).toBe('Message not found')
  })
})

describe('readSession dedup (Issue #137 Phase 3)', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-test-readsession-dedup'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-session-dedup-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  const writeMessages = async (sessionId: string, messages: unknown[]) => {
    const filePath = path.join(projectDir, `${sessionId}.jsonl`)
    await fs.writeFile(filePath, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')
  }

  it('should keep all messages when there are no duplicate uuids', async () => {
    const sessionId = 'test-session'
    await writeMessages(sessionId, [
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'A' }] },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        parentUuid: 'user-1',
        timestamp: '2025-12-19T01:00:01.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'B' }] },
      },
    ])

    const messages = await Effect.runPromise(readSession(projectName, sessionId))
    expect(messages).toHaveLength(2)
    expect(messages.map((m) => m.uuid)).toEqual(['user-1', 'assistant-1'])
  })

  it('should dedupe duplicate uuids keeping the last occurrence', async () => {
    const sessionId = 'test-session'
    await writeMessages(sessionId, [
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'First' }] },
      },
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2025-12-19T01:00:05.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Second (latest)' }] },
      },
    ])

    const messages = await Effect.runPromise(readSession(projectName, sessionId))
    expect(messages).toHaveLength(1)
    expect(messages[0].uuid).toBe('user-1')
    const payload = messages[0].message as { content: Array<{ text: string }> }
    expect(payload.content[0].text).toBe('Second (latest)')
  })

  it('should dedupe 3+ occurrences keeping only the last', async () => {
    const sessionId = 'test-session'
    await writeMessages(sessionId, [
      {
        type: 'user',
        uuid: 'dup-uuid',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'v1' }] },
      },
      {
        type: 'user',
        uuid: 'dup-uuid',
        timestamp: '2025-12-19T01:00:01.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'v2' }] },
      },
      {
        type: 'user',
        uuid: 'dup-uuid',
        timestamp: '2025-12-19T01:00:02.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'v3 (latest)' }] },
      },
    ])

    const messages = await Effect.runPromise(readSession(projectName, sessionId))
    expect(messages).toHaveLength(1)
    const payload = messages[0].message as { content: Array<{ text: string }> }
    expect(payload.content[0].text).toBe('v3 (latest)')
  })

  it('should preserve order of non-duplicated messages around dedup target', async () => {
    const sessionId = 'test-session'
    await writeMessages(sessionId, [
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'A' }] },
      },
      {
        type: 'user',
        uuid: 'dup',
        timestamp: '2025-12-19T01:00:01.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'dup-first' }] },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        parentUuid: 'dup',
        timestamp: '2025-12-19T01:00:02.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'B' }] },
      },
      {
        type: 'user',
        uuid: 'dup',
        timestamp: '2025-12-19T01:00:03.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'dup-last' }] },
      },
    ])

    const messages = await Effect.runPromise(readSession(projectName, sessionId))
    expect(messages).toHaveLength(3)
    expect(messages.map((m) => m.uuid)).toEqual(['user-1', 'assistant-1', 'dup'])
    const dupMsg = messages.find((m) => m.uuid === 'dup')!
    const payload = dupMsg.message as { content: Array<{ text: string }> }
    expect(payload.content[0].text).toBe('dup-last')
  })

  it('should not dedupe messages without uuid (summary, file-history-snapshot, custom-title)', async () => {
    const sessionId = 'test-session'
    await writeMessages(sessionId, [
      {
        type: 'summary',
        summary: 'Summary one',
        leafUuid: 'leaf-1',
      },
      {
        type: 'summary',
        summary: 'Summary two',
        leafUuid: 'leaf-2',
      },
      {
        type: 'file-history-snapshot',
        messageId: 'fhs-shared',
        timestamp: '2025-12-19T01:00:00.000Z',
        snapshot: { trackedFileBackups: {} },
      },
      {
        type: 'file-history-snapshot',
        messageId: 'fhs-shared',
        timestamp: '2025-12-19T01:00:01.000Z',
        snapshot: { trackedFileBackups: {} },
      },
      {
        type: 'custom-title',
        customTitle: 'A',
        sessionId,
      },
      {
        type: 'custom-title',
        customTitle: 'B',
        sessionId,
      },
    ])

    const messages = await Effect.runPromise(readSession(projectName, sessionId))
    expect(messages).toHaveLength(6)
  })
})

describe('updateMessageContent — type-aware editing (tool_result/thinking)', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-test-update-typed'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-session-update-typed-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  const writeMessages = async (sessionId: string, messages: unknown[]) => {
    const filePath = path.join(projectDir, `${sessionId}.jsonl`)
    await fs.writeFile(filePath, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')
  }

  it('should edit tool_result content preserving tool_use_id and is_error', async () => {
    const sessionId = 'typed-tool-result'
    await writeMessages(sessionId, [
      {
        type: 'user',
        uuid: 'tr-1',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tu-1', content: 'old output', is_error: false },
          ],
        },
      },
    ])

    const result = await Effect.runPromise(
      updateMessageContent(projectName, sessionId, 'tr-1', 'corrected output')
    )

    expect(result.success).toBe(true)
    const updated = await Effect.runPromise(readSession(projectName, sessionId))
    expect(updated[0].message?.content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu-1', content: 'corrected output', is_error: false },
    ])
  })

  it('should edit thinking content preserving signature and unknown fields', async () => {
    const sessionId = 'typed-thinking'
    await writeMessages(sessionId, [
      {
        type: 'assistant',
        uuid: 'th-1',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'old reasoning', signature: 'sig-abc' }],
        },
      },
    ])

    const result = await Effect.runPromise(
      updateMessageContent(projectName, sessionId, 'th-1', 'revised reasoning')
    )

    expect(result.success).toBe(true)
    const updated = await Effect.runPromise(readSession(projectName, sessionId))
    expect(updated[0].message?.content).toEqual([
      { type: 'thinking', thinking: 'revised reasoning', signature: 'sig-abc' },
    ])
  })

  it('should still prefer the first text block when text and tool_result coexist', async () => {
    const sessionId = 'typed-mixed'
    await writeMessages(sessionId, [
      {
        type: 'user',
        uuid: 'mx-1',
        timestamp: '2025-12-19T01:00:00.000Z',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tu-2', content: 'tool output' },
            { type: 'text', text: 'original note' },
          ],
        },
      },
    ])

    const result = await Effect.runPromise(
      updateMessageContent(projectName, sessionId, 'mx-1', 'edited note')
    )

    expect(result.success).toBe(true)
    const updated = await Effect.runPromise(readSession(projectName, sessionId))
    expect(updated[0].message?.content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu-2', content: 'tool output' },
      { type: 'text', text: 'edited note' },
    ])
  })

  it('should preserve tool_use <-> tool_result pairing across an edit (invariant fixture)', async () => {
    const sessionId = 'typed-pairing'
    const assistantMsg = {
      type: 'assistant',
      uuid: 'as-1',
      timestamp: '2025-12-19T01:00:00.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu-9', name: 'Bash', input: { command: 'ls' } }],
      },
    }
    await writeMessages(sessionId, [
      assistantMsg,
      {
        type: 'user',
        uuid: 'tr-9',
        timestamp: '2025-12-19T01:00:01.000Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-9', content: 'file-a file-b' }],
        },
      },
    ])

    const result = await Effect.runPromise(
      updateMessageContent(projectName, sessionId, 'tr-9', 'file-a file-b file-c')
    )

    expect(result.success).toBe(true)
    const updated = await Effect.runPromise(readSession(projectName, sessionId))
    // paired assistant tool_use untouched
    expect(updated[0]).toEqual(assistantMsg)
    // tool_result edited in place, pairing id intact
    expect(updated[1].message?.content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu-9', content: 'file-a file-b file-c' },
    ])
  })
})
