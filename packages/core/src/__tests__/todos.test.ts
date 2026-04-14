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
    getTodosDir: vi.fn(),
    getSessionsDir: vi.fn(),
  }
})

import {
  findLinkedTodos,
  sessionHasTodos,
  deleteLinkedTodos,
  findOrphanTodos,
  deleteOrphanTodos,
} from '../todos.js'
import { getTodosDir, getSessionsDir } from '../paths.js'

describe('todos', () => {
  let tempDir: string
  let todosDir: string
  let sessionsDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-todos-test-'))
    todosDir = path.join(tempDir, 'todos')
    sessionsDir = path.join(tempDir, 'projects')
    await fs.mkdir(todosDir, { recursive: true })
    await fs.mkdir(sessionsDir, { recursive: true })
    vi.mocked(getTodosDir).mockReturnValue(todosDir)
    vi.mocked(getSessionsDir).mockReturnValue(sessionsDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  describe('findLinkedTodos', () => {
    it('should return empty result when todos directory does not exist', async () => {
      vi.mocked(getTodosDir).mockReturnValue(path.join(tempDir, 'nonexistent'))

      const result = await Effect.runPromise(findLinkedTodos('session-1'))

      expect(result.sessionId).toBe('session-1')
      expect(result.sessionTodos).toEqual([])
      expect(result.agentTodos).toEqual([])
      expect(result.hasTodos).toBe(false)
    })

    it('should find session todos from json file', async () => {
      const todos = [
        { content: 'Fix bug', status: 'pending' },
        { content: 'Write tests', status: 'completed' },
      ]
      await fs.writeFile(path.join(todosDir, 'session-1.json'), JSON.stringify(todos))

      const result = await Effect.runPromise(findLinkedTodos('session-1'))

      expect(result.sessionId).toBe('session-1')
      expect(result.sessionTodos).toEqual(todos)
      expect(result.hasTodos).toBe(true)
    })

    it('should find agent todos by scanning directory', async () => {
      const agentTodos = [{ content: 'Agent task', status: 'in_progress' }]
      await fs.writeFile(
        path.join(todosDir, 'session-1-agent-abc123.json'),
        JSON.stringify(agentTodos)
      )

      const result = await Effect.runPromise(findLinkedTodos('session-1'))

      expect(result.agentTodos).toHaveLength(1)
      expect(result.agentTodos[0].agentId).toBe('agent-abc123')
      expect(result.agentTodos[0].todos).toEqual(agentTodos)
      expect(result.hasTodos).toBe(true)
    })

    it('should merge provided agentIds with discovered agents', async () => {
      const agentTodos = [{ content: 'Task A', status: 'pending' }]
      // File exists for agent discovered by scan
      await fs.writeFile(
        path.join(todosDir, 'session-1-agent-abc123.json'),
        JSON.stringify(agentTodos)
      )
      // File for agent passed via parameter
      await fs.writeFile(
        path.join(todosDir, 'session-1-agent-def456.json'),
        JSON.stringify([{ content: 'Task B', status: 'pending' }])
      )

      const result = await Effect.runPromise(findLinkedTodos('session-1', ['agent-def456']))

      expect(result.agentTodos).toHaveLength(2)
      const agentIds = result.agentTodos.map((a) => a.agentId).sort()
      expect(agentIds).toEqual(['agent-abc123', 'agent-def456'])
    })

    it('should handle invalid JSON gracefully', async () => {
      await fs.writeFile(path.join(todosDir, 'session-1.json'), 'not valid json')

      const result = await Effect.runPromise(findLinkedTodos('session-1'))

      expect(result.sessionTodos).toEqual([])
      expect(result.hasTodos).toBe(false)
    })

    it('should skip agent files with empty todos array', async () => {
      await fs.writeFile(path.join(todosDir, 'session-1-agent-abc123.json'), JSON.stringify([]))

      const result = await Effect.runPromise(findLinkedTodos('session-1'))

      expect(result.agentTodos).toEqual([])
      expect(result.hasTodos).toBe(false)
    })
  })

  describe('sessionHasTodos', () => {
    it('should return false when todos directory does not exist', async () => {
      vi.mocked(getTodosDir).mockReturnValue(path.join(tempDir, 'nonexistent'))

      const result = await Effect.runPromise(sessionHasTodos('session-1'))

      expect(result).toBe(false)
    })

    it('should return true when session has todos', async () => {
      await fs.writeFile(
        path.join(todosDir, 'session-1.json'),
        JSON.stringify([{ content: 'Task', status: 'pending' }])
      )

      const result = await Effect.runPromise(sessionHasTodos('session-1'))

      expect(result).toBe(true)
    })

    it('should return true when agent has todos', async () => {
      await fs.writeFile(
        path.join(todosDir, 'session-1-agent-abc123.json'),
        JSON.stringify([{ content: 'Agent task', status: 'pending' }])
      )

      const result = await Effect.runPromise(sessionHasTodos('session-1'))

      expect(result).toBe(true)
    })

    it('should return false when session todo file has empty array', async () => {
      await fs.writeFile(path.join(todosDir, 'session-1.json'), JSON.stringify([]))

      const result = await Effect.runPromise(sessionHasTodos('session-1'))

      expect(result).toBe(false)
    })

    it('should return false when session todo file has invalid JSON', async () => {
      await fs.writeFile(path.join(todosDir, 'session-1.json'), '{broken')

      const result = await Effect.runPromise(sessionHasTodos('session-1'))

      expect(result).toBe(false)
    })
  })

  describe('deleteLinkedTodos', () => {
    it('should return 0 when todos directory does not exist', async () => {
      vi.mocked(getTodosDir).mockReturnValue(path.join(tempDir, 'nonexistent'))

      const result = await Effect.runPromise(deleteLinkedTodos('session-1', []))

      expect(result.deletedCount).toBe(0)
    })

    it('should move session todo file to .bak', async () => {
      await fs.writeFile(
        path.join(todosDir, 'session-1.json'),
        JSON.stringify([{ content: 'Task', status: 'pending' }])
      )

      const result = await Effect.runPromise(deleteLinkedTodos('session-1', []))

      expect(result.deletedCount).toBe(1)
      // Original file should be gone
      await expect(fs.access(path.join(todosDir, 'session-1.json'))).rejects.toThrow()
      // Backup should exist
      await expect(
        fs.access(path.join(todosDir, '.bak', 'session-1.json'))
      ).resolves.toBeUndefined()
    })

    it('should move agent todo files to .bak', async () => {
      await fs.writeFile(
        path.join(todosDir, 'session-1-agent-abc123.json'),
        JSON.stringify([{ content: 'Agent task', status: 'pending' }])
      )

      const result = await Effect.runPromise(deleteLinkedTodos('session-1', ['agent-abc123']))

      expect(result.deletedCount).toBe(1)
      await expect(
        fs.access(path.join(todosDir, '.bak', 'session-1-agent-abc123.json'))
      ).resolves.toBeUndefined()
    })

    it('should handle both session and agent todos', async () => {
      await fs.writeFile(
        path.join(todosDir, 'session-1.json'),
        JSON.stringify([{ content: 'Task', status: 'pending' }])
      )
      await fs.writeFile(
        path.join(todosDir, 'session-1-agent-abc123.json'),
        JSON.stringify([{ content: 'Agent task', status: 'pending' }])
      )

      const result = await Effect.runPromise(deleteLinkedTodos('session-1', ['agent-abc123']))

      expect(result.deletedCount).toBe(2)
    })
  })

  describe('findOrphanTodos', () => {
    it('should return empty when no todo files exist', async () => {
      const result = await Effect.runPromise(findOrphanTodos())

      expect(result).toEqual([])
    })

    it('should return empty when all todos have matching sessions', async () => {
      const sessionId = 'aabb0011-2233-4455-6677-889900aabbcc'
      // Create a project with a session
      const projectDir = path.join(sessionsDir, 'test-project')
      await fs.mkdir(projectDir, { recursive: true })
      await fs.writeFile(path.join(projectDir, `${sessionId}.jsonl`), '{"type":"user"}\n')

      // Create matching todo
      await fs.writeFile(
        path.join(todosDir, `${sessionId}.json`),
        JSON.stringify([{ content: 'Task', status: 'pending' }])
      )

      const result = await Effect.runPromise(findOrphanTodos())

      expect(result).toEqual([])
    })

    it('should find orphan todo files', async () => {
      // Create a project with a valid session
      const projectDir = path.join(sessionsDir, 'test-project')
      await fs.mkdir(projectDir, { recursive: true })
      await fs.writeFile(
        path.join(projectDir, 'aabb0011-2233-4455-6677-889900aabbcc.jsonl'),
        '{"type":"user"}\n'
      )

      // Create todo for non-existent session (hex-only ID to match regex)
      await fs.writeFile(
        path.join(todosDir, 'dead0000-1111-2222-3333-444455556666.json'),
        JSON.stringify([{ content: 'Orphan task', status: 'pending' }])
      )

      const result = await Effect.runPromise(findOrphanTodos())

      expect(result).toContain('dead0000-1111-2222-3333-444455556666.json')
    })

    it('should detect orphan agent todo files', async () => {
      // Create a project with a valid session
      const projectDir = path.join(sessionsDir, 'test-project')
      await fs.mkdir(projectDir, { recursive: true })
      await fs.writeFile(
        path.join(projectDir, 'aabb0011-2233-4455-6677-889900aabbcc.jsonl'),
        '{"type":"user"}\n'
      )

      // Agent todo for non-existent session (hex-only IDs)
      await fs.writeFile(
        path.join(todosDir, 'dead0000-1111-2222-3333-444455556666-agent-abc123.json'),
        JSON.stringify([{ content: 'Orphan agent task', status: 'pending' }])
      )

      const result = await Effect.runPromise(findOrphanTodos())

      expect(result).toContain('dead0000-1111-2222-3333-444455556666-agent-abc123.json')
    })

    it('should skip agent- prefixed session files', async () => {
      // Create project with agent file (should not count as valid session)
      const projectDir = path.join(sessionsDir, 'test-project')
      await fs.mkdir(projectDir, { recursive: true })
      await fs.writeFile(path.join(projectDir, 'agent-abc123.jsonl'), '{"type":"assistant"}\n')

      // Todo matching the agent file name — still orphan because agent files are not sessions
      await fs.writeFile(
        path.join(todosDir, 'agent-abc123.json'),
        JSON.stringify([{ content: 'Task', status: 'pending' }])
      )

      // agent-abc123 doesn't match the regex pattern ^([a-f0-9-]+)
      // so it won't be detected as orphan either — it's simply ignored
      const result = await Effect.runPromise(findOrphanTodos())
      // The regex requires hex chars and dashes, "agent-abc123" has letters outside hex range
      // so this file won't match the orphan detection pattern
      expect(result).toEqual([])
    })
  })

  describe('deleteOrphanTodos', () => {
    it('should return 0 when no orphans exist', async () => {
      const result = await Effect.runPromise(deleteOrphanTodos())

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(0)
    })

    it('should move orphan todo files to .bak', async () => {
      // No sessions exist, so any todo is orphan
      await fs.writeFile(
        path.join(todosDir, 'aabbccdd-1122-3344-5566-778899aabbcc.json'),
        JSON.stringify([{ content: 'Orphan', status: 'pending' }])
      )

      const result = await Effect.runPromise(deleteOrphanTodos())

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(1)
      // Original gone
      await expect(
        fs.access(path.join(todosDir, 'aabbccdd-1122-3344-5566-778899aabbcc.json'))
      ).rejects.toThrow()
      // Backup exists
      await expect(
        fs.access(path.join(todosDir, '.bak', 'aabbccdd-1122-3344-5566-778899aabbcc.json'))
      ).resolves.toBeUndefined()
    })
  })
})
