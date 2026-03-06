/**
 * Tree data cache for fast project loading
 *
 * Stores the full output of loadProjectTreeData alongside sessions at
 * ~/.claude/projects/{project}/.tree-cache.json
 * Invalidated by comparing file mtimes.
 */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir } from '../paths.js'
import type { SessionTreeData } from '../types.js'
import { createLogger } from '../logger.js'

const log = createLogger('cache')

const CACHE_VERSION = 1
const CACHE_FILENAME = '.tree-cache.json'

// ============================================================================
// Types
// ============================================================================

export interface CachedSessionData {
  fileMtime: number
  data: SessionTreeData
}

export interface TreeCache {
  version: number
  /** Phase 1 output: global UUID map entries */
  globalUuidMap: Record<string, { sessionId: string; timestamp?: string }>
  /** Phase 1 output: all summary records */
  allSummaries: Array<{
    summary: string
    leafUuid?: string
    timestamp?: string
    sourceFile: string
  }>
  /** Phase 2 output: per-session tree data keyed by sessionId */
  sessions: Record<string, CachedSessionData>
}

export interface CacheValidation {
  isFullHit: boolean
  changedSessionIds: string[]
  unchangedSessionIds: string[]
  deletedSessionIds: string[]
  /** New session files not in cache */
  newSessionIds: string[]
}

// ============================================================================
// Path helper
// ============================================================================

export const getCachePath = (projectName: string): string =>
  path.join(getSessionsDir(), projectName, CACHE_FILENAME)

// ============================================================================
// Read / Write / Validate
// ============================================================================

export const loadTreeCache = async (projectName: string): Promise<TreeCache | null> => {
  const cachePath = getCachePath(projectName)
  try {
    const raw = await fs.readFile(cachePath, 'utf-8')
    const parsed = JSON.parse(raw) as TreeCache
    if (parsed.version !== CACHE_VERSION) {
      log.debug(`cache version mismatch (${parsed.version} !== ${CACHE_VERSION}), ignoring`)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export const writeTreeCache = async (projectName: string, cache: TreeCache): Promise<void> => {
  const cachePath = getCachePath(projectName)
  const tmpPath = cachePath + '.tmp'
  try {
    await fs.writeFile(tmpPath, JSON.stringify(cache), 'utf-8')
    await fs.rename(tmpPath, cachePath)
  } catch (e) {
    log.debug(`failed to write cache: ${e}`)
    // Clean up temp file on failure
    try {
      await fs.unlink(tmpPath)
    } catch {
      // ignore
    }
  }
}

/**
 * Compare current file mtimes against cache to determine what changed.
 * @param cache - Previously saved cache
 * @param sessionFileIds - Current session IDs (from file listing, without .jsonl)
 * @param currentMtimes - Map of sessionId → current mtime (ms)
 */
export const validateCache = (
  cache: TreeCache,
  sessionFileIds: string[],
  currentMtimes: Map<string, number>
): CacheValidation => {
  const cachedIds = new Set(Object.keys(cache.sessions))
  const currentIds = new Set(sessionFileIds)

  const changedSessionIds: string[] = []
  const unchangedSessionIds: string[] = []
  const newSessionIds: string[] = []
  const deletedSessionIds: string[] = []

  // Check each current file against cache
  for (const id of currentIds) {
    if (!cachedIds.has(id)) {
      newSessionIds.push(id)
    } else {
      const cachedMtime = cache.sessions[id].fileMtime
      const currentMtime = currentMtimes.get(id) ?? 0
      // 1ms tolerance: filesystem mtimes have varying precision across platforms
      if (Math.abs(cachedMtime - currentMtime) < 1) {
        unchangedSessionIds.push(id)
      } else {
        changedSessionIds.push(id)
      }
    }
  }

  // Files that were in cache but no longer exist
  for (const id of cachedIds) {
    if (!currentIds.has(id)) {
      deletedSessionIds.push(id)
    }
  }

  const isFullHit =
    changedSessionIds.length === 0 && newSessionIds.length === 0 && deletedSessionIds.length === 0

  return { isFullHit, changedSessionIds, unchangedSessionIds, deletedSessionIds, newSessionIds }
}
