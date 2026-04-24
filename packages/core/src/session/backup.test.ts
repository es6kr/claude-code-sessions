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

vi.mock('../todos.js', async () => ({
  sessionHasTodos: vi.fn(() => Effect.succeed(false)),
  findOrphanTodos: vi.fn(() => Effect.succeed([])),
  deleteOrphanTodos: vi.fn(() => Effect.succeed({ deletedCount: 0 })),
  deleteLinkedTodos: vi.fn(() => Effect.succeed({ deletedCount: 0 })),
}))

import { listBackupSessions, restoreSession } from './backup.js'
import { getSessionsDir } from '../paths.js'

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: 'user',
    uuid: `msg-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ...overrides,
  }
}

function writeBackup(
  sessionsDir: string,
  projectName: string,
  sessionId: string,
  messages: unknown[]
) {
  const backupDir = path.join(sessionsDir, '.bak')
  const content = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
  return fs.writeFile(path.join(backupDir, `${projectName}_${sessionId}.jsonl`), content, 'utf-8')
}

function writeAgentBackup(
  sessionsDir: string,
  projectName: string,
  agentId: string,
  messages: unknown[]
) {
  const agentBackupDir = path.join(sessionsDir, projectName, '.bak')
  const content = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
  return fs.writeFile(path.join(agentBackupDir, `${agentId}.jsonl`), content, 'utf-8')
}

describe('listBackupSessions', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-test-'))
    vi.mocked(getSessionsDir).mockReturnValue(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns empty array when .bak directory does not exist', async () => {
    const result = await Effect.runPromise(listBackupSessions())
    expect(result).toEqual([])
  })

  it('returns empty array when .bak directory is empty', async () => {
    await fs.mkdir(path.join(tmpDir, '.bak'), { recursive: true })
    const result = await Effect.runPromise(listBackupSessions())
    expect(result).toEqual([])
  })

  it('lists backup sessions with correct metadata', async () => {
    await fs.mkdir(path.join(tmpDir, '.bak'), { recursive: true })
    const messages = [
      makeMessage({ type: 'summary', summary: 'Test session summary' }),
      makeMessage(),
      makeMessage(),
    ]
    await writeBackup(tmpDir, 'test-project', 'session-1', messages)

    const result = await Effect.runPromise(listBackupSessions())
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'session-1',
      projectName: 'test-project',
      messageCount: 3,
    })
    expect(result[0].backupDate).toBeGreaterThan(0)
    expect(result[0].fileSize).toBeGreaterThan(0)
  })

  it('extracts title from custom-title message', async () => {
    await fs.mkdir(path.join(tmpDir, '.bak'), { recursive: true })
    const messages = [{ type: 'custom-title', customTitle: 'My Custom Title' }, makeMessage()]
    await writeBackup(tmpDir, 'project-a', 'session-2', messages)

    const result = await Effect.runPromise(listBackupSessions())
    expect(result[0].title).toBe('My Custom Title')
  })

  it('lists multiple backup sessions', async () => {
    await fs.mkdir(path.join(tmpDir, '.bak'), { recursive: true })
    await writeBackup(tmpDir, 'project-a', 'session-1', [makeMessage()])
    await writeBackup(tmpDir, 'project-b', 'session-2', [makeMessage(), makeMessage()])

    const result = await Effect.runPromise(listBackupSessions())
    expect(result).toHaveLength(2)
    const ids = result.map((s) => s.id).sort()
    expect(ids).toEqual(['session-1', 'session-2'])
  })

  it('skips non-jsonl files in .bak directory', async () => {
    await fs.mkdir(path.join(tmpDir, '.bak'), { recursive: true })
    await writeBackup(tmpDir, 'project-a', 'session-1', [makeMessage()])
    await fs.writeFile(path.join(tmpDir, '.bak', 'readme.txt'), 'ignore me')

    const result = await Effect.runPromise(listBackupSessions())
    expect(result).toHaveLength(1)
  })

  it('handles corrupted backup files gracefully', async () => {
    await fs.mkdir(path.join(tmpDir, '.bak'), { recursive: true })
    await fs.writeFile(path.join(tmpDir, '.bak', 'project_corrupted.jsonl'), 'not valid json\n')
    await writeBackup(tmpDir, 'project-a', 'session-1', [makeMessage()])

    const result = await Effect.runPromise(listBackupSessions())
    // Should still return the valid backup, skip or include corrupted with defaults
    expect(result.length).toBeGreaterThanOrEqual(1)
  })
})

describe('restoreSession', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'))
    vi.mocked(getSessionsDir).mockReturnValue(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('restores a backup session to its original location', async () => {
    await fs.mkdir(path.join(tmpDir, '.bak'), { recursive: true })
    const messages = [makeMessage(), makeMessage()]
    await writeBackup(tmpDir, 'test-project', 'session-1', messages)

    const result = await Effect.runPromise(restoreSession('test-project', 'session-1'))
    expect(result.success).toBe(true)
    expect(result.restoredAgents).toBe(0)

    // Verify file was moved
    const restoredPath = path.join(tmpDir, 'test-project', 'session-1.jsonl')
    const stat = await fs.stat(restoredPath)
    expect(stat.isFile()).toBe(true)

    // Verify backup was removed
    const backupPath = path.join(tmpDir, '.bak', 'test-project_session-1.jsonl')
    await expect(fs.access(backupPath)).rejects.toThrow()
  })

  it('creates project directory if it does not exist', async () => {
    await fs.mkdir(path.join(tmpDir, '.bak'), { recursive: true })
    await writeBackup(tmpDir, 'new-project', 'session-1', [makeMessage()])

    const result = await Effect.runPromise(restoreSession('new-project', 'session-1'))
    expect(result.success).toBe(true)

    const projectDir = path.join(tmpDir, 'new-project')
    const stat = await fs.stat(projectDir)
    expect(stat.isDirectory()).toBe(true)
  })

  it('restores linked agent backups', async () => {
    await fs.mkdir(path.join(tmpDir, '.bak'), { recursive: true })
    await fs.mkdir(path.join(tmpDir, 'test-project', '.bak'), { recursive: true })

    // Session backup
    const sessionMessages = [
      makeMessage(),
      { type: 'summary', summary: 'Agent task', leafSessionId: 'agent-1' },
    ]
    await writeBackup(tmpDir, 'test-project', 'session-1', sessionMessages)

    // Agent backup — first line must contain sessionId for linking
    const agentMessages = [
      {
        type: 'user',
        sessionId: 'session-1',
        uuid: 'agent-msg-1',
        timestamp: new Date().toISOString(),
        message: { role: 'user', content: [{ type: 'text', text: 'Agent task' }] },
      },
    ]
    await writeAgentBackup(tmpDir, 'test-project', 'agent-1', agentMessages)

    const result = await Effect.runPromise(restoreSession('test-project', 'session-1'))
    expect(result.success).toBe(true)
    expect(result.restoredAgents).toBe(1)

    // Verify agent was restored
    const agentPath = path.join(tmpDir, 'test-project', 'agent-1.jsonl')
    const stat = await fs.stat(agentPath)
    expect(stat.isFile()).toBe(true)
  })

  it('fails when backup does not exist', async () => {
    await fs.mkdir(path.join(tmpDir, '.bak'), { recursive: true })

    const result = await Effect.runPromise(
      restoreSession('nonexistent', 'session-1').pipe(
        Effect.catchAll((e) => Effect.succeed({ success: false, error: String(e) }))
      )
    )
    expect(result.success).toBe(false)
  })

  it('does not overwrite existing session file', async () => {
    await fs.mkdir(path.join(tmpDir, '.bak'), { recursive: true })
    await fs.mkdir(path.join(tmpDir, 'test-project'), { recursive: true })

    // Create both backup and existing session
    await writeBackup(tmpDir, 'test-project', 'session-1', [makeMessage()])
    await fs.writeFile(
      path.join(tmpDir, 'test-project', 'session-1.jsonl'),
      JSON.stringify(makeMessage()) + '\n'
    )

    const result = await Effect.runPromise(
      restoreSession('test-project', 'session-1').pipe(
        Effect.catchAll((e) => Effect.succeed({ success: false, error: String(e) }))
      )
    )
    expect(result.success).toBe(false)
  })
})
