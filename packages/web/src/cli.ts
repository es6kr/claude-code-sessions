#!/usr/bin/env node
/**
 * CLI entry point for @claude-sessions/web
 * Runs the SvelteKit server with configurable port
 *
 * Options:
 *   --port <number>    Port to run the server on (default: 5173)
 *   --editor <cmd>     Editor command to open files (default: code)
 *   --home <path>      Home directory for ~ expansion (default: system homedir)
 *   --project <name>   Current project name for priority sorting (default: auto-detect from cwd)
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverPath = path.join(__dirname, '..', 'build', 'index.js')

// Parse command line arguments
const args = process.argv.slice(2)
let port = 5173
let editor = ''
let home = ''
let project = ''

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10)
    i++
  } else if (args[i] === '--editor' && args[i + 1]) {
    editor = args[i + 1]
    i++
  } else if (args[i] === '--home' && args[i + 1]) {
    home = args[i + 1]
    i++
  } else if (args[i] === '--project' && args[i + 1]) {
    project = args[i + 1]
    i++
  }
}

// Build environment variables
const serverEnv: Record<string, string> = {
  ...process.env,
  PORT: String(port),
} as Record<string, string>

if (editor) {
  serverEnv.CLAUDE_SESSIONS_EDITOR = editor
}
if (home) {
  serverEnv.CLAUDE_SESSIONS_HOME = home
}
if (project) {
  serverEnv.CLAUDE_SESSIONS_PROJECT = project
}

// Start the server
const child = spawn('node', [serverPath], {
  stdio: 'inherit',
  env: serverEnv,
})

child.on('error', (err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

// Forward signals
process.on('SIGTERM', () => child.kill('SIGTERM'))
process.on('SIGINT', () => child.kill('SIGINT'))
