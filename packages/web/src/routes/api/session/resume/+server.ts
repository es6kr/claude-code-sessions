import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { folderNameToPath } from '@claude-sessions/core'
import { resumeSession } from '@claude-sessions/core/server'
import * as os from 'node:os'

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { projectName, sessionId }: { projectName: string; sessionId: string } =
      await request.json()

    if (!projectName || !sessionId) {
      return json({ error: 'Missing projectName or sessionId' }, { status: 400 })
    }

    // Get project path for cwd
    const folderPath = folderNameToPath(projectName)
    const homeDir = os.homedir()
    const cwd = folderPath.startsWith('~') ? folderPath.replace('~', homeDir) : folderPath

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
