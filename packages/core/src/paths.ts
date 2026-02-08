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
import { tryParseJsonLine } from './utils.js'

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

/** Get Claude sessions directory (~/.claude/projects)
 * Can be overridden with CLAUDE_SESSIONS_DIR environment variable for testing
 */
export const getSessionsDir = (): string =>
  process.env.CLAUDE_SESSIONS_DIR || path.join(os.homedir(), '.claude', 'projects')

/** Get Claude todos directory (~/.claude/todos) */
export const getTodosDir = (): string => path.join(os.homedir(), '.claude', 'todos')

// ============================================
// Internal Path Utilities
// ============================================

/** Windows path detection patterns */
const WINDOWS_PATTERNS = {
  /** Matches Windows absolute path: C:\ or C:/ */
  absolutePath: /^([A-Za-z]):[/\\]/,
  /** Matches Windows folder name format: C-- */
  folderName: /^([A-Za-z])--/,
} as const

type WindowsPathResult = { isWindows: true; drive: string; rest: string } | { isWindows: false }

/** Parse Windows absolute path, extracting drive letter and rest */
const parseWindowsAbsPath = (p: string): WindowsPathResult => {
  const match = p.match(WINDOWS_PATTERNS.absolutePath)
  return match ? { isWindows: true, drive: match[1], rest: p.slice(3) } : { isWindows: false }
}

/** Parse Windows folder name format, extracting drive letter and rest */
const parseWindowsFolderName = (name: string): WindowsPathResult => {
  const match = name.match(WINDOWS_PATTERNS.folderName)
  return match ? { isWindows: true, drive: match[1], rest: name.slice(3) } : { isWindows: false }
}

/** Check if path looks like Windows format */
const isWindowsPath = (p: string): boolean => WINDOWS_PATTERNS.absolutePath.test(p)

/** Convert non-ASCII characters to '-' */
const convertNonAscii = (str: string): string =>
  [...str].map((c) => (c.charCodeAt(0) <= 127 ? c : '-')).join('')

/** Convert path chars to folder name format (handles dots) */
const pathCharsToFolderName = (str: string): string =>
  str
    .replace(/[/\\]\./g, '--')
    .replace(/[/\\]/g, '-')
    .replace(/\./g, '-')

/** Convert separators to folder name format (no dot handling) */
const separatorsToFolderName = (str: string): string =>
  str.replace(/[/\\]\./g, '--').replace(/[/\\]/g, '-')

// ============================================
// Pure Functions (No I/O)
// ============================================

/** Extract cwd from file content - pure function for easy testing */
export const extractCwdFromContent = (content: string, filePath?: string): string | null => {
  const lines = content.split('\n').filter((l) => l.trim())

  for (let i = 0; i < lines.length; i++) {
    const parsed = tryParseJsonLine<{ cwd?: string }>(lines[i], i + 1, filePath)
    if (parsed?.cwd) {
      return parsed.cwd
    }
  }

  return null
}

/** Check if filename is a session file */
export const isSessionFile = (filename: string): boolean =>
  filename.endsWith('.jsonl') && !filename.startsWith('agent-')

/** Expand ~ path to absolute path with OS-native separators */
export const expandHomePath = (tildePath: string, homeDir: string): string => {
  if (!tildePath.startsWith('~')) return tildePath
  const relativePart = tildePath.slice(1)
  // path.join uses OS-native separator
  return path.join(homeDir, ...relativePart.split('/').filter(Boolean))
}

/** Convert path to relative form if under home directory */
export const toRelativePath = (absolutePath: string, homeDir: string): string => {
  const normalizedPath = absolutePath.replace(/\\/g, '/')
  const normalizedHome = homeDir.replace(/\\/g, '/')

  // Windows: case-insensitive comparison (C: vs c:)
  const isWin = isWindowsPath(homeDir)
  const pathLower = normalizedPath.toLowerCase()
  const homeLower = normalizedHome.toLowerCase()

  // Check for exact match or path with separator after home dir
  if (isWin ? pathLower === homeLower : normalizedPath === normalizedHome) {
    return '~'
  }

  const startsWithHome = isWin
    ? pathLower.startsWith(homeLower + '/')
    : normalizedPath.startsWith(normalizedHome + '/')

  if (startsWithHome) {
    // Use OS-native separator in return value
    const sep = isWin ? '\\' : '/'
    const relativePart = absolutePath.slice(homeDir.length)
    return '~' + relativePart.replace(/[\\/]/g, sep)
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
  const parsed = parseWindowsFolderName(folderName)
  if (parsed.isWindows) {
    return parsed.drive + ':\\' + parsed.rest.replace(/--/g, '\\.').replace(/-/g, '\\')
  }

  // Unix path
  return folderName.replace(/^-/, '/').replace(/--/g, '/.').replace(/-/g, '/')
}

/**
 * Convert display path to folder name (reverse of folderNameToDisplayPath)
 * @deprecated Use pathToFolderName for absolute paths. This function exists
 * for roundtrip testing and does not handle non-ASCII or normalize drive case.
 */
export const displayPathToFolderName = (displayPath: string): string => {
  const parsed = parseWindowsAbsPath(displayPath)
  if (parsed.isWindows) {
    return parsed.drive + '--' + separatorsToFolderName(parsed.rest)
  }

  return displayPath.replace(/^\//g, '-').replace(/\/\./g, '--').replace(/\//g, '-')
}

/**
 * Convert absolute path to project folder name
 * Non-ASCII characters are converted to '-' per character
 * Windows drive letter is normalized to lowercase (C: -> c--)
 */
export const pathToFolderName = (absolutePath: string): string => {
  const parsed = parseWindowsAbsPath(absolutePath)
  if (parsed.isWindows) {
    // Normalize drive letter to lowercase (Claude Code uses lowercase)
    return parsed.drive.toLowerCase() + '--' + pathCharsToFolderName(convertNonAscii(parsed.rest))
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
      return null
    }

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

/**
 * Find project folder name that matches the given workspace path
 * Searches through all projects and checks if any session's cwd matches
 *
 * @param workspacePath - Absolute path of current workspace
 * @param projectNames - List of project folder names to search
 * @param sessionsDir - Optional sessions directory for testing
 * @param fileSystem - Optional FileSystem for testing
 * @param logger - Optional Logger for testing
 * @returns Matching project folder name or null
 */
export const findProjectByWorkspacePath = (
  workspacePath: string,
  projectNames: string[],
  sessionsDir: string = getSessionsDir(),
  fileSystem: FileSystem = fs,
  logger: Logger = log
): string | null => {
  // First, check if direct conversion matches any project
  const directMatch = pathToFolderName(workspacePath)
  if (projectNames.includes(directMatch)) {
    return directMatch
  }

  // Search through projects to find one with matching cwd
  for (const projectName of projectNames) {
    const projectDir = path.join(sessionsDir, projectName)

    try {
      const files = fileSystem.readdirSync(projectDir).filter(isSessionFile)

      for (const f of files) {
        const cwd = tryGetCwdFromFile(path.join(projectDir, f), fileSystem, logger)
        if (cwd === workspacePath) {
          logger.debug(
            `findProjectByWorkspacePath: ${workspacePath} -> found in ${projectName} (moved session)`
          )
          return projectName
        }
      }
    } catch {
      // Skip inaccessible projects
    }
  }

  logger.debug(`findProjectByWorkspacePath: ${workspacePath} -> no matching project found`)
  return null
}
