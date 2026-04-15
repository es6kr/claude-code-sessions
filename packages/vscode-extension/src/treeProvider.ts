import * as vscode from 'vscode'
import * as path from 'node:path'
import * as session from '@claude-sessions/core'
import type {
  TodoItem,
  SessionSortOptions,
  TreeItemType,
  TitleDisplayMode,
  DateGroupKey,
  DateGroup,
} from '@claude-sessions/core'
import {
  maskHomePath,
  sortProjects,
  formatRelativeTime,
  getTotalTodoCount,
  sessionHasSubItems,
  canMoveSession,
  getSessionTooltip,
  groupSessionsByDate,
  sortSessions,
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

  private currentProjectName: string | null = null

  // In-memory project data cache (survives filter changes, cleared on explicit refresh)
  private inFlightRequests = new Map<string, Promise<session.ProjectTreeData | null>>()
  private projectDataCache = new Map<string, session.ProjectTreeData>()

  // Filter text for session search
  private filterText = ''

  // Sort options (persisted in memory, reset on restart)
  private sortOptions: SessionSortOptions = { field: 'updated', order: 'desc' }

  // Date grouping toggle
  private groupByDate = false

  // Project display name cache (for date-grouped mode)
  private projectDisplayNames = new Map<string, string>()

  // Cache of date-grouped sessions to avoid redundant loads between root and expansion
  private groupedSessionsCache: DateGroup<session.SessionTreeData>[] | null = null

  getSortOptions(): SessionSortOptions {
    return this.sortOptions
  }

  setSortOptions(options: SessionSortOptions): void {
    this.sortOptions = options
    this.refresh()
  }

  getGroupByDate(): boolean {
    return this.groupByDate
  }

  setGroupByDate(enabled: boolean): void {
    this.groupByDate = enabled
    this.groupedSessionsCache = null
    this._onDidChangeTreeData.fire()
  }

  getFilterText(): string {
    return this.filterText
  }

  setFilterText(text: string): void {
    this.filterText = text.trim().toLowerCase()
    this._onDidChangeTreeData.fire()
  }

  refresh(): void {
    this.currentProjectName = null
    this.inFlightRequests.clear()
    this.projectDataCache.clear()
    this.projectDisplayNames.clear()
    this.groupedSessionsCache = null
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

    // Enable drag-to-editor: drop onto editor area opens the file
    const uris = source
      .filter((s): s is SessionFileTreeItem => 'resourceUri' in s && !!s.resourceUri)
      .map((s) => s.resourceUri!.toString())
    if (uris.length > 0) {
      dataTransfer.set('text/uri-list', new vscode.DataTransferItem(uris.join('\r\n')))
    }
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

    // Need a valid target to drop onto (date-group headers are not valid targets)
    if (!target || target.type === 'date-group' || !target.projectName) {
      debug('drop rejected: invalid target', { targetType: target?.type })
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

  private async getProjectData(projectName: string): Promise<session.ProjectTreeData | null> {
    const cached = this.projectDataCache.get(projectName)
    if (cached) return cached

    const inFlight = this.inFlightRequests.get(projectName)
    if (inFlight) return inFlight

    const promise = Effect.runPromise(session.loadProjectTreeData(projectName, this.sortOptions))
      .then((data) => {
        if (data) this.projectDataCache.set(projectName, data)
        return data
      })
      .finally(() => {
        this.inFlightRequests.delete(projectName)
      })
    this.inFlightRequests.set(projectName, promise)
    return promise
  }

  private filterSessions(
    sessions: session.SessionTreeData[],
    projectName?: string
  ): session.SessionTreeData[] {
    if (!this.filterText) return sessions
    // If the project name itself matches, show all its sessions
    if (projectName && projectName.toLowerCase().includes(this.filterText)) {
      return sessions
    }
    return sessions.filter((s) => {
      // Search across all available text: title, custom title, all summaries
      const texts = [
        s.title,
        s.customTitle,
        s.currentSummary,
        ...s.summaries.map((sum) => sum.summary),
      ]
      return texts.some((t) => t && t.toLowerCase().includes(this.filterText))
    })
  }

  /** Get the grouping timestamp for a session based on current sort field */
  private getGroupTimestamp(s: session.SessionTreeData): number | undefined {
    const sort = this.sortOptions
    if (sort.field === 'updated' && s.updatedAt) return new Date(s.updatedAt).getTime()
    if (sort.field === 'created' && s.createdAt) return new Date(s.createdAt).getTime()
    if (sort.field === 'modified' && s.fileMtime) return s.fileMtime
    return s.updatedAt ? new Date(s.updatedAt).getTime() : s.sortTimestamp
  }

  private buildSessionItems(
    sessions: session.SessionTreeData[],
    expandFirst: boolean,
    dateGrouped?: DateGroupKey
  ): SessionFileTreeItem[] {
    const titleMode = vscode.workspace
      .getConfiguration('claudeSessions')
      .get<TitleDisplayMode>('titleDisplayMode', 'message')
    const locale = vscode.env.language

    return sessions.map((s, index) => {
      const hasSubItems = sessionHasSubItems(s)
      const shouldExpand = !this.filterText && expandFirst && index === 0 && hasSubItems

      const descriptionText =
        titleMode === 'datetime' && !s.customTitle && !s.currentSummary
          ? session.getDisplayTitle(undefined, undefined, s.title)
          : undefined

      return new SessionFileTreeItem(
        session.getDisplayTitle({
          customTitle: s.customTitle,
          currentSummary: s.currentSummary,
          title: s.title,
          createdAt: s.createdAt,
          mode: titleMode,
          locale,
        }),
        hasSubItems
          ? shouldExpand
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        s.projectName,
        s.id,
        s.messageCount,
        s.sortTimestamp,
        getSessionTooltip(s), // tooltip
        descriptionText, // session description (first message in datetime mode)
        dateGrouped, // pass through so session knows it's in grouped mode
        dateGrouped ? this.projectDisplayNames.get(s.projectName) : undefined
      )
    })
  }

  /** Load and merge sessions from all projects (for date-grouped view) */
  private async loadAllSessions(): Promise<session.SessionTreeData[]> {
    const allProjects = await Effect.runPromise(session.listProjects)
    const excludePatterns = vscode.workspace
      .getConfiguration('claudeSessions')
      .get<string[]>('excludeProjectPatterns', [])
    const projects =
      excludePatterns.length > 0
        ? allProjects.filter((p) => !excludePatterns.some((pattern) => p.name.includes(pattern)))
        : allProjects

    // Build project display name map for short labels
    for (const p of projects) {
      if (!this.projectDisplayNames.has(p.name)) {
        const displayPath = maskHomePath(p.displayName, USER_HOME)
        const lastSegment = displayPath.split(/[/\\]/).filter(Boolean).pop() ?? p.name
        this.projectDisplayNames.set(p.name, lastSegment)
      }
    }

    const CONCURRENCY = 5
    const allSessions: session.SessionTreeData[] = []
    for (let i = 0; i < projects.length; i += CONCURRENCY) {
      const batch = projects.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(batch.map((p) => this.getProjectData(p.name)))
      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) {
          continue
        }
        const filtered = this.filterSessions(result.value.sessions)
        allSessions.push(...filtered)
      }
    }

    return sortSessions(allSessions, this.sortOptions)
  }

  async getChildren(element?: SessionTreeItem): Promise<SessionTreeItem[]> {
    if (!element) {
      // Date-grouped mode: root shows date groups across all projects
      if (this.groupByDate && !this.filterText) {
        const allSessions = await this.loadAllSessions()
        const groups = groupSessionsByDate(allSessions, (s) => this.getGroupTimestamp(s))
        this.groupedSessionsCache = groups

        return groups.map(
          (g) =>
            new DateGroupTreeItem(
              g.label,
              vscode.TreeItemCollapsibleState.Expanded,
              g.key,
              g.sessions.length
            )
        )
      }

      // Normal mode: root shows projects
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

      this.currentProjectName = currentProjectName

      // Sort: 1) current project, 2) current user's home subpaths, 3) others
      const sorted = sortProjects(projects, {
        currentProjectName,
        homeDir: USER_HOME,
      })

      // When filter is active, load projects with bounded concurrency and only show those with matches
      if (this.filterText) {
        const CONCURRENCY = 5
        const projectResults: (SessionTreeItem | null)[] = []
        for (let i = 0; i < sorted.length; i += CONCURRENCY) {
          const batch = sorted.slice(i, i + CONCURRENCY)
          const batchResults = await Promise.all(
            batch.map(async (p) => {
              const data = await this.getProjectData(p.name)
              if (!data) return null
              const matches = this.filterSessions(data.sessions, p.name)
              if (matches.length === 0) return null
              return new ProjectTreeItem(
                maskHomePath(p.displayName, USER_HOME),
                vscode.TreeItemCollapsibleState.Expanded, // auto-expand filtered projects
                p.name,
                data.sessionCount // show total count, filtered children convey match info
              )
            })
          )
          projectResults.push(...batchResults)
        }
        return projectResults.filter((item): item is SessionTreeItem => item !== null)
      }

      return sorted.map(
        (p) =>
          new ProjectTreeItem(
            maskHomePath(p.displayName, USER_HOME), // displayName already computed by listProjects
            // Expand current project by default
            p.name === currentProjectName
              ? vscode.TreeItemCollapsibleState.Expanded
              : vscode.TreeItemCollapsibleState.Collapsed,
            p.name,
            p.sessionCount || 0
          )
      )
    }

    if (element.type === 'date-group') {
      // Show sessions within a date group (reuse cache from root render when available)
      if (!this.groupedSessionsCache) {
        const allSessions = await this.loadAllSessions()
        this.groupedSessionsCache = groupSessionsByDate(allSessions, (s) =>
          this.getGroupTimestamp(s)
        )
      }
      const group = this.groupedSessionsCache.find((g) => g.key === element.dateGroupKey)
      if (!group) return []
      return this.buildSessionItems(group.sessions, false, element.dateGroupKey)
    }

    if (element.type === 'project') {
      // Show sessions under project (uses in-memory cache if available)
      const projectData = await this.getProjectData(element.projectName)
      if (!projectData) return []

      // Apply filter if set
      const sessions = this.filterSessions(projectData.sessions, element.projectName)
      const isCurrentProject = element.projectName === this.currentProjectName

      return this.buildSessionItems(sessions, isCurrentProject)
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
          new GroupTreeItem(
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
          new GroupTreeItem(
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
          new GroupTreeItem(
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
        const timestampMs =
          typeof summary.timestamp === 'string'
            ? new Date(summary.timestamp).getTime()
            : summary.timestamp

        return new SummaryTreeItem(
          displayText,
          vscode.TreeItemCollapsibleState.None,
          element.projectName,
          element.sessionId,
          idx, // itemIndex for unique ID
          timestampMs
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
          new TodoTreeItem(
            todo.content,
            vscode.TreeItemCollapsibleState.None,
            element.projectName,
            element.sessionId,
            todo,
            todoIndex++ // itemIndex for unique ID
          )
        )
      }

      // Agent todos
      for (const agentTodo of sessionData.todos.agentTodos) {
        for (const todo of agentTodo.todos) {
          items.push(
            new TodoTreeItem(
              todo.content,
              vscode.TreeItemCollapsibleState.None,
              element.projectName,
              element.sessionId,
              todo,
              todoIndex++, // itemIndex for unique ID
              agentTodo.agentId
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
          new AgentTreeItem(
            agent.name ?? agent.id.slice(0, 8),
            vscode.TreeItemCollapsibleState.None,
            element.projectName,
            element.sessionId,
            idx, // itemIndex for unique ID
            agent.id
          )
      )
    }

    return []
  }
}

export type SessionTreeItem =
  | ProjectTreeItem
  | DateGroupTreeItem
  | SessionFileTreeItem
  | GroupTreeItem
  | SummaryTreeItem
  | TodoTreeItem
  | AgentTreeItem

export abstract class BaseClaudeTreeItem extends vscode.TreeItem {
  constructor(
    public readonly type: TreeItemType,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly projectName: string,
    public readonly sessionId: string,
    public readonly agentId?: string,
    public readonly itemIndex?: number
  ) {
    super(label, collapsibleState)
    this.id = generateTreeNodeId(type, projectName, sessionId, agentId, itemIndex)
    this.contextValue = type
  }
}

export class ProjectTreeItem extends BaseClaudeTreeItem {
  declare readonly type: 'project'
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    projectName: string,
    public readonly projectSessionCount: number
  ) {
    super('project', label, collapsibleState, projectName, '')
    this.iconPath = new vscode.ThemeIcon(TREE_ICONS.project.codicon)
    this.description = `${projectSessionCount} sessions`

    // Bind the item natively to the sessions folder for this project
    const sessionsDir = session.getSessionsDir()
    this.resourceUri = vscode.Uri.file(path.join(sessionsDir, projectName))
  }
}

export class DateGroupTreeItem extends BaseClaudeTreeItem {
  declare readonly type: 'date-group'
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly dateGroupKey: DateGroupKey,
    public readonly sessionCount: number
  ) {
    super('date-group', label, collapsibleState, '', '')
    this.id = `date-group::${dateGroupKey}`
    this.iconPath = new vscode.ThemeIcon(TREE_ICONS['date-group'].codicon)
    this.description = `${sessionCount}`
  }
}

export class SessionFileTreeItem extends BaseClaudeTreeItem {
  declare readonly type: 'session'
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    projectName: string,
    sessionId: string,
    public readonly sessionMessageCount: number,
    public readonly sortTimestamp?: number,
    public readonly sessionTooltipText?: string,
    public readonly sessionDescription?: string,
    public readonly dateGroupKey?: DateGroupKey,
    public readonly shortProjectName?: string
  ) {
    super('session', label, collapsibleState, projectName, sessionId)
    this.iconPath = new vscode.ThemeIcon(TREE_ICONS.session.codicon)

    // Description: [PROJECT ·] count · context
    const parts: string[] = []
    if (dateGroupKey && shortProjectName) {
      parts.push(shortProjectName.toUpperCase())
    }
    parts.push(`${sessionMessageCount}`)
    if (sessionDescription) {
      parts.push(sessionDescription)
    } else if (sortTimestamp) {
      parts.push(formatRelativeTime(sortTimestamp))
    }
    this.description = parts.join(' · ')

    // Set tooltip with session info and ID
    if (sessionTooltipText) {
      this.tooltip = sessionTooltipText
    }

    // Bind the item natively to the session file
    const sessionsDir = session.getSessionsDir()
    this.resourceUri = vscode.Uri.file(path.join(sessionsDir, projectName, `${sessionId}.jsonl`))

    // Open the session file on click
    this.command = {
      command: 'vscode.open',
      title: 'Open Session',
      arguments: [this.resourceUri],
    }
  }
}

export class GroupTreeItem extends BaseClaudeTreeItem {
  declare readonly type: 'summaries-group' | 'todos-group' | 'agents-group'
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    type: 'summaries-group' | 'todos-group' | 'agents-group',
    projectName: string,
    sessionId: string,
    public readonly groupCount: number
  ) {
    super(type, label, collapsibleState, projectName, sessionId)
    this.iconPath = new vscode.ThemeIcon(TREE_ICONS[type].codicon)
    this.description = `${groupCount}`
  }
}

export class SummaryTreeItem extends BaseClaudeTreeItem {
  declare readonly type: 'summary'
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    projectName: string,
    sessionId: string,
    itemIndex: number,
    public readonly sortTimestamp?: number
  ) {
    super('summary', label, collapsibleState, projectName, sessionId, undefined, itemIndex)
    this.iconPath = new vscode.ThemeIcon(TREE_ICONS.summary.codicon)
    this.description = sortTimestamp ? formatRelativeTime(sortTimestamp) : undefined
  }
}

export class TodoTreeItem extends BaseClaudeTreeItem {
  declare readonly type: 'todo'
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    projectName: string,
    sessionId: string,
    public readonly todoData: TodoItem,
    itemIndex: number,
    agentId?: string
  ) {
    super('todo', label, collapsibleState, projectName, sessionId, agentId, itemIndex)
    const status = todoData.status ?? 'pending'
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
  }
}

export class AgentTreeItem extends BaseClaudeTreeItem {
  declare readonly type: 'agent'
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    projectName: string,
    sessionId: string,
    itemIndex: number,
    agentId: string
  ) {
    super('agent', label, collapsibleState, projectName, sessionId, agentId, itemIndex)
    this.iconPath = new vscode.ThemeIcon(TREE_ICONS.agent.codicon)
    this.tooltip = agentId
  }
}
