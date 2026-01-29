# claude-sessions-mcp

MCP (Model Context Protocol) server for managing Claude Code sessions.

## Features

- **Project Listing**: Browse Claude Code project folders
- **Session Management**: List, rename, and delete sessions
- **Message Management**: View and delete messages within sessions
- **Cleanup**: Clear empty sessions and remove invalid API key messages
- **Web UI**: Launch built-in web interface for visual session management

## Usage

### Claude Code MCP Integration

Add to Claude Code:

```bash
claude mcp add claude-sessions -- npx claude-sessions-mcp
```

Or manually edit `~/.claude.json`:

```jsonc
{
  "mcpServers": {
    // default (uses cached version if available)
    "claude-sessions": {
      "command": "npx",
      "args": ["-y", "claude-sessions-mcp"],
    },
    // always fetch latest stable version
    "claude-sessions-latest": {
      "command": "npx",
      "args": ["-y", "claude-sessions-mcp@latest"],
    },
    // beta version for latest features
    "claude-sessions-beta": {
      "command": "npx",
      "args": ["-y", "claude-sessions-mcp@beta"],
    },
  },
}
```

### Web GUI

Launch the web interface via MCP tool (from Claude Code):

```text
> Use the start_gui tool to launch web interface
```

The GUI opens at `http://localhost:5173` with features:

- Browse all projects and sessions
- View full conversation history
- Rename sessions with inline editing
- Delete unwanted sessions
- Bulk cleanup of empty sessions

## MCP Tools

| Tool                | Description                               |
| ------------------- | ----------------------------------------- |
| `list_projects`     | List Claude Code projects                 |
| `list_sessions`     | List sessions in a project                |
| `rename_session`    | Rename a session                          |
| `delete_session`    | Delete a session (moves to backup folder) |
| `delete_message`    | Delete a message and repair UUID chain    |
| `preview_cleanup`   | Preview sessions to be cleaned            |
| `clear_sessions`    | Clear empty sessions and invalid messages |
| `get_session_files` | Get files changed in a session            |
| `split_session`     | Split session at a specific message       |
| `start_gui`         | Start the web UI                          |
| `stop_gui`          | Stop the web UI                           |

## Related Packages

- [`@claude-sessions/core`](https://www.npmjs.com/package/@claude-sessions/core) - Core library
- [`@claude-sessions/web`](https://www.npmjs.com/package/@claude-sessions/web) - Standalone Web UI

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **MCP SDK**: @modelcontextprotocol/sdk
- **Async**: Effect-TS
- **Validation**: Zod

## License

MIT
