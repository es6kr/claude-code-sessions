import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'

vi.mock('./paths.js', async () => {
  const actual = await vi.importActual('./paths.js')
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  }
})

import { loadProjectTreeData } from './session/tree.js'
import { setLogger, getLogger } from './logger.js'
import { getSessionsDir } from './paths.js'

describe('structured logging in catch blocks', () => {
  let tempDir: string
  let projectDir: string
  let debugMessages: string[]
  let originalLogger: ReturnType<typeof getLogger>
  const projectName = 'test-project'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logging-test-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)

    debugMessages = []
    originalLogger = getLogger()
    setLogger({
      debug: (msg: string) => debugMessages.push(msg),
      info: () => {},
      warn: () => {},
      error: () => {},
    })
  })

  afterEach(async () => {
    setLogger(originalLogger)
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('emits debug log when session file is unreadable', async () => {
    const sessionFile = path.join(projectDir, 'unreadable.jsonl')
    await fs.writeFile(sessionFile, '{"type":"human","message":{"content":"test"}}')
    await fs.chmod(sessionFile, 0o000)

    // Verify the file is actually unreadable
    let isUnreadable = false
    try {
      await fs.readFile(sessionFile, 'utf-8')
    } catch {
      isUnreadable = true
    }

    if (!isUnreadable) {
      // On some CI/test runners, chmod 000 may not prevent reads (e.g. root)
      // Skip this test in that case
      await fs.chmod(sessionFile, 0o644)
      return
    }

    try {
      await Effect.runPromise(loadProjectTreeData(projectName))
    } catch {
      // May fail — we only care about logging
    }

    expect(
      debugMessages.some(
        (msg) => msg.includes('Skipping unreadable file') || msg.includes('Failed to stat file')
      ),
      `Expected 'Skipping unreadable file' in debug messages, got: ${JSON.stringify(debugMessages)}`
    ).toBe(true)

    await fs.chmod(sessionFile, 0o644)
  })

  it('emits debug log for invalid agent file JSON', async () => {
    const sessionFile = path.join(projectDir, 'valid-session.jsonl')
    await fs.writeFile(
      sessionFile,
      '{"type":"human","message":{"content":"test"},"uuid":"abc-123"}\n'
    )

    const agentFile = path.join(projectDir, 'agent-abc.jsonl')
    await fs.writeFile(agentFile, 'NOT VALID JSON\n')

    try {
      await Effect.runPromise(loadProjectTreeData(projectName))
    } catch {
      // May fail
    }

    const hasAgentLog = debugMessages.some((msg) =>
      msg.includes('Skipping invalid JSON in agent file: agent-abc.jsonl')
    )
    expect(
      hasAgentLog,
      `Expected invalid agent JSON debug log, got: ${JSON.stringify(debugMessages)}`
    ).toBe(true)
  })
})
