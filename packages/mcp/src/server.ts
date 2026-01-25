/**
 * Web server management for MCP
 * Launches @claude-sessions/web
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Determine the npm tag for @claude-sessions/web based on current MCP package version.
 * Beta MCP should use beta web, alpha MCP should use alpha web.
 */
export function getWebPackageTag(version: string): 'latest' | 'beta' | 'alpha' {
  if (version.includes('-beta')) return 'beta'
  if (version.includes('-alpha')) return 'alpha'
  return 'latest'
}

/**
 * Get the current package version from package.json
 */
function getCurrentVersion(): string {
  const packageJsonPath = resolve(__dirname, '../package.json')
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    return packageJson.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export interface WebServer {
  process: ChildProcess
  port: number
}

export interface WebServerOptions {
  port?: number
  openBrowser?: boolean
  editor?: string
  home?: string
  project?: string
}

export async function startWebServer(options: WebServerOptions = {}): Promise<WebServer> {
  const { port = 5173, openBrowser = true, editor, home, project } = options

  // Try local build first, fallback to npx
  const localCliPath = resolve(__dirname, '../../web/dist/cli.js')
  const useLocal = existsSync(localCliPath)

  // Build CLI arguments
  const cliArgs = ['--port', String(port)]
  if (editor) {
    cliArgs.push('--editor', editor)
  }
  if (home) {
    cliArgs.push('--home', home)
  }
  if (project) {
    cliArgs.push('--project', project)
  }

  const webPackageTag = getWebPackageTag(getCurrentVersion())
  const child = useLocal
    ? spawn('node', [localCliPath, ...cliArgs], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      })
    : spawn('npx', [`@claude-sessions/web@${webPackageTag}`, ...cliArgs], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      })

  // Wait for server to start
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 30000)

    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      // SvelteKit adapter-node outputs "Listening on http://0.0.0.0:PORT"
      if (
        output.includes('Listening on') ||
        output.includes('localhost') ||
        output.includes('Local:')
      ) {
        clearTimeout(timeout)
        resolve()
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      const output = data.toString()
      // npm/npx progress output goes to stderr
      if (output.includes('Listening on') || output.includes('localhost')) {
        clearTimeout(timeout)
        resolve()
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.on('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeout)
        reject(new Error(`Server exited with code ${code}`))
      }
    })
  })

  // Open browser if requested
  if (openBrowser) {
    const url = `http://localhost:${port}`
    const openCmd =
      process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
    spawn(openCmd, [url], { stdio: 'ignore', detached: true }).unref()
  }

  return { process: child, port }
}

export async function stopWebServer(server: WebServer): Promise<void> {
  server.process.kill('SIGTERM')
}
