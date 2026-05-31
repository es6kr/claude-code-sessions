import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const readdirMock = vi.fn(actual.readdir)
  return {
    ...actual,
    readdir: readdirMock,
    default: { ...actual, readdir: readdirMock },
  }
})

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

import { clearSessions, deduplicateTitleRecords, previewCleanup } from './cleanup.js'
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

function makeInvalidMessage(overrides: Record<string, unknown> = {}) {
  return makeMessage({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'Invalid API key provided' }],
    },
    ...overrides,
  })
}

function writeSession(dir: string, projectName: string, sessionId: string, messages: unknown[]) {
  const projectDir = path.join(dir, projectName)
  const content = messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
  return fs.writeFile(path.join(projectDir, `${sessionId}.jsonl`), content, 'utf-8')
}

async function readSession(dir: string, projectName: string, sessionId: string) {
  const content = await fs.readFile(path.join(dir, projectName, `${sessionId}.jsonl`), 'utf-8')
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

describe('clearSessions', () => {
  let tempDir: string
  const projectName = '-Users-test-project'

  beforeEach(async () => {
    // Restore readdir to the real implementation; individual tests may override.
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fs.readdir).mockImplementation(actual.readdir as typeof fs.readdir)

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-test-'))
    await fs.mkdir(path.join(tempDir, projectName), { recursive: true })
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  describe('cleanInvalidMessages (via clearSessions)', () => {
    it('should preserve all messages when none are invalid', async () => {
      const msg1 = makeMessage({ uuid: 'msg-1' })
      const msg2 = makeMessage({ uuid: 'msg-2', type: 'assistant' })
      await writeSession(tempDir, projectName, 'session-1', [msg1, msg2])

      const result = await Effect.runPromise(
        clearSessions({ projectName, clearEmpty: false, clearOrphanAgents: false })
      )

      expect(result.removedMessageCount).toBe(0)
      const remaining = await readSession(tempDir, projectName, 'session-1')
      expect(remaining).toHaveLength(2)
    })

    it('should remove invalid API key messages and keep valid ones', async () => {
      const valid1 = makeMessage({ uuid: 'msg-1' })
      const invalid = makeInvalidMessage({ uuid: 'msg-2', parentUuid: 'msg-1' })
      const valid2 = makeMessage({ uuid: 'msg-3', parentUuid: 'msg-2' })
      await writeSession(tempDir, projectName, 'session-1', [valid1, invalid, valid2])

      const result = await Effect.runPromise(
        clearSessions({ projectName, clearEmpty: false, clearOrphanAgents: false })
      )

      expect(result.removedMessageCount).toBe(1)
      const remaining = await readSession(tempDir, projectName, 'session-1')
      expect(remaining).toHaveLength(2)
      expect(remaining[0].uuid).toBe('msg-1')
      expect(remaining[1].uuid).toBe('msg-3')
    })

    it('should repair parentUuid chain when invalid message is removed', async () => {
      const msg1 = makeMessage({ uuid: 'msg-1' })
      const invalid = makeInvalidMessage({ uuid: 'msg-2', parentUuid: 'msg-1' })
      const msg3 = makeMessage({ uuid: 'msg-3', parentUuid: 'msg-2' })
      await writeSession(tempDir, projectName, 'session-1', [msg1, invalid, msg3])

      await Effect.runPromise(
        clearSessions({ projectName, clearEmpty: false, clearOrphanAgents: false })
      )

      const remaining = await readSession(tempDir, projectName, 'session-1')
      expect(remaining[1].parentUuid).toBe('msg-1')
    })

    it('should delete session when all messages are invalid', async () => {
      const invalid1 = makeInvalidMessage({ uuid: 'msg-1' })
      const invalid2 = makeInvalidMessage({ uuid: 'msg-2', parentUuid: 'msg-1' })
      await writeSession(tempDir, projectName, 'session-1', [invalid1, invalid2])

      const result = await Effect.runPromise(
        clearSessions({ projectName, clearOrphanAgents: false })
      )

      expect(result.removedMessageCount).toBe(2)
      expect(result.deletedCount).toBe(1)
    })

    it('should count summary-only session as 1 remaining message', async () => {
      const summary = makeMessage({ type: 'summary', uuid: 'msg-1', summary: 'Session summary' })
      await writeSession(tempDir, projectName, 'session-1', [summary])

      const result = await Effect.runPromise(
        clearSessions({ projectName, clearEmpty: false, clearOrphanAgents: false })
      )

      expect(result.removedMessageCount).toBe(0)
      expect(result.deletedCount).toBe(0)
    })
  })

  describe('clearEmpty option', () => {
    it('should delete empty session files when clearEmpty is true', async () => {
      await writeSession(tempDir, projectName, 'empty-session', [])

      const result = await Effect.runPromise(
        clearSessions({ projectName, clearInvalid: false, clearOrphanAgents: false })
      )

      expect(result.deletedCount).toBe(1)
    })

    it('should preserve empty sessions when clearEmpty is false', async () => {
      await writeSession(tempDir, projectName, 'empty-session', [])

      const result = await Effect.runPromise(
        clearSessions({
          projectName,
          clearEmpty: false,
          clearInvalid: false,
          clearOrphanAgents: false,
        })
      )

      expect(result.deletedCount).toBe(0)
    })
  })

  describe('clearInvalid option', () => {
    it('should skip invalid message cleanup when clearInvalid is false', async () => {
      const invalid = makeInvalidMessage({ uuid: 'msg-1' })
      await writeSession(tempDir, projectName, 'session-1', [invalid])

      const result = await Effect.runPromise(
        clearSessions({
          projectName,
          clearInvalid: false,
          clearEmpty: false,
          clearOrphanAgents: false,
        })
      )

      expect(result.removedMessageCount).toBe(0)
      const remaining = await readSession(tempDir, projectName, 'session-1')
      expect(remaining).toHaveLength(1)
    })
  })

  describe('deduplicateTitleRecords (via clearSessions)', () => {
    it('should remove duplicate agent-name records keeping the last', async () => {
      const agentName1 = { type: 'agent-name', agentName: 'Task Agent', sessionId: 'session-1' }
      const msg1 = makeMessage({ uuid: 'msg-1' })
      const msg2 = makeMessage({ uuid: 'msg-2', type: 'assistant', parentUuid: 'msg-1' })
      const agentName2 = { type: 'agent-name', agentName: 'Task Agent', sessionId: 'session-1' }
      await writeSession(tempDir, projectName, 'session-1', [agentName1, msg1, msg2, agentName2])

      const result = await Effect.runPromise(
        clearSessions({
          projectName,
          clearEmpty: false,
          clearInvalid: false,
          clearOrphanAgents: false,
          deduplicateTitles: true,
        })
      )

      expect(result.deduplicatedRecordCount).toBe(1)
      const remaining = await readSession(tempDir, projectName, 'session-1')
      expect(remaining).toHaveLength(3) // msg1, msg2, agentName2
      expect(remaining.filter((r: { type: string }) => r.type === 'agent-name')).toHaveLength(1)
    })

    it('should remove duplicate custom-title records keeping the last', async () => {
      const title1 = { type: 'custom-title', customTitle: 'My Session', sessionId: 'session-1' }
      const msg1 = makeMessage({ uuid: 'msg-1' })
      const title2 = { type: 'custom-title', customTitle: 'My Session', sessionId: 'session-1' }
      await writeSession(tempDir, projectName, 'session-1', [title1, msg1, title2])

      const result = await Effect.runPromise(
        clearSessions({
          projectName,
          clearEmpty: false,
          clearInvalid: false,
          clearOrphanAgents: false,
          deduplicateTitles: true,
        })
      )

      expect(result.deduplicatedRecordCount).toBe(1)
      const remaining = await readSession(tempDir, projectName, 'session-1')
      expect(remaining).toHaveLength(2) // msg1, title2
      expect(remaining.filter((r: { type: string }) => r.type === 'custom-title')).toHaveLength(1)
    })

    it('should handle both agent-name and custom-title duplicates', async () => {
      const agentName1 = { type: 'agent-name', agentName: 'Agent', sessionId: 'session-1' }
      const title1 = { type: 'custom-title', customTitle: 'Title', sessionId: 'session-1' }
      const msg1 = makeMessage({ uuid: 'msg-1' })
      const compact = {
        type: 'system',
        subtype: 'compact_boundary',
        uuid: 'compact-1',
        timestamp: new Date().toISOString(),
      }
      const agentName2 = { type: 'agent-name', agentName: 'Agent', sessionId: 'session-1' }
      const title2 = { type: 'custom-title', customTitle: 'Title', sessionId: 'session-1' }
      const msg2 = makeMessage({ uuid: 'msg-2', parentUuid: 'compact-1' })
      await writeSession(tempDir, projectName, 'session-1', [
        agentName1,
        title1,
        msg1,
        compact,
        agentName2,
        title2,
        msg2,
      ])

      const result = await Effect.runPromise(
        clearSessions({
          projectName,
          clearEmpty: false,
          clearInvalid: false,
          clearOrphanAgents: false,
          deduplicateTitles: true,
        })
      )

      expect(result.deduplicatedRecordCount).toBe(2) // removed agentName1 + title1
      const remaining = await readSession(tempDir, projectName, 'session-1')
      expect(remaining).toHaveLength(5) // msg1, compact, agentName2, title2, msg2
    })

    it('should not modify file when no duplicates exist', async () => {
      const agentName = { type: 'agent-name', agentName: 'Agent', sessionId: 'session-1' }
      const msg1 = makeMessage({ uuid: 'msg-1' })
      await writeSession(tempDir, projectName, 'session-1', [agentName, msg1])

      const result = await Effect.runPromise(
        clearSessions({
          projectName,
          clearEmpty: false,
          clearInvalid: false,
          clearOrphanAgents: false,
          deduplicateTitles: true,
        })
      )

      expect(result.deduplicatedRecordCount).toBe(0)
      const remaining = await readSession(tempDir, projectName, 'session-1')
      expect(remaining).toHaveLength(2)
    })

    it('should keep last when values differ across duplicates', async () => {
      const title1 = { type: 'custom-title', customTitle: 'Old Title', sessionId: 'session-1' }
      const msg1 = makeMessage({ uuid: 'msg-1' })
      const title2 = { type: 'custom-title', customTitle: 'New Title', sessionId: 'session-1' }
      await writeSession(tempDir, projectName, 'session-1', [title1, msg1, title2])

      await Effect.runPromise(
        clearSessions({
          projectName,
          clearEmpty: false,
          clearInvalid: false,
          clearOrphanAgents: false,
          deduplicateTitles: true,
        })
      )

      const remaining = await readSession(tempDir, projectName, 'session-1')
      expect(remaining).toHaveLength(2) // msg1, title2
      const titles = remaining.filter((r: { type: string }) => r.type === 'custom-title')
      expect(titles).toHaveLength(1)
      expect(titles[0].customTitle).toBe('New Title')
    })

    it('should be disabled by default', async () => {
      const title1 = { type: 'custom-title', customTitle: 'Title', sessionId: 'session-1' }
      const msg1 = makeMessage({ uuid: 'msg-1' })
      const title2 = { type: 'custom-title', customTitle: 'Title', sessionId: 'session-1' }
      await writeSession(tempDir, projectName, 'session-1', [title1, msg1, title2])

      const result = await Effect.runPromise(
        clearSessions({
          projectName,
          clearEmpty: false,
          clearInvalid: false,
          clearOrphanAgents: false,
        })
      )

      expect(result.deduplicatedRecordCount).toBe(0)
      const remaining = await readSession(tempDir, projectName, 'session-1')
      expect(remaining).toHaveLength(3) // all preserved
    })
  })

  describe('deduplicateTitleRecords standalone', () => {
    it('should deduplicate a single session file', async () => {
      const title1 = { type: 'custom-title', customTitle: 'Title', sessionId: 'session-1' }
      const msg1 = makeMessage({ uuid: 'msg-1' })
      const title2 = { type: 'custom-title', customTitle: 'Title', sessionId: 'session-1' }
      await writeSession(tempDir, projectName, 'session-1', [title1, msg1, title2])

      const result = await Effect.runPromise(deduplicateTitleRecords(projectName, 'session-1'))

      expect(result.removedCount).toBe(1)
      const remaining = await readSession(tempDir, projectName, 'session-1')
      expect(remaining).toHaveLength(2)
    })
  })

  describe('projectName filter', () => {
    it('should only clean targeted project', async () => {
      const otherProject = '-Users-other-project'
      await fs.mkdir(path.join(tempDir, otherProject), { recursive: true })
      await writeSession(tempDir, projectName, 'empty-1', [])
      await writeSession(tempDir, otherProject, 'empty-2', [])

      const result = await Effect.runPromise(
        clearSessions({
          projectName,
          clearInvalid: false,
          clearOrphanAgents: false,
        })
      )

      expect(result.deletedCount).toBe(1)
      const otherFiles = await fs.readdir(path.join(tempDir, otherProject))
      expect(otherFiles).toContain('empty-2.jsonl')
    })
  })

  describe('stale project handling', () => {
    const staleProjectA = '-Users-test-stale-A-nonexistent-workspace'
    const staleProjectB = '-Users-test-stale-B-nonexistent-workspace'

    async function setSessionMtimeDaysAgo(
      dir: string,
      projectFolder: string,
      sessionId: string,
      daysAgo: number
    ) {
      const filePath = path.join(dir, projectFolder, `${sessionId}.jsonl`)
      const mtime = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
      await fs.utimes(filePath, mtime, mtime)
    }

    it('does not delete project directories when clearStale is false (default)', async () => {
      await fs.mkdir(path.join(tempDir, staleProjectA), { recursive: true })
      await writeSession(tempDir, staleProjectA, 'session-1', [makeMessage({ uuid: 'm1' })])

      const result = await Effect.runPromise(
        clearSessions({
          projectName: staleProjectA,
          clearEmpty: false,
          clearInvalid: false,
          clearOrphanAgents: false,
        })
      )

      const projectStillExists = await fs
        .access(path.join(tempDir, staleProjectA))
        .then(() => true)
        .catch(() => false)
      expect(projectStillExists).toBe(true)
      expect(result.deletedStaleProjectCount ?? 0).toBe(0)
    })

    it('deletes listed stale projects when clearStale is true', async () => {
      await fs.mkdir(path.join(tempDir, staleProjectA), { recursive: true })
      await fs.mkdir(path.join(tempDir, staleProjectB), { recursive: true })
      await writeSession(tempDir, staleProjectA, 'session-1', [makeMessage({ uuid: 'a1' })])
      await writeSession(tempDir, staleProjectB, 'session-1', [makeMessage({ uuid: 'b1' })])

      const result = await Effect.runPromise(
        clearSessions({
          clearEmpty: false,
          clearInvalid: false,
          clearOrphanAgents: false,
          clearStale: true,
          staleProjects: [staleProjectA, staleProjectB],
        })
      )

      const aExists = await fs
        .access(path.join(tempDir, staleProjectA))
        .then(() => true)
        .catch(() => false)
      const bExists = await fs
        .access(path.join(tempDir, staleProjectB))
        .then(() => true)
        .catch(() => false)
      expect(aExists).toBe(false)
      expect(bExists).toBe(false)
      expect(result.deletedStaleProjectCount).toBe(2)
    })

    it('ignores staleProjects list when clearStale is false', async () => {
      await fs.mkdir(path.join(tempDir, staleProjectA), { recursive: true })
      await writeSession(tempDir, staleProjectA, 'session-1', [makeMessage({ uuid: 'a1' })])

      const result = await Effect.runPromise(
        clearSessions({
          clearEmpty: false,
          clearInvalid: false,
          clearOrphanAgents: false,
          clearStale: false,
          staleProjects: [staleProjectA],
        })
      )

      const stillExists = await fs
        .access(path.join(tempDir, staleProjectA))
        .then(() => true)
        .catch(() => false)
      expect(stillExists).toBe(true)
      expect(result.deletedStaleProjectCount ?? 0).toBe(0)
    })

    it('handles missing project directories gracefully when clearStale is true', async () => {
      const result = await Effect.runPromise(
        clearSessions({
          clearEmpty: false,
          clearInvalid: false,
          clearOrphanAgents: false,
          clearStale: true,
          staleProjects: ['ghost-project-that-does-not-exist'],
        })
      )

      expect(result.deletedStaleProjectCount).toBe(1)
    })

    it('previewCleanup does NOT mark recent sessions as stale even when folder missing', async () => {
      await writeSession(tempDir, projectName, 'recent-session', [makeMessage({ uuid: 'r1' })])
      await setSessionMtimeDaysAgo(tempDir, projectName, 'recent-session', 5)

      const result = await Effect.runPromise(previewCleanup(projectName))

      expect(result).toHaveLength(1)
      expect(result[0].isStale).toBe(false)
    })

    it('previewCleanup marks old sessions as stale when folder missing', async () => {
      await writeSession(tempDir, projectName, 'old-session', [makeMessage({ uuid: 'o1' })])
      await setSessionMtimeDaysAgo(tempDir, projectName, 'old-session', 60)

      const result = await Effect.runPromise(previewCleanup(projectName))

      expect(result).toHaveLength(1)
      expect(result[0].isStale).toBe(true)
    })

    it('rejects path traversal entries (..) when clearStale is true', async () => {
      // Create a sibling directory OUTSIDE the sessions dir that must NOT be deleted
      const parentDir = path.resolve(tempDir, '..')
      const siblingName = `traversal-target-${Date.now()}`
      const siblingPath = path.join(parentDir, siblingName)
      await fs.mkdir(siblingPath, { recursive: true })

      try {
        const result = await Effect.runPromise(
          clearSessions({
            clearEmpty: false,
            clearInvalid: false,
            clearOrphanAgents: false,
            clearStale: true,
            staleProjects: [`../${siblingName}`],
          })
        )

        // Sibling must still exist — traversal entry must be rejected
        const siblingStillExists = await fs
          .access(siblingPath)
          .then(() => true)
          .catch(() => false)
        expect(siblingStillExists).toBe(true)
        // The traversal entry must NOT be counted as deleted
        expect(result.deletedStaleProjectCount ?? 0).toBe(0)
      } finally {
        await fs.rm(siblingPath, { recursive: true, force: true })
      }
    })

    it('rejects absolute path entries when clearStale is true', async () => {
      const parentDir = path.resolve(tempDir, '..')
      const absoluteName = `absolute-target-${Date.now()}`
      const absolutePath = path.join(parentDir, absoluteName)
      await fs.mkdir(absolutePath, { recursive: true })

      try {
        const result = await Effect.runPromise(
          clearSessions({
            clearEmpty: false,
            clearInvalid: false,
            clearOrphanAgents: false,
            clearStale: true,
            staleProjects: [absolutePath],
          })
        )

        const absoluteStillExists = await fs
          .access(absolutePath)
          .then(() => true)
          .catch(() => false)
        expect(absoluteStillExists).toBe(true)
        expect(result.deletedStaleProjectCount ?? 0).toBe(0)
      } finally {
        await fs.rm(absolutePath, { recursive: true, force: true })
      }
    })

    it('rejects entries containing path separators when clearStale is true', async () => {
      // Even if the entry stays within tempDir, embedded separators bypass the
      // contract of "encoded project name" (a single directory component).
      await fs.mkdir(path.join(tempDir, 'nested', 'inside'), { recursive: true })
      await writeSession(tempDir, path.join('nested', 'inside'), 'session-1', [
        makeMessage({ uuid: 'n1' }),
      ])

      const result = await Effect.runPromise(
        clearSessions({
          clearEmpty: false,
          clearInvalid: false,
          clearOrphanAgents: false,
          clearStale: true,
          staleProjects: ['nested/inside'],
        })
      )

      const nestedStillExists = await fs
        .access(path.join(tempDir, 'nested', 'inside'))
        .then(() => true)
        .catch(() => false)
      expect(nestedStillExists).toBe(true)
      expect(result.deletedStaleProjectCount ?? 0).toBe(0)
    })
  })

  // Issue #103 — Guard readdir against missing project folders (TOCTOU).
  // Encoded project folders can disappear between listProjects and any
  // subsequent per-project readdir (cross-PC sync, manual deletion, etc).
  // Without catchAll, one ENOENT aborts the entire Effect.all run.
  describe('readdir TOCTOU safety (Issue #103)', () => {
    function makeEnoent(p: string): NodeJS.ErrnoException {
      const err = new Error(
        `ENOENT: no such file or directory, scandir '${p}'`
      ) as NodeJS.ErrnoException
      err.code = 'ENOENT'
      return err
    }

    it('T1: clearSessions Step 1 skips a project whose folder vanishes before readdir', async () => {
      const projA = '-Users-test-toctou-step1-A'
      const projB = '-Users-test-toctou-step1-B'
      await fs.mkdir(path.join(tempDir, projA), { recursive: true })
      await fs.mkdir(path.join(tempDir, projB), { recursive: true })
      await writeSession(tempDir, projA, 'a1', [makeInvalidMessage({ uuid: 'a1' })])
      await writeSession(tempDir, projB, 'b1', [makeInvalidMessage({ uuid: 'b1' })])

      // Override readdir to throw ENOENT only for projA, simulating mid-operation deletion.
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      vi.mocked(fs.readdir).mockImplementation(((p: unknown, opts: unknown) => {
        if (typeof p === 'string' && p.endsWith(projA)) {
          return Promise.reject(makeEnoent(p))
        }
        return (actual.readdir as typeof fs.readdir)(
          p as Parameters<typeof fs.readdir>[0],
          opts as Parameters<typeof fs.readdir>[1]
        )
      }) as typeof fs.readdir)

      // After fix: projA silently skipped, projB processed normally.
      const result = await Effect.runPromise(
        clearSessions({ clearInvalid: true, clearEmpty: false, clearOrphanAgents: false })
      )

      expect(result.removedMessageCount).toBeGreaterThan(0)
    })

    it('T2: clearSessions Step 6 skips a project whose folder vanishes between Step 1 and Step 6', async () => {
      const projA = '-Users-test-toctou-step6-vanish'
      const projB = '-Users-test-toctou-step6-keep'
      await fs.mkdir(path.join(tempDir, projA), { recursive: true })
      await fs.mkdir(path.join(tempDir, projB), { recursive: true })
      await writeSession(tempDir, projA, 'a1', [makeMessage({ uuid: 'a1' })])
      await writeSession(tempDir, projB, 'b1', [makeMessage({ uuid: 'b1' })])

      // First readdir(projA) succeeds (Step 1 cleanInvalid), subsequent calls fail (Step 6 dedup).
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      let projACallCount = 0
      vi.mocked(fs.readdir).mockImplementation(((p: unknown, opts: unknown) => {
        if (typeof p === 'string' && p.endsWith(projA)) {
          projACallCount++
          if (projACallCount > 1) {
            return Promise.reject(makeEnoent(p))
          }
        }
        return (actual.readdir as typeof fs.readdir)(
          p as Parameters<typeof fs.readdir>[0],
          opts as Parameters<typeof fs.readdir>[1]
        )
      }) as typeof fs.readdir)

      // After fix: Step 6 catches ENOENT on projA, completes normally.
      await expect(
        Effect.runPromise(
          clearSessions({
            clearInvalid: true,
            clearEmpty: false,
            clearOrphanAgents: false,
            deduplicateTitles: true,
          })
        )
      ).resolves.toBeDefined()
    })

    // T3 (getMostRecentSessionMtime readdir failure) was investigated but proved
    // unreliable as a unit test because previewCleanup's chain calls readdir on the
    // same projectPath through multiple unwrapped sites (crud-streaming, crud, agents,
    // todos). The fix itself (narrow `.catch` on cleanup.ts:37) is one line and
    // covered by code review. Broader readdir hardening across the previewCleanup
    // chain is tracked as a follow-up — see PR description "Follow-up" section.

    it('T6: non-ENOENT readdir error (EACCES) PROPAGATES from Step 1 (does not silently skip)', async () => {
      const projA = '-Users-test-eacces-step1'
      await fs.mkdir(path.join(tempDir, projA), { recursive: true })
      await writeSession(tempDir, projA, 'a1', [makeInvalidMessage({ uuid: 'a1' })])

      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      vi.mocked(fs.readdir).mockImplementation(((p: unknown, opts: unknown) => {
        if (typeof p === 'string' && p.endsWith(projA)) {
          const err = new Error(
            `EACCES: permission denied, scandir '${p}'`
          ) as NodeJS.ErrnoException
          err.code = 'EACCES'
          return Promise.reject(err)
        }
        return (actual.readdir as typeof fs.readdir)(
          p as Parameters<typeof fs.readdir>[0],
          opts as Parameters<typeof fs.readdir>[1]
        )
      }) as typeof fs.readdir)

      // After narrow-catch fix: EACCES is NOT swallowed → clearSessions fails loudly
      await expect(
        Effect.runPromise(
          clearSessions({ clearInvalid: true, clearEmpty: false, clearOrphanAgents: false })
        )
      ).rejects.toThrow()
    })

    it('T8: clearSessions Step 2 (listSessions) skips a project whose folder vanishes', async () => {
      const projA = '-Users-test-toctou-step2-vanish'
      const projB = '-Users-test-toctou-step2-keep'
      await fs.mkdir(path.join(tempDir, projA), { recursive: true })
      await fs.mkdir(path.join(tempDir, projB), { recursive: true })
      // projB has an empty session so clearEmpty has something to do
      await writeSession(tempDir, projB, 'b-empty', [])

      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      vi.mocked(fs.readdir).mockImplementation(((p: unknown, opts: unknown) => {
        if (typeof p === 'string' && p.endsWith(projA)) {
          return Promise.reject(makeEnoent(p))
        }
        return (actual.readdir as typeof fs.readdir)(
          p as Parameters<typeof fs.readdir>[0],
          opts as Parameters<typeof fs.readdir>[1]
        )
      }) as typeof fs.readdir)

      // After fix: projA Step 2 catchAll → projB processed normally
      await expect(
        Effect.runPromise(
          clearSessions({
            clearInvalid: false,
            clearEmpty: true,
            clearOrphanAgents: false,
          })
        )
      ).resolves.toBeDefined()
    })

    it('T9: clearSessions Step 4 (deleteOrphanAgents) skips a project whose folder vanishes', async () => {
      const projA = '-Users-test-toctou-step4-vanish'
      const projB = '-Users-test-toctou-step4-keep'
      await fs.mkdir(path.join(tempDir, projA), { recursive: true })
      await fs.mkdir(path.join(tempDir, projB), { recursive: true })
      await writeSession(tempDir, projB, 'b1', [makeMessage({ uuid: 'b1' })])

      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      vi.mocked(fs.readdir).mockImplementation(((p: unknown, opts: unknown) => {
        if (typeof p === 'string' && p.endsWith(projA)) {
          return Promise.reject(makeEnoent(p))
        }
        return (actual.readdir as typeof fs.readdir)(
          p as Parameters<typeof fs.readdir>[0],
          opts as Parameters<typeof fs.readdir>[1]
        )
      }) as typeof fs.readdir)

      // After fix: projA Step 4 catchAll → projB completes
      await expect(
        Effect.runPromise(
          clearSessions({
            clearInvalid: false,
            clearEmpty: false,
            clearOrphanAgents: true,
          })
        )
      ).resolves.toBeDefined()
    })

    it('T10: clearSessions reports skippedProjectCount (unique per project across steps)', async () => {
      const projA = '-Users-test-skipped-A'
      const projB = '-Users-test-skipped-B'
      const projC = '-Users-test-skipped-C-healthy'
      await fs.mkdir(path.join(tempDir, projA), { recursive: true })
      await fs.mkdir(path.join(tempDir, projB), { recursive: true })
      await fs.mkdir(path.join(tempDir, projC), { recursive: true })
      await writeSession(tempDir, projC, 'c1', [makeMessage({ uuid: 'c1' })])

      // Strategy: let listProjects's per-entry readdir succeed (so projA/B reach
      // targetProjects), then fail Step 1 + Step 6 readdir(projA/B) to trigger
      // cleanup.ts's skippedProjects tracking. Use call-count per path: first
      // call per project succeeds (listProjects), subsequent fail.
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      const callsPerProject: Record<string, number> = { [projA]: 0, [projB]: 0 }
      vi.mocked(fs.readdir).mockImplementation(((p: unknown, opts: unknown) => {
        if (typeof p === 'string') {
          for (const key of [projA, projB]) {
            if (p.endsWith(key)) {
              callsPerProject[key]++
              // 1st call = listProjects per-entry (success); 2nd+ = Step 1/6 (fail)
              if (callsPerProject[key] > 1) {
                return Promise.reject(makeEnoent(p))
              }
            }
          }
        }
        return (actual.readdir as typeof fs.readdir)(
          p as Parameters<typeof fs.readdir>[0],
          opts as Parameters<typeof fs.readdir>[1]
        )
      }) as typeof fs.readdir)

      const result = await Effect.runPromise(
        clearSessions({
          clearInvalid: true,
          clearEmpty: false,
          clearOrphanAgents: false,
          deduplicateTitles: true,
        })
      )

      // Both projA + projB are skipped across Step 1 + Step 6.
      // skippedProjectCount must be 2 (unique), not 4 (steps × projects).
      expect(result.skippedProjectCount).toBe(2)
    })
  })
})
