import { json, error } from '@sveltejs/kit'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { homedir } from 'os'
import { join } from 'path'
import { env } from '$env/dynamic/private'
import type { RequestHandler } from './$types'

const execFileAsync = promisify(execFile)

/**
 * Expand ~ to configured home directory or system homedir
 */
function expandHomePath(filePath: string): string {
  const homeDir = env.CLAUDE_SESSIONS_HOME || homedir()
  if (filePath.startsWith('~')) {
    return filePath.replace(/^~/, homeDir)
  }
  return filePath
}

/**
 * Get the editor command from environment or default to 'code'
 */
function getEditorCommand(): string {
  return env.CLAUDE_SESSIONS_EDITOR || 'code'
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json()

  let filePath: string

  if (body.filePath) {
    // Direct file path (for Read tool)
    filePath = body.filePath
  } else if (body.sessionId && body.backupFileName) {
    // Backup file path: ~/.claude/file-history/{sessionId}/{backupFileName}
    const homeDir = env.CLAUDE_SESSIONS_HOME || homedir()
    filePath = join(homeDir, '.claude', 'file-history', body.sessionId, body.backupFileName)
  } else {
    throw error(400, 'filePath or (sessionId and backupFileName) required')
  }

  // Expand ~ in path if present
  filePath = expandHomePath(filePath)

  try {
    const editorCommand = getEditorCommand()
    // execFile never goes through a shell, so filePath (or an
    // attacker-supplied payload like `; rm -rf ~ #`) cannot be interpreted
    // as a command regardless of its contents. CLAUDE_SESSIONS_EDITOR may
    // itself be a multi-token string (e.g. "code --wait") — split it into
    // the binary plus its own leading args, then append filePath last.
    const [editorBin, ...editorArgs] = editorCommand.trim().split(/\s+/)
    await execFileAsync(editorBin, [...editorArgs, filePath])
    return json({ success: true })
  } catch (e) {
    throw error(500, `Failed to open file: ${e}`)
  }
}
