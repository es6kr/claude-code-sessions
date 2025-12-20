/**
 * Agent messages API - loads messages from agent session file
 */
import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as core from '@claude-sessions/core'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  const projectName = url.searchParams.get('project')
  const sessionId = url.searchParams.get('session')
  const agentId = url.searchParams.get('agent')

  if (!projectName) {
    throw error(400, 'project parameter required')
  }
  if (!sessionId) {
    throw error(400, 'session parameter required')
  }
  if (!agentId) {
    throw error(400, 'agent parameter required')
  }

  const result = await Effect.runPromise(core.loadAgentMessages(projectName, sessionId, agentId))

  return json(result)
}
