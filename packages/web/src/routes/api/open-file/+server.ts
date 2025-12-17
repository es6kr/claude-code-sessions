import { json, error } from '@sveltejs/kit'
import { exec } from 'child_process'
import { promisify } from 'util'
import { homedir } from 'os'
import { join } from 'path'
import type { RequestHandler } from './$types'

const execAsync = promisify(exec)

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json()

  let filePath: string

  if (body.filePath) {
    // Direct file path (for Read tool)
    filePath = body.filePath
  } else if (body.sessionId && body.backupFileName) {
    // Backup file path: ~/.claude/file-history/{sessionId}/{backupFileName}
    filePath = join(homedir(), '.claude', 'file-history', body.sessionId, body.backupFileName)
  } else {
    throw error(400, 'filePath or (sessionId and backupFileName) required')
  }

  try {
    // Open the file in VS Code using the code command
    await execAsync(`code "${filePath}"`)
    return json({ success: true })
  } catch (e) {
    throw error(500, `Failed to open file: ${e}`)
  }
}
