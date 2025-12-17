import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as session from '$lib/server/session'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  const projectName = url.searchParams.get('project')
  const sessionId = url.searchParams.get('id')
  if (!projectName || !sessionId) {
    throw error(400, 'project and id parameters required')
  }
  const messages = await Effect.runPromise(session.readSession(projectName, sessionId))
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
