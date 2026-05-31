/**
 * Project-level utilities
 */
import type { Project, ProjectGroup, ProjectLeaf, ProjectTreeNode } from './types.js'
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

// ============================================================================
// Hierarchical grouping
// ============================================================================

export interface GroupProjectsOptions {
  /**
   * Minimum number of leaf descendants required for a group node to remain.
   * Subtrees with fewer leaves are flattened into the parent (default 2).
   */
  minGroupSize?: number
  /** Filter out empty projects (sessionCount === 0) before grouping (default true) */
  filterEmpty?: boolean
  /** Sort hints; ancestors of the current project (by displayName) come first at each level */
  sort?: {
    /** Folder-name form (e.g., "-Users-david-..."); decoded internally — best-effort */
    currentProjectName?: string | null
    /** Already-decoded displayName form (e.g., "~/ghq/github.com/es6kr/a"); preferred when available */
    currentProjectDisplayName?: string | null
    homeDir?: string
  }
}

/** Internal trie node */
interface TrieNode {
  children: Map<string, TrieNode>
  project?: Project
}

/**
 * Split a project displayName into path segments while preserving root markers.
 *
 * Root segment preservation:
 * - Leading "~" stays as a dedicated root segment (e.g. "~/ghq/x" → ["~", "ghq", "x"]).
 * - Leading "/" is fused into the first segment so absolute paths remain visually
 *   distinguishable from relative ones (e.g. "/mnt/c/Users/x" → ["/mnt", "c", "Users", "x"];
 *   without this, "/mnt/c/..." and "mnt/c/..." would collide in the trie root).
 * - On non-Windows OS, Windows-style home roots "<DriveLetter>:/Users/<username>" are fused
 *   into a single root segment so foreign Windows data anchors at the Windows home rather
 *   than letting downstream segments (e.g. "ghq") rise to the top level and become
 *   indistinguishable from the host OS's own "~/ghq" group.
 *
 * Examples:
 * - "~/ghq/github.com/es6kr/skills" → ["~", "ghq", "github.com", "es6kr", "skills"]
 * - "/mnt/c/Users/x/app"            → ["/mnt", "c", "Users", "x", "app"]
 * - "/opt/projects/svc"             → ["/opt", "projects", "svc"]
 * - "C:/Users/foo/ghq/x" (non-Win)  → ["C:/Users/foo", "ghq", "x"]
 * - "github.com/es6kr/skills"       → ["github.com", "es6kr", "skills"]
 */
const splitDisplayName = (displayName: string): string[] => {
  if (displayName === '~' || displayName === '~/') return ['~']
  if (displayName.startsWith('~/')) {
    return ['~', ...displayName.slice(2).split('/').filter(Boolean)]
  }

  // Windows-style home root: fuse "<X>:/Users/<username>" into one root segment so the
  // Windows-home boundary survives the trie's single-child walk-down. Applied in all
  // environments (no process.platform check) to keep behavior identical between SSR and
  // CSR — otherwise the browser bundle would throw "process is not defined" and hydration
  // would diverge from the server-rendered output.
  const winHomeMatch = displayName.match(/^([A-Za-z]:\/Users\/[^/]+)(?:\/(.*))?$/)
  if (winHomeMatch) {
    const root = winHomeMatch[1]
    const rest = winHomeMatch[2]
    if (!rest) return [root]
    return [root, ...rest.split('/').filter(Boolean)]
  }

  // Absolute path: keep the leading "/" as part of the root segment.
  if (displayName.startsWith('/')) {
    const parts = displayName.split('/').filter(Boolean)
    if (parts.length === 0) return []
    return ['/' + parts[0], ...parts.slice(1)]
  }

  return displayName.split('/').filter(Boolean)
}

const countLeaves = (node: TrieNode): number => {
  let count = node.project ? 1 : 0
  for (const child of node.children.values()) {
    count += countLeaves(child)
  }
  return count
}

/** Collect every leaf in the subtree, each paired with its full collapsed path */
const collectLeaves = (
  node: TrieNode,
  pathPrefix: string
): Array<{ path: string; project: Project }> => {
  const result: Array<{ path: string; project: Project }> = []
  if (node.project) {
    result.push({ path: pathPrefix, project: node.project })
  }
  for (const [key, child] of node.children) {
    const childPath = pathPrefix ? `${pathPrefix}/${key}` : key
    result.push(...collectLeaves(child, childPath))
  }
  return result
}

/** True when `path` is `target` or `target` lies under `path`. */
const isAncestorPath = (path: string, target: string): boolean => {
  if (!path) return true
  return target === path || target.startsWith(path + '/')
}

/** True when `p` is a Windows-style home root segment like "C:/Users/<username>". */
const isWindowsHomeRoot = (p: string): boolean => /^[A-Za-z]:\/Users\/[^/]+$/.test(p)

/**
 * Sort tree-level children: ancestors of the current project first;
 * groups before leaves; remaining entries alphabetical by displayName.
 */
const sortNodesAtLevel = (
  nodes: ProjectTreeNode[],
  currentDisplayName: string | null
): ProjectTreeNode[] => {
  const labelOf = (node: ProjectTreeNode): string =>
    node.kind === 'group' ? node.displayName : node.project.displayName

  const pathOf = (node: ProjectTreeNode): string =>
    node.kind === 'group' ? node.name : node.collapsedPath

  return [...nodes].sort((a, b) => {
    if (currentDisplayName) {
      const aAnc = isAncestorPath(pathOf(a), currentDisplayName)
      const bAnc = isAncestorPath(pathOf(b), currentDisplayName)
      if (aAnc && !bAnc) return -1
      if (!aAnc && bAnc) return 1
    }

    if (a.kind === 'group' && b.kind !== 'group') return -1
    if (a.kind !== 'group' && b.kind === 'group') return 1

    return labelOf(a).localeCompare(labelOf(b))
  })
}

/**
 * Build hierarchical groups from a flat project list by splitting displayName on '/'.
 *
 * Behavior:
 * - Subtrees with fewer than `minGroupSize` leaves auto-flatten into the parent. The
 *   flattened leaf carries its full collapsed path so the UI can render it as a single line.
 * - A group walks down single-child intermediate path segments before branching, so
 *   "github.com → es6kr → {a,b}" renders as one group "github.com/es6kr" with [a, b].
 * - Within each level, ancestors of the current project come first (when sort.currentProjectName
 *   is provided), followed by other groups (alphabetical), followed by leaves (alphabetical).
 */
export const groupProjects = (
  projects: Project[],
  options: GroupProjectsOptions = {}
): ProjectTreeNode[] => {
  const minGroupSize = options.minGroupSize ?? 2
  const filterEmpty = options.filterEmpty ?? true

  const filtered = filterEmpty ? projects.filter((p) => p.sessionCount > 0) : projects
  if (filtered.length === 0) return []

  // Build trie. Each project's final segment becomes a node with project set.
  const root: TrieNode = { children: new Map() }
  for (const project of filtered) {
    const segments = splitDisplayName(project.displayName)
    if (segments.length === 0) continue
    let node = root
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i]
      let next = node.children.get(seg)
      if (!next) {
        next = { children: new Map() }
        node.children.set(seg, next)
      }
      node = next
    }
    const lastSeg = segments[segments.length - 1]
    let leaf = node.children.get(lastSeg)
    if (!leaf) {
      leaf = { children: new Map() }
      node.children.set(lastSeg, leaf)
    }
    // If two projects share the same displayName, last write wins (shouldn't happen in practice).
    leaf.project = project
  }

  // Resolve current project displayName for ancestor-first ordering.
  // Prefer the explicit currentProjectDisplayName; fall back to lossy decode of folder-name form.
  let currentDisplayName: string | null = null
  if (options.sort?.currentProjectDisplayName) {
    currentDisplayName = options.sort.currentProjectDisplayName
  } else if (options.sort?.currentProjectName) {
    currentDisplayName = decodeFolderNameForCompare(
      options.sort.currentProjectName,
      options.sort.homeDir
    )
  }

  const buildNodes = (node: TrieNode, pathPrefix: string, depth: number): ProjectTreeNode[] => {
    const result: ProjectTreeNode[] = []

    for (const [key, child] of node.children) {
      const childPath = pathPrefix ? `${pathPrefix}/${key}` : key
      const leafCount = countLeaves(child)
      if (leafCount === 0) continue

      if (leafCount < minGroupSize) {
        // Flatten: emit each descendant leaf with its full collapsed path.
        for (const { path, project } of collectLeaves(child, childPath)) {
          result.push({
            kind: 'project',
            project,
            depth,
            collapsedPath: path,
          } satisfies ProjectLeaf)
        }
        continue
      }

      // Walk down single-child intermediate nodes (no project attached) to find the branching point.
      // The walk-down stops at a Windows-home boundary ("<DriveLetter>:/Users/<username>")
      // so foreign Windows data anchors at its own home rather than letting descendants
      // (e.g. "ghq") rise to a top-level label indistinguishable from the host's "~/ghq".
      let walkPath = childPath
      let walkNode = child
      while (walkNode.children.size === 1 && !walkNode.project && !isWindowsHomeRoot(walkPath)) {
        const [nextKey, nextChild] = walkNode.children.entries().next().value as [string, TrieNode]
        walkPath = `${walkPath}/${nextKey}`
        walkNode = nextChild
      }

      const groupChildren = buildNodes(walkNode, walkPath, depth + 1)

      // Edge case: the branching node also carries a project (e.g., same displayName as parent path).
      if (walkNode.project) {
        groupChildren.unshift({
          kind: 'project',
          project: walkNode.project,
          depth: depth + 1,
          collapsedPath: walkPath,
        } satisfies ProjectLeaf)
      }

      const totalSessions = groupChildren.reduce<number>((sum, n) => {
        if (n.kind === 'group') return sum + n.totalSessions
        return sum + n.project.sessionCount
      }, 0)

      const displayName = walkPath.split('/').pop() ?? walkPath
      result.push({
        kind: 'group',
        name: walkPath,
        displayName,
        children: groupChildren,
        totalSessions,
        depth,
      } satisfies ProjectGroup)
    }

    return sortNodesAtLevel(result, currentDisplayName)
  }

  return buildNodes(root, '', 0)
}

/**
 * Convert a folder-name (e.g., "-Users-david-ghq-foo") to a displayName form
 * ("Users/david/ghq/foo" or "~/ghq/foo" when homeDir matches).
 *
 * This is a best-effort sync decoder for sort.currentProjectName so the ancestor-priority
 * algorithm can compare against displayName segments. Async folderNameToPath() is preferable
 * but cannot be awaited from a pure-sync API.
 */
const decodeFolderNameForCompare = (folderName: string, homeDir: string | undefined): string => {
  // Folder names start with '-' for absolute paths: "-Users-david-..." → "/Users/david/..."
  const restored = folderName.replace(/^-/, '/').replace(/-/g, '/')
  if (homeDir) {
    const normalizedHome = homeDir.replace(/\\/g, '/')
    if (restored === normalizedHome) return '~'
    if (restored.startsWith(normalizedHome + '/')) {
      return '~' + restored.slice(normalizedHome.length)
    }
  }
  return restored
}
