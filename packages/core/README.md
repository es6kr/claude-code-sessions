# @claude-sessions/core

Core library for Claude Code session management.

## Installation

```bash
npm install @claude-sessions/core
# or
pnpm add @claude-sessions/core
```

## Usage

```typescript
import { Effect } from 'effect'
import {
  listProjects,
  listSessions,
  readSession,
  searchSessions,
  deleteSession,
  renameSession,
} from '@claude-sessions/core'

// List all projects
const projects = await Effect.runPromise(listProjects())

// List sessions in a project
const sessions = await Effect.runPromise(listSessions(projectName))

// Read session messages
const messages = await Effect.runPromise(readSession(projectName, sessionId))

// Search sessions (title only)
const titleResults = await Effect.runPromise(
  searchSessions('query', { searchContent: false })
)

// Search sessions (title + content)
const allResults = await Effect.runPromise(
  searchSessions('query', { searchContent: true })
)

// Rename a session
await Effect.runPromise(renameSession(projectName, sessionId, 'New Title'))

// Delete a session (moves to backup)
await Effect.runPromise(deleteSession(projectName, sessionId))
```

## API

### Session Operations

| Function | Description |
|----------|-------------|
| `listProjects()` | List all Claude Code projects |
| `listSessions(projectName)` | List sessions in a project |
| `readSession(projectName, sessionId)` | Read all messages in a session |
| `searchSessions(query, options?)` | Search sessions by title or content |
| `renameSession(projectName, sessionId, title)` | Rename a session |
| `deleteSession(projectName, sessionId)` | Delete a session (backup) |
| `deleteMessage(projectName, sessionId, uuid)` | Delete a message |
| `splitSession(projectName, sessionId, uuid)` | Split session at a message |
| `moveSession(source, sessionId, target)` | Move session to another project |
| `getSessionFiles(projectName, sessionId)` | Get files changed in session |
| `previewCleanup(projectName?)` | Preview cleanup candidates |
| `clearSessions(options)` | Clear empty/invalid sessions |

### Path Utilities

| Function | Description |
|----------|-------------|
| `getSessionsDir()` | Get Claude Code sessions directory |
| `getTodosDir()` | Get Claude Code todos directory |
| `folderNameToDisplayPath(name)` | Convert folder name to display path |
| `displayPathToFolderName(path)` | Convert display path to folder name |

### Message Utilities

| Function | Description |
|----------|-------------|
| `extractTextContent(message)` | Extract text from message content |
| `extractTitle(messages)` | Extract session title from messages |
| `isInvalidApiKeyMessage(message)` | Check if message has invalid API key error |
| `isContinuationSummary(message)` | Check if message is a continuation summary |

### Agent & Todo Management

| Function | Description |
|----------|-------------|
| `findLinkedAgents(projectName, sessionId)` | Find agents linked to session |
| `findOrphanAgents(projectName?)` | Find orphan agent files |
| `deleteOrphanAgents(projectName?)` | Delete orphan agents |
| `findLinkedTodos(projectName, sessionId)` | Find todos linked to session |
| `sessionHasTodos(projectName, sessionId)` | Check if session has todos |
| `findOrphanTodos(projectName?)` | Find orphan todo files |
| `deleteOrphanTodos(projectName?)` | Delete orphan todos |

## License

MIT