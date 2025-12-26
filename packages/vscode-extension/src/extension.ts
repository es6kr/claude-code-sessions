import * as vscode from 'vscode'
import { SessionTreeProvider, type SessionTreeItem } from './treeProvider'
import * as session from '@claude-sessions/core'
import { Effect } from 'effect'
import { spawn, type ChildProcess } from 'node:child_process'

let webServerProcess: ChildProcess | null = null

// Global output channel for debugging
export const outputChannel = vscode.window.createOutputChannel('Claude Sessions')

// Configure core library to use VSCode output channel
session.setLogger({
  debug: (msg: string) => outputChannel.appendLine(`[DEBUG] ${msg}`),
  info: (msg: string) => outputChannel.appendLine(`[INFO] ${msg}`),
  warn: (msg: string) => outputChannel.appendLine(`[WARN] ${msg}`),
  error: (msg: string) => outputChannel.appendLine(`[ERROR] ${msg}`),
})

function getConfig() {
  const config = vscode.workspace.getConfiguration('claudeSessions')
  return {
    port: config.get<number>('port', 5174),
    autoStartServer: config.get<boolean>('autoStartServer', true),
    openInEditor: config.get<boolean>('openInEditor', true),
  }
}

async function ensureWebServer(): Promise<number> {
  const { port, autoStartServer } = getConfig()

  // Check if server is running
  try {
    const response = await fetch(`http://localhost:${port}/api/version`)
    if (response.ok) return port
  } catch {
    // Server not running
  }

  if (!autoStartServer) {
    throw new Error(
      `Web server not running on port ${port}. Start it manually or enable autoStartServer.`
    )
  }

  // Start the server
  if (webServerProcess) {
    webServerProcess.kill()
    webServerProcess = null
  }

  outputChannel.appendLine('=== Starting Web Server ===')
  outputChannel.appendLine(`Command: npx @claude-sessions/web --port ${port}`)

  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['-y', '@claude-sessions/web', '--port', String(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })

    webServerProcess = child
    let waitingForReady = false

    const timeout = setTimeout(() => {
      outputChannel.appendLine('ERROR: Server startup timeout')
      reject(new Error('Server startup timeout'))
    }, 30000)

    // Wait for server to be ready with health check
    const waitForReady = async () => {
      if (waitingForReady) return // Prevent duplicate calls
      waitingForReady = true
      clearTimeout(timeout)
      outputChannel.appendLine(`Server output indicates ready, verifying with health check...`)

      // Retry health check up to 20 times with 300ms delay
      for (let i = 0; i < 20; i++) {
        outputChannel.appendLine(`Health check attempt ${i + 1}/20...`)
        try {
          const response = await fetch(`http://localhost:${port}/api/version`)
          if (response.ok) {
            // Wait for SvelteKit to fully initialize
            outputChannel.appendLine(`Health check passed, waiting 1s for SvelteKit...`)
            await new Promise((r) => setTimeout(r, 1000))
            outputChannel.appendLine(`Server ready on port ${port}`)
            resolve(port)
            return
          }
          outputChannel.appendLine(`Health check returned ${response.status}`)
        } catch (e) {
          outputChannel.appendLine(`Health check failed: ${e}`)
        }
        await new Promise((r) => setTimeout(r, 300))
      }
      reject(new Error('Server health check failed'))
    }

    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString().trim()
      if (output) {
        outputChannel.appendLine(`[stdout] ${output}`)
      }
      // Only trigger on actual "Listening on" message
      if (output.includes('Listening on')) {
        waitForReady()
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      const output = data.toString().trim()
      if (output) {
        outputChannel.appendLine(`[stderr] ${output}`)
      }
      // Only trigger on actual "Listening on" message
      if (output.includes('Listening on')) {
        waitForReady()
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      outputChannel.appendLine(`ERROR: ${err.message}`)
      reject(err)
    })

    child.on('exit', (code) => {
      outputChannel.appendLine(`Server exited with code ${code}`)
      if (code !== 0 && code !== null) {
        clearTimeout(timeout)
        reject(new Error(`Server exited with code ${code}`))
      }
    })
  })
}

async function openOrRevealFolder(absolutePath: string) {
  // Normalize paths for comparison (lowercase on Windows, forward slashes)
  const normalize = (p: string) => p.toLowerCase().replace(/\\/g, '/')

  const workspaceFolders = vscode.workspace.workspaceFolders
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      if (normalize(absolutePath).startsWith(normalize(folder.uri.fsPath))) {
        const uri = vscode.Uri.file(absolutePath)
        await vscode.commands.executeCommand('revealInExplorer', uri)
        return
      }
    }
  }

  // Open in OS file explorer instead of new VSCode window
  await vscode.env.openExternal(vscode.Uri.file(absolutePath))
}

export function activate(context: vscode.ExtensionContext) {
  const treeProvider = new SessionTreeProvider()

  // Register tree view with drag and drop support
  const treeView = vscode.window.createTreeView('claudeSessions', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
    canSelectMany: true,
    dragAndDropController: treeProvider,
  })

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeSessions.refresh', () => {
      treeProvider.refresh()
    }),

    vscode.commands.registerCommand('claudeSessions.openSession', async (item: SessionTreeItem) => {
      if (item.type === 'session') {
        try {
          const port = await ensureWebServer()
          const { openInEditor } = getConfig()
          const url = `http://localhost:${port}/session/${encodeURIComponent(item.projectName)}/${encodeURIComponent(item.sessionId)}`

          if (openInEditor) {
            // Open in VS Code Simple Browser (expects string URL)
            await vscode.commands.executeCommand('simpleBrowser.show', url)
          } else {
            // Open in external browser
            await vscode.env.openExternal(vscode.Uri.parse(url))
          }
        } catch (e) {
          vscode.window.showErrorMessage(`Failed to open session: ${e}`)
        }
      }
    }),

    vscode.commands.registerCommand(
      'claudeSessions.renameSession',
      async (item: SessionTreeItem) => {
        if (item.type !== 'session') return

        const newTitle = await vscode.window.showInputBox({
          prompt: 'Enter new session title',
          value: item.label as string,
        })

        if (newTitle) {
          await Effect.runPromise(session.renameSession(item.projectName, item.sessionId, newTitle))
          treeProvider.refresh()
          vscode.window.showInformationMessage(`Session renamed to "${newTitle}"`)
        }
      }
    ),

    vscode.commands.registerCommand(
      'claudeSessions.deleteSession',
      async (item: SessionTreeItem) => {
        if (item.type !== 'session') return

        const confirm = await vscode.window.showWarningMessage(
          `Delete session "${item.label}"?`,
          { modal: true },
          'Delete',
          'Delete & Restart Extension Host'
        )

        if (confirm === 'Delete' || confirm === 'Delete & Restart Extension Host') {
          await Effect.runPromise(session.deleteSession(item.projectName, item.sessionId))
          treeProvider.refresh()

          if (confirm === 'Delete & Restart Extension Host') {
            await vscode.commands.executeCommand('workbench.action.restartExtensionHost')
          } else {
            vscode.window.showInformationMessage('Session deleted')
          }
        }
      }
    ),

    vscode.commands.registerCommand('claudeSessions.openWebUI', async () => {
      try {
        const port = await ensureWebServer()
        vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`))
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to open Web UI: ${e}`)
      }
    }),

    vscode.commands.registerCommand(
      'claudeSessions.openProjectFolder',
      async (item: SessionTreeItem) => {
        if (item.type !== 'project') return

        const folderPath = session.folderNameToPath(item.projectName)
        const homeDir = process.env.HOME || process.env.USERPROFILE || ''
        const absolutePath = folderPath.startsWith('~')
          ? folderPath.replace('~', homeDir)
          : folderPath

        await openOrRevealFolder(absolutePath)
      }
    ),

    vscode.commands.registerCommand(
      'claudeSessions.openSessionsFolder',
      async (item: SessionTreeItem) => {
        if (item?.type !== 'project') return

        const sessionsDir = session.getSessionsDir()
        // Use path.join for cross-platform compatibility
        const path = await import('node:path')
        const projectSessionsFolder = path.join(sessionsDir, item.projectName)

        await openOrRevealFolder(projectSessionsFolder)
      }
    ),

    vscode.commands.registerCommand('claudeSessions.moveSession', async (item: SessionTreeItem) => {
      if (item.type !== 'session') return

      // Get all projects
      const projects = await Effect.runPromise(session.listProjects)
      const otherProjects = projects.filter(
        (p) => p.name !== item.projectName && p.sessionCount >= 0
      )

      if (otherProjects.length === 0) {
        vscode.window.showWarningMessage('No other projects available')
        return
      }

      // Show quick pick to select target project
      const selected = await vscode.window.showQuickPick(
        otherProjects.map((p) => ({
          label: session.folderNameToPath(p.name),
          description: `${p.sessionCount} sessions`,
          projectName: p.name,
        })),
        {
          placeHolder: 'Select target project',
          title: 'Move Session to...',
        }
      )

      if (!selected) return

      const result = await Effect.runPromise(
        session.moveSession(item.projectName, item.sessionId, selected.projectName)
      )

      if (result.success) {
        treeProvider.refresh()
        vscode.window.showInformationMessage(`Moved session to ${selected.label}`)
      } else {
        vscode.window.showErrorMessage(`Failed to move session: ${result.error}`)
      }
    }),

    vscode.commands.registerCommand('claudeSessions.cleanup', async () => {
      const preview = await Effect.runPromise(session.previewCleanup())

      const totalEmpty = preview.reduce((sum, p) => sum + p.emptySessions.length, 0)
      const totalInvalid = preview.reduce((sum, p) => sum + p.invalidSessions.length, 0)

      if (totalEmpty === 0 && totalInvalid === 0) {
        vscode.window.showInformationMessage('No sessions to clean up')
        return
      }

      const confirm = await vscode.window.showWarningMessage(
        `Clean up ${totalEmpty} empty sessions and ${totalInvalid} invalid sessions?`,
        { modal: true },
        'Clean Up'
      )

      if (confirm === 'Clean Up') {
        const result = await Effect.runPromise(session.clearSessions({}))
        treeProvider.refresh()
        vscode.window.showInformationMessage(`Cleaned up ${result.deletedCount} sessions`)
      }
    }),

    vscode.commands.registerCommand(
      'claudeSessions.resumeSession',
      async (item: SessionTreeItem) => {
        if (item.type !== 'session') return

        const choice = await vscode.window.showQuickPick(
          [
            {
              label: '$(terminal) Internal Terminal',
              description: 'Open in VSCode integrated terminal',
              mode: 'internal' as const,
            },
            {
              label: '$(link-external) External Terminal',
              description: 'Open in system default terminal',
              mode: 'external' as const,
            },
          ],
          {
            placeHolder: 'Where to open Claude session?',
            title: 'Resume Session',
          }
        )

        if (!choice) return

        // Get project path for cwd
        const folderPath = session.folderNameToPath(item.projectName)
        const homeDir = process.env.HOME || process.env.USERPROFILE || ''
        const cwd = folderPath.startsWith('~') ? folderPath.replace('~', homeDir) : folderPath

        if (choice.mode === 'internal') {
          // Create terminal with proper name and cwd
          const terminal = vscode.window.createTerminal({
            name: `Claude: ${item.label}`,
            cwd,
          })
          terminal.show()
          terminal.sendText(`claude --resume ${item.sessionId}`)
        } else {
          // External: spawn detached process
          const result = session.resumeSession({
            sessionId: item.sessionId,
            cwd,
          })

          if (result.success) {
            vscode.window.showInformationMessage(
              `Claude session started in external terminal (PID: ${result.pid})`
            )
          } else {
            vscode.window.showErrorMessage(`Failed to resume session: ${result.error}`)
          }
        }
      }
    ),

    treeView
  )
}

export function deactivate() {
  if (webServerProcess) {
    webServerProcess.kill()
    webServerProcess = null
  }
}
