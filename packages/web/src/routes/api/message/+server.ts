import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as session from '$lib/server/session'
import type { RequestHandler } from './$types'

// Restore a deleted message
export const POST: RequestHandler = async ({ url, request }) => {
  const projectName = url.searchParams.get('project')
  const sessionId = url.searchParams.get('session')
  if (!projectName || !sessionId) {
    throw error(400, 'project and session parameters required')
  }
  const body = await request.json()
  const { message, index } = body as { message: Record<string, unknown>; index: number }
  if (!message || typeof index !== 'number') {
    throw error(400, 'message and index are required')
  }
  const result = await Effect.runPromise(
    session.restoreMessage(projectName, sessionId, message, index)
  )
  return json(result)
}

export const DELETE: RequestHandler = async ({ url }) => {
  const projectName = url.searchParams.get('project')
  const sessionId = url.searchParams.get('session')
  const messageUuid = url.searchParams.get('uuid')
  const lineIndex = url.searchParams.get('lineIndex')
  const targetType = url.searchParams.get('targetType') as
    | 'file-history-snapshot'
    | 'summary'
    | null

  if (!projectName || !sessionId) {
    throw error(400, 'project and session parameters required')
  }

  // Line index based deletion for uuid-less messages (custom-title, agent-name)
  if (lineIndex !== null) {
    const idx = parseInt(lineIndex, 10)
    if (isNaN(idx)) throw error(400, 'lineIndex must be a number')
    const result = await Effect.runPromise(
      session.deleteTitleMessageByIndex(projectName, sessionId, idx)
    )
    return json(result)
  }

  if (!messageUuid) {
    throw error(400, 'uuid or lineIndex parameter required')
  }
  const result = await Effect.runPromise(
    session.deleteMessage(projectName, sessionId, messageUuid, targetType ?? undefined)
  )
  return json(result)
}

export const PATCH: RequestHandler = async ({ url, request }) => {
  const projectName = url.searchParams.get('project')
  const sessionId = url.searchParams.get('session')
  const lineIndex = url.searchParams.get('lineIndex')

  if (!projectName || !sessionId) {
    throw error(400, 'project and session parameters required')
  }

  const body = await request.json()
  const { customTitle } = body as { customTitle?: string | null }

  // Line index based update for uuid-less messages
  if (lineIndex !== null) {
    const idx = parseInt(lineIndex, 10)
    if (isNaN(idx)) throw error(400, 'lineIndex must be a number')
    if (customTitle === null || customTitle === '') {
      const result = await Effect.runPromise(
        session.deleteTitleMessageByIndex(projectName, sessionId, idx)
      )
      return json(result)
    }
    if (customTitle === undefined) throw error(400, 'customTitle is required')
    const result = await Effect.runPromise(
      session.updateTitleMessageByIndex(projectName, sessionId, idx, customTitle)
    )
    return json(result)
  }

  // Fallback: type-based bulk deletion via rename
  if (customTitle === null || customTitle === '') {
    const result = await Effect.runPromise(
      session.deleteTitleMessages(projectName, sessionId, 'custom-title')
    )
    return json(result)
  }

  throw error(400, 'lineIndex parameter required for title message updates')
}
