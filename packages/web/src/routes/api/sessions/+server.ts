import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as session from '$lib/server/session'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  const projectName = url.searchParams.get('project')
  if (!projectName) {
    throw error(400, 'project parameter required')
  }
  const sessions = await Effect.runPromise(session.listSessions(projectName))
  return json(sessions)
}
