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
import { compressSession, readSession } from '../session.js'

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
})
