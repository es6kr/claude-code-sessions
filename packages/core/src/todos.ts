/**
 * Todo file management utilities
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir, getTodosDir } from './paths.js'
import type { TodoItem, SessionTodos } from './types.js'

// Find linked todo files for a session and its agents
// Scans todos directory for files matching session pattern
export const findLinkedTodos = (sessionId: string, agentIds: string[] = []) =>
  Effect.gen(function* () {
    const todosDir = getTodosDir()

    // Check if todos directory exists
    const exists = yield* Effect.tryPromise(() =>
      fs
        .access(todosDir)
        .then(() => true)
        .catch(() => false)
    )

    if (!exists) {
      return {
        sessionId,
        sessionTodos: [],
        agentTodos: [],
        hasTodos: false,
      }
    }

    // Read session's own todo file
    const sessionTodoPath = path.join(todosDir, `${sessionId}.json`)
    let sessionTodos: TodoItem[] = []

    const sessionTodoExists = yield* Effect.tryPromise(() =>
      fs
        .access(sessionTodoPath)
        .then(() => true)
        .catch(() => false)
    )

    if (sessionTodoExists) {
      const content = yield* Effect.tryPromise(() => fs.readFile(sessionTodoPath, 'utf-8'))
      try {
        sessionTodos = JSON.parse(content) as TodoItem[]
      } catch {
        // Invalid JSON, treat as empty
      }
    }

    // Scan todos directory for agent todo files matching this session
    const allFiles = yield* Effect.tryPromise(() => fs.readdir(todosDir))
    const agentTodoPattern = new RegExp(`^${sessionId}-agent-([a-f0-9-]+)\\.json$`)

    // Collect agent IDs from both provided list and directory scan
    const discoveredAgentIds = new Set<string>(agentIds)
    for (const file of allFiles) {
      const match = file.match(agentTodoPattern)
      if (match) {
        discoveredAgentIds.add(`agent-${match[1]}`)
      }
    }

    // Read agent todo files
    const agentTodos: { agentId: string; todos: TodoItem[] }[] = []

    for (const agentId of discoveredAgentIds) {
      // Agent todo files are named: {sessionId}-agent-{shortAgentId}.json
      const shortAgentId = agentId.replace('agent-', '')
      const agentTodoPath = path.join(todosDir, `${sessionId}-agent-${shortAgentId}.json`)

      const agentTodoExists = yield* Effect.tryPromise(() =>
        fs
          .access(agentTodoPath)
          .then(() => true)
          .catch(() => false)
      )

      if (agentTodoExists) {
        const content = yield* Effect.tryPromise(() => fs.readFile(agentTodoPath, 'utf-8'))
        try {
          const todos = JSON.parse(content) as TodoItem[]
          if (todos.length > 0) {
            agentTodos.push({ agentId, todos })
          }
        } catch {
          // Invalid JSON, skip
        }
      }
    }

    const hasTodos = sessionTodos.length > 0 || agentTodos.some((at) => at.todos.length > 0)

    return {
      sessionId,
      sessionTodos,
      agentTodos,
      hasTodos,
    } as SessionTodos
  })

// Check if session has any todos (quick check)
// Scans todos directory for files matching session pattern
export const sessionHasTodos = (sessionId: string, agentIds: string[] = []) =>
  Effect.gen(function* () {
    const todosDir = getTodosDir()

    // Check if todos directory exists
    const exists = yield* Effect.tryPromise(() =>
      fs
        .access(todosDir)
        .then(() => true)
        .catch(() => false)
    )

    if (!exists) return false

    // Check session's own todo file
    const sessionTodoPath = path.join(todosDir, `${sessionId}.json`)
    const sessionTodoExists = yield* Effect.tryPromise(() =>
      fs
        .access(sessionTodoPath)
        .then(() => true)
        .catch(() => false)
    )

    if (sessionTodoExists) {
      const content = yield* Effect.tryPromise(() => fs.readFile(sessionTodoPath, 'utf-8'))
      try {
        const todos = JSON.parse(content) as TodoItem[]
        if (todos.length > 0) return true
      } catch {
        // Invalid JSON, continue
      }
    }

    // Scan todos directory for agent todo files matching this session
    const allFiles = yield* Effect.tryPromise(() => fs.readdir(todosDir))
    const agentTodoPattern = new RegExp(`^${sessionId}-agent-([a-f0-9-]+)\\.json$`)

    // Collect agent IDs from both provided list and directory scan
    const discoveredAgentIds = new Set<string>(agentIds)
    for (const file of allFiles) {
      const match = file.match(agentTodoPattern)
      if (match) {
        discoveredAgentIds.add(`agent-${match[1]}`)
      }
    }

    // Check agent todo files
    for (const agentId of discoveredAgentIds) {
      const shortAgentId = agentId.replace('agent-', '')
      const agentTodoPath = path.join(todosDir, `${sessionId}-agent-${shortAgentId}.json`)

      const agentTodoExists = yield* Effect.tryPromise(() =>
        fs
          .access(agentTodoPath)
          .then(() => true)
          .catch(() => false)
      )

      if (agentTodoExists) {
        const content = yield* Effect.tryPromise(() => fs.readFile(agentTodoPath, 'utf-8'))
        try {
          const todos = JSON.parse(content) as TodoItem[]
          if (todos.length > 0) return true
        } catch {
          // Invalid JSON, continue
        }
      }
    }

    return false
  })

// Delete linked todo files for a session (move to .bak)
export const deleteLinkedTodos = (sessionId: string, agentIds: string[]) =>
  Effect.gen(function* () {
    const todosDir = getTodosDir()

    // Check if todos directory exists
    const exists = yield* Effect.tryPromise(() =>
      fs
        .access(todosDir)
        .then(() => true)
        .catch(() => false)
    )

    if (!exists) return { deletedCount: 0 }

    // Create backup directory
    const backupDir = path.join(todosDir, '.bak')
    yield* Effect.tryPromise(() => fs.mkdir(backupDir, { recursive: true }))

    let deletedCount = 0

    // Delete session's own todo file
    const sessionTodoPath = path.join(todosDir, `${sessionId}.json`)
    const sessionTodoExists = yield* Effect.tryPromise(() =>
      fs
        .access(sessionTodoPath)
        .then(() => true)
        .catch(() => false)
    )

    if (sessionTodoExists) {
      const backupPath = path.join(backupDir, `${sessionId}.json`)
      yield* Effect.tryPromise(() => fs.rename(sessionTodoPath, backupPath))
      deletedCount++
    }

    // Delete agent todo files
    for (const agentId of agentIds) {
      const shortAgentId = agentId.replace('agent-', '')
      const agentTodoPath = path.join(todosDir, `${sessionId}-agent-${shortAgentId}.json`)

      const agentTodoExists = yield* Effect.tryPromise(() =>
        fs
          .access(agentTodoPath)
          .then(() => true)
          .catch(() => false)
      )

      if (agentTodoExists) {
        const backupPath = path.join(backupDir, `${sessionId}-agent-${shortAgentId}.json`)
        yield* Effect.tryPromise(() => fs.rename(agentTodoPath, backupPath))
        deletedCount++
      }
    }

    return { deletedCount }
  })

// Find all orphan todo files (session no longer exists)
export const findOrphanTodos = () =>
  Effect.gen(function* () {
    const todosDir = getTodosDir()
    const sessionsDir = getSessionsDir()

    // Check if directories exist
    const [todosExists, sessionsExists] = yield* Effect.all([
      Effect.tryPromise(() =>
        fs
          .access(todosDir)
          .then(() => true)
          .catch(() => false)
      ),
      Effect.tryPromise(() =>
        fs
          .access(sessionsDir)
          .then(() => true)
          .catch(() => false)
      ),
    ])

    if (!todosExists || !sessionsExists) return []

    // Get all todo files
    const todoFiles = yield* Effect.tryPromise(() => fs.readdir(todosDir))
    const jsonFiles = todoFiles.filter((f) => f.endsWith('.json'))

    // Build set of all valid session IDs across all projects
    const validSessionIds = new Set<string>()
    const projectEntries = yield* Effect.tryPromise(() =>
      fs.readdir(sessionsDir, { withFileTypes: true })
    )

    for (const entry of projectEntries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const projectPath = path.join(sessionsDir, entry.name)
      const files = yield* Effect.tryPromise(() => fs.readdir(projectPath))
      for (const f of files) {
        if (f.endsWith('.jsonl') && !f.startsWith('agent-')) {
          validSessionIds.add(f.replace('.jsonl', ''))
        }
      }
    }

    // Find orphan todo files
    const orphans: string[] = []
    for (const todoFile of jsonFiles) {
      // Parse session ID from todo filename
      // Format: {sessionId}.json or {sessionId}-agent-{agentId}.json
      const match = todoFile.match(/^([a-f0-9-]+)(?:-agent-[a-f0-9]+)?\.json$/)
      if (match) {
        const sessionId = match[1]
        if (!validSessionIds.has(sessionId)) {
          orphans.push(todoFile)
        }
      }
    }

    return orphans
  })

// Delete orphan todo files
export const deleteOrphanTodos = () =>
  Effect.gen(function* () {
    const todosDir = getTodosDir()
    const orphans = yield* findOrphanTodos()

    if (orphans.length === 0) return { success: true, deletedCount: 0 }

    // Create backup directory
    const backupDir = path.join(todosDir, '.bak')
    yield* Effect.tryPromise(() => fs.mkdir(backupDir, { recursive: true }))

    let deletedCount = 0

    for (const orphan of orphans) {
      const filePath = path.join(todosDir, orphan)
      const backupPath = path.join(backupDir, orphan)
      yield* Effect.tryPromise(() => fs.rename(filePath, backupPath))
      deletedCount++
    }

    return { success: true, deletedCount }
  })
