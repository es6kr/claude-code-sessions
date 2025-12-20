/**
 * Session tree data API - loads single session data including agents, todos, summaries
 */
import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as core from '@claude-sessions/core'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  const projectName = url.searchParams.get('project')
  const sessionId = url.searchParams.get('id')

  if (!projectName) {
    throw error(400, 'project parameter required')
  }
  if (!sessionId) {
    throw error(400, 'id parameter required')
  }

  const result = await Effect.runPromise(core.loadSessionTreeData(projectName, sessionId))

  if (!result) {
    throw error(404, 'Session not found')
  }

  return json(result)
}
