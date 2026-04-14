import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'

// Mock paths module to use temp directories
vi.mock('../paths.js', async () => {
  const actual = await vi.importActual('../paths.js')
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  }
})

import {
  analyzeSession,
  compressSession,
  extractProjectKnowledge,
  summarizeSession,
} from '../session/analysis.js'
import { getSessionsDir } from '../paths.js'

// Helper to write session JSONL files
async function writeSession(
  projectDir: string,
  sessionId: string,
  messages: Record<string, unknown>[]
) {
  const content = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
  await fs.writeFile(path.join(projectDir, `${sessionId}.jsonl`), content)
}

describe('analyzeSession', () => {
  let tempDir: string
  let projectDir: string
  const projectName = 'test-project'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-analysis-test-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should count user and assistant messages', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2025-01-01T10:01:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there' }],
        },
      },
      {
        type: 'user',
        uuid: 'msg-3',
        parentUuid: 'msg-2',
        timestamp: '2025-01-01T10:02:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Thanks' }] },
      },
    ])

    const result = await Effect.runPromise(analyzeSession(projectName, 'session-1'))

    expect(result.stats.userMessages).toBe(2)
    expect(result.stats.assistantMessages).toBe(1)
    expect(result.stats.totalMessages).toBe(3)
  })

  it('should calculate session duration', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Start' }] },
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2025-01-01T10:30:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'End' }],
        },
      },
    ])

    const result = await Effect.runPromise(analyzeSession(projectName, 'session-1'))

    expect(result.durationMinutes).toBe(30)
  })

  it('should track tool usage', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Edit file' }] },
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2025-01-01T10:01:00.000Z',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tu-1',
              name: 'Edit',
              input: { file_path: '/project/src/app.ts' },
            },
            { type: 'tool_use', id: 'tu-2', name: 'Read', input: {} },
            {
              type: 'tool_use',
              id: 'tu-3',
              name: 'Edit',
              input: { file_path: '/project/src/utils.ts' },
            },
          ],
        },
      },
    ])

    const result = await Effect.runPromise(analyzeSession(projectName, 'session-1'))

    expect(result.toolUsage).toHaveLength(2)
    const editTool = result.toolUsage.find((t) => t.name === 'Edit')
    expect(editTool?.count).toBe(2)
    const readTool = result.toolUsage.find((t) => t.name === 'Read')
    expect(readTool?.count).toBe(1)
  })

  it('should track files changed by Edit and Write tools', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'assistant',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tu-1',
              name: 'Write',
              input: { file_path: '/project/new.ts' },
            },
            { type: 'tool_use', id: 'tu-2', name: 'Edit', input: { file_path: '/project/old.ts' } },
          ],
        },
      },
    ])

    const result = await Effect.runPromise(analyzeSession(projectName, 'session-1'))

    expect(result.filesChanged).toContain('/project/new.ts')
    expect(result.filesChanged).toContain('/project/old.ts')
  })

  it('should detect high error rate pattern', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'assistant',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu-1', name: 'Bash', input: {} },
            { type: 'tool_use', id: 'tu-2', name: 'Bash', input: {} },
            { type: 'tool_use', id: 'tu-3', name: 'Bash', input: {} },
            { type: 'tool_use', id: 'tu-4', name: 'Bash', input: {} },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2025-01-01T10:01:00.000Z',
        content: [
          { type: 'tool_result', tool_use_id: 'tu-1', is_error: true, content: 'Error' },
          { type: 'tool_result', tool_use_id: 'tu-2', is_error: true, content: 'Error' },
          { type: 'tool_result', tool_use_id: 'tu-3', content: 'OK' },
          { type: 'tool_result', tool_use_id: 'tu-4', content: 'OK' },
        ],
      },
    ])

    const result = await Effect.runPromise(analyzeSession(projectName, 'session-1'))

    const highErrorPattern = result.patterns.find((p) => p.type === 'high_error_rate')
    expect(highErrorPattern).toBeDefined()
    expect(highErrorPattern?.description).toContain('Bash')
  })

  it('should count summary and snapshot messages', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'summary',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        summary: 'Session checkpoint reached',
      },
      {
        type: 'file-history-snapshot',
        uuid: 'msg-2',
        timestamp: '2025-01-01T10:01:00.000Z',
        snapshot: { trackedFileBackups: { '/project/file.ts': {} } },
      },
    ])

    const result = await Effect.runPromise(analyzeSession(projectName, 'session-1'))

    expect(result.stats.summaryCount).toBe(1)
    expect(result.stats.snapshotCount).toBe(1)
    expect(result.filesChanged).toContain('/project/file.ts')
  })

  it('should detect milestone from user messages containing commit keyword', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        // analyzeSession reads msg.content (direct string), not msg.message.content
        content: 'Please commit these changes',
        message: { role: 'user', content: [{ type: 'text', text: 'Please commit these changes' }] },
      },
    ])

    const result = await Effect.runPromise(analyzeSession(projectName, 'session-1'))

    expect(result.milestones).toHaveLength(1)
    expect(result.milestones[0].description).toContain('commit')
  })
})

describe('compressSession', () => {
  let tempDir: string
  let projectDir: string
  const projectName = 'test-project'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-compress-test-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should remove intermediate snapshots with first_last option', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'file-history-snapshot',
        uuid: 'snap-1',
        timestamp: '2025-01-01T10:01:00.000Z',
        snapshot: { trackedFileBackups: {} },
      },
      {
        type: 'file-history-snapshot',
        uuid: 'snap-2',
        timestamp: '2025-01-01T10:02:00.000Z',
        snapshot: { trackedFileBackups: {} },
      },
      {
        type: 'file-history-snapshot',
        uuid: 'snap-3',
        timestamp: '2025-01-01T10:03:00.000Z',
        snapshot: { trackedFileBackups: {} },
      },
    ])

    const result = await Effect.runPromise(
      compressSession(projectName, 'session-1', { keepSnapshots: 'first_last' })
    )

    expect(result.success).toBe(true)
    expect(result.removedSnapshots).toBe(1) // middle one removed

    const content = await fs.readFile(path.join(projectDir, 'session-1.jsonl'), 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(3) // user + first snap + last snap
  })

  it('should remove all snapshots with none option', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'file-history-snapshot',
        uuid: 'snap-1',
        timestamp: '2025-01-01T10:01:00.000Z',
        snapshot: { trackedFileBackups: {} },
      },
    ])

    const result = await Effect.runPromise(
      compressSession(projectName, 'session-1', { keepSnapshots: 'none' })
    )

    expect(result.removedSnapshots).toBe(1)
  })

  it('should truncate long tool outputs', async () => {
    const longOutput = 'x'.repeat(10000)
    await writeSession(projectDir, 'session-1', [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: longOutput }],
      },
    ])

    const result = await Effect.runPromise(
      compressSession(projectName, 'session-1', { maxToolOutputLength: 100 })
    )

    expect(result.truncatedOutputs).toBe(1)

    const content = await fs.readFile(path.join(projectDir, 'session-1.jsonl'), 'utf-8')
    const msg = JSON.parse(content.trim())
    expect(msg.content[0].content.length).toBeLessThan(200)
    expect(msg.content[0].content).toContain('[truncated]')
  })

  it('should remove non-Stop progress messages', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'progress',
        uuid: 'prog-1',
        hookEvent: 'PostToolUse',
      },
      {
        type: 'progress',
        uuid: 'prog-2',
        hookEvent: 'Stop',
      },
    ])

    const result = await Effect.runPromise(compressSession(projectName, 'session-1'))

    expect(result.removedProgress).toBe(1)

    const content = await fs.readFile(path.join(projectDir, 'session-1.jsonl'), 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(2) // user + Stop progress
  })

  it('should keep only last custom-title when duplicates exist', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'custom-title',
        uuid: 'ct-1',
        customTitle: 'First title',
      },
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'custom-title',
        uuid: 'ct-2',
        customTitle: 'Updated title',
      },
    ])

    const result = await Effect.runPromise(compressSession(projectName, 'session-1'))

    expect(result.removedCustomTitles).toBe(1)

    const content = await fs.readFile(path.join(projectDir, 'session-1.jsonl'), 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    const titles = lines
      .map((l) => JSON.parse(l))
      .filter((m: Record<string, unknown>) => m.type === 'custom-title')
    expect(titles).toHaveLength(1)
    expect(titles[0].customTitle).toBe('Updated title')
  })

  it('should report compressed size smaller than original', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'progress',
        uuid: 'prog-1',
        hookEvent: 'PostToolUse',
        data: { result: 'x'.repeat(1000) },
      },
    ])

    const result = await Effect.runPromise(compressSession(projectName, 'session-1'))

    expect(result.compressedSize).toBeLessThan(result.originalSize)
  })
})

describe('summarizeSession', () => {
  let tempDir: string
  let projectDir: string
  const projectName = 'test-project'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-summarize-test-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should format user and assistant messages', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-06-15T14:30:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'How do I fix this bug?' }] },
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2025-06-15T14:31:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Let me check the code.' }],
        },
      },
    ])

    const result = await Effect.runPromise(summarizeSession(projectName, 'session-1'))

    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].role).toBe('user')
    expect(result.lines[0].content).toContain('How do I fix this bug?')
    expect(result.lines[1].role).toBe('assistant')
    expect(result.lines[1].content).toContain('Let me check the code.')
    expect(result.formatted).toContain('user')
    expect(result.formatted).toContain('assistant')
  })

  it('should respect limit option', async () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      type: i % 2 === 0 ? 'user' : 'assistant',
      uuid: `msg-${i}`,
      parentUuid: i > 0 ? `msg-${i - 1}` : undefined,
      timestamp: `2025-01-01T10:${String(i).padStart(2, '0')}:00.000Z`,
      message: {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: [{ type: 'text', text: `Message ${i}` }],
      },
    }))

    await writeSession(projectDir, 'session-1', messages)

    const result = await Effect.runPromise(summarizeSession(projectName, 'session-1', { limit: 3 }))

    expect(result.lines).toHaveLength(3)
  })

  it('should truncate long messages', async () => {
    const longText = 'A'.repeat(500)
    await writeSession(projectDir, 'session-1', [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: longText }] },
      },
    ])

    const result = await Effect.runPromise(
      summarizeSession(projectName, 'session-1', { maxLength: 50 })
    )

    expect(result.lines[0].content.length).toBeLessThanOrEqual(53) // 50 + '...'
    expect(result.lines[0].content).toContain('...')
  })

  it('should skip non-conversation message types', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'file-history-snapshot',
        uuid: 'snap-1',
        timestamp: '2025-01-01T10:01:00.000Z',
        snapshot: {},
      },
      {
        type: 'summary',
        uuid: 'sum-1',
        timestamp: '2025-01-01T10:02:00.000Z',
        summary: 'Summary text',
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2025-01-01T10:03:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
        },
      },
    ])

    const result = await Effect.runPromise(summarizeSession(projectName, 'session-1'))

    expect(result.lines).toHaveLength(2) // only user + assistant
  })
})

describe('extractProjectKnowledge', () => {
  let tempDir: string
  let projectDir: string
  const projectName = 'test-project'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-knowledge-test-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should aggregate hot files across sessions', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'file-history-snapshot',
        uuid: 'snap-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        snapshot: {
          trackedFileBackups: { '/project/hot-file.ts': {}, '/project/cold.ts': {} },
          timestamp: '2025-01-01T10:00:00.000Z',
        },
      },
    ])

    await writeSession(projectDir, 'session-2', [
      {
        type: 'file-history-snapshot',
        uuid: 'snap-2',
        timestamp: '2025-01-02T10:00:00.000Z',
        snapshot: {
          trackedFileBackups: { '/project/hot-file.ts': {} },
          timestamp: '2025-01-02T10:00:00.000Z',
        },
      },
    ])

    const result = await Effect.runPromise(extractProjectKnowledge(projectName))

    expect(result.hotFiles[0].path).toBe('/project/hot-file.ts')
    expect(result.hotFiles[0].modifyCount).toBe(2)
  })

  it('should detect workflow patterns from tool sequences', async () => {
    for (const id of ['session-1', 'session-2']) {
      await writeSession(projectDir, id, [
        {
          type: 'assistant',
          uuid: `msg-${id}`,
          timestamp: '2025-01-01T10:00:00.000Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', name: 'Read', id: 'tu-1' },
              { type: 'tool_use', name: 'Edit', id: 'tu-2' },
              { type: 'tool_use', name: 'Bash', id: 'tu-3' },
            ],
          },
        },
      ])
    }

    const result = await Effect.runPromise(extractProjectKnowledge(projectName))

    expect(result.workflows.length).toBeGreaterThanOrEqual(1)
    expect(result.workflows[0].sequence).toEqual(['Read', 'Edit', 'Bash'])
    expect(result.workflows[0].count).toBe(2)
  })

  it('should extract decisions from summary messages', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'summary',
        uuid: 'sum-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        summary: 'Decided to use Effect-TS for error handling',
      },
    ])

    const result = await Effect.runPromise(extractProjectKnowledge(projectName))

    expect(result.decisions).toHaveLength(1)
    expect(result.decisions[0].decision).toContain('Effect-TS')
    expect(result.decisions[0].sessionId).toBe('session-1')
  })

  it('should only analyze specified session IDs when provided', async () => {
    await writeSession(projectDir, 'session-1', [
      {
        type: 'summary',
        uuid: 'sum-1',
        summary: 'Session 1 decision',
      },
    ])
    await writeSession(projectDir, 'session-2', [
      {
        type: 'summary',
        uuid: 'sum-2',
        summary: 'Session 2 decision',
      },
    ])

    const result = await Effect.runPromise(extractProjectKnowledge(projectName, ['session-1']))

    expect(result.decisions).toHaveLength(1)
    expect(result.decisions[0].sessionId).toBe('session-1')
  })
})
