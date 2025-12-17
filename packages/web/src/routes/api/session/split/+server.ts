import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as session from '$lib/server/session'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json()
  const { project, sessionId, messageUuid } = body as {
    project?: string
    sessionId?: string
    messageUuid?: string
  }

  if (!project || !sessionId || !messageUuid) {
    throw error(400, 'project, sessionId, and messageUuid are required')
  }

  const result = await Effect.runPromise(session.splitSession(project, sessionId, messageUuid))
  return json(result)
}
