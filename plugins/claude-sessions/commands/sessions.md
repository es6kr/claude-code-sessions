---
description: List and manage Claude Code sessions
---

# Session Management

Use the `claude-sessions-mcp` MCP server tools to help the user manage their Claude Code sessions.

## Available Operations

1. **List Projects**: Show all projects with session counts
   - Use `mcp__claude-sessions-mcp__list_projects` tool

2. **List Sessions**: Show sessions in a specific project
   - Use `mcp__claude-sessions-mcp__list_sessions` tool with project_name

3. **Start Web GUI**: Open the session management web interface
   - Use `mcp__claude-sessions-mcp__start_gui` tool
   - Default port: 5173

4. **Cleanup Sessions**: Remove empty and invalid sessions
   - First use `mcp__claude-sessions-mcp__preview_cleanup` to show what will be deleted
   - Then use `mcp__claude-sessions-mcp__clear_sessions` to perform cleanup

5. **Rename Session**: Change a session's title
   - Use `mcp__claude-sessions-mcp__rename_session` tool

6. **Delete Session**: Remove a specific session
   - Use `mcp__claude-sessions-mcp__delete_session` tool

## Usage

Ask the user what they want to do:
- "List my projects" → list_projects
- "Show sessions for [project]" → list_sessions
- "Open session manager" → start_gui
- "Clean up sessions" → preview_cleanup, then clear_sessions
- "Rename session [id] to [title]" → rename_session
- "Delete session [id]" → delete_session
