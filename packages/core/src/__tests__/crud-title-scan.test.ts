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

import { listSessions } from '../session/crud.js'
import { getSessionsDir } from '../paths.js'

async function writeSession(
  projectDir: string,
  sessionId: string,
  messages: Record<string, unknown>[]
) {
  const content = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
  await fs.writeFile(path.join(projectDir, `${sessionId}.jsonl`), content)
}

// Regression tests for issue #189 — session title resolution
describe('listSessions title resolution (issue #189)', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-project-title-scan-test'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-title-scan-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  // Bug 1: backward scan for custom-title breaks on user/assistant before finding
  // the record when Claude Code appends conversational turns after rename metadata.
  it('finds customTitle when conversational turns follow the custom-title record', async () => {
    const sessionId = 'session-bug1'
    await writeSession(projectDir, sessionId, [
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: 'First prompt' },
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2025-01-01T10:00:01.000Z',
        message: { role: 'assistant', content: 'Reply' },
      },
      { type: 'custom-title', customTitle: 'My-Session-Name', sessionId },
      { type: 'agent-name', agentName: 'My-Agent', sessionId },
      {
        type: 'user',
        uuid: 'msg-3',
        parentUuid: 'msg-2',
        timestamp: '2025-01-01T10:00:02.000Z',
        message: { role: 'user', content: 'Follow-up prompt' },
      },
      {
        type: 'assistant',
        uuid: 'msg-4',
        parentUuid: 'msg-3',
        timestamp: '2025-01-01T10:00:03.000Z',
        message: { role: 'assistant', content: 'Follow-up reply' },
      },
      // Claude Code sometimes appends a file-history-snapshot at the very end
      { type: 'file-history-snapshot', messageId: 'msg-4', snapshot: {}, isSnapshotUpdate: false },
    ])

    const sessions = await Effect.runPromise(listSessions(projectName))

    expect(sessions).toHaveLength(1)
    expect(sessions[0].customTitle).toBe('My-Session-Name')
    expect(sessions[0].agentName).toBe('My-Agent')
  })

  // Bug 2: fallback (first user message) does not skip synthetic isMeta reminders.
  // Claude Code injects an isMeta system-reminder describing the rename as an
  // early "user" entry; extractTitle then displays that raw reminder text.
  it('skips isMeta system-reminder messages when picking fallback title', async () => {
    const sessionId = 'session-bug2'
    await writeSession(projectDir, sessionId, [
      // Synthetic reminder Claude Code injects as an isMeta user message
      {
        type: 'user',
        isMeta: true,
        uuid: 'meta-1',
        timestamp: '2025-01-01T09:59:00.000Z',
        message: {
          role: 'user',
          content:
            '<system-reminder>\nThe user named this session "My-Session-Name". This may indicate the session\'s focus or intent.\n</system-reminder>',
        },
      },
      // Real first user prompt
      {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T10:00:00.000Z',
        message: { role: 'user', content: 'What is the answer to life?' },
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2025-01-01T10:00:01.000Z',
        message: { role: 'assistant', content: 'Forty-two.' },
      },
      // No custom-title record → fallback path is exercised
    ])

    const sessions = await Effect.runPromise(listSessions(projectName))

    expect(sessions).toHaveLength(1)
    // Falls back to first non-meta user message, not the reminder text
    expect(sessions[0].title).toBe('What is the answer to life?')
    // Reminder text must not leak through
    expect(sessions[0].title ?? '').not.toContain('<system-reminder>')
    expect(sessions[0].title ?? '').not.toContain('named this session')
  })
})
