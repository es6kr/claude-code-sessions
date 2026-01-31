import * as vscode from 'vscode'
import * as session from '@claude-sessions/core'
import type { TodoItem, SessionSortOptions, TreeItemType } from '@claude-sessions/core'
import {
  maskHomePath,
  sortProjects,
  formatRelativeTime,
  getTotalTodoCount,
  sessionHasSubItems,
  canMoveSession,
  TREE_ICONS,
  getTodoIcon,
  generateTreeNodeId,
} from '@claude-sessions/core'
import { Effect } from 'effect'
import { homedir } from 'os'

const MIME_TYPE = 'application/vnd.code.tree.claudesessions'
const USER_HOME = homedir()

// Import outputChannel from separate module to avoid circular dependency
import { outputChannel } from './output'

const debug = (msg: string, ...args: unknown[]) => {
  outputChannel.appendLine(`[DnD] ${msg} ${args.length > 0 ? JSON.stringify(args) : ''}`)
}

interface SessionDTO {
  type: string
  projectName: string
  sessionId: string
  label: string
  id: string
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

  // Drag and drop - match official VSCode sample
  readonly dropMimeTypes = [MIME_TYPE]
  readonly dragMimeTypes = ['text/uri-list', MIME_TYPE]

  // Sort options (persisted in memory, reset on restart)
  private sortOptions: SessionSortOptions = { field: 'summary', order: 'desc' }

  getSortOptions(): SessionSortOptions {
    return this.sortOptions
  }

  setSortOptions(options: SessionSortOptions): void {
    this.sortOptions = options
    this.refresh()
  }

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element
  }

  public async handleDrag(
    source: readonly SessionTreeItem[],
    dataTransfer: vscode.DataTransfer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Create safe DTOs to avoid circular references and serialization issues
    const items = source.map((s) => ({
      type: s.type,
      projectName: s.projectName,
      sessionId: s.sessionId,
      label: s.label,
      id: s.id,
    }))

    // Use DTOs for custom MIME type
    dataTransfer.set(MIME_TYPE, new vscode.DataTransferItem(items))
  }

  public async handleDrop(
    target: SessionTreeItem | undefined,
    dataTransfer: vscode.DataTransfer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ): Promise<void> {
    const types: string[] = []
    dataTransfer.forEach((_, mimeType) => {
      types.push(mimeType)
    })

    debug('handleDrop called', {
      targetType: target?.type,
      targetLabel: target?.label,
      targetProject: target?.projectName,
      availableMimeTypes: types,
    })

    // Need a target to drop onto
    if (!target) {
      debug('drop rejected: no target')
      return
    }

    let sessions: SessionDTO[] = []

    // Try getting items from custom MIME type
    const transferItem = dataTransfer.get(MIME_TYPE)
    if (transferItem) {
      const value = transferItem.value
      if (Array.isArray(value)) {
        // Filter for sessions from the DTO array
        sessions = value.filter(
          (item): item is SessionDTO =>
            item && typeof item === 'object' && 'type' in item && item.type === 'session'
        )
        debug('MIME_TYPE sessions found', { count: sessions.length })
      } else {
        // If value is string (sometimes happens with IPC), parse it
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value)
            if (Array.isArray(parsed)) {
              sessions = parsed.filter(
                (item): item is SessionDTO =>
                  item && typeof item === 'object' && 'type' in item && item.type === 'session'
              )
              debug('MIME_TYPE string parsed sessions', { count: sessions.length })
            }
          } catch (e) {
            debug('MIME_TYPE value string parse failed', e)
          }
        } else {
          debug('MIME_TYPE value is weird type', { type: typeof value })
        }
      }
    }

    debug('final sessions to move', { count: sessions.length })

    if (sessions.length === 0) {
      debug('drop rejected: no sessions to move')
      return
    }

    for (const sessionItem of sessions) {
      debug('processing session', {
        id: sessionItem.sessionId,
        from: sessionItem.projectName,
        to: target.projectName,
      })

      if (!canMoveSession(sessionItem.projectName, target.projectName)) {
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

  private findCurrentProject(projectNames: string[]): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) return null
    const fsPath = workspaceFolders[0].uri.fsPath
    // Use findProjectByWorkspacePath which verifies against actual project list
    // and searches session cwd for moved sessions
    return session.findProjectByWorkspacePath(fsPath, projectNames)
  }

  async getChildren(element?: SessionTreeItem): Promise<SessionTreeItem[]> {
    if (!element) {
      // Root level - show projects
      const allProjects = await Effect.runPromise(session.listProjects)

      // Filter out projects matching exclude patterns
      const excludePatterns = vscode.workspace
        .getConfiguration('claudeSessions')
        .get<string[]>('excludeProjectPatterns', [])
      const projects =
        excludePatterns.length > 0
          ? allProjects.filter((p) => !excludePatterns.some((pattern) => p.name.includes(pattern)))
          : allProjects

      const projectNames = projects.map((p) => p.name)
      const currentProjectName = this.findCurrentProject(projectNames)

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
      const projectData = await Effect.runPromise(
        session.loadProjectTreeData(element.projectName, this.sortOptions)
      )
      if (!projectData) return []

      // Check if this is the current project (should auto-expand first session)
      const projectNames = (await Effect.runPromise(session.listProjects)).map((p) => p.name)
      const currentProjectName = this.findCurrentProject(projectNames)
      const isCurrentProject = element.projectName === currentProjectName

      return projectData.sessions.map((s, index) => {
        // Calculate if session has sub-items (summaries, agents, todos)
        const hasSubItems = sessionHasSubItems(s)

        // Auto-expand first session in current project
        const shouldExpand = isCurrentProject && index === 0 && hasSubItems

        return new SessionTreeItem(
          session.getDisplayTitle(s.customTitle, s.currentSummary, s.title),
          hasSubItems
            ? shouldExpand
              ? vscode.TreeItemCollapsibleState.Expanded
              : vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
          'session',
          element.projectName,
          s.id,
          s.messageCount,
          s.sortTimestamp,
          undefined, // todo
          undefined, // agentId
          undefined // itemIndex
        )
      })
    }

    if (element.type === 'session') {
      // Show "Summaries", "Todos" and "Agents" groups under session
      const sessionData = await Effect.runPromise(
        session.loadSessionTreeData(element.projectName, element.sessionId)
      )

      const items: SessionTreeItem[] = []

      // Summaries group (if any)
      if (sessionData.summaries.length > 0) {
        items.push(
          new SessionTreeItem(
            'Summaries',
            vscode.TreeItemCollapsibleState.Collapsed,
            'summaries-group',
            element.projectName,
            element.sessionId,
            sessionData.summaries.length
          )
        )
      }

      // Todos group
      const totalTodos = getTotalTodoCount(sessionData.todos)
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
      if (sessionData.agents.length > 0) {
        items.push(
          new SessionTreeItem(
            'Agents',
            vscode.TreeItemCollapsibleState.Collapsed,
            'agents-group',
            element.projectName,
            element.sessionId,
            sessionData.agents.length
          )
        )
      }

      return items
    }

    if (element.type === 'summaries-group') {
      // Show summaries under "Summaries" group
      const sessionData = await Effect.runPromise(
        session.loadSessionTreeData(element.projectName, element.sessionId)
      )

      return sessionData.summaries.map((summary, idx) => {
        // Truncate summary text for display
        const displayText =
          summary.summary.length > 60 ? summary.summary.slice(0, 57) + '...' : summary.summary
        return new SessionTreeItem(
          displayText,
          vscode.TreeItemCollapsibleState.None,
          'summary',
          element.projectName,
          element.sessionId,
          idx === 0 ? undefined : idx, // Show index for older summaries
          summary.timestamp,
          undefined, // todo
          undefined, // agentId
          idx // itemIndex for unique ID
        )
      })
    }

    if (element.type === 'todos-group') {
      // Show todos under "Todos" group
      const sessionData = await Effect.runPromise(
        session.loadSessionTreeData(element.projectName, element.sessionId)
      )

      const items: SessionTreeItem[] = []
      let todoIndex = 0

      // Session todos
      for (const todo of sessionData.todos.sessionTodos) {
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
            undefined, // agentId
            todoIndex++ // itemIndex for unique ID
          )
        )
      }

      // Agent todos
      for (const agentTodo of sessionData.todos.agentTodos) {
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
              agentTodo.agentId,
              todoIndex++ // itemIndex for unique ID
            )
          )
        }
      }

      return items
    }

    if (element.type === 'agents-group') {
      // Show agents under "Agents" group
      const sessionData = await Effect.runPromise(
        session.loadSessionTreeData(element.projectName, element.sessionId)
      )

      return sessionData.agents.map(
        (agent, idx) =>
          new SessionTreeItem(
            agent.name ?? agent.id.slice(0, 8),
            vscode.TreeItemCollapsibleState.None,
            'agent',
            element.projectName,
            element.sessionId,
            agent.messageCount,
            undefined,
            undefined,
            agent.id,
            idx // itemIndex for unique ID
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
    public readonly type: TreeItemType,
    public readonly projectName: string,
    public readonly sessionId: string,
    public readonly count?: number,
    public readonly sortTimestamp?: number,
    public readonly todo?: TodoItem,
    public readonly agentId?: string,
    public readonly itemIndex?: number
  ) {
    super(label, collapsibleState)

    // Set unique ID for drag and drop to work (required by VSCode)
    this.id = generateTreeNodeId(type, projectName, sessionId, agentId, itemIndex)
    this.contextValue = type

    if (type === 'project') {
      this.iconPath = new vscode.ThemeIcon(TREE_ICONS.project.codicon)
      this.description = `${count ?? 0} sessions`
    } else if (type === 'session') {
      this.iconPath = new vscode.ThemeIcon(TREE_ICONS.session.codicon)

      // Simple description: count + timestamp
      const parts: string[] = [`${count ?? 0}`]
      if (sortTimestamp) {
        parts.push(formatRelativeTime(sortTimestamp))
      }
      this.description = parts.join(' · ')

      this.command = {
        command: 'claudeSessions.openSession',
        title: 'Open Session',
        arguments: [this],
      }
    } else if (type === 'summaries-group') {
      this.iconPath = new vscode.ThemeIcon(TREE_ICONS['summaries-group'].codicon)
      this.description = `${count ?? 0}`
    } else if (type === 'todos-group') {
      this.iconPath = new vscode.ThemeIcon(TREE_ICONS['todos-group'].codicon)
      this.description = `${count ?? 0}`
    } else if (type === 'agents-group') {
      this.iconPath = new vscode.ThemeIcon(TREE_ICONS['agents-group'].codicon)
      this.description = `${count ?? 0}`
    } else if (type === 'summary') {
      this.iconPath = new vscode.ThemeIcon(TREE_ICONS.summary.codicon)
      this.description = sortTimestamp ? formatRelativeTime(sortTimestamp) : undefined
    } else if (type === 'todo') {
      const status = todo?.status ?? 'pending'
      const todoIcon = getTodoIcon(status)
      if (todoIcon.color) {
        this.iconPath = new vscode.ThemeIcon(
          todoIcon.codicon,
          new vscode.ThemeColor(`charts.${todoIcon.color}`)
        )
      } else {
        this.iconPath = new vscode.ThemeIcon(todoIcon.codicon)
      }
      this.description = agentId ? `${TREE_ICONS.agent.emoji} ${agentId.slice(0, 8)}` : undefined
    } else if (type === 'agent') {
      this.iconPath = new vscode.ThemeIcon(TREE_ICONS.agent.codicon)
      this.tooltip = agentId
    }
  }
}
