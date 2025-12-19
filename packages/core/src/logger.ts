/**
 * Simple logger abstraction for Claude Sessions
 * Consumers can provide their own logger implementation
 */

export interface Logger {
  debug: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
}

// Default console logger
const consoleLogger: Logger = {
  debug: (msg, ...args) => console.debug(`[DEBUG] ${msg}`, ...args),
  info: (msg, ...args) => console.info(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
}

// Global logger instance
let currentLogger: Logger = consoleLogger

/**
 * Set custom logger implementation
 * @example
 * // VSCode extension
 * setLogger({
 *   debug: (msg) => outputChannel.appendLine(`[DEBUG] ${msg}`),
 *   info: (msg) => outputChannel.appendLine(`[INFO] ${msg}`),
 *   warn: (msg) => outputChannel.appendLine(`[WARN] ${msg}`),
 *   error: (msg) => outputChannel.appendLine(`[ERROR] ${msg}`),
 * })
 */
export const setLogger = (logger: Logger): void => {
  currentLogger = logger
}

/**
 * Get current logger instance
 */
export const getLogger = (): Logger => currentLogger

/**
 * Create a namespaced logger
 * @example
 * const log = createLogger('paths')
 * log.debug('Converting folder name') // [DEBUG] [paths] Converting folder name
 */
export const createLogger = (namespace: string): Logger => ({
  debug: (msg, ...args) => currentLogger.debug(`[${namespace}] ${msg}`, ...args),
  info: (msg, ...args) => currentLogger.info(`[${namespace}] ${msg}`, ...args),
  warn: (msg, ...args) => currentLogger.warn(`[${namespace}] ${msg}`, ...args),
  error: (msg, ...args) => currentLogger.error(`[${namespace}] ${msg}`, ...args),
})
