import { json } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as session from '$lib/server/session'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as {
    sourceProject: string
    sessionId: string
    targetProject: string
  }

  if (!body.sourceProject || !body.sessionId || !body.targetProject) {
    return json({ success: false, error: 'Missing required parameters' }, { status: 400 })
  }

  if (body.sourceProject === body.targetProject) {
    return json(
      { success: false, error: 'Source and target projects are the same' },
      { status: 400 }
    )
  }

  const result = await Effect.runPromise(
    session.moveSession(body.sourceProject, body.sessionId, body.targetProject)
  )

  return json(result)
}
