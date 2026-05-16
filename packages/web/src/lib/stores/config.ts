/**
 * Global configuration store
 */

import { writable, derived, get } from 'svelte/store'
import { maskHomePath as coreMaskHomePath, type ProjectViewMode } from '@claude-sessions/core'

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

// ============================================================================
// Project tree view mode
// ============================================================================

const VIEW_MODE_KEY = 'claudeSessionsViewMode'
const EXPANDED_GROUPS_KEY = 'claude-sessions.expandedGroups'

const isViewMode = (value: string | null): value is ProjectViewMode =>
  value === 'flat' || value === 'date-group' || value === 'folder-group'

const initialViewMode = (): ProjectViewMode => {
  if (typeof localStorage === 'undefined') return 'folder-group'
  const stored = localStorage.getItem(VIEW_MODE_KEY)
  return isViewMode(stored) ? stored : 'folder-group'
}

const initialExpandedGroups = (): Set<string> => {
  if (typeof localStorage === 'undefined') return new Set()
  try {
    const stored = localStorage.getItem(EXPANDED_GROUPS_KEY)
    if (!stored) return new Set()
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed)
      ? new Set(parsed.filter((s): s is string => typeof s === 'string'))
      : new Set()
  } catch {
    return new Set()
  }
}

export const viewMode = writable<ProjectViewMode>(initialViewMode())
export const expandedGroups = writable<Set<string>>(initialExpandedGroups())

if (typeof localStorage !== 'undefined') {
  viewMode.subscribe((mode) => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode)
    } catch {
      // ignore storage write errors (private mode, quota)
    }
  })
  expandedGroups.subscribe((set) => {
    try {
      localStorage.setItem(EXPANDED_GROUPS_KEY, JSON.stringify([...set]))
    } catch {
      // ignore
    }
  })
}
