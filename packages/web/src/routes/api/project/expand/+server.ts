/**
 * Expand project API - loads all session data including agents, todos, summaries
 * Uses core loadProjectTreeData for full tree structure
 */
import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as core from '@claude-sessions/core'
import type { SessionSortField, SessionSortOrder } from '@claude-sessions/core'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  const projectName = url.searchParams.get('project')
  if (!projectName) {
    throw error(400, 'project parameter required')
  }

  // Parse sort options (defaults to 'summary' + 'desc' in core)
  const sortField = url.searchParams.get('sortField') as SessionSortField | null
  const sortOrder = url.searchParams.get('sortOrder') as SessionSortOrder | null
  const sortOptions =
    sortField && sortOrder
      ? { field: sortField, order: sortOrder }
      : { field: 'summary' as SessionSortField, order: 'desc' as SessionSortOrder }

  const result = await Effect.runPromise(core.loadProjectTreeData(projectName, sortOptions))

  if (!result) {
    throw error(404, 'Project not found')
  }

  return json(result.sessions)
}
