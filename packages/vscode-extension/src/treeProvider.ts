import * as vscode from 'vscode'
import * as session from '@claude-sessions/core'
import type { TodoItem } from '@claude-sessions/core'
import { maskHomePath, sortProjects } from '@claude-sessions/core'
import { Effect } from 'effect'
import { homedir } from 'os'

const MIME_TYPE = 'application/vnd.code.tree.claudesessions'
const USER_HOME = homedir()

// Import outputChannel from extension for debug logging
import { outputChannel } from './extension'

const debug = (msg: string, ...args: unknown[]) => {
  outputChannel.appendLine(`[DnD] ${msg} ${args.length > 0 ? JSON.stringify(args) : ''}`)
}

export class SessionTreeProvider
  implements
    vscode.TreeDataProvider<SessionTreeItem>,
    vscode.TreeDragAndDropController<SessionTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    SessionTreeItem | undefined | null | void
  >()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  // Drag and drop
  readonly dropMimeTypes = [MIME_TYPE]
  readonly dragMimeTypes = [MIME_TYPE]

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    debug('getTreeItem', { type: element.type, label: element.label })
    return element
  }

  public async handleDrag(
    source: readonly SessionTreeItem[],
    dataTransfer: vscode.DataTransfer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ): Promise<void> {
    debug('handleDrag called', { sourceCount: source.length, types: source.map((s) => s.type) })
    const sessions = source.filter((item) => item.type === 'session')
    debug('filtered sessions', { sessionCount: sessions.length })
    if (sessions.length > 0) {
      dataTransfer.set(MIME_TYPE, new vscode.DataTransferItem(sessions))
      debug('dataTransfer set with MIME_TYPE', MIME_TYPE)
    }
  }

  public async handleDrop(
    target: SessionTreeItem | undefined,
    dataTransfer: vscode.DataTransfer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ): Promise<void> {
    debug('handleDrop called', {
      targetType: target?.type,
      targetLabel: target?.label,
      targetProject: target?.projectName,
    })

    if (!target || target.type !== 'project') {
      debug('drop rejected: target is not a project')
      return
    }

    const transferItem = dataTransfer.get(MIME_TYPE)
    debug('transferItem', { hasMimeType: !!transferItem })

    if (!transferItem) {
      debug('drop rejected: no transfer item with MIME_TYPE')
      return
    }

    const sessions = transferItem.value as SessionTreeItem[]
    debug('sessions from transfer', { count: sessions?.length, sessions })

    if (!sessions || sessions.length === 0) {
      debug('drop rejected: no sessions in transfer')
      return
    }

    for (const sessionItem of sessions) {
      debug('processing session', {
        id: sessionItem.sessionId,
        from: sessionItem.projectName,
        to: target.projectName,
      })

      if (sessionItem.projectName === target.projectName) {
        debug('skipping: same project')
        continue
      }

      const result = await Effect.runPromise(
        session.moveSession(sessionItem.projectName, sessionItem.sessionId, target.projectName)
      )

      debug('moveSession result', result)

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
    const fsPath = workspaceFolders[0].uri.fsPath
    return session.pathToFolderName(fsPath)
  }

  async getChildren(element?: SessionTreeItem): Promise<SessionTreeItem[]> {
    if (!element) {
      // Root level - show projects
      const projects = await Effect.runPromise(session.listProjects)
      const currentProjectName = this.getCurrentProjectName()

      // Sort: 1) current project, 2) current user's home subpaths, 3) others
      const sorted = sortProjects(projects, {
        currentProjectName,
        homeDir: USER_HOME,
      })

      return sorted.map(
        (p) =>
          new SessionTreeItem(
            maskHomePath(session.folderNameToPath(p.name), USER_HOME), // Show ~/... for current user only
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
      // Show sessions under project using loadProjectTreeData for full metadata
      const projectData = await Effect.runPromise(session.loadProjectTreeData(element.projectName))
      if (!projectData) return []

      return projectData.sessions.map(
        (s) =>
          new SessionTreeItem(
            session.getDisplayTitle(s.customTitle, s.currentSummary, s.title),
            vscode.TreeItemCollapsibleState.Collapsed,
            'session',
            element.projectName,
            s.id,
            s.messageCount,
            s.updatedAt
          )
      )
    }

    if (element.type === 'session') {
      // Show "Todos" and "Agents" groups under session
      const messages = await Effect.runPromise(
        session.readSession(element.projectName, element.sessionId)
      )
      const agentIds = [
        ...new Set(
          messages
            .filter(
              (m): m is typeof m & { agentId: string } =>
                m.type === 'agent' && typeof (m as { agentId?: string }).agentId === 'string'
            )
            .map((m) => m.agentId)
        ),
      ]

      const todosResult = await Effect.runPromise(
        session.findLinkedTodos(element.sessionId, agentIds)
      )
      const totalTodos =
        todosResult.sessionTodos.length +
        todosResult.agentTodos.reduce((sum, a) => sum + a.todos.length, 0)

      const items: SessionTreeItem[] = []

      // Todos group
      if (totalTodos > 0) {
        items.push(
          new SessionTreeItem(
            'Todos',
            vscode.TreeItemCollapsibleState.Collapsed,
            'todos-group',
            element.projectName,
            element.sessionId,
            totalTodos
          )
        )
      }

      // Agents group
      if (agentIds.length > 0) {
        items.push(
          new SessionTreeItem(
            'Agents',
            vscode.TreeItemCollapsibleState.Collapsed,
            'agents-group',
            element.projectName,
            element.sessionId,
            agentIds.length
          )
        )
      }

      return items
    }

    if (element.type === 'todos-group') {
      // Show todos under "Todos" group
      const messages = await Effect.runPromise(
        session.readSession(element.projectName, element.sessionId)
      )
      const agentIds = [
        ...new Set(
          messages
            .filter(
              (m): m is typeof m & { agentId: string } =>
                m.type === 'agent' && typeof (m as { agentId?: string }).agentId === 'string'
            )
            .map((m) => m.agentId)
        ),
      ]

      const todosResult = await Effect.runPromise(
        session.findLinkedTodos(element.sessionId, agentIds)
      )

      const items: SessionTreeItem[] = []

      // Session todos
      for (const todo of todosResult.sessionTodos) {
        items.push(
          new SessionTreeItem(
            todo.content,
            vscode.TreeItemCollapsibleState.None,
            'todo',
            element.projectName,
            element.sessionId,
            undefined,
            undefined,
            todo
          )
        )
      }

      // Agent todos
      for (const agentTodo of todosResult.agentTodos) {
        for (const todo of agentTodo.todos) {
          items.push(
            new SessionTreeItem(
              todo.content,
              vscode.TreeItemCollapsibleState.None,
              'todo',
              element.projectName,
              element.sessionId,
              undefined,
              undefined,
              todo,
              agentTodo.agentId
            )
          )
        }
      }

      return items
    }

    if (element.type === 'agents-group') {
      // Show agents under "Agents" group
      const messages = await Effect.runPromise(
        session.readSession(element.projectName, element.sessionId)
      )
      const agentIds = [
        ...new Set(
          messages
            .filter(
              (m): m is typeof m & { agentId: string } =>
                m.type === 'agent' && typeof (m as { agentId?: string }).agentId === 'string'
            )
            .map((m) => m.agentId)
        ),
      ]

      return agentIds.map(
        (agentId) =>
          new SessionTreeItem(
            agentId.slice(0, 8),
            vscode.TreeItemCollapsibleState.None,
            'agent',
            element.projectName,
            element.sessionId,
            undefined,
            undefined,
            undefined,
            agentId
          )
      )
    }

    return []
  }
}

type TreeItemType = 'project' | 'session' | 'todos-group' | 'agents-group' | 'todo' | 'agent'

export class SessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: TreeItemType,
    public readonly projectName: string,
    public readonly sessionId: string,
    public readonly count?: number,
    public readonly updatedAt?: string,
    public readonly todo?: TodoItem,
    public readonly agentId?: string
  ) {
    super(label, collapsibleState)

    this.contextValue = type

    if (type === 'project') {
      this.iconPath = new vscode.ThemeIcon('folder')
      this.description = `${count ?? 0} sessions`
    } else if (type === 'session') {
      this.iconPath = new vscode.ThemeIcon('comment-discussion')
      this.description = updatedAt
        ? `${count ?? 0} msgs · ${formatDate(updatedAt)}`
        : `${count ?? 0} msgs`
      this.command = {
        command: 'claudeSessions.openSession',
        title: 'Open Session',
        arguments: [this],
      }
    } else if (type === 'todos-group') {
      this.iconPath = new vscode.ThemeIcon('checklist')
      this.description = `${count ?? 0}`
    } else if (type === 'agents-group') {
      this.iconPath = new vscode.ThemeIcon('hubot')
      this.description = `${count ?? 0}`
    } else if (type === 'todo') {
      const status = todo?.status ?? 'pending'
      if (status === 'completed') {
        this.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('charts.green'))
      } else if (status === 'in_progress') {
        this.iconPath = new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.yellow'))
      } else {
        this.iconPath = new vscode.ThemeIcon('circle-outline')
      }
      this.description = agentId ? `🤖 ${agentId.slice(0, 8)}` : undefined
    } else if (type === 'agent') {
      this.iconPath = new vscode.ThemeIcon('hubot')
      this.tooltip = agentId
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
