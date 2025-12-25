import { json } from '@sveltejs/kit'
import { homedir } from 'os'
import { pathToFolderName } from '@claude-sessions/core'
import type { RequestHandler } from './$types'

declare const __APP_VERSION__: string

// INIT_CWD is set by npm/pnpm to the original directory where the command was run
const currentProjectName = pathToFolderName(process.env.INIT_CWD || process.cwd())

export const GET: RequestHandler = async () => {
  return json({
    version: __APP_VERSION__,
    homeDir: homedir(),
    currentProjectName,
  })
}
