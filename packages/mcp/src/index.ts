#!/usr/bin/env node
/**
 * claude-sessions-mcp
 * MCP server for managing Claude Code conversation sessions
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Effect } from 'effect'
import { z } from 'zod'
import * as session from '@claude-sessions/core'
import { startWebServer, stopWebServer, type WebServer } from './server.js'

const server = new McpServer({
  name: 'claude-sessions-mcp',
  version: '0.4.0',
})

// List all projects
server.tool('list_projects', 'List all Claude Code projects with session counts', {}, async () => {
  const result = await Effect.runPromise(session.listProjects)
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  }
})

// List sessions in a project
server.tool(
  'list_sessions',
  'List all sessions in a project',
  {
    project_name: z.string().describe("Project folder name (e.g., '-Users-young-works-myproject')"),
  },
  async ({ project_name }) => {
    const result = await Effect.runPromise(session.listSessions(project_name))
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
)

// Rename session
server.tool(
  'rename_session',
  'Rename a session by adding a title prefix to the first message',
  {
    project_name: z.string().describe('Project folder name'),
    session_id: z.string().describe('Session ID (filename without .jsonl)'),
    new_title: z.string().describe('New title to add as prefix'),
  },
  async ({ project_name, session_id, new_title }) => {
    const result = await Effect.runPromise(
      session.renameSession(project_name, session_id, new_title)
    )
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
)

// Delete session
server.tool(
  'delete_session',
  'Delete a session (moves to .bak folder for recovery)',
  {
    project_name: z.string().describe('Project folder name'),
    session_id: z.string().describe('Session ID to delete'),
  },
  async ({ project_name, session_id }) => {
    const result = await Effect.runPromise(session.deleteSession(project_name, session_id))
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
)

// Delete message
server.tool(
  'delete_message',
  'Delete a message from a session and repair the parentUuid chain',
  {
    project_name: z.string().describe('Project folder name'),
    session_id: z.string().describe('Session ID'),
    message_uuid: z.string().describe('UUID of the message to delete'),
  },
  async ({ project_name, session_id, message_uuid }) => {
    const result = await Effect.runPromise(
      session.deleteMessage(project_name, session_id, message_uuid)
    )
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
)

// Preview cleanup
server.tool(
  'preview_cleanup',
  'Preview sessions that would be cleaned (empty and invalid API key sessions)',
  {
    project_name: z.string().optional().describe('Optional: filter by project name'),
  },
  async ({ project_name }) => {
    const result = await Effect.runPromise(session.previewCleanup(project_name))
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
)

// Clear sessions
server.tool(
  'clear_sessions',
  'Delete all empty sessions and invalid API key sessions',
  {
    project_name: z.string().optional().describe('Optional: filter by project name'),
    clear_empty: z.boolean().default(true).describe('Clear empty sessions (default: true)'),
    clear_invalid: z
      .boolean()
      .default(true)
      .describe('Clear invalid API key sessions (default: true)'),
    clear_orphan_agents: z
      .boolean()
      .default(true)
      .describe('Clear orphan agent files whose session no longer exists (default: true)'),
  },
  async ({ project_name, clear_empty, clear_invalid, clear_orphan_agents }) => {
    const result = await Effect.runPromise(
      session.clearSessions({
        projectName: project_name,
        clearEmpty: clear_empty,
        clearInvalid: clear_invalid,
        clearOrphanAgents: clear_orphan_agents,
      })
    )
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
)

// Get changed files from a session
server.tool(
  'get_session_files',
  'Get list of all files changed in a session (from file-history-snapshot and tool_use)',
  {
    project_name: z.string().describe('Project folder name'),
    session_id: z.string().describe('Session ID'),
  },
  async ({ project_name, session_id }) => {
    const result = await Effect.runPromise(session.getSessionFiles(project_name, session_id))
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
)

// Analyze session for optimization insights
server.tool(
  'analyze_session',
  'Analyze a session to get statistics, tool usage, patterns, and optimization insights',
  {
    project_name: z.string().describe('Project folder name'),
    session_id: z.string().describe('Session ID'),
  },
  async ({ project_name, session_id }) => {
    const result = await Effect.runPromise(session.analyzeSession(project_name, session_id))
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
)

// Summarize session into user/assistant conversation format
server.tool(
  'summarize_session',
  'Summarize a session into compact user/assistant conversation format with timestamps',
  {
    project_name: z.string().describe('Project folder name'),
    session_id: z.string().describe('Session ID'),
    limit: z.number().default(50).describe('Maximum number of messages to include (default: 50)'),
    max_length: z
      .number()
      .default(100)
      .describe('Maximum length for each message content (default: 100)'),
  },
  async ({ project_name, session_id, limit, max_length }) => {
    const result = await Effect.runPromise(
      session.summarizeSession(project_name, session_id, {
        limit,
        maxLength: max_length,
      })
    )
    return {
      content: [{ type: 'text', text: result.formatted }],
    }
  }
)

// Compress session to reduce file size
server.tool(
  'compress_session',
  'Compress a session by removing redundant snapshots and truncating long tool outputs',
  {
    project_name: z.string().describe('Project folder name'),
    session_id: z.string().describe('Session ID'),
    keep_snapshots: z
      .enum(['first_last', 'all', 'none'])
      .default('first_last')
      .describe('Which snapshots to keep: first_last (default), all, or none'),
    max_tool_output_length: z
      .number()
      .default(0)
      .describe('Truncate tool outputs longer than this (0 = no limit)'),
  },
  async ({ project_name, session_id, keep_snapshots, max_tool_output_length }) => {
    const result = await Effect.runPromise(
      session.compressSession(project_name, session_id, {
        keepSnapshots: keep_snapshots,
        maxToolOutputLength: max_tool_output_length,
      })
    )
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
)

// Extract project knowledge from sessions
server.tool(
  'extract_project_knowledge',
  'Extract patterns, hot files, workflows, and decisions from project sessions',
  {
    project_name: z.string().describe('Project folder name'),
    session_ids: z
      .array(z.string())
      .optional()
      .describe('Optional: specific session IDs to analyze (default: all sessions)'),
  },
  async ({ project_name, session_ids }) => {
    const result = await Effect.runPromise(
      session.extractProjectKnowledge(project_name, session_ids)
    )
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
)

// Split session
server.tool(
  'split_session',
  'Split a session at a specific message, creating a new session with messages from that point onwards',
  {
    project_name: z.string().describe('Project folder name'),
    session_id: z.string().describe('Session ID to split'),
    message_uuid: z
      .string()
      .describe(
        'UUID of the message where the split starts (this message becomes the first message of the new session)'
      ),
  },
  async ({ project_name, session_id, message_uuid }) => {
    const result = await Effect.runPromise(
      session.splitSession(project_name, session_id, message_uuid)
    )
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  }
)

// Start GUI
let webServerInstance: WebServer | null = null

server.tool(
  'start_gui',
  'Start the web GUI for session management and open it in browser',
  {
    port: z.number().default(5173).describe('Port to run the web server on (default: 5173)'),
    open_browser: z
      .boolean()
      .default(true)
      .describe('Whether to open browser automatically (default: true)'),
    restart: z
      .boolean()
      .default(false)
      .describe('Restart the server if already running (default: false)'),
  },
  async ({ port, open_browser, restart }) => {
    try {
      if (webServerInstance) {
        if (restart) {
          await stopWebServer(webServerInstance)
          webServerInstance = null
        } else {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    message: 'Web GUI is already running',
                    url: `http://localhost:${port}`,
                  },
                  null,
                  2
                ),
              },
            ],
          }
        }
      }

      webServerInstance = await startWebServer(port, open_browser)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: 'Web GUI started successfully',
                url: `http://localhost:${port}`,
                pid: process.pid,
              },
              null,
              2
            ),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: String(error),
              },
              null,
              2
            ),
          },
        ],
      }
    }
  }
)

// Stop GUI
server.tool('stop_gui', 'Stop the web GUI server', {}, async () => {
  if (webServerInstance) {
    const port = webServerInstance.port
    // Call shutdown API first for graceful shutdown
    try {
      await fetch(`http://localhost:${port}/api/shutdown`, { method: 'POST' })
    } catch {
      // Server might already be stopping
    }
    // Then kill the process if still running
    await stopWebServer(webServerInstance)
    webServerInstance = null
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, message: 'Web GUI stopped successfully' }, null, 2),
        },
      ],
    }
  }
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true, message: 'Web GUI was not running' }, null, 2),
      },
    ],
  }
})

// Main entry
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
