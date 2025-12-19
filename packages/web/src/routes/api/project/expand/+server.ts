/**
 * Expand project API - loads all session data including agents, todos, summaries
 * Uses core loadProjectTreeData for full tree structure
 */
import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as core from '@claude-sessions/core'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  const projectName = url.searchParams.get('project')
  if (!projectName) {
    throw error(400, 'project parameter required')
  }

  const result = await Effect.runPromise(core.loadProjectTreeData(projectName))

  if (!result) {
    throw error(404, 'Project not found')
  }

  return json(result.sessions)
}
