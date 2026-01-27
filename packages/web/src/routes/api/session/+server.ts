import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as session from '$lib/server/session'
import { validateChain, getLogger } from '@claude-sessions/core'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  const projectName = url.searchParams.get('project')
  const sessionId = url.searchParams.get('id')
  if (!projectName || !sessionId) {
    throw error(400, 'project and id parameters required')
  }
  const messages = await Effect.runPromise(session.readSession(projectName, sessionId))

  // Validate chain and log errors
  const chainResult = validateChain(messages)
  if (!chainResult.valid) {
    const logger = getLogger()
    logger.warn(
      `[session] Chain validation failed for ${sessionId}: ${chainResult.errors.length} error(s)`
    )
    for (const e of chainResult.errors) {
      logger.warn(JSON.stringify(e))
    }
  }

  return json(messages)
}

export const DELETE: RequestHandler = async ({ url }) => {
  const projectName = url.searchParams.get('project')
  const sessionId = url.searchParams.get('id')
  if (!projectName || !sessionId) {
    throw error(400, 'project and id parameters required')
  }
  const result = await Effect.runPromise(session.deleteSession(projectName, sessionId))
  return json(result)
}
