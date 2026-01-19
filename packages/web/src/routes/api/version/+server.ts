import { json } from '@sveltejs/kit'
import { homedir } from 'os'
import { pathToFolderName } from '@claude-sessions/core'
import { env } from '$env/dynamic/private'
import type { RequestHandler } from './$types'

declare const __APP_VERSION__: string

// Priority: CLAUDE_SESSIONS_PROJECT > INIT_CWD > cwd()
// INIT_CWD is set by npm/pnpm to the original directory where the command was run
const getCurrentProjectName = (): string => {
  if (env.CLAUDE_SESSIONS_PROJECT) {
    return env.CLAUDE_SESSIONS_PROJECT
  }
  return pathToFolderName(process.env.INIT_CWD || process.cwd())
}

export const GET: RequestHandler = async () => {
  return json({
    version: __APP_VERSION__,
    homeDir: env.CLAUDE_SESSIONS_HOME || homedir(),
    currentProjectName: getCurrentProjectName(),
  })
}
