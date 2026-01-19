/**
 * Sessions index file operations
 *
 * The sessions-index.json file is maintained by the official Claude Code extension.
 * It provides quick access to session metadata without parsing JSONL files.
 *
 * File location: ~/.claude/projects/{project-folder}/sessions-index.json
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir } from '../paths.js'
import type { SessionsIndex, SessionIndexEntry } from '../types.js'

/**
 * Load sessions-index.json for a project
 * Returns null if the file doesn't exist
 */
export const loadSessionsIndex = (projectName: string) =>
  Effect.gen(function* () {
    const indexPath = path.join(getSessionsDir(), projectName, 'sessions-index.json')

    try {
      const content = yield* Effect.tryPromise(() => fs.readFile(indexPath, 'utf-8'))
      const index = JSON.parse(content) as SessionsIndex
      return index
    } catch {
      return null
    }
  })

/**
 * Get display title from index entry
 * Priority: customTitle > summary > firstPrompt (cleaned)
 */
export const getIndexEntryDisplayTitle = (entry: SessionIndexEntry): string => {
  if (entry.customTitle) return entry.customTitle
  if (entry.summary) return entry.summary

  // Clean up firstPrompt
  let prompt = entry.firstPrompt
  if (prompt === 'No prompt') return 'Untitled'
  if (prompt.startsWith('[Request interrupted')) return 'Untitled'

  // Remove IDE tags
  prompt = prompt.replace(/<ide_[^>]*>[^<]*<\/ide_[^>]*>/g, '').trim()
  if (!prompt) return 'Untitled'

  // Truncate
  if (prompt.length > 60) {
    return prompt.slice(0, 57) + '...'
  }

  return prompt
}

/**
 * Sort index entries by modified time (newest first)
 */
export const sortIndexEntriesByModified = (entries: SessionIndexEntry[]): SessionIndexEntry[] => {
  return [...entries].sort((a, b) => {
    const modA = new Date(a.modified).getTime()
    const modB = new Date(b.modified).getTime()
    return modB - modA
  })
}

/**
 * Check if sessions-index.json exists for a project
 */
export const hasSessionsIndex = (projectName: string) =>
  Effect.gen(function* () {
    const indexPath = path.join(getSessionsDir(), projectName, 'sessions-index.json')
    try {
      yield* Effect.tryPromise(() => fs.access(indexPath))
      return true
    } catch {
      return false
    }
  })
