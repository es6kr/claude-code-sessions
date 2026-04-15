import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'

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

    it('should read session todos from matching JSON file', async () => {
      const todos = [
        { content: 'Fix unit tests', status: 'pending' },
        { content: 'Update docs', status: 'completed' },
      ]
      await fs.writeFile(path.join(todosDir, 'session-1.json'), JSON.stringify(todos))

      const result = await Effect.runPromise(findLinkedTodos('session-1'))

      expect(result.sessionTodos).toEqual(todos)
      expect(result.hasTodos).toBe(true)
    })

    it('should return empty session todos when file does not exist', async () => {
      const result = await Effect.runPromise(findLinkedTodos('nonexistent-session'))

      expect(result.sessionTodos).toEqual([])
      expect(result.hasTodos).toBe(false)
    })

    it('should handle invalid JSON in session todo file', async () => {
      await fs.writeFile(path.join(todosDir, 'session-1.json'), 'not-valid-json')

      const result = await Effect.runPromise(findLinkedTodos('session-1'))

      expect(result.sessionTodos).toEqual([])
      expect(result.hasTodos).toBe(false)
    })

    it('should discover agent todos from directory scan', async () => {
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

    it('should include agent todos from provided agentIds', async () => {
      const agentTodos = [{ content: 'Provided agent task', status: 'pending' }]
      await fs.writeFile(
        path.join(todosDir, 'session-1-agent-def456.json'),
        JSON.stringify(agentTodos)
      )

      const result = await Effect.runPromise(findLinkedTodos('session-1', ['agent-def456']))

      expect(result.agentTodos).toHaveLength(1)
      expect(result.agentTodos[0].agentId).toBe('agent-def456')
    })

    it('should deduplicate agent IDs from scan and provided list', async () => {
      const agentTodos = [{ content: 'Task', status: 'pending' }]
      await fs.writeFile(
        path.join(todosDir, 'session-1-agent-abc123.json'),
        JSON.stringify(agentTodos)
      )

      const result = await Effect.runPromise(findLinkedTodos('session-1', ['agent-abc123']))

      // Should only appear once despite being in both scan and provided list
      expect(result.agentTodos).toHaveLength(1)
    })

    it('should skip agent files with empty todos array', async () => {
      await fs.writeFile(path.join(todosDir, 'session-1-agent-abc123.json'), JSON.stringify([]))

      const result = await Effect.runPromise(findLinkedTodos('session-1'))

      expect(result.agentTodos).toEqual([])
      expect(result.hasTodos).toBe(false)
    })

    it('should handle invalid JSON in agent todo file', async () => {
      await fs.writeFile(path.join(todosDir, 'session-1-agent-abc123.json'), 'invalid')

      const result = await Effect.runPromise(findLinkedTodos('session-1'))

      expect(result.agentTodos).toEqual([])
    })

    it('should combine session and agent todos', async () => {
      const sessionTodos = [{ content: 'Session task', status: 'pending' }]
      const agentTodos = [{ content: 'Agent task', status: 'completed' }]

      await fs.writeFile(path.join(todosDir, 'session-1.json'), JSON.stringify(sessionTodos))
      await fs.writeFile(
        path.join(todosDir, 'session-1-agent-abc123.json'),
        JSON.stringify(agentTodos)
      )

      const result = await Effect.runPromise(findLinkedTodos('session-1'))

      expect(result.sessionTodos).toEqual(sessionTodos)
      expect(result.agentTodos).toHaveLength(1)
      expect(result.hasTodos).toBe(true)
    })
  })

  describe('sessionHasTodos', () => {
    it('should return false when todos directory does not exist', async () => {
      vi.mocked(getTodosDir).mockReturnValue(path.join(tempDir, 'nonexistent'))

      const result = await Effect.runPromise(sessionHasTodos('session-1'))

      expect(result).toBe(false)
    })

    it('should return true when session has todos', async () => {
      const todos = [{ content: 'Task', status: 'pending' }]
      await fs.writeFile(path.join(todosDir, 'session-1.json'), JSON.stringify(todos))

      const result = await Effect.runPromise(sessionHasTodos('session-1'))

      expect(result).toBe(true)
    })

    it('should return false when session todo file is empty array', async () => {
      await fs.writeFile(path.join(todosDir, 'session-1.json'), JSON.stringify([]))

      const result = await Effect.runPromise(sessionHasTodos('session-1'))

      expect(result).toBe(false)
    })

    it('should return false when session todo file has invalid JSON', async () => {
      await fs.writeFile(path.join(todosDir, 'session-1.json'), 'bad-json')

      const result = await Effect.runPromise(sessionHasTodos('session-1'))

      expect(result).toBe(false)
    })

    it('should return true when agent has todos', async () => {
      const agentTodos = [{ content: 'Agent task', status: 'pending' }]
      await fs.writeFile(
        path.join(todosDir, 'session-1-agent-abc123.json'),
        JSON.stringify(agentTodos)
      )

      const result = await Effect.runPromise(sessionHasTodos('session-1'))

      expect(result).toBe(true)
    })

    it('should return true when provided agentId has todos', async () => {
      const agentTodos = [{ content: 'Task', status: 'pending' }]
      await fs.writeFile(
        path.join(todosDir, 'session-1-agent-def456.json'),
        JSON.stringify(agentTodos)
      )

      const result = await Effect.runPromise(sessionHasTodos('session-1', ['agent-def456']))

      expect(result).toBe(true)
    })

    it('should return false when no todos exist for session', async () => {
      // Other session's todo file exists but not for session-1
      await fs.writeFile(
        path.join(todosDir, 'other-session.json'),
        JSON.stringify([{ content: 'Task', status: 'pending' }])
      )

      const result = await Effect.runPromise(sessionHasTodos('session-1'))

      expect(result).toBe(false)
    })
  })

  describe('deleteLinkedTodos', () => {
    it('should return zero count when todos directory does not exist', async () => {
      vi.mocked(getTodosDir).mockReturnValue(path.join(tempDir, 'nonexistent'))

      const result = await Effect.runPromise(deleteLinkedTodos('session-1', []))

      expect(result.deletedCount).toBe(0)
    })

    it('should move session todo file to backup directory', async () => {
      const todos = [{ content: 'Task', status: 'pending' }]
      await fs.writeFile(path.join(todosDir, 'session-1.json'), JSON.stringify(todos))

      const result = await Effect.runPromise(deleteLinkedTodos('session-1', []))

      expect(result.deletedCount).toBe(1)

      // Original file should be gone
      await expect(fs.access(path.join(todosDir, 'session-1.json'))).rejects.toThrow()

      // Backup should exist
      const backupContent = await fs.readFile(
        path.join(todosDir, '.bak', 'session-1.json'),
        'utf-8'
      )
      expect(JSON.parse(backupContent)).toEqual(todos)
    })

    it('should move agent todo files to backup directory', async () => {
      const agentTodos = [{ content: 'Agent task', status: 'completed' }]
      await fs.writeFile(
        path.join(todosDir, 'session-1-agent-abc123.json'),
        JSON.stringify(agentTodos)
      )

      const result = await Effect.runPromise(deleteLinkedTodos('session-1', ['agent-abc123']))

      expect(result.deletedCount).toBe(1)

      // Original should be gone
      await expect(fs.access(path.join(todosDir, 'session-1-agent-abc123.json'))).rejects.toThrow()

      // Backup should exist
      await expect(
        fs.access(path.join(todosDir, '.bak', 'session-1-agent-abc123.json'))
      ).resolves.toBeUndefined()
    })

    it('should handle session with both session and agent todos', async () => {
      await fs.writeFile(
        path.join(todosDir, 'session-1.json'),
        JSON.stringify([{ content: 'Session task', status: 'pending' }])
      )
      await fs.writeFile(
        path.join(todosDir, 'session-1-agent-abc123.json'),
        JSON.stringify([{ content: 'Agent task', status: 'pending' }])
      )

      const result = await Effect.runPromise(deleteLinkedTodos('session-1', ['agent-abc123']))

      expect(result.deletedCount).toBe(2)
    })

    it('should not count nonexistent files', async () => {
      const result = await Effect.runPromise(deleteLinkedTodos('session-1', ['agent-nonexistent']))

      expect(result.deletedCount).toBe(0)
    })
  })

  describe('findOrphanTodos', () => {
    it('should return empty when todos directory does not exist', async () => {
      vi.mocked(getTodosDir).mockReturnValue(path.join(tempDir, 'nonexistent'))

      const result = await Effect.runPromise(findOrphanTodos())

      expect(result).toEqual([])
    })

    it('should return empty when sessions directory does not exist', async () => {
      vi.mocked(getSessionsDir).mockReturnValue(path.join(tempDir, 'nonexistent'))

      const result = await Effect.runPromise(findOrphanTodos())

      expect(result).toEqual([])
    })

    it('should identify orphan todo files', async () => {
      // Session IDs must be hex to match regex /^([a-f0-9-]+)/
      const validId = 'aaa111-bbb2-ccc3'
      const orphanId = 'ddd444-eee5-fff6'

      const projectDir = path.join(sessionsDir, '-test-project')
      await fs.mkdir(projectDir, { recursive: true })
      await fs.writeFile(path.join(projectDir, `${validId}.jsonl`), '')

      await fs.writeFile(
        path.join(todosDir, `${validId}.json`),
        JSON.stringify([{ content: 'Task', status: 'pending' }])
      )

      await fs.writeFile(
        path.join(todosDir, `${orphanId}.json`),
        JSON.stringify([{ content: 'Orphan task', status: 'pending' }])
      )

      const result = await Effect.runPromise(findOrphanTodos())

      expect(result).toEqual([`${orphanId}.json`])
    })

    it('should identify orphan agent todo files', async () => {
      const validId = 'aaa111-bbb2-ccc3'
      const orphanId = 'ddd444-eee5-fff6'

      const projectDir = path.join(sessionsDir, '-test-project')
      await fs.mkdir(projectDir, { recursive: true })
      await fs.writeFile(path.join(projectDir, `${validId}.jsonl`), '')

      await fs.writeFile(
        path.join(todosDir, `${orphanId}-agent-abc123.json`),
        JSON.stringify([{ content: 'Task', status: 'pending' }])
      )

      const result = await Effect.runPromise(findOrphanTodos())

      expect(result).toEqual([`${orphanId}-agent-abc123.json`])
    })

    it('should not flag valid session todos as orphans', async () => {
      const sessionId = 'aaa111-bbb2-ccc3'

      const projectDir = path.join(sessionsDir, '-test-project')
      await fs.mkdir(projectDir, { recursive: true })
      await fs.writeFile(path.join(projectDir, `${sessionId}.jsonl`), '')

      await fs.writeFile(
        path.join(todosDir, `${sessionId}.json`),
        JSON.stringify([{ content: 'Active task', status: 'in_progress' }])
      )

      const result = await Effect.runPromise(findOrphanTodos())

      expect(result).toEqual([])
    })

    it('should skip hidden directories in sessions', async () => {
      const sessionId = 'aaa111-bbb2-ccc3'

      const hiddenDir = path.join(sessionsDir, '.hidden')
      await fs.mkdir(hiddenDir, { recursive: true })
      await fs.writeFile(path.join(hiddenDir, `${sessionId}.jsonl`), '')

      await fs.writeFile(
        path.join(todosDir, `${sessionId}.json`),
        JSON.stringify([{ content: 'Task', status: 'pending' }])
      )

      // Session is only in hidden dir, so todo is orphan
      const result = await Effect.runPromise(findOrphanTodos())

      expect(result).toEqual([`${sessionId}.json`])
    })

    it('should ignore non-hex filenames in todos directory', async () => {
      // Filenames with non-hex chars won't match the regex pattern
      await fs.writeFile(
        path.join(todosDir, 'not-hex-name.json'),
        JSON.stringify([{ content: 'Task', status: 'pending' }])
      )

      const result = await Effect.runPromise(findOrphanTodos())

      // Non-hex filenames are not matched by regex, so not flagged
      expect(result).toEqual([])
    })
  })

  describe('deleteOrphanTodos', () => {
    it('should return zero when no orphans exist', async () => {
      const result = await Effect.runPromise(deleteOrphanTodos())

      expect(result).toEqual({ success: true, deletedCount: 0 })
    })

    it('should move orphan todos to backup and return count', async () => {
      // No valid sessions
      await fs.writeFile(
        path.join(todosDir, 'aaa111.json'),
        JSON.stringify([{ content: 'Orphan', status: 'pending' }])
      )

      const result = await Effect.runPromise(deleteOrphanTodos())

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(1)

      // Original should be gone
      await expect(fs.access(path.join(todosDir, 'aaa111.json'))).rejects.toThrow()

      // Backup should exist
      await expect(fs.access(path.join(todosDir, '.bak', 'aaa111.json'))).resolves.toBeUndefined()
    })

    it('should only delete orphans and preserve valid session todos', async () => {
      // Create valid session
      const projectDir = path.join(sessionsDir, '-Users-test-project')
      await fs.mkdir(projectDir, { recursive: true })
      await fs.writeFile(path.join(projectDir, 'aaa111.jsonl'), '')

      // Valid todo
      await fs.writeFile(
        path.join(todosDir, 'aaa111.json'),
        JSON.stringify([{ content: 'Valid', status: 'pending' }])
      )

      // Orphan todo
      await fs.writeFile(
        path.join(todosDir, 'bbb222.json'),
        JSON.stringify([{ content: 'Orphan', status: 'pending' }])
      )

      const result = await Effect.runPromise(deleteOrphanTodos())

      expect(result.deletedCount).toBe(1)

      // Valid todo should still exist
      await expect(fs.access(path.join(todosDir, 'aaa111.json'))).resolves.toBeUndefined()

      // Orphan should be moved to backup
      await expect(fs.access(path.join(todosDir, 'bbb222.json'))).rejects.toThrow()
    })
  })
})
