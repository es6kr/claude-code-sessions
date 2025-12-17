/**
 * Path utilities for Claude Code session management
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// Get Claude sessions directory (~/.claude/projects)
export const getSessionsDir = (): string => path.join(os.homedir(), '.claude', 'projects')

// Get Claude todos directory (~/.claude/todos)
export const getTodosDir = (): string => path.join(os.homedir(), '.claude', 'todos')

// Convert project folder name to display path
// e.g., -home-user-projects -> /home/user/projects
// Handle dot-prefixed folders: --claude -> /.claude, -projects--vscode -> /projects/.vscode
export const folderNameToDisplayPath = (folderName: string): string => {
  return folderName
    .replace(/^-/, '/')
    .replace(/--/g, '/.') // double dash means dot-prefixed folder
    .replace(/-/g, '/')
}

// Convert display path to folder name (reverse of above)
export const displayPathToFolderName = (displayPath: string): string => {
  return displayPath
    .replace(/^\//g, '-')
    .replace(/\/\./g, '--') // dot-prefixed folder becomes double dash
    .replace(/\//g, '-')
}

// Convert absolute path to project folder name
// e.g., /home/user/projects/.vscode -> -home-user-projects--vscode
// e.g., /home/user/example.com -> -home-user-example-com
export const pathToFolderName = (absolutePath: string): string => {
  return absolutePath
    .replace(/^\//g, '-')
    .replace(/\/\./g, '--') // dot-prefixed folder becomes double dash
    .replace(/\//g, '-')
    .replace(/\./g, '-') // dots in filenames become single dash
}

// Convert folder name to relative or absolute path for display
// If path is under home directory, show relative (~/...)
// Otherwise show absolute path
export const folderNameToPath = (folderName: string): string => {
  // First try to get real path from session cwd
  const realPath = getRealPathFromSession(folderName)
  if (realPath) {
    const home = os.homedir()
    if (realPath.startsWith(home)) {
      return '~' + realPath.slice(home.length)
    }
    return realPath
  }

  // Fallback to pattern-based conversion
  const absolutePath = folderNameToDisplayPath(folderName)
  const home = os.homedir()

  if (absolutePath.startsWith(home)) {
    return '~' + absolutePath.slice(home.length)
  }
  return absolutePath
}

// Try to extract cwd from a single session file
const tryGetCwdFromFile = (filePath: string): string | null => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const firstLine = content.split('\n')[0]
    if (!firstLine) return null
    const message = JSON.parse(firstLine) as { cwd?: string }
    return message.cwd ?? null
  } catch {
    return null
  }
}

// Extract real cwd path from session files in a project
// This handles edge cases like es~kr -> es.kr (tilde in hostname)
// Iterates through all session files to find one with matching cwd
// Returns null if no session has cwd matching the folder name (all sessions moved from other projects)
export const getRealPathFromSession = (folderName: string): string | null => {
  const projectDir = path.join(getSessionsDir(), folderName)

  try {
    const files = fs.readdirSync(projectDir)
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))

    for (const sessionFile of sessionFiles) {
      const cwd = tryGetCwdFromFile(path.join(projectDir, sessionFile))
      // Verify cwd matches the folder name (session wasn't moved from another project)
      if (cwd && pathToFolderName(cwd) === folderName) {
        return cwd
      }
    }

    return null
  } catch {
    return null
  }
}
