import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as session from '$lib/server/session'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q')
  if (!query) {
    throw error(400, 'q parameter required')
  }

  const projectName = url.searchParams.get('project') ?? undefined
  const searchContent = url.searchParams.get('content') === 'true'

  const results = await Effect.runPromise(
    session.searchSessions(query, { projectName, searchContent })
  )
  return json(results)
}
