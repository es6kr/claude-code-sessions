/**
 * Global configuration store
 */

import { writable, derived, get } from 'svelte/store'
import { maskHomePath as coreMaskHomePath } from '@claude-sessions/core'

export interface AppConfig {
  version: string
  homeDir: string
  currentProjectName: string
}

// Global config store
export const appConfig = writable<AppConfig>({ version: '', homeDir: '', currentProjectName: '' })

/**
 * Mask paths for current user's home directory only
 * Uses core maskHomePath, falls back to generic masking if homeDir not set
 */
export const maskHomePath = (text: string, homeDir?: string): string => {
  const home = homeDir ?? get(appConfig).homeDir

  if (!home) {
    // Fallback: mask any /Users/username pattern (when homeDir unknown)
    return text.replace(
      /(?:\/Users\/[^/\s]+|C:\\Users\\[^\\\s]+)(?=[/\\]|(?=\s|$|[)"'\]}>,:;]))/g,
      '~'
    )
  }

  return coreMaskHomePath(text, home)
}

/**
 * Derived store for path masking function
 */
export const pathMasker = derived(appConfig, ($config) => {
  return (text: string) => maskHomePath(text, $config.homeDir)
})
