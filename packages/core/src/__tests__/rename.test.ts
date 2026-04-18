import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'

vi.mock('../paths.js', async () => {
  const actual = await vi.importActual('../paths.js')
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  }
})

import { renameSession } from '../session.js'
import { getSessionsDir } from '../paths.js'

async function writeSession(
  projectDir: string,
  sessionId: string,
  messages: Record<string, unknown>[]
) {
  const content = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
  await fs.writeFile(path.join(projectDir, `${sessionId}.jsonl`), content)
}

async function readLines(projectDir: string, sessionId: string) {
  const content = await fs.readFile(path.join(projectDir, `${sessionId}.jsonl`), 'utf-8')
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>)
}

describe('renameSession', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-test-rename'
  const sessionId = 'session-rename-test'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-rename-test-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should replace existing custom-title AND agent-name with new title', async () => {
    await writeSession(projectDir, sessionId, [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      { type: 'agent-name', agentName: 'Old Agent Name', sessionId },
      { type: 'custom-title', customTitle: 'Old Title', sessionId },
      {
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2025-01-01T10:01:00.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      },
    ])

    const result = await Effect.runPromise(renameSession(projectName, sessionId, 'New Title'))
    expect(result.success).toBe(true)

    const lines = await readLines(projectDir, sessionId)
    const customTitles = lines.filter((l) => l.type === 'custom-title')
    const agentNames = lines.filter((l) => l.type === 'agent-name')

    expect(customTitles).toHaveLength(1)
    expect(customTitles[0].customTitle).toBe('New Title')
    expect(agentNames).toHaveLength(1)
    expect(agentNames[0].agentName).toBe('New Title')
  })

  it('should add custom-title and agent-name after last message if none exist', async () => {
    await writeSession(projectDir, sessionId, [
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
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      },
    ])

    const result = await Effect.runPromise(renameSession(projectName, sessionId, 'Brand New'))
    expect(result.success).toBe(true)

    const lines = await readLines(projectDir, sessionId)
    const customTitles = lines.filter((l) => l.type === 'custom-title')
    const agentNames = lines.filter((l) => l.type === 'agent-name')

    expect(customTitles).toHaveLength(1)
    expect(customTitles[0].customTitle).toBe('Brand New')
    expect(agentNames).toHaveLength(1)
    expect(agentNames[0].agentName).toBe('Brand New')

    // Both should be after the last message (assistant msg-2)
    const lastMsgIdx = lines.findIndex((l) => l.uuid === 'msg-2')
    const ctIdx = lines.findIndex((l) => l.type === 'custom-title')
    const anIdx = lines.findIndex((l) => l.type === 'agent-name')
    expect(ctIdx).toBeGreaterThan(lastMsgIdx)
    expect(anIdx).toBeGreaterThan(lastMsgIdx)
  })

  it('should remove all custom-title and agent-name when title is empty', async () => {
    await writeSession(projectDir, sessionId, [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      { type: 'agent-name', agentName: 'Agent', sessionId },
      { type: 'custom-title', customTitle: 'Title', sessionId },
    ])

    const result = await Effect.runPromise(renameSession(projectName, sessionId, ''))
    expect(result.success).toBe(true)

    const lines = await readLines(projectDir, sessionId)
    expect(lines.filter((l) => l.type === 'custom-title')).toHaveLength(0)
    expect(lines.filter((l) => l.type === 'agent-name')).toHaveLength(0)
  })

  it('should handle multiple existing custom-title and agent-name records', async () => {
    await writeSession(projectDir, sessionId, [
      { type: 'agent-name', agentName: 'First Agent', sessionId },
      { type: 'custom-title', customTitle: 'First', sessionId },
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      },
      { type: 'agent-name', agentName: 'Second Agent', sessionId },
      { type: 'custom-title', customTitle: 'Second', sessionId },
    ])

    const result = await Effect.runPromise(renameSession(projectName, sessionId, 'Final'))
    expect(result.success).toBe(true)

    const lines = await readLines(projectDir, sessionId)
    const customTitles = lines.filter((l) => l.type === 'custom-title')
    const agentNames = lines.filter((l) => l.type === 'agent-name')

    // All old ones removed, exactly 1 of each with new value
    expect(customTitles).toHaveLength(1)
    expect(customTitles[0].customTitle).toBe('Final')
    expect(agentNames).toHaveLength(1)
    expect(agentNames[0].agentName).toBe('Final')
  })
})
