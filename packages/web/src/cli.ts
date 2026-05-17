#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverPath = path.join(__dirname, '..', 'build', 'index.js')

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10)
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new InvalidArgumentError('Port must be a number between 1 and 65535.')
  }
  return port
}

const program = new Command()
  .name('claude-sessions-web')
  .description('Web UI for Claude Code session management')
  .version(version)
  .option('-p, --port <number>', 'port to run the server on', parsePort, 5173)
  .option('--editor <cmd>', 'editor command to open files')
  .option('--home <path>', 'home directory for ~ expansion')
  .option('--project <name>', 'current project name for priority sorting')
  .option('--yolo', 'skip all safety checks')
  .parse()

const opts = program.opts<{
  port: number
  editor?: string
  home?: string
  project?: string
  yolo?: boolean
}>()

// Build environment variables
const serverEnv: Record<string, string> = {
  ...process.env,
  PORT: String(opts.port),
} as Record<string, string>

if (opts.editor) {
  serverEnv.CLAUDE_SESSIONS_EDITOR = opts.editor
}
if (opts.home) {
  serverEnv.CLAUDE_SESSIONS_HOME = opts.home
}
if (opts.project) {
  serverEnv.CLAUDE_SESSIONS_PROJECT = opts.project
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
