import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'

// Mock the paths module to use temp directory
vi.mock('./paths.js', async () => {
  const actual = await vi.importActual('./paths.js')
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  }
})

import { findOrphanAgents, findLinkedAgents, deleteOrphanAgents } from './agents.js'
import { getSessionsDir } from './paths.js'

describe('findOrphanAgents', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-david-test-project'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-agent-test-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should detect orphan agent in project root when parent session is missing', async () => {
    // Create an agent file that references a non-existent session
    const orphanSessionId = 'non-existent-session-id'
    const agentHeader = {
      sessionId: orphanSessionId,
      agentId: 'a03969f',
      type: 'user',
      message: { role: 'user', content: 'Warmup' },
    }

    await fs.writeFile(
      path.join(projectDir, 'agent-a03969f.jsonl'),
      JSON.stringify(agentHeader) + '\n'
    )

    const orphans = await Effect.runPromise(findOrphanAgents(projectName))

    expect(orphans).toHaveLength(1)
    expect(orphans[0].agentId).toBe('agent-a03969f')
    expect(orphans[0].sessionId).toBe(orphanSessionId)
  })

  it('should NOT detect agent as orphan when parent session exists', async () => {
    const sessionId = 'existing-session-id'

    // Create session file
    const sessionMessage = {
      type: 'user',
      uuid: 'msg-1',
      timestamp: '2025-01-01T00:00:00.000Z',
      message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    }
    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      JSON.stringify(sessionMessage) + '\n'
    )

    // Create agent file that references the existing session
    const agentHeader = {
      sessionId: sessionId,
      agentId: 'a12345f',
      type: 'user',
      message: { role: 'user', content: 'Warmup' },
    }
    await fs.writeFile(
      path.join(projectDir, 'agent-a12345f.jsonl'),
      JSON.stringify(agentHeader) + '\n'
    )

    const orphans = await Effect.runPromise(findOrphanAgents(projectName))

    expect(orphans).toHaveLength(0)
  })

  it('should detect orphan agent in session subagents folder when parent session is deleted', async () => {
    // Session folder exists but the session file (.jsonl) is deleted
    const deletedSessionId = 'fa958d3f-4102-444a-a5e8-0c10179bd4a2'
    const sessionFolderPath = path.join(projectDir, deletedSessionId)
    const subagentsPath = path.join(sessionFolderPath, 'subagents')

    await fs.mkdir(subagentsPath, { recursive: true })

    // Create a subagent file inside the session's subagents folder
    const subagentHeader = {
      sessionId: deletedSessionId,
      agentId: 'a910d85',
      type: 'user',
      message: { role: 'user', content: 'Warmup' },
    }
    await fs.writeFile(
      path.join(subagentsPath, 'agent-a910d85.jsonl'),
      JSON.stringify(subagentHeader) + '\n'
    )

    // Note: No session file exists (${deletedSessionId}.jsonl)

    const orphans = await Effect.runPromise(findOrphanAgents(projectName))

    expect(orphans).toHaveLength(1)
    expect(orphans[0].agentId).toBe('agent-a910d85')
    expect(orphans[0].sessionId).toBe(deletedSessionId)
  })

  it('should NOT detect subagent as orphan when parent session file exists', async () => {
    const sessionId = 'valid-session-with-subagents'
    const sessionFolderPath = path.join(projectDir, sessionId)
    const subagentsPath = path.join(sessionFolderPath, 'subagents')

    await fs.mkdir(subagentsPath, { recursive: true })

    // Create session file
    const sessionMessage = {
      type: 'user',
      uuid: 'msg-1',
      timestamp: '2025-01-01T00:00:00.000Z',
      message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    }
    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      JSON.stringify(sessionMessage) + '\n'
    )

    // Create subagent file
    const subagentHeader = {
      sessionId: sessionId,
      agentId: 'a567890',
      type: 'user',
      message: { role: 'user', content: 'Warmup' },
    }
    await fs.writeFile(
      path.join(subagentsPath, 'agent-a567890.jsonl'),
      JSON.stringify(subagentHeader) + '\n'
    )

    const orphans = await Effect.runPromise(findOrphanAgents(projectName))

    expect(orphans).toHaveLength(0)
  })

  it('should detect multiple orphan agents from different locations', async () => {
    // Case 1: Orphan in project root
    const orphanAgentHeader1 = {
      sessionId: 'missing-session-1',
      agentId: 'aaaa111',
      type: 'user',
      message: { role: 'user', content: 'Warmup' },
    }
    await fs.writeFile(
      path.join(projectDir, 'agent-aaaa111.jsonl'),
      JSON.stringify(orphanAgentHeader1) + '\n'
    )

    // Case 2: Orphan in subagents folder (session folder exists but no .jsonl file)
    const orphanSessionId = 'orphan-session-folder'
    const orphanSubagentsPath = path.join(projectDir, orphanSessionId, 'subagents')
    await fs.mkdir(orphanSubagentsPath, { recursive: true })

    const orphanAgentHeader2 = {
      sessionId: orphanSessionId,
      agentId: 'bbbb222',
      type: 'user',
      message: { role: 'user', content: 'Warmup' },
    }
    await fs.writeFile(
      path.join(orphanSubagentsPath, 'agent-bbbb222.jsonl'),
      JSON.stringify(orphanAgentHeader2) + '\n'
    )

    // Case 3: Valid agent (should NOT be detected)
    const validSessionId = 'valid-session'
    const validSessionMessage = {
      type: 'user',
      uuid: 'msg-1',
      timestamp: '2025-01-01T00:00:00.000Z',
      message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    }
    await fs.writeFile(
      path.join(projectDir, `${validSessionId}.jsonl`),
      JSON.stringify(validSessionMessage) + '\n'
    )

    const validAgentHeader = {
      sessionId: validSessionId,
      agentId: 'cccc333',
      type: 'user',
      message: { role: 'user', content: 'Warmup' },
    }
    await fs.writeFile(
      path.join(projectDir, 'agent-cccc333.jsonl'),
      JSON.stringify(validAgentHeader) + '\n'
    )

    const orphans = await Effect.runPromise(findOrphanAgents(projectName))

    expect(orphans).toHaveLength(2)
    const orphanIds = orphans.map((o) => o.agentId).sort()
    expect(orphanIds).toEqual(['agent-aaaa111', 'agent-bbbb222'])
  })
})

describe('deleteOrphanAgents', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-david-test-delete'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-agent-delete-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should permanently delete warmup-only orphan agents (≤2 lines)', async () => {
    // Create orphan agent with only 1 line (warmup only)
    const orphanHeader = {
      sessionId: 'deleted-session',
      agentId: 'orphan1',
      type: 'user',
      message: { role: 'user', content: 'Warmup' },
    }
    await fs.writeFile(
      path.join(projectDir, 'agent-orphan1.jsonl'),
      JSON.stringify(orphanHeader) + '\n'
    )

    const result = await Effect.runPromise(deleteOrphanAgents(projectName))

    expect(result.success).toBe(true)
    expect(result.count).toBe(1)
    expect(result.deletedAgents).toContain('agent-orphan1')
    expect(result.deletedCount).toBe(1)
    expect(result.backedUpCount).toBe(0)

    // Original file should be gone
    const originalExists = await fs
      .access(path.join(projectDir, 'agent-orphan1.jsonl'))
      .then(() => true)
      .catch(() => false)
    expect(originalExists).toBe(false)

    // Backup should NOT exist (permanently deleted)
    const backupExists = await fs
      .access(path.join(projectDir, '.bak', 'agent-orphan1.jsonl'))
      .then(() => true)
      .catch(() => false)
    expect(backupExists).toBe(false)
  })

  it('should backup orphan agents with >2 lines to .bak folder', async () => {
    // Create orphan agent with 3 lines (has actual data)
    const lines = [
      JSON.stringify({
        sessionId: 'deleted-session',
        agentId: 'orphan2',
        type: 'user',
        message: { role: 'user', content: 'Warmup' },
      }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'Ready' } }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'Do something' } }),
    ]
    await fs.writeFile(path.join(projectDir, 'agent-orphan2.jsonl'), lines.join('\n') + '\n')

    const result = await Effect.runPromise(deleteOrphanAgents(projectName))

    expect(result.success).toBe(true)
    expect(result.count).toBe(1)
    expect(result.backedUpAgents).toContain('agent-orphan2')
    expect(result.backedUpCount).toBe(1)
    expect(result.deletedCount).toBe(0)

    // Original file should be gone
    const originalExists = await fs
      .access(path.join(projectDir, 'agent-orphan2.jsonl'))
      .then(() => true)
      .catch(() => false)
    expect(originalExists).toBe(false)

    // Backup should exist
    const backupExists = await fs
      .access(path.join(projectDir, '.bak', 'agent-orphan2.jsonl'))
      .then(() => true)
      .catch(() => false)
    expect(backupExists).toBe(true)
  })

  it('should delete orphan agents from subagents folders', async () => {
    // Create orphan in subagents folder
    const orphanSessionId = 'orphan-session-folder'
    const subagentsPath = path.join(projectDir, orphanSessionId, 'subagents')
    await fs.mkdir(subagentsPath, { recursive: true })

    const orphanHeader = {
      sessionId: orphanSessionId,
      agentId: 'suborphan1',
      type: 'user',
      message: { role: 'user', content: 'Warmup' },
    }
    await fs.writeFile(
      path.join(subagentsPath, 'agent-suborphan1.jsonl'),
      JSON.stringify(orphanHeader) + '\n'
    )

    const result = await Effect.runPromise(deleteOrphanAgents(projectName))

    expect(result.success).toBe(true)
    expect(result.count).toBe(1)
    expect(result.deletedAgents).toContain('agent-suborphan1')
  })

  it('should clean up empty subagents and session folders after deletion', async () => {
    // Create orphan in subagents folder
    const orphanSessionId = 'orphan-session-to-cleanup'
    const subagentsPath = path.join(projectDir, orphanSessionId, 'subagents')
    await fs.mkdir(subagentsPath, { recursive: true })

    const orphanHeader = {
      sessionId: orphanSessionId,
      agentId: 'cleanup-agent',
      type: 'user',
      message: { role: 'user', content: 'Warmup' },
    }
    await fs.writeFile(
      path.join(subagentsPath, 'agent-cleanup-agent.jsonl'),
      JSON.stringify(orphanHeader) + '\n'
    )

    // Verify folders exist before deletion
    const subagentsDirExists = await fs
      .access(subagentsPath)
      .then(() => true)
      .catch(() => false)
    expect(subagentsDirExists).toBe(true)

    const result = await Effect.runPromise(deleteOrphanAgents(projectName))

    expect(result.success).toBe(true)
    expect(result.deletedAgents).toContain('agent-cleanup-agent')
    expect(result.cleanedFolderCount).toBeGreaterThanOrEqual(1)

    // Subagents folder should be gone
    const subagentsGone = await fs
      .access(subagentsPath)
      .then(() => false)
      .catch(() => true)
    expect(subagentsGone).toBe(true)

    // Session folder should also be gone (was empty after subagents removed)
    const sessionFolderGone = await fs
      .access(path.join(projectDir, orphanSessionId))
      .then(() => false)
      .catch(() => true)
    expect(sessionFolderGone).toBe(true)
  })
})

describe('findLinkedAgents', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-david-test-linked'

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-agent-linked-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should find agents linked to a specific session', async () => {
    const sessionId = 'test-session'

    // Create session file
    await fs.writeFile(
      path.join(projectDir, `${sessionId}.jsonl`),
      JSON.stringify({ type: 'user', uuid: 'msg-1' }) + '\n'
    )

    // Create linked agent
    const linkedAgentHeader = {
      sessionId: sessionId,
      agentId: 'linked1',
    }
    await fs.writeFile(
      path.join(projectDir, 'agent-linked1.jsonl'),
      JSON.stringify(linkedAgentHeader) + '\n'
    )

    // Create unlinked agent
    const unlinkedAgentHeader = {
      sessionId: 'other-session',
      agentId: 'unlinked1',
    }
    await fs.writeFile(
      path.join(projectDir, 'agent-unlinked1.jsonl'),
      JSON.stringify(unlinkedAgentHeader) + '\n'
    )

    const linked = await Effect.runPromise(findLinkedAgents(projectName, sessionId))

    expect(linked).toHaveLength(1)
    expect(linked[0]).toBe('agent-linked1')
  })
})
