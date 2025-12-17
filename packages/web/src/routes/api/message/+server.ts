import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as session from '$lib/server/session'
import type { RequestHandler } from './$types'

export const DELETE: RequestHandler = async ({ url }) => {
  const projectName = url.searchParams.get('project')
  const sessionId = url.searchParams.get('session')
  const messageUuid = url.searchParams.get('uuid')
  if (!projectName || !sessionId || !messageUuid) {
    throw error(400, 'project, session, and uuid parameters required')
  }
  const result = await Effect.runPromise(session.deleteMessage(projectName, sessionId, messageUuid))
  return json(result)
}

export const PATCH: RequestHandler = async ({ url, request }) => {
  const projectName = url.searchParams.get('project')
  const sessionId = url.searchParams.get('session')
  const messageUuid = url.searchParams.get('uuid')
  if (!projectName || !sessionId || !messageUuid) {
    throw error(400, 'project, session, and uuid parameters required')
  }
  const body = await request.json()
  const { customTitle } = body as { customTitle?: string }
  if (!customTitle) {
    throw error(400, 'customTitle is required')
  }
  const result = await Effect.runPromise(
    session.updateCustomTitle(projectName, sessionId, messageUuid, customTitle)
  )
  return json(result)
}
