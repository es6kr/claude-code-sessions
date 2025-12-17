# @claude-sessions/web

Web UI for managing Claude Code sessions.

## Usage

```bash
# Start web server (default port 5173)
npx @claude-sessions/web

# Custom port
npx @claude-sessions/web --port 8080
```

Open http://localhost:5173 in your browser.

## Features

- **Project Browser**: View all Claude Code projects with session counts
- **Session Management**: Rename, delete, and split sessions
- **Message Viewer**: Browse messages with syntax highlighting
- **Cleanup**: Remove empty sessions and invalid API key messages
- **File Tracking**: View files changed during a session

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects` | GET | List all projects |
| `/api/sessions?project=` | GET | List sessions in project |
| `/api/session?project=&id=` | GET | Get session details |
| `/api/session/rename` | POST | Rename a session |
| `/api/session/move` | POST | Move session to another project |
| `/api/session/split` | POST | Split session at message |
| `/api/session/files` | GET | Get files changed in session |
| `/api/message` | DELETE | Delete a message |
| `/api/cleanup` | GET/POST | Preview/execute cleanup |

## Tech Stack

- SvelteKit + Svelte 5
- TailwindCSS
- @claude-sessions/core

## License

MIT
