import * as vscode from 'vscode'
import { SessionTreeProvider, type SessionTreeItem } from './treeProvider'
import * as session from '@claude-sessions/core'
import { Effect } from 'effect'
import { spawn, type ChildProcess } from 'node:child_process'

let webServerProcess: ChildProcess | null = null

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
    throw new Error(`Web server not running on port ${port}. Start it manually or enable autoStartServer.`)
  }

  // Start the server
  if (webServerProcess) {
    webServerProcess.kill()
    webServerProcess = null
  }

  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['@claude-sessions/web', '--port', String(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })

    webServerProcess = child

    const timeout = setTimeout(() => {
      reject(new Error('Server startup timeout'))
    }, 30000)

    child.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      if (output.includes('Listening on') || output.includes('localhost')) {
        clearTimeout(timeout)
        resolve(port)
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      const output = data.toString()
      if (output.includes('Listening on') || output.includes('localhost')) {
        clearTimeout(timeout)
        resolve(port)
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout)
        reject(new Error(`Server exited with code ${code}`))
      }
    })
  })
}

async function openOrRevealFolder(absolutePath: string) {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      if (absolutePath.startsWith(folder.uri.fsPath)) {
        const uri = vscode.Uri.file(absolutePath)
        await vscode.commands.executeCommand('revealInExplorer', uri)
        return
      }
    }
  }
  const uri = vscode.Uri.file(absolutePath)
  await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true })
}

export function activate(context: vscode.ExtensionContext) {
  const treeProvider = new SessionTreeProvider()

  // Register tree view with drag and drop support
  const treeView = vscode.window.createTreeView('claudeSessions', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
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

    vscode.commands.registerCommand('claudeSessions.renameSession', async (item: SessionTreeItem) => {
      if (item.type !== 'session') return

      const newTitle = await vscode.window.showInputBox({
        prompt: 'Enter new session title',
        value: item.label as string,
      })

      if (newTitle) {
        await Effect.runPromise(
          session.renameSession(item.projectName, item.sessionId, newTitle)
        )
        treeProvider.refresh()
        vscode.window.showInformationMessage(`Session renamed to "${newTitle}"`)
      }
    }),

    vscode.commands.registerCommand('claudeSessions.deleteSession', async (item: SessionTreeItem) => {
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
    }),

    vscode.commands.registerCommand('claudeSessions.openWebUI', async () => {
      try {
        const port = await ensureWebServer()
        vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`))
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to open Web UI: ${e}`)
      }
    }),

    vscode.commands.registerCommand('claudeSessions.openProjectFolder', async (item: SessionTreeItem) => {
      if (item.type !== 'project') return

      const folderPath = session.folderNameToPath(item.projectName)
      const absolutePath = folderPath.startsWith('~')
        ? folderPath.replace('~', process.env.HOME || '')
        : folderPath

      await openOrRevealFolder(absolutePath)
    }),

    vscode.commands.registerCommand('claudeSessions.openSessionsFolder', async (item: SessionTreeItem) => {
      if (item?.type !== 'project') return

      const sessionsDir = session.getSessionsDir()
      const projectSessionsFolder = `${sessionsDir}/${item.projectName}`
      await openOrRevealFolder(projectSessionsFolder)
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

    treeView
  )
}

export function deactivate() {
  if (webServerProcess) {
    webServerProcess.kill()
    webServerProcess = null
  }
}
