import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'
import * as session from '@claude-sessions/core'

describe('MCP Tools - Integration Tests', () => {
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-test-mcp'
  let originalEnv: string | undefined

  beforeEach(async () => {
    // Save original env
    originalEnv = process.env.CLAUDE_SESSIONS_DIR

    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })

    // Set environment variable to use temp directory
    process.env.CLAUDE_SESSIONS_DIR = tempDir
  })

  afterEach(async () => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.CLAUDE_SESSIONS_DIR
    } else {
      process.env.CLAUDE_SESSIONS_DIR = originalEnv
    }

    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('listProjects', () => {
    it('should list projects with session counts', async () => {
      // Create a session file
      const sessionId = 'test-session-1'
      const messages = [
        {
          type: 'user',
          uuid: 'msg-1',
          timestamp: '2025-01-18T01:00:00.000Z',
          message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        },
      ]
      await fs.writeFile(
        path.join(projectDir, `${sessionId}.jsonl`),
        messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
      )

      const result = await Effect.runPromise(session.listProjects)

      expect(result).toBeInstanceOf(Array)
      const project = result.find((p) => p.name === projectName)
      expect(project).toBeDefined()
      expect(project!.sessionCount).toBe(1)
    })

    it('should return empty array when no projects exist', async () => {
      // Remove the project dir
      await fs.rm(projectDir, { recursive: true })

      const result = await Effect.runPromise(session.listProjects)

      expect(result).toBeInstanceOf(Array)
      expect(result).toHaveLength(0)
    })
  })

  describe('listSessions', () => {
    it('should list sessions in a project', async () => {
      const sessionId1 = 'session-1'
      const sessionId2 = 'session-2'

      // Create two sessions
      const messages = [
        {
          type: 'user',
          uuid: 'msg-1',
          timestamp: '2025-01-18T01:00:00.000Z',
          message: { role: 'user', content: [{ type: 'text', text: 'First session' }] },
        },
      ]

      await fs.writeFile(
        path.join(projectDir, `${sessionId1}.jsonl`),
        messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
      )
      await fs.writeFile(
        path.join(projectDir, `${sessionId2}.jsonl`),
        messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
      )

      const result = await Effect.runPromise(session.listSessions(projectName))

      expect(result).toHaveLength(2)
      const sessionIds = result.map((s) => s.id)
      expect(sessionIds).toContain(sessionId1)
      expect(sessionIds).toContain(sessionId2)
    })

    it('should throw error for non-existent project', async () => {
      // listSessions throws an error for non-existent projects
      await expect(
        Effect.runPromise(session.listSessions('non-existent-project'))
      ).rejects.toThrow()
    })
  })

  describe('deleteSession', () => {
    it('should delete a session and create backup', async () => {
      const sessionId = 'session-to-delete'
      const messages = [
        {
          type: 'user',
          uuid: 'msg-1',
          timestamp: '2025-01-18T01:00:00.000Z',
          message: { role: 'user', content: [{ type: 'text', text: 'To be deleted' }] },
        },
      ]

      const sessionPath = path.join(projectDir, `${sessionId}.jsonl`)
      await fs.writeFile(sessionPath, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

      const result = await Effect.runPromise(session.deleteSession(projectName, sessionId))

      expect(result.success).toBe(true)
      expect(result.backupPath).toContain('.bak')

      // Original file should be deleted
      await expect(fs.access(sessionPath)).rejects.toThrow()

      // Backup should exist
      expect(result.backupPath).toBeDefined()
      await expect(fs.access(result.backupPath!)).resolves.toBeUndefined()
    })
  })

  describe('renameSession', () => {
    it('should rename a session by adding custom-title record', async () => {
      const sessionId = 'session-to-rename'
      const newTitle = 'New Title'
      const messages = [
        {
          type: 'user',
          uuid: 'msg-1',
          timestamp: '2025-01-18T01:00:00.000Z',
          message: { role: 'user', content: [{ type: 'text', text: 'Original message' }] },
        },
      ]

      const sessionPath = path.join(projectDir, `${sessionId}.jsonl`)
      await fs.writeFile(sessionPath, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

      const result = await Effect.runPromise(
        session.renameSession(projectName, sessionId, newTitle)
      )

      // renameSession returns { success: true } or { success: false, error: string }
      expect(result.success).toBe(true)

      // Read the file and verify custom-title record was appended at the end
      const content = await fs.readFile(sessionPath, 'utf-8')
      const lines = content.trim().split('\n')
      const lastMessage = JSON.parse(lines[lines.length - 1])
      expect(lastMessage.type).toBe('custom-title')
      expect(lastMessage.customTitle).toBe(newTitle)
    })
  })

  describe('summarizeSession', () => {
    it('should summarize session into user/assistant format', async () => {
      const sessionId = 'session-to-summarize'
      const messages = [
        {
          type: 'user',
          uuid: 'msg-1',
          parentUuid: undefined,
          timestamp: '2025-01-18T01:00:00.000Z',
          message: { role: 'user', content: [{ type: 'text', text: 'Hello AI' }] },
        },
        {
          type: 'assistant',
          uuid: 'msg-2',
          parentUuid: 'msg-1',
          timestamp: '2025-01-18T01:00:05.000Z',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Hello human!' }] },
        },
        {
          type: 'user',
          uuid: 'msg-3',
          parentUuid: 'msg-2',
          timestamp: '2025-01-18T01:00:10.000Z',
          message: { role: 'user', content: [{ type: 'text', text: 'How are you?' }] },
        },
      ]

      const sessionPath = path.join(projectDir, `${sessionId}.jsonl`)
      await fs.writeFile(sessionPath, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

      const result = await Effect.runPromise(
        session.summarizeSession(projectName, sessionId, { limit: 50, maxLength: 100 })
      )

      // summarizeSession returns { sessionId, projectName, lines, formatted }
      expect(result.lines).toHaveLength(3)
      expect(result.lines[0].role).toBe('user')
      expect(result.lines[0].content).toContain('Hello AI')
      expect(result.lines[1].role).toBe('assistant')
      expect(result.lines[1].content).toContain('Hello human!')
      expect(result.formatted).toContain('user')
      expect(result.formatted).toContain('assistant')
    })

    it('should respect limit option', async () => {
      const sessionId = 'session-limit'
      const messages = Array.from({ length: 10 }, (_, i) => ({
        type: i % 2 === 0 ? 'user' : 'assistant',
        uuid: `msg-${i}`,
        parentUuid: i > 0 ? `msg-${i - 1}` : undefined,
        timestamp: `2025-01-18T01:00:${String(i).padStart(2, '0')}.000Z`,
        message: {
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: [{ type: 'text', text: `Message ${i}` }],
        },
      }))

      const sessionPath = path.join(projectDir, `${sessionId}.jsonl`)
      await fs.writeFile(sessionPath, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

      const result = await Effect.runPromise(
        session.summarizeSession(projectName, sessionId, { limit: 3, maxLength: 100 })
      )

      expect(result.lines.length).toBeLessThanOrEqual(3)
    })

    it('should truncate long messages', async () => {
      const sessionId = 'session-truncate'
      const longText = 'A'.repeat(500)
      const messages = [
        {
          type: 'user',
          uuid: 'msg-1',
          timestamp: '2025-01-18T01:00:00.000Z',
          message: { role: 'user', content: [{ type: 'text', text: longText }] },
        },
      ]

      const sessionPath = path.join(projectDir, `${sessionId}.jsonl`)
      await fs.writeFile(sessionPath, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

      const result = await Effect.runPromise(
        session.summarizeSession(projectName, sessionId, { limit: 50, maxLength: 50 })
      )

      expect(result.lines[0].content.length).toBeLessThanOrEqual(53) // 50 + '...'
    })
  })

  describe('analyzeSession', () => {
    it('should analyze session and return statistics', async () => {
      const sessionId = 'session-to-analyze'
      const messages = [
        {
          type: 'user',
          uuid: 'msg-1',
          timestamp: '2025-01-18T01:00:00.000Z',
          message: { role: 'user', content: [{ type: 'text', text: 'Please read the file' }] },
        },
        {
          type: 'assistant',
          uuid: 'msg-2',
          parentUuid: 'msg-1',
          timestamp: '2025-01-18T01:00:05.000Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/test.txt' } },
            ],
          },
        },
        {
          type: 'user',
          uuid: 'msg-3',
          parentUuid: 'msg-2',
          timestamp: '2025-01-18T01:00:10.000Z',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'file contents' }],
          },
        },
      ]

      const sessionPath = path.join(projectDir, `${sessionId}.jsonl`)
      await fs.writeFile(sessionPath, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

      const result = await Effect.runPromise(session.analyzeSession(projectName, sessionId))

      // analyzeSession returns { sessionId, projectName, durationMinutes, stats, toolUsage, filesChanged, patterns, milestones }
      expect(result.stats.totalMessages).toBe(3)
      expect(result.stats.userMessages).toBe(2)
      expect(result.stats.assistantMessages).toBe(1)
      expect(result.toolUsage).toBeDefined()
      expect(result.toolUsage.find((t) => t.name === 'Read')?.count).toBe(1)
    })
  })

  describe('getSessionFiles', () => {
    it('should extract files from tool_use calls', async () => {
      const sessionId = 'session-with-files'
      const messages = [
        {
          type: 'user',
          uuid: 'msg-1',
          timestamp: '2025-01-18T01:00:00.000Z',
          message: { role: 'user', content: [{ type: 'text', text: 'Read files' }] },
        },
        {
          type: 'assistant',
          uuid: 'msg-2',
          parentUuid: 'msg-1',
          timestamp: '2025-01-18T01:00:05.000Z',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Read',
                input: { file_path: '/path/to/file1.ts' },
              },
              {
                type: 'tool_use',
                id: 'tool-2',
                name: 'Write',
                input: { file_path: '/path/to/file2.ts' },
              },
            ],
          },
        },
      ]

      const sessionPath = path.join(projectDir, `${sessionId}.jsonl`)
      await fs.writeFile(sessionPath, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

      const result = await Effect.runPromise(session.getSessionFiles(projectName, sessionId))

      // getSessionFiles returns { sessionId, projectName, files: FileChange[], totalChanges }
      // FileChange has { path, action, timestamp?, messageUuid? }
      // Only Write/Edit actions are tracked, not Read
      const filePaths = result.files.map((f) => f.path)
      expect(filePaths).toContain('/path/to/file2.ts')
      expect(result.totalChanges).toBeGreaterThanOrEqual(1)
    })
  })

  describe('splitSession', () => {
    it('should split session at specified message', async () => {
      const sessionId = 'session-to-split'
      const messages = [
        {
          type: 'user',
          uuid: 'msg-1',
          parentUuid: undefined,
          timestamp: '2025-01-18T01:00:00.000Z',
          message: { role: 'user', content: [{ type: 'text', text: 'First part' }] },
        },
        {
          type: 'assistant',
          uuid: 'msg-2',
          parentUuid: 'msg-1',
          timestamp: '2025-01-18T01:00:05.000Z',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Response 1' }] },
        },
        {
          type: 'user',
          uuid: 'msg-3',
          parentUuid: 'msg-2',
          timestamp: '2025-01-18T01:00:10.000Z',
          message: { role: 'user', content: [{ type: 'text', text: 'Second part' }] },
        },
        {
          type: 'assistant',
          uuid: 'msg-4',
          parentUuid: 'msg-3',
          timestamp: '2025-01-18T01:00:15.000Z',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Response 2' }] },
        },
      ]

      const sessionPath = path.join(projectDir, `${sessionId}.jsonl`)
      await fs.writeFile(sessionPath, messages.map((m) => JSON.stringify(m)).join('\n') + '\n')

      // Split at msg-3 - splits BEFORE that message
      // splitSession returns { success, newSessionId, newSessionPath, movedMessageCount, duplicatedSummary }
      // Original session keeps messages FROM splitIndex onwards (msg-3, msg-4)
      // New session gets messages BEFORE splitIndex (msg-1, msg-2)
      const result = await Effect.runPromise(session.splitSession(projectName, sessionId, 'msg-3'))

      expect(result.success).toBe(true)
      expect(result.newSessionId).toBeDefined()
      expect(result.movedMessageCount).toBe(2) // msg-1 and msg-2 moved to new session

      // Original session keeps messages from split point onwards (msg-3, msg-4)
      const originalContent = await fs.readFile(sessionPath, 'utf-8')
      const originalLines = originalContent.trim().split('\n')
      expect(originalLines).toHaveLength(2)

      // New session has messages before split point (msg-1, msg-2)
      const newSessionPath = path.join(projectDir, `${result.newSessionId}.jsonl`)
      const newContent = await fs.readFile(newSessionPath, 'utf-8')
      const newLines = newContent.trim().split('\n')
      expect(newLines).toHaveLength(2)
    })
  })

  describe('clearSessions', () => {
    it('should clear empty sessions', async () => {
      // Create an empty session
      const emptySessionId = 'empty-session'
      await fs.writeFile(path.join(projectDir, `${emptySessionId}.jsonl`), '')

      // Create a non-empty session
      const normalSessionId = 'normal-session'
      const messages = [
        {
          type: 'user',
          uuid: 'msg-1',
          timestamp: '2025-01-18T01:00:00.000Z',
          message: { role: 'user', content: [{ type: 'text', text: 'Not empty' }] },
        },
      ]
      await fs.writeFile(
        path.join(projectDir, `${normalSessionId}.jsonl`),
        messages.map((m) => JSON.stringify(m)).join('\n') + '\n'
      )

      const result = await Effect.runPromise(
        session.clearSessions({
          projectName,
          clearEmpty: true,
          clearInvalid: false,
          clearOrphanAgents: false,
        })
      )

      // clearSessions returns { success, deletedCount, removedMessageCount, deletedOrphanAgentCount, deletedOrphanTodoCount }
      expect(result.success).toBe(true)
      expect(result.deletedCount).toBeGreaterThanOrEqual(1)

      // Empty session should be deleted
      await expect(fs.access(path.join(projectDir, `${emptySessionId}.jsonl`))).rejects.toThrow()

      // Normal session should still exist
      await expect(
        fs.access(path.join(projectDir, `${normalSessionId}.jsonl`))
      ).resolves.toBeUndefined()
    })
  })

  describe('previewCleanup', () => {
    it('should preview sessions to be cleaned', async () => {
      // Create an empty session
      const emptySessionId = 'empty-preview-session'
      await fs.writeFile(path.join(projectDir, `${emptySessionId}.jsonl`), '')

      // previewCleanup returns CleanupPreview[] array
      // Each item: { project, emptySessions, invalidSessions, emptyWithTodosCount, orphanAgentCount, orphanTodoCount }
      const results = await Effect.runPromise(session.previewCleanup(projectName))

      expect(results).toBeInstanceOf(Array)
      expect(results.length).toBeGreaterThanOrEqual(1)
      const projectResult = results.find((r) => r.project === projectName)
      expect(projectResult).toBeDefined()
      expect(projectResult!.emptySessions).toBeDefined()
      expect(projectResult!.emptySessions.length).toBeGreaterThanOrEqual(1)
      expect(projectResult!.emptySessions.some((s) => s.id === emptySessionId)).toBe(true)
    })
  })
})
