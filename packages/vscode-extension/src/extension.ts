import * as vscode from 'vscode'
import { SessionTreeProvider, type SessionTreeItem } from './treeProvider'
import * as session from '@claude-sessions/core'
import { resumeSession } from '@claude-sessions/core/server'
import { Effect } from 'effect'
import { spawn, type ChildProcess } from 'node:child_process'
import { outputChannel } from './output'

let webServerProcess: ChildProcess | null = null

function shortLabel(text: string, max = 30): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

function shortProjectName(projectName: string): string {
  // Extract last path segment from encoded folder name (e.g. "-home-work-projects-Foo" → "Foo")
  const parts = projectName.split('-').filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : projectName
}

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
    autoStartServer: config.get<boolean>('autoStartServer', true),
    cliFlags: config.get<string>('cliFlags', ''),
    defaultTerminalMode: config.get<string>('defaultTerminalMode', 'ask'),
    openInEditor: config.get<boolean>('openInEditor', true),
    packageTag: config.get<string>('packageTag', ''),
    port: config.get<number>('port', 5174),
    useBetaVersion: config.get<boolean>('useBetaVersion', false),
    webServerPath: config.get<string>('webServerPath', ''),
  }
}

function killWebServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!webServerProcess) {
      resolve()
      return
    }
    const proc = webServerProcess
    // Escalate to SIGKILL if process doesn't exit within 3s
    const timeout = setTimeout(() => {
      try {
        if (proc.pid && process.platform !== 'win32') {
          process.kill(-proc.pid, 'SIGKILL')
        } else {
          proc.kill('SIGKILL')
        }
      } catch {
        // Process already terminated
      }
      webServerProcess = null
      resolve()
    }, 3000)
    proc.once('exit', () => {
      clearTimeout(timeout)
      webServerProcess = null
      resolve()
    })
    // shell: true + detached: true spawns a new process group.
    // Use negative PID to kill the entire group (shell + npx + node).
    // On Windows, detached creates a new console so proc.kill() suffices.
    if (proc.pid && process.platform !== 'win32') {
      try {
        process.kill(-proc.pid, 'SIGTERM')
      } catch {
        try {
          proc.kill()
        } catch {
          // Process already terminated
        }
      }
    } else {
      try {
        proc.kill()
      } catch {
        // Process already terminated
      }
    }
  })
}

async function ensureWebServer({
  forceRestart = false,
  skipAutoStartCheck = false,
} = {}): Promise<number> {
  const { port, autoStartServer } = getConfig()

  // Check if server is running (skip when force-restarting with new config)
  if (!forceRestart) {
    try {
      const response = await fetch(`http://localhost:${port}/api/version`)
      if (response.ok) return port
    } catch {
      // Server not running
    }
  }

  if (!autoStartServer && !skipAutoStartCheck) {
    throw new Error(
      `Web server not running on port ${port}. Start it manually or enable autoStartServer.`
    )
  }

  // Start the server
  await killWebServer()

  const { packageTag, useBetaVersion, webServerPath } = getConfig()

  let spawnCmd: string
  let spawnArgs: string[]

  if (webServerPath) {
    spawnCmd = 'node'
    spawnArgs = [webServerPath, '--port', String(port)]
  } else {
    // Resolve effective tag: packageTag takes precedence, useBetaVersion as fallback
    const tag = packageTag || (useBetaVersion ? 'beta' : '')
    const packageSpec = tag ? `@claude-sessions/web@${tag}` : '@claude-sessions/web'
    spawnCmd = 'npx'
    spawnArgs = ['-y', packageSpec, '--port', String(port)]
  }

  outputChannel.appendLine('=== Starting Web Server ===')
  outputChannel.appendLine(`Command: ${spawnCmd} ${spawnArgs.join(' ')}`)

  return new Promise((resolve, reject) => {
    const child = spawn(spawnCmd, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: process.platform !== 'win32',
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

async function resolveProjectCwd(projectName: string): Promise<string> {
  const folderPath = await session.folderNameToPath(projectName)
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  return session.expandHomePath(folderPath, homeDir)
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
          const localUrl = `http://localhost:${port}/session/${encodeURIComponent(item.projectName)}/${encodeURIComponent(item.sessionId)}`
          const externalUri = await vscode.env.asExternalUri(vscode.Uri.parse(localUrl))

          if (openInEditor) {
            await vscode.commands.executeCommand('simpleBrowser.show', externalUri.toString())
          } else {
            await vscode.env.openExternal(externalUri)
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
          'Delete & Restart Extensions'
        )

        if (confirm === 'Delete' || confirm === 'Delete & Restart Extensions') {
          await Effect.runPromise(session.deleteSession(item.projectName, item.sessionId))
          treeProvider.refresh()

          if (confirm === 'Delete & Restart Extensions') {
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
        const externalUri = await vscode.env.asExternalUri(
          vscode.Uri.parse(`http://localhost:${port}`)
        )
        vscode.env.openExternal(externalUri)
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to open Web UI: ${e}`)
      }
    }),

    vscode.commands.registerCommand(
      'claudeSessions.openProjectFolder',
      async (item: SessionTreeItem) => {
        if (item.type !== 'project') return

        const absolutePath = await resolveProjectCwd(item.projectName)

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

    vscode.commands.registerCommand(
      'claudeSessions.moveSession',
      async (item: SessionTreeItem, selectedItems?: SessionTreeItem[]) => {
        // When multiple items selected via right-click, selectedItems contains all of them
        const items = selectedItems && selectedItems.length > 0 ? selectedItems : [item]
        const sessions = items.filter((i) => i.type === 'session')

        if (sessions.length === 0) return

        // Get all projects
        const projects = await Effect.runPromise(session.listProjects)
        // Exclude all source projects from target list
        const sourceProjectNames = new Set(sessions.map((s) => s.projectName))
        const otherProjects = projects.filter(
          (p) => !sourceProjectNames.has(p.name) && p.sessionCount >= 0
        )

        if (otherProjects.length === 0) {
          vscode.window.showWarningMessage('No other projects available')
          return
        }

        // Show quick pick to select target project
        const quickPickItems = await Promise.all(
          otherProjects.map(async (p) => ({
            label: await session.folderNameToPath(p.name),
            description: `${p.sessionCount} sessions`,
            projectName: p.name,
          }))
        )
        const selected = await vscode.window.showQuickPick(quickPickItems, {
          placeHolder: 'Select target project',
          title:
            sessions.length > 1 ? `Move ${sessions.length} Sessions to...` : 'Move Session to...',
        })

        if (!selected) return

        let successCount = 0
        let failCount = 0

        for (const sessionItem of sessions) {
          // Skip if source equals target
          if (sessionItem.projectName === selected.projectName) continue

          const result = await Effect.runPromise(
            session.moveSession(
              sessionItem.projectName,
              sessionItem.sessionId,
              selected.projectName
            )
          )

          if (result.success) {
            successCount++
          } else {
            failCount++
            outputChannel.appendLine(
              `Failed to move session ${sessionItem.sessionId}: ${result.error}`
            )
          }
        }

        treeProvider.refresh()

        if (successCount > 0 && failCount === 0) {
          vscode.window.showInformationMessage(
            successCount === 1
              ? `Moved session to ${selected.label}`
              : `Moved ${successCount} sessions to ${selected.label}`
          )
        } else if (successCount > 0 && failCount > 0) {
          vscode.window.showWarningMessage(
            `Moved ${successCount} sessions, ${failCount} failed. See output for details.`
          )
        } else {
          vscode.window.showErrorMessage('Failed to move sessions. See output for details.')
        }
      }
    ),

    vscode.commands.registerCommand('claudeSessions.filterSessions', async () => {
      const value = await vscode.window.showInputBox({
        prompt: 'Filter sessions by title or summary',
        value: treeProvider.getFilterText(),
        placeHolder: 'Type to filter sessions...',
      })

      if (value !== undefined) {
        treeProvider.setFilterText(value)
        treeView.message = value.trim() ? `Filter: "${value.trim()}"` : undefined
        vscode.commands.executeCommand(
          'setContext',
          'claudeSessions.filterActive',
          value.trim().length > 0
        )
      }
    }),

    vscode.commands.registerCommand('claudeSessions.clearFilter', () => {
      treeProvider.setFilterText('')
      treeView.message = undefined
      vscode.commands.executeCommand('setContext', 'claudeSessions.filterActive', false)
    }),

    vscode.commands.registerCommand('claudeSessions.sortBy', async () => {
      const sortOptions: Array<{
        label: string
        description: string
        field: session.SessionSortField
        order: session.SessionSortOrder
      }> = [
        {
          label: '$(clock) Recently Updated',
          description: 'Most recent message first (default)',
          field: 'updated',
          order: 'desc',
        },
        {
          label: '$(history) Latest Summary',
          description: 'Most recent summary first',
          field: 'summary',
          order: 'desc',
        },
        {
          label: '$(calendar) Recently Modified',
          description: 'Most recently modified file first',
          field: 'modified',
          order: 'desc',
        },
        {
          label: '$(calendar) Recently Created',
          description: 'Newest session first',
          field: 'created',
          order: 'desc',
        },
        {
          label: '$(comment-discussion) Most Messages',
          description: 'Highest message count first',
          field: 'messageCount',
          order: 'desc',
        },
        {
          label: '$(symbol-text) Title A-Z',
          description: 'Alphabetical by title',
          field: 'title',
          order: 'asc',
        },
        {
          label: '$(calendar) Oldest First',
          description: 'Oldest session first',
          field: 'created',
          order: 'asc',
        },
      ]

      const currentSort = treeProvider.getSortOptions()
      const selected = await vscode.window.showQuickPick(
        sortOptions.map((opt) => ({
          ...opt,
          picked: opt.field === currentSort.field && opt.order === currentSort.order,
        })),
        {
          placeHolder: 'Select sort option',
          title: 'Sort Sessions',
        }
      )

      if (selected) {
        treeProvider.setSortOptions({ field: selected.field, order: selected.order })
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

        const { defaultTerminalMode, cliFlags } = getConfig()
        const cliCommand = cliFlags
          ? `claude --resume ${item.sessionId} ${cliFlags}`
          : `claude --resume ${item.sessionId}`

        // Get project path for cwd (needed for all modes)
        const cwd = await resolveProjectCwd(item.projectName)

        // Determine terminal mode: skip picker if pre-configured
        let mode: 'internal' | 'external'
        if (defaultTerminalMode === 'internal' || defaultTerminalMode === 'external') {
          mode = defaultTerminalMode
        } else {
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
          mode = choice.mode
        }

        if (mode === 'internal') {
          // Create terminal with proper name and cwd
          const terminal = vscode.window.createTerminal({
            name: `Claude: ${shortLabel(item.label as string)}`,
            cwd,
          })
          terminal.show()
          terminal.sendText(cliCommand)
        } else {
          // External: spawn detached process
          const extraArgs = cliFlags ? cliFlags.split(/\s+/).filter(Boolean) : []
          const result = resumeSession({
            sessionId: item.sessionId,
            cwd,
            args: extraArgs,
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

    vscode.commands.registerCommand('claudeSessions.restartWebServer', async () => {
      await killWebServer()
      try {
        await ensureWebServer({ forceRestart: true, skipAutoStartCheck: true })
        vscode.window.showInformationMessage('Web server restarted successfully')
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to restart web server: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }),

    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (
        e.affectsConfiguration('claudeSessions.packageTag') ||
        e.affectsConfiguration('claudeSessions.useBetaVersion')
      ) {
        if (!webServerProcess) {
          outputChannel.appendLine(
            'Package tag setting changed; no managed web server is running, skipping restart'
          )
          return
        }
        outputChannel.appendLine('Package tag setting changed, restarting web server...')
        await killWebServer()
        try {
          await ensureWebServer({ forceRestart: true })
          outputChannel.appendLine('Web server restarted with new configuration')
        } catch (err) {
          outputChannel.appendLine(
            `Failed to restart web server: ${
              err instanceof Error ? (err.stack ?? err.message) : String(err)
            }`
          )
          vscode.window.showErrorMessage(
            `Failed to restart web server: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
    }),

    vscode.commands.registerCommand(
      'claudeSessions.openTerminalHere',
      async (item: SessionTreeItem) => {
        if (item.type !== 'session') return

        const folderPath = await session.folderNameToPath(item.projectName)
        const homeDir = process.env.HOME || process.env.USERPROFILE || ''
        const cwd = session.expandHomePath(folderPath, homeDir)

        const terminal = vscode.window.createTerminal({
          name: `Terminal: ${shortProjectName(item.projectName)}`,
          cwd,
        })
        terminal.show()
      }
    ),

    vscode.commands.registerCommand(
      'claudeSessions.startClaudeYolo',
      async (item: SessionTreeItem) => {
        if (item.type !== 'session') return

        const folderPath = await session.folderNameToPath(item.projectName)
        const homeDir = process.env.HOME || process.env.USERPROFILE || ''
        const cwd = session.expandHomePath(folderPath, homeDir)

        const terminal = vscode.window.createTerminal({
          name: `Claude: ${shortProjectName(item.projectName)}`,
          cwd,
        })
        terminal.show()
        terminal.sendText('claude --dangerously-skip-permissions')
      }
    ),

    vscode.commands.registerCommand(
      'claudeSessions.resumeSessionYolo',
      async (item: SessionTreeItem) => {
        if (item.type !== 'session') return

        const folderPath = await session.folderNameToPath(item.projectName)
        const homeDir = process.env.HOME || process.env.USERPROFILE || ''
        const cwd = session.expandHomePath(folderPath, homeDir)

        const terminal = vscode.window.createTerminal({
          name: `Claude: ${shortLabel(item.label as string)}`,
          cwd,
        })
        terminal.show()
        terminal.sendText(`claude --resume ${item.sessionId} --dangerously-skip-permissions`)
      }
    ),

    treeView
  )
}

export async function deactivate() {
  await killWebServer()
}
