import * as vscode from 'vscode'
import * as session from '@claude-sessions/core'
import { Effect } from 'effect'

const MIME_TYPE = 'application/vnd.code.tree.claudesessions'

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionTreeItem>, vscode.TreeDragAndDropController<SessionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  // Drag and drop
  readonly dropMimeTypes = [MIME_TYPE]
  readonly dragMimeTypes = [MIME_TYPE]

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element
  }

  handleDrag(source: readonly SessionTreeItem[], dataTransfer: vscode.DataTransfer): void {
    const sessions = source.filter(item => item.type === 'session')
    if (sessions.length > 0) {
      dataTransfer.set(MIME_TYPE, new vscode.DataTransferItem(sessions))
    }
  }

  async handleDrop(target: SessionTreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    if (!target || target.type !== 'project') return

    const transferItem = dataTransfer.get(MIME_TYPE)
    if (!transferItem) return

    const sessions = transferItem.value as SessionTreeItem[]
    if (!sessions || sessions.length === 0) return

    for (const sessionItem of sessions) {
      if (sessionItem.projectName === target.projectName) continue // Skip same project

      const result = await Effect.runPromise(
        session.moveSession(sessionItem.projectName, sessionItem.sessionId, target.projectName)
      )

      if (result.success) {
        vscode.window.showInformationMessage(`Moved session to ${target.label}`)
      } else {
        vscode.window.showErrorMessage(`Failed to move session: ${result.error}`)
      }
    }

    this.refresh()
  }

  private getCurrentProjectName(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) return null
    return session.pathToFolderName(workspaceFolders[0].uri.fsPath)
  }

  async getChildren(element?: SessionTreeItem): Promise<SessionTreeItem[]> {
    if (!element) {
      // Root level - show projects
      const projects = await Effect.runPromise(session.listProjects)
      const currentProjectName = this.getCurrentProjectName()

      // Sort: current project first, then by name
      const sorted = projects.sort((a, b) => {
        if (a.name === currentProjectName) return -1
        if (b.name === currentProjectName) return 1
        return a.displayName.localeCompare(b.displayName)
      })

      return sorted.map(
        (p) =>
          new SessionTreeItem(
            session.folderNameToPath(p.name), // Show ~/... or absolute path
            // Expand current project by default
            p.name === currentProjectName
              ? vscode.TreeItemCollapsibleState.Expanded
              : vscode.TreeItemCollapsibleState.Collapsed,
            'project',
            p.name,
            '',
            p.sessionCount
          )
      )
    }

    if (element.type === 'project') {
      // Show sessions under project
      const sessions = await Effect.runPromise(session.listSessions(element.projectName))
      return sessions.map(
        (s) =>
          new SessionTreeItem(
            s.title || s.id,
            vscode.TreeItemCollapsibleState.None,
            'session',
            element.projectName,
            s.id,
            s.messageCount,
            s.updatedAt
          )
      )
    }

    return []
  }
}

export class SessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: 'project' | 'session',
    public readonly projectName: string,
    public readonly sessionId: string,
    public readonly count?: number,
    public readonly updatedAt?: string
  ) {
    super(label, collapsibleState)

    this.contextValue = type

    if (type === 'project') {
      this.iconPath = new vscode.ThemeIcon('folder')
      this.description = `${count ?? 0} sessions`
    } else {
      this.iconPath = new vscode.ThemeIcon('comment-discussion')
      this.description = updatedAt
        ? `${count ?? 0} msgs · ${formatDate(updatedAt)}`
        : `${count ?? 0} msgs`
      this.command = {
        command: 'claudeSessions.openSession',
        title: 'Open Session',
        arguments: [this],
      }
    }
  }
}

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString()
}
