/**
 * Open file utility - configurable editor command
 */
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface OpenFileOptions {
  editorCommand: string
  homeDir: string
}

const defaultOptions: OpenFileOptions = {
  editorCommand: 'code',
  homeDir: '',
}

let currentOptions: OpenFileOptions = { ...defaultOptions }

/**
 * Configure the open file options
 */
export function configureOpenFile(options: Partial<OpenFileOptions>): void {
  currentOptions = { ...currentOptions, ...options }
}

/**
 * Get current configuration
 */
export function getOpenFileConfig(): OpenFileOptions {
  return { ...currentOptions }
}

/**
 * Reset to default configuration
 */
export function resetOpenFileConfig(): void {
  currentOptions = { ...defaultOptions }
}

/**
 * Expand ~ to home directory
 */
export function expandHomePath(filePath: string, homeDir: string): string {
  if (!homeDir) return filePath
  if (filePath.startsWith('~')) {
    return filePath.replace(/^~/, homeDir)
  }
  return filePath
}

/**
 * Open a file with the configured editor
 */
export async function openFile(filePath: string): Promise<void> {
  const { editorCommand, homeDir } = currentOptions
  const expandedPath = expandHomePath(filePath, homeDir)
  await execAsync(`${editorCommand} "${expandedPath}"`)
}
