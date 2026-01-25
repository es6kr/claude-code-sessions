/**
 * E2E tests using MCP SDK Client
 * Tests the actual MCP protocol communication via stdio
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

type TextContent = Extract<CallToolResult['content'][number], { type: 'text' }>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTextContent(result: any): string {
  if (!result.content) throw new Error('No content in result')
  const textContent = result.content.find(
    (c: { type: string }): c is TextContent => c.type === 'text'
  )
  if (!textContent) throw new Error('No text content in result')
  return textContent.text
}

describe('MCP Server E2E Tests', () => {
  let client: Client
  let transport: StdioClientTransport
  let tempDir: string
  let projectDir: string
  const projectName = '-Users-test-e2e'
  let originalEnv: string | undefined

  beforeAll(async () => {
    // Save original env
    originalEnv = process.env.CLAUDE_SESSIONS_DIR

    // Create temp directory for test data
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-e2e-'))
    projectDir = path.join(tempDir, projectName)
    await fs.mkdir(projectDir, { recursive: true })
  })

  afterAll(async () => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.CLAUDE_SESSIONS_DIR
    } else {
      process.env.CLAUDE_SESSIONS_DIR = originalEnv
    }

    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    // Start MCP server via stdio transport
    transport = new StdioClientTransport({
      command: 'node',
      args: ['--import', 'tsx', 'src/index.ts'],
      env: {
        ...process.env,
        CLAUDE_SESSIONS_DIR: tempDir,
      },
      cwd: path.resolve(import.meta.dirname, '../..'),
    })

    client = new Client({
      name: 'test-client',
      version: '1.0.0',
    })

    await client.connect(transport)
  })

  afterEach(async () => {
    await client.close()
  })

  describe('list_projects', () => {
    it('should list projects via MCP protocol', async () => {
      // Create a session file
      const sessionId = 'e2e-test-session'
      const sessionFile = path.join(projectDir, `${sessionId}.jsonl`)
      const message = {
        type: 'user',
        uuid: 'msg-1',
        timestamp: new Date().toISOString(),
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      }
      await fs.writeFile(sessionFile, JSON.stringify(message) + '\n')

      // Call list_projects via MCP
      const result = await client.callTool({
        name: 'list_projects',
        arguments: {},
      })

      const projects = JSON.parse(getTextContent(result))
      expect(Array.isArray(projects)).toBe(true)
      expect(projects.length).toBeGreaterThan(0)

      const testProject = projects.find((p: { name: string }) => p.name === projectName)
      expect(testProject).toBeDefined()
      expect(testProject.sessionCount).toBe(1)
    })
  })

  describe('list_sessions', () => {
    it('should list sessions in a project via MCP protocol', async () => {
      // Create session files
      const sessions = ['session-1', 'session-2']
      for (const sessionId of sessions) {
        const sessionFile = path.join(projectDir, `${sessionId}.jsonl`)
        const message = {
          type: 'user',
          uuid: `msg-${sessionId}`,
          timestamp: new Date().toISOString(),
          message: { role: 'user', content: [{ type: 'text', text: `Hello from ${sessionId}` }] },
        }
        await fs.writeFile(sessionFile, JSON.stringify(message) + '\n')
      }

      // Call list_sessions via MCP
      const result = await client.callTool({
        name: 'list_sessions',
        arguments: { project_name: projectName },
      })

      const sessionList = JSON.parse(getTextContent(result))
      expect(Array.isArray(sessionList)).toBe(true)
      expect(sessionList.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('rename_session', () => {
    it('should rename a session via MCP protocol', async () => {
      // Create a session
      const sessionId = 'rename-test-session'
      const sessionFile = path.join(projectDir, `${sessionId}.jsonl`)
      const message = {
        type: 'user',
        uuid: 'msg-rename',
        timestamp: new Date().toISOString(),
        message: { role: 'user', content: [{ type: 'text', text: 'Original message' }] },
      }
      await fs.writeFile(sessionFile, JSON.stringify(message) + '\n')

      // Rename via MCP
      const result = await client.callTool({
        name: 'rename_session',
        arguments: {
          project_name: projectName,
          session_id: sessionId,
          new_title: 'New Title',
        },
      })

      expect(result.content).toBeDefined()

      // Verify the file was updated
      const content = await fs.readFile(sessionFile, 'utf-8')
      expect(content).toContain('New Title')
    })
  })

  describe('preview_cleanup', () => {
    it('should preview empty sessions via MCP protocol', async () => {
      // Create an empty session
      const emptySessionId = 'empty-e2e-session'
      const emptySessionFile = path.join(projectDir, `${emptySessionId}.jsonl`)
      await fs.writeFile(emptySessionFile, '')

      // Call preview_cleanup via MCP
      const result = await client.callTool({
        name: 'preview_cleanup',
        arguments: { project_name: projectName },
      })

      // Response is an array of CleanupPreview objects
      const previews = JSON.parse(getTextContent(result))
      expect(Array.isArray(previews)).toBe(true)

      const projectPreview = previews.find((p: { project: string }) => p.project === projectName)
      expect(projectPreview).toBeDefined()
      expect(projectPreview.emptySessions).toBeDefined()
      expect(
        projectPreview.emptySessions.some((s: { id: string }) => s.id === emptySessionId)
      ).toBe(true)
    })
  })

  describe('clear_sessions', () => {
    it('should clear empty sessions via MCP protocol', async () => {
      // Create an empty session
      const emptySessionId = 'clear-e2e-session'
      const emptySessionFile = path.join(projectDir, `${emptySessionId}.jsonl`)
      await fs.writeFile(emptySessionFile, '')

      // Clear via MCP
      const result = await client.callTool({
        name: 'clear_sessions',
        arguments: {
          project_name: projectName,
          clear_empty: true,
          clear_invalid: false,
        },
      })

      expect(result.content).toBeDefined()

      // Verify the file was removed
      const exists = await fs
        .access(emptySessionFile)
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(false)
    })
  })

  describe('server info', () => {
    it('should return server info', async () => {
      const serverInfo = client.getServerVersion()
      expect(serverInfo).toBeDefined()
      expect(serverInfo?.name).toBe('claude-sessions-mcp')
    })

    it('should list available tools', async () => {
      const tools = await client.listTools()
      expect(tools.tools).toBeDefined()
      expect(tools.tools.length).toBeGreaterThan(0)

      const toolNames = tools.tools.map((t) => t.name)
      expect(toolNames).toContain('list_projects')
      expect(toolNames).toContain('list_sessions')
      expect(toolNames).toContain('rename_session')
      expect(toolNames).toContain('delete_session')
      expect(toolNames).toContain('preview_cleanup')
      expect(toolNames).toContain('clear_sessions')
    })
  })
})
