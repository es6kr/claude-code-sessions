const BASE_URL = '/api'

export interface Project {
  name: string
  displayName: string
  path: string
  sessionCount: number
}

export interface SessionMeta {
  id: string
  projectName: string
  title?: string
  messageCount: number
  createdAt?: string
  updatedAt?: string
}

// Content item with recursive content support
export interface ContentItem {
  type: string
  content?: Content
  text?: string
  [key: string]: unknown
}

// Content can be string, single item, or array
export type Content = string | ContentItem | ContentItem[]

// Tool result object format
export interface ToolResultObject {
  type?: string
  text?: string
  content?: Content // Grep/search result content
  file?: { filePath?: string; content?: string }
  stdout?: string
  stderr?: string
  interrupted?: boolean
}

export interface Message {
  uuid: string
  parentUuid?: string | null
  messageId?: string // For file-history-snapshot type
  type: string
  subtype?: string
  content?: Content
  message?: unknown
  timestamp?: string
  toolUseResult?: Content | ToolResultObject
}

export interface CleanupPreview {
  project: string
  emptySessions: SessionMeta[]
  invalidSessions: SessionMeta[]
  emptyWithTodosCount: number
  orphanAgentCount: number
  orphanTodoCount: number
}

// Fetch helpers
const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const post = async <T>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const del = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const patch = async <T>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// API functions
export const listProjects = () => get<Project[]>('/projects')

export const listSessions = (project: string) =>
  get<SessionMeta[]>(`/sessions?project=${encodeURIComponent(project)}`)

export const getSession = (project: string, id: string) =>
  get<Message[]>(`/session?project=${encodeURIComponent(project)}&id=${encodeURIComponent(id)}`)

export const deleteSession = (project: string, id: string) =>
  del<{ success: boolean }>(
    `/session?project=${encodeURIComponent(project)}&id=${encodeURIComponent(id)}`
  )

export const renameSession = (project: string, id: string, title: string) =>
  post<{ success: boolean }>('/session/rename', { project, id, title })

export const deleteMessage = (project: string, session: string, uuid: string) =>
  del<{ success: boolean }>(
    `/message?project=${encodeURIComponent(project)}&session=${encodeURIComponent(session)}&uuid=${encodeURIComponent(uuid)}`
  )

export const updateCustomTitle = (
  project: string,
  session: string,
  uuid: string,
  customTitle: string
) =>
  patch<{ success: boolean }>(
    `/message?project=${encodeURIComponent(project)}&session=${encodeURIComponent(session)}&uuid=${encodeURIComponent(uuid)}`,
    { customTitle }
  )

export const previewCleanup = (project?: string) =>
  get<CleanupPreview[]>(`/cleanup${project ? `?project=${encodeURIComponent(project)}` : ''}`)

export const clearSessions = (options: {
  project?: string
  clearEmpty?: boolean
  clearInvalid?: boolean
  skipWithTodos?: boolean
  clearOrphanAgents?: boolean
  clearOrphanTodos?: boolean
}) =>
  post<{
    success: boolean
    deletedCount: number
    removedMessageCount: number
    deletedOrphanAgentCount: number
    deletedOrphanTodoCount: number
  }>('/cleanup', options)

export const getVersion = () => get<{ version: string }>('/version')

export const shutdown = () => post<{ success: boolean; message: string }>('/shutdown', {})

export interface FileChange {
  path: string
  action: 'created' | 'modified' | 'deleted'
  timestamp?: string
  messageUuid?: string
}

export interface SessionFilesSummary {
  sessionId: string
  projectName: string
  files: FileChange[]
  totalChanges: number
}

export const getSessionFiles = (project: string, id: string) =>
  get<SessionFilesSummary>(
    `/session/files?project=${encodeURIComponent(project)}&id=${encodeURIComponent(id)}`
  )

export const openFileInVscode = (sessionId: string, backupFileName: string) =>
  post<{ success: boolean }>('/open-file', { sessionId, backupFileName })

export const openFile = (filePath: string) => post<{ success: boolean }>('/open-file', { filePath })

export interface SplitSessionResult {
  success: boolean
  newSessionId?: string
  newSessionPath?: string
  movedMessageCount?: number
  error?: string
}

export const splitSession = (project: string, sessionId: string, messageUuid: string) =>
  post<SplitSessionResult>('/session/split', { project, sessionId, messageUuid })

export interface MoveSessionResult {
  success: boolean
  error?: string
}

export const moveSession = (sourceProject: string, sessionId: string, targetProject: string) =>
  post<MoveSessionResult>('/session/move', { sourceProject, sessionId, targetProject })

export const checkFileExists = async (filePath: string): Promise<boolean> => {
  try {
    const res = await get<{ exists: boolean }>(`/file-exists?path=${encodeURIComponent(filePath)}`)
    return res.exists
  } catch {
    return false
  }
}
