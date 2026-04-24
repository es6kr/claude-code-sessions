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

import { clearSessions, deduplicateTitleRecords } from './cleanup.js'
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
})
