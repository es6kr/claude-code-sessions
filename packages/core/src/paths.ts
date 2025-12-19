/**
 * Path utilities for Claude Code session management
 *
 * Architecture:
 * - Pure Functions: extractCwdFromContent, isSessionFile, toRelativePath (no I/O)
 * - I/O Functions: tryGetCwdFromFile, getRealPathFromSession (with optional DI for testing)
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createLogger } from './logger.js'

const log = createLogger('paths')

// ============================================
// Types (for dependency injection)
// ============================================

export interface Logger {
  debug: (msg: string) => void
  warn: (msg: string) => void
}

export interface FileSystem {
  readFileSync: (path: string, encoding: 'utf-8') => string
  readdirSync: (path: string) => string[]
}

// ============================================
// Directory Paths
// ============================================

/** Get Claude sessions directory (~/.claude/projects) */
export const getSessionsDir = (): string => path.join(os.homedir(), '.claude', 'projects')

/** Get Claude todos directory (~/.claude/todos) */
export const getTodosDir = (): string => path.join(os.homedir(), '.claude', 'todos')

// ============================================
// Pure Functions (No I/O)
// ============================================

/** Extract cwd from file content - pure function for easy testing */
export const extractCwdFromContent = (content: string): string | null => {
  const lines = content.split('\n').filter((l) => l.trim())

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      if (parsed?.cwd) {
        return parsed.cwd
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return null
}

/** Check if filename is a session file */
export const isSessionFile = (filename: string): boolean =>
  filename.endsWith('.jsonl') && !filename.startsWith('agent-')

/** Convert path to relative form if under home directory */
export const toRelativePath = (absolutePath: string, homeDir: string): string => {
  const normalizedPath = absolutePath.replace(/\\/g, '/')
  const normalizedHome = homeDir.replace(/\\/g, '/')

  if (normalizedPath.startsWith(normalizedHome)) {
    return '~' + normalizedPath.slice(normalizedHome.length)
  }
  return absolutePath
}

// ============================================
// Path Conversion (Pure)
// ============================================

/**
 * Convert project folder name to display path
 * Unix: -home-user-projects -> /home/user/projects
 * Windows: C--Users-david -> C:\Users\david
 * Handle dot-prefixed folders: --claude -> /.claude
 */
export const folderNameToDisplayPath = (folderName: string): string => {
  // Check if Windows path (starts with drive letter pattern like "C--")
  const windowsDriveMatch = folderName.match(/^([A-Za-z])--/)
  if (windowsDriveMatch) {
    const driveLetter = windowsDriveMatch[1]
    const rest = folderName.slice(3)
    return driveLetter + ':\\' + rest.replace(/--/g, '\\.').replace(/-/g, '\\')
  }

  // Unix path
  return folderName.replace(/^-/, '/').replace(/--/g, '/.').replace(/-/g, '/')
}

/** Convert display path to folder name (reverse of above) */
export const displayPathToFolderName = (displayPath: string): string => {
  const windowsDriveMatch = displayPath.match(/^([A-Za-z]):[/\\]/)
  if (windowsDriveMatch) {
    const driveLetter = windowsDriveMatch[1]
    const rest = displayPath.slice(3)
    return driveLetter + '--' + rest.replace(/[/\\]\./g, '--').replace(/[/\\]/g, '-')
  }

  return displayPath.replace(/^\//g, '-').replace(/\/\./g, '--').replace(/\//g, '-')
}

/**
 * Convert absolute path to project folder name
 * Non-ASCII characters are converted to '-' per character
 * Windows drive letter is normalized to lowercase (C: -> c--)
 */
export const pathToFolderName = (absolutePath: string): string => {
  const convertNonAscii = (str: string): string =>
    [...str].map((char) => (char.charCodeAt(0) <= 127 ? char : '-')).join('')

  const windowsDriveMatch = absolutePath.match(/^([A-Za-z]):[/\\]/)
  if (windowsDriveMatch) {
    // Normalize drive letter to lowercase (Claude Code uses lowercase)
    const driveLetter = windowsDriveMatch[1].toLowerCase()
    const rest = absolutePath.slice(3)
    return (
      driveLetter +
      '--' +
      convertNonAscii(rest)
        .replace(/[/\\]\./g, '--')
        .replace(/[/\\]/g, '-')
        .replace(/\./g, '-')
    )
  }

  return convertNonAscii(absolutePath)
    .replace(/^\//g, '-')
    .replace(/\/\./g, '--')
    .replace(/\//g, '-')
    .replace(/\./g, '-')
}

// ============================================
// I/O Functions (with optional DI for testing)
// ============================================

/**
 * Try to extract cwd from a single session file
 * @param filePath - Path to session file
 * @param fileSystem - Optional FileSystem for testing
 * @param logger - Optional Logger for testing
 */
export const tryGetCwdFromFile = (
  filePath: string,
  fileSystem: FileSystem = fs,
  logger: Logger = log
): string | null => {
  const basename = path.basename(filePath)

  try {
    const content = fileSystem.readFileSync(filePath, 'utf-8')
    const cwd = extractCwdFromContent(content)

    if (cwd === null) {
      const lines = content.split('\n').filter((l) => l.trim())
      if (lines.length === 0) {
        logger.debug(`tryGetCwdFromFile: ${basename} -> empty file`)
      } else {
        logger.debug(`tryGetCwdFromFile: ${basename} -> no cwd found in ${lines.length} lines`)
      }
      return null
    }

    logger.debug(`tryGetCwdFromFile: ${basename} -> cwd=${cwd}`)
    return cwd
  } catch (e) {
    logger.warn(`tryGetCwdFromFile: ${basename} -> read error: ${e}`)
    return null
  }
}

/**
 * Extract real cwd path from session files in a project
 * @param folderName - Project folder name
 * @param sessionsDir - Optional sessions directory for testing
 * @param fileSystem - Optional FileSystem for testing
 * @param logger - Optional Logger for testing
 */
export const getRealPathFromSession = (
  folderName: string,
  sessionsDir: string = getSessionsDir(),
  fileSystem: FileSystem = fs,
  logger: Logger = log
): string | null => {
  const projectDir = path.join(sessionsDir, folderName)

  try {
    const files = fileSystem.readdirSync(projectDir).filter(isSessionFile)

    const cwdList: string[] = []
    for (const f of files) {
      const cwd = tryGetCwdFromFile(path.join(projectDir, f), fileSystem, logger)
      if (cwd !== null) {
        cwdList.push(cwd)
      }
    }

    // Find cwd that matches folder name
    const matched = cwdList.find((cwd) => pathToFolderName(cwd) === folderName)
    if (matched) {
      logger.debug(`getRealPathFromSession: ${folderName} -> ${matched}`)
      return matched
    }

    // Log for debugging
    if (cwdList.length > 0) {
      logger.warn(
        `getRealPathFromSession: ${folderName} -> no match, cwds found: ${cwdList.join(', ')}`
      )
    } else {
      logger.warn(`getRealPathFromSession: ${folderName} -> no valid cwd in any session`)
    }
    return null
  } catch {
    return null
  }
}

// ============================================
// Public API
// ============================================

/**
 * Convert folder name to relative or absolute path for display
 * If path is under home directory, show relative (~/...)
 */
export const folderNameToPath = (folderName: string): string => {
  const homeDir = os.homedir()

  // First try to get real path from session cwd
  const realPath = getRealPathFromSession(folderName)
  if (realPath) {
    return toRelativePath(realPath, homeDir)
  }

  // Fallback to pattern-based conversion
  const absolutePath = folderNameToDisplayPath(folderName)
  return toRelativePath(absolutePath, homeDir)
}
