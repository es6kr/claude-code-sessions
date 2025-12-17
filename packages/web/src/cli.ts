#!/usr/bin/env node
/**
 * CLI entry point for @claude-sessions/web
 * Runs the SvelteKit server with configurable port
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverPath = path.join(__dirname, '..', 'build', 'index.js')

// Parse command line arguments
const args = process.argv.slice(2)
let port = 5173

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10)
    i++
  }
}

// Start the server
const child = spawn('node', [serverPath], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(port) },
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
