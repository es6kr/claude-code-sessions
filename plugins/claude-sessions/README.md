# Claude Sessions Plugin

Claude Code plugin for session management - list, view, and manage conversation history.

## Features

- List all projects and sessions
- Open session viewer in browser
- Clean up empty/invalid sessions
- Rename and delete sessions

## Commands

### /sessions

List and manage Claude Code sessions with the web GUI.

## MCP Server

This plugin relies on the `claude-sessions-mcp` MCP server for session operations.

### Configuration

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "claude-sessions-mcp": {
      "command": "npx",
      "args": ["-y", "claude-sessions-mcp@latest"]
    }
  }
}
```

## Installation

### From npm (coming soon)

```bash
/install claude-sessions
```

### Local Development

```bash
# Clone the repository
git clone https://github.com/es6kr/claude-code-sessions.git
cd claude-code-sessions/packages/plugin

# Install as local plugin
/install local:./packages/plugin
```

## Related Packages

- [@claude-sessions/core](https://www.npmjs.com/package/@claude-sessions/core) - Core library
- [@claude-sessions/web](https://www.npmjs.com/package/@claude-sessions/web) - Web GUI
- [claude-sessions-mcp](https://www.npmjs.com/package/claude-sessions-mcp) - MCP server
- [claude-sessions-vscode](https://marketplace.visualstudio.com/items?itemName=es6kr.claude-sessions-vscode) - VS Code extension
