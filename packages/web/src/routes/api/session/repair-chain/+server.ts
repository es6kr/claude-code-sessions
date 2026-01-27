import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as session from '$lib/server/session'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ url }) => {
  const projectName = url.searchParams.get('project')
  const sessionId = url.searchParams.get('session')
  if (!projectName || !sessionId) {
    throw error(400, 'project and session parameters required')
  }
  const result = await Effect.runPromise(session.repairChain(projectName, sessionId))
  return json(result)
}
