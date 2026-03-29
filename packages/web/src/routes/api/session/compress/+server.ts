import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as session from '$lib/server/session'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json()
  const { project, sessionId } = body as { project?: string; sessionId?: string }

  if (!project || !sessionId) {
    throw error(400, 'project and sessionId are required')
  }

  const result = await Effect.runPromise(
    session.compressSession(project, sessionId, {
      keepSnapshots: 'first_last',
      maxToolOutputLength: 0,
    })
  )
  return json(result)
}
