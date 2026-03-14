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

## Screenshot

![Web UI](../../docs/screenshot-mainpage.png)

## Features

### Project Listing

Browse Claude Code project folders with expandable tree view, sorted by summary time or name.

![Project Listing](../../docs/feature-project-listing.png)

### Session Management

List, rename, delete, and split sessions. Hover to see session details with tooltip.

![Session Management](../../docs/feature-session-management.png)

### Message Viewer

View messages with tab interface. Inspect user/assistant turns, tool calls, and thinking blocks.

![Message Viewer](../../docs/feature-message-viewer.png)

### Search

Search sessions by title across all projects.

![Search](../../docs/feature-search.png)

### Cleanup

Remove empty sessions, orphan agents, and orphan todos with preview before execution.

![Cleanup](../../docs/feature-cleanup.png)

## API Endpoints

| Endpoint                    | Method   | Description                     |
| --------------------------- | -------- | ------------------------------- |
| `/api/projects`             | GET      | List all projects               |
| `/api/sessions?project=`    | GET      | List sessions in project        |
| `/api/session?project=&id=` | GET      | Get session details             |
| `/api/session/rename`       | POST     | Rename a session                |
| `/api/session/move`         | POST     | Move session to another project |
| `/api/session/split`        | POST     | Split session at message        |
| `/api/session/files`        | GET      | Get files changed in session    |
| `/api/message`              | DELETE   | Delete a message                |
| `/api/cleanup`              | GET/POST | Preview/execute cleanup         |

## Tech Stack

- SvelteKit + Svelte 5
- TailwindCSS
- @claude-sessions/core

## License

MIT
