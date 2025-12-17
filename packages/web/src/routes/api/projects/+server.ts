import { json } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as session from '$lib/server/session'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async () => {
  const projects = await Effect.runPromise(session.listProjects)
  return json(projects)
}
