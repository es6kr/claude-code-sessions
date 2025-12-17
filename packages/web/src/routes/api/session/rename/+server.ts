import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as session from '$lib/server/session'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as { project: string; id: string; title: string }
  if (!body.project || !body.id || !body.title) {
    throw error(400, 'project, id, and title required')
  }
  const result = await Effect.runPromise(session.renameSession(body.project, body.id, body.title))
  return json(result)
}
