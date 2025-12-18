/**
 * Expand project API - loads all session data including agents, todos, summaries
 */
import { json, error } from '@sveltejs/kit'
import { Effect } from 'effect'
import * as core from '@claude-sessions/core'
import type { RequestHandler } from './$types'

interface SummaryInfo {
  uuid: string
  summary: string
  leafUuid?: string
  timestamp?: string
  sessionId: string
}

interface SessionData {
  id: string
  title?: string
  messageCount: number
  createdAt?: string
  updatedAt?: string
  agents: string[]
  todos: string[]
  summaries: SummaryInfo[]
  lastSummary?: SummaryInfo
}

export const GET: RequestHandler = async ({ url }) => {
  const projectName = url.searchParams.get('project')
  if (!projectName) {
    throw error(400, 'project parameter required')
  }

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      // List all sessions
      const sessions = yield* core.listSessions(projectName)
      const sessionDataList: SessionData[] = []

      for (const session of sessions) {
        // Find linked agents
        const agents = yield* core.findLinkedAgents(projectName, session.id)

        // Find linked todos
        const todosResult = yield* core.findLinkedTodos(session.id, agents)
        const todos = todosResult.hasTodos
          ? [
              ...(todosResult.sessionTodos.length > 0 ? [session.id] : []),
              ...todosResult.agentTodos.map((at) => at.agentId),
            ]
          : []

        // Read session messages to extract summaries
        const messages = yield* core.readSession(projectName, session.id)
        const summaries: SummaryInfo[] = []

        // Build message map for timestamp lookup
        const messageMap = new Map<string, { timestamp?: string }>()
        for (const msg of messages) {
          if (msg.uuid) {
            messageMap.set(msg.uuid, { timestamp: msg.timestamp })
          }
        }

        // Extract summaries
        for (const msg of messages) {
          const msgAny = msg as { type: string; summary?: string; leafUuid?: string; uuid: string; timestamp?: string }
          if (msgAny.type === 'summary' && msgAny.summary) {
            const leafMsg = msgAny.leafUuid ? messageMap.get(msgAny.leafUuid) : undefined
            summaries.push({
              uuid: msgAny.uuid,
              summary: msgAny.summary,
              leafUuid: msgAny.leafUuid,
              timestamp: leafMsg?.timestamp ?? msgAny.timestamp,
              sessionId: session.id,
            })
          }
        }

        // Get last summary (most recent by timestamp)
        const lastSummary =
          summaries.length > 0
            ? [...summaries].sort((a, b) => {
                if (!a.timestamp) return 1
                if (!b.timestamp) return -1
                return b.timestamp.localeCompare(a.timestamp)
              })[0]
            : undefined

        sessionDataList.push({
          id: session.id,
          title: session.title,
          messageCount: session.messageCount,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          agents,
          todos,
          summaries,
          lastSummary,
        })
      }

      return sessionDataList
    })
  )

  return json(result)
}
