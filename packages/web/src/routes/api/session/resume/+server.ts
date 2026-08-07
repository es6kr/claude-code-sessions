import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { folderNameToPath, expandHomePath } from '@claude-sessions/core'
import { resumeSession } from '@claude-sessions/core/server'
import * as os from 'node:os'

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { projectName, sessionId }: { projectName: string; sessionId: string } =
      await request.json()

    if (!projectName || !sessionId) {
      return json({ error: 'Missing projectName or sessionId' }, { status: 400 })
    }

    // Defense in depth: sessionId is interpolated into a spawned CLI argv
    // (resumeSession -> claudeArgs) and ultimately into a shell string on
    // some platforms (AppleScript do script / bash -c / cmd). The Host
    // allow-list + one-time-token auth in hooks.server.ts already restrict
    // who can reach this endpoint, but the value itself is still
    // unvalidated -- mirror the same allow-list regex the vscode-extension
    // already applies to its own resume/openTerminalHere handlers.
    if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
      return json({ error: 'Invalid session id' }, { status: 400 })
    }

    // Get project path for cwd
    const folderPath = await folderNameToPath(projectName)
    const homeDir = os.homedir()
    const cwd = expandHomePath(folderPath, homeDir)

    const result = resumeSession({
      sessionId,
      cwd,
    })

    if (result.success) {
      return json({ success: true, pid: result.pid })
    } else {
      return json({ error: result.error }, { status: 500 })
    }
  } catch (error) {
    return json({ error: String(error) }, { status: 500 })
  }
}
