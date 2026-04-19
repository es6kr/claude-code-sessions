/**
 * Project-level utilities
 */
import type { Project } from './types.js'
import { pathToFolderName } from './paths.js'

/**
 * Sort projects with priority:
 * 1. Current project (if specified)
 * 2. Current user's home directory subpaths
 * 3. Others (alphabetically by displayName)
 */
export const sortProjects = (
  projects: Project[],
  options: {
    currentProjectName?: string | null
    homeDir?: string
    filterEmpty?: boolean
  } = {}
): Project[] => {
  const { currentProjectName, homeDir, filterEmpty = true } = options

  const filtered = filterEmpty ? projects.filter((p) => p.sessionCount > 0) : projects

  // Convert homeDir to folder name format for comparison with project.name
  // e.g., "/Users/david" -> "-Users-david"
  const homeDirPrefix = homeDir ? pathToFolderName(homeDir) : null

  return filtered.sort((a, b) => {
    // Current project always first
    if (currentProjectName) {
      if (a.name === currentProjectName) return -1
      if (b.name === currentProjectName) return 1
    }

    // Then prioritize current user's home directory paths
    // Compare using project.name (folder name format) with homeDirPrefix
    if (homeDirPrefix) {
      const aIsUserHome = a.name.startsWith(homeDirPrefix)
      const bIsUserHome = b.name.startsWith(homeDirPrefix)
      if (aIsUserHome && !bIsUserHome) return -1
      if (!aIsUserHome && bIsUserHome) return 1
    }

    // Finally sort by display name
    return a.displayName.localeCompare(b.displayName)
  })
}
