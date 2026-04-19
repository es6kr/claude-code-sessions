import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { Effect } from 'effect'

vi.mock('../paths.js', async () => {
  const actual = await vi.importActual('../paths.js')
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  }
})

import { getSessionsDir } from '../paths.js'
import { analyzeSession, compressSession, readSession, summarizeSession } from '../session.js'

describe('compressSession', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-test-analysis'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-session-analysis-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should preserve Stop hook progress messages while removing other progress entries', async () => {
    const sessionId = 'test-session'
    const messages = [
      {
        type: 'user',
        uuid: 'u1',
        parentUuid: null,
        timestamp: '2026-03-27T00:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Start' }] },
      },
      {
        type: 'progress',
        uuid: 'p1',
        parentUuid: 'u1',
        timestamp: '2026-03-27T00:00:01.000Z',
        data: { type: 'hook_progress', hookEvent: 'PostToolUse' },
      },
      {
        type: 'progress',
        uuid: 'p2',
        parentUuid: 'p1',
        timestamp: '2026-03-27T00:00:02.000Z',
        data: { type: 'hook_progress', hookEvent: 'Stop' },
      },
      {
        type: 'assistant',
        uuid: 'a1',
        parentUuid: 'p2',
        timestamp: '2026-03-27T00:00:03.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
      },
    ]

    const sessionFile = path.join(projectDir, `${sessionId}.jsonl`)
    await fs.writeFile(sessionFile, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

    const result = await Effect.runPromise(compressSession(projectName, sessionId))
    const compressedMessages = await Effect.runPromise(readSession(projectName, sessionId))

    expect(result.success).toBe(true)
    expect(result.removedProgress).toBe(1)
    expect(compressedMessages.map((msg) => msg.type)).toEqual(['user', 'progress', 'assistant'])
    expect(compressedMessages[1]).toMatchObject({
      type: 'progress',
      data: { hookEvent: 'Stop' },
    })
    expect(compressedMessages[2]).toMatchObject({
      type: 'assistant',
      parentUuid: 'p2',
    })
  })

  it('should remove intermediate snapshots with first_last strategy', async () => {
    const sessionId = 'test-session'
    const messages = [
      {
        type: 'file-history-snapshot',
        uuid: 'snap-1',
        parentUuid: null,
        snapshot: { trackedFileBackups: { '/a': {} } },
      },
      {
        type: 'user',
        uuid: 'u1',
        parentUuid: 'snap-1',
        message: { role: 'user', content: 'Work' },
      },
      {
        type: 'file-history-snapshot',
        uuid: 'snap-2',
        parentUuid: 'u1',
        snapshot: { trackedFileBackups: { '/b': {} } },
      },
      {
        type: 'file-history-snapshot',
        uuid: 'snap-3',
        parentUuid: 'snap-2',
        snapshot: { trackedFileBackups: { '/c': {} } },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(
      compressSession(projectName, sessionId, { keepSnapshots: 'first_last' })
    )

    expect(result.removedSnapshots).toBe(1)
    const compressed = await Effect.runPromise(readSession(projectName, sessionId))
    const snapshots = compressed.filter((m) => m.type === 'file-history-snapshot')
    expect(snapshots).toHaveLength(2)
    expect(snapshots.map((s) => s.uuid)).toEqual(['snap-1', 'snap-3'])
  })

  it('should remove all snapshots with none strategy', async () => {
    const sessionId = 'test-session'
    const messages = [
      { type: 'file-history-snapshot', uuid: 'snap-1', parentUuid: null, snapshot: {} },
      {
        type: 'user',
        uuid: 'u1',
        parentUuid: 'snap-1',
        message: { role: 'user', content: 'Hello' },
      },
      { type: 'file-history-snapshot', uuid: 'snap-2', parentUuid: 'u1', snapshot: {} },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(
      compressSession(projectName, sessionId, { keepSnapshots: 'none' })
    )

    expect(result.removedSnapshots).toBe(2)
    const compressed = await Effect.runPromise(readSession(projectName, sessionId))
    expect(compressed.some((m) => m.type === 'file-history-snapshot')).toBe(false)
  })

  it('should keep only the last custom-title', async () => {
    const sessionId = 'test-session'
    const messages = [
      { type: 'custom-title', uuid: 'ct1', parentUuid: null, customTitle: 'Old title' },
      { type: 'user', uuid: 'u1', parentUuid: 'ct1', message: { role: 'user', content: 'Work' } },
      { type: 'custom-title', uuid: 'ct2', parentUuid: 'u1', customTitle: 'New title' },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(compressSession(projectName, sessionId))

    expect(result.removedCustomTitles).toBe(1)
    const compressed = await Effect.runPromise(readSession(projectName, sessionId))
    const titles = compressed.filter((m) => m.type === 'custom-title')
    expect(titles).toHaveLength(1)
    expect(titles[0]).toMatchObject({ uuid: 'ct2', customTitle: 'New title' })
  })

  it('should truncate long tool outputs', async () => {
    const sessionId = 'test-session'
    const longOutput = 'x'.repeat(10000)
    const messages = [
      {
        type: 'user',
        uuid: 'u1',
        parentUuid: null,
        content: [
          { type: 'tool_result', tool_use_id: 't1', content: longOutput },
          { type: 'tool_result', tool_use_id: 't2', content: 'short' },
        ],
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(
      compressSession(projectName, sessionId, { maxToolOutputLength: 100 })
    )

    expect(result.truncatedOutputs).toBe(1)
    const content = await fs.readFile(path.join(projectDir, `${sessionId}.jsonl`), 'utf-8')
    const line = JSON.parse(content.trim())
    expect(line.content[0].content).toContain('[truncated]')
    expect(line.content[1].content).toBe('short')
  })

  it('should reduce file size after compression', async () => {
    const sessionId = 'test-session'
    const messages = [
      { type: 'user', uuid: 'u1', parentUuid: null, message: { role: 'user', content: 'Hello' } },
      {
        type: 'progress',
        uuid: 'p1',
        parentUuid: 'u1',
        data: { hookEvent: 'ToolUse', payload: 'x'.repeat(500) },
      },
      {
        type: 'progress',
        uuid: 'p2',
        parentUuid: 'p1',
        data: { hookEvent: 'ToolResult', payload: 'y'.repeat(500) },
      },
      {
        type: 'file-history-snapshot',
        uuid: 'snap-1',
        parentUuid: 'p2',
        snapshot: { trackedFileBackups: { '/a': { content: 'z'.repeat(500) } } },
      },
      {
        type: 'file-history-snapshot',
        uuid: 'snap-2',
        parentUuid: 'snap-1',
        snapshot: { trackedFileBackups: { '/b': { content: 'w'.repeat(500) } } },
      },
      {
        type: 'file-history-snapshot',
        uuid: 'snap-3',
        parentUuid: 'snap-2',
        snapshot: { trackedFileBackups: { '/c': { content: 'v'.repeat(500) } } },
      },
      {
        type: 'assistant',
        uuid: 'a1',
        parentUuid: 'snap-3',
        message: { role: 'assistant', content: 'Done' },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(compressSession(projectName, sessionId))

    expect(result.compressedSize).toBeLessThan(result.originalSize)
  })
})

describe('analyzeSession', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-test-analysis'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-session-analyze-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should count message types correctly', async () => {
    const sessionId = 'test-session'
    const messages = [
      {
        type: 'user',
        uuid: 'u1',
        timestamp: '2025-01-01T00:00:00Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2025-01-01T00:01:00Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      },
      {
        type: 'user',
        uuid: 'u2',
        timestamp: '2025-01-01T00:02:00Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Help' }] },
      },
      {
        type: 'assistant',
        uuid: 'a2',
        timestamp: '2025-01-01T00:03:00Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Sure' }] },
      },
      { type: 'summary', uuid: 's1', summary: 'Session about greetings' },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(analyzeSession(projectName, sessionId))

    expect(result.stats.totalMessages).toBe(5)
    expect(result.stats.userMessages).toBe(2)
    expect(result.stats.assistantMessages).toBe(2)
    expect(result.stats.summaryCount).toBe(1)
  })

  it('should calculate session duration in minutes', async () => {
    const sessionId = 'test-session'
    const messages = [
      {
        type: 'user',
        uuid: 'u1',
        timestamp: '2025-01-01T00:00:00Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Start' }] },
      },
      {
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2025-01-01T01:30:00Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'End' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(analyzeSession(projectName, sessionId))

    expect(result.durationMinutes).toBe(90)
  })

  it('should track tool usage from assistant messages', async () => {
    const sessionId = 'test-session'
    const messages = [
      {
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2025-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 't1',
              name: 'Read',
              input: { file_path: '/project/src/index.ts' },
            },
            {
              type: 'tool_use',
              id: 't2',
              name: 'Edit',
              input: { file_path: '/project/src/index.ts' },
            },
          ],
        },
      },
      {
        type: 'assistant',
        uuid: 'a2',
        timestamp: '2025-01-01T00:01:00Z',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 't3',
              name: 'Read',
              input: { file_path: '/project/src/utils.ts' },
            },
          ],
        },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(analyzeSession(projectName, sessionId))

    const readTool = result.toolUsage.find((t) => t.name === 'Read')
    const editTool = result.toolUsage.find((t) => t.name === 'Edit')
    expect(readTool?.count).toBe(2)
    expect(editTool?.count).toBe(1)
  })

  it('should track files changed via Write and Edit tools', async () => {
    const sessionId = 'test-session'
    const messages = [
      {
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2025-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 't1',
              name: 'Write',
              input: { file_path: '/project/new-file.ts' },
            },
            {
              type: 'tool_use',
              id: 't2',
              name: 'Edit',
              input: { file_path: '/project/existing.ts' },
            },
          ],
        },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(analyzeSession(projectName, sessionId))

    expect(result.filesChanged).toContain('/project/new-file.ts')
    expect(result.filesChanged).toContain('/project/existing.ts')
  })

  it('should detect high error rate pattern', async () => {
    const sessionId = 'test-session'
    const messages = [
      {
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2025-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
            { type: 'tool_use', id: 't2', name: 'Bash', input: {} },
            { type: 'tool_use', id: 't3', name: 'Bash', input: {} },
            { type: 'tool_use', id: 't4', name: 'Bash', input: {} },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'u1',
        timestamp: '2025-01-01T00:00:01Z',
        content: [
          { type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'Error' },
          { type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'Error' },
          { type: 'tool_result', tool_use_id: 't3', content: 'OK' },
          { type: 'tool_result', tool_use_id: 't4', is_error: true, content: 'Error' },
        ],
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(analyzeSession(projectName, sessionId))

    const highErrorPattern = result.patterns.find((p) => p.type === 'high_error_rate')
    expect(highErrorPattern).toBeDefined()
    expect(highErrorPattern?.count).toBe(3)
  })

  it('should detect many snapshots pattern', async () => {
    const sessionId = 'test-session'
    const snapshots = Array.from({ length: 12 }, (_, i) => ({
      type: 'file-history-snapshot',
      messageId: `msg-${i}`,
      timestamp: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
      snapshot: { trackedFileBackups: {} },
    }))

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      snapshots.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(analyzeSession(projectName, sessionId))

    expect(result.stats.snapshotCount).toBe(12)
    const snapshotPattern = result.patterns.find((p) => p.type === 'many_snapshots')
    expect(snapshotPattern).toBeDefined()
  })
})

describe('summarizeSession', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-test-analysis'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-session-summarize-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should extract user and assistant conversation lines', async () => {
    const sessionId = 'test-session'
    const messages = [
      {
        type: 'user',
        uuid: 'u1',
        timestamp: '2025-01-01T09:00:00Z',
        message: { role: 'user', content: [{ type: 'text', text: 'What is TypeScript?' }] },
      },
      {
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2025-01-01T09:01:00Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'TypeScript is a typed superset of JavaScript.' }],
        },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(summarizeSession(projectName, sessionId))

    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].role).toBe('user')
    expect(result.lines[0].content).toContain('TypeScript')
    expect(result.lines[1].role).toBe('assistant')
  })

  it('should respect limit option', async () => {
    const sessionId = 'test-session'
    const messages = Array.from({ length: 10 }, (_, i) => ({
      type: i % 2 === 0 ? 'user' : 'assistant',
      uuid: `msg-${i}`,
      timestamp: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
      message: {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: [{ type: 'text', text: `Message ${i}` }],
      },
    }))

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(summarizeSession(projectName, sessionId, { limit: 3 }))

    expect(result.lines).toHaveLength(3)
  })

  it('should truncate long messages', async () => {
    const sessionId = 'test-session'
    const longText = 'A'.repeat(500)
    const messages = [
      {
        type: 'user',
        uuid: 'u1',
        message: { role: 'user', content: [{ type: 'text', text: longText }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(
      summarizeSession(projectName, sessionId, { maxLength: 50 })
    )

    expect(result.lines[0].content.length).toBeLessThanOrEqual(53) // 50 + "..."
  })

  it('should skip non-conversation message types', async () => {
    const sessionId = 'test-session'
    const messages = [
      {
        type: 'user',
        uuid: 'u1',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      { type: 'summary', uuid: 's1', summary: 'A summary' },
      { type: 'file-history-snapshot', uuid: 'snap1', snapshot: {} },
      {
        type: 'assistant',
        uuid: 'a1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Reply' }] },
      },
    ]

    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    )

    const result = await Effect.runPromise(summarizeSession(projectName, sessionId))

    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].role).toBe('user')
    expect(result.lines[1].role).toBe('assistant')
  })
})
