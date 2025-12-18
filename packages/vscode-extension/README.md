# Claude Code Sessions for VS Code

Manage Claude Code sessions directly from VS Code sidebar.

## Features

- **Session Browser**: View all Claude Code projects and sessions in a tree view
- **Quick Access**: Open sessions with a single click
- **Session Management**: Rename and delete sessions
- **Cleanup**: Remove empty and invalid sessions in bulk
- **Web UI Integration**: Launch the full web interface

## Installation

### From VSIX (Local)

```bash
# Build the extension
cd packages/vscode-extension
pnpm install
pnpm build
pnpm package

# Install the .vsix file in VS Code
code --install-extension claude-sessions-vscode-0.1.0.vsix
```

### From Marketplace (Coming Soon)

Search for "Claude Code Sessions" in VS Code Extensions.

## Usage

1. Click the Claude Code Sessions icon in the Activity Bar (left sidebar)
2. Browse your projects and sessions
3. Click a session to view its messages
4. Right-click for rename/delete options
5. Use the toolbar buttons to refresh, open web UI, or cleanup

## Commands

| Command                             | Description                   |
| ----------------------------------- | ----------------------------- |
| `Claude Code Sessions: Refresh`     | Refresh the session tree      |
| `Claude Code Sessions: Open Web UI` | Open the web interface        |
| `Claude Code Sessions: Cleanup`     | Remove empty/invalid sessions |

## Requirements

- VS Code 1.85.0 or later
- Claude Code installed (for session data)

## Related

- [`claude-sessions-mcp`](https://www.npmjs.com/package/claude-sessions-mcp) - MCP Server
- [`@claude-sessions/web`](https://www.npmjs.com/package/@claude-sessions/web) - Web UI

## License

MIT
