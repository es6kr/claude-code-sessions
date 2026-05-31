import { describe, it, expect } from 'vitest'
import { sortProjects, groupProjects } from './projects.js'
import type { Project, ProjectGroup, ProjectLeaf, ProjectTreeNode } from './types.js'

describe('sortProjects', () => {
  // Use folder name format for name (as returned by pathToFolderName)
  // and path points to .claude/projects/<name>
  const MY_HOME = '/home/me'
  const MY_HOME_PREFIX = '-home-me'

  const createProject = (originalPath: string, sessionCount = 5): Project => {
    // Convert path to folder name format: /home/me -> -home-me
    const name = originalPath.replace(/^\//, '-').replace(/\//g, '-')
    return {
      name,
      displayName: originalPath,
      path: `${MY_HOME}/.claude/projects/${name}`,
      sessionCount,
    }
  }

  const projects: Project[] = [
    createProject('/home/other/work/project-a'),
    createProject('/home/me/work/project-b'),
    createProject('/home/me/work/project-a'),
    createProject('/opt/projects/system'),
    createProject('/home/me/work/empty', 0),
  ]

  it('should filter out empty projects by default', () => {
    const sorted = sortProjects(projects, { homeDir: MY_HOME })
    expect(sorted.find((p) => p.displayName === '/home/me/work/empty')).toBeUndefined()
  })

  it('should keep empty projects when filterEmpty is false', () => {
    const sorted = sortProjects(projects, { homeDir: MY_HOME, filterEmpty: false })
    expect(sorted.find((p) => p.displayName === '/home/me/work/empty')).toBeDefined()
  })

  it('should put current project first', () => {
    const systemProjectName = '-opt-projects-system'
    const sorted = sortProjects(projects, {
      currentProjectName: systemProjectName,
      homeDir: MY_HOME,
    })
    expect(sorted[0].name).toBe(systemProjectName)
  })

  it('should prioritize current user home paths over others', () => {
    const sorted = sortProjects(projects, { homeDir: MY_HOME })
    // All my projects should come before others
    // Check using name which is in folder name format: -home-me-...
    const myProjects = sorted.filter((p) => p.name.startsWith(MY_HOME_PREFIX))
    const otherProjects = sorted.filter((p) => !p.name.startsWith(MY_HOME_PREFIX))

    expect(myProjects.length).toBe(2)
    expect(otherProjects.length).toBe(2)

    // Check order: my projects first (index 0), all my before any other
    const firstMyIndex = sorted.findIndex((p) => p.name.startsWith(MY_HOME_PREFIX))
    const firstOtherIndex = sorted.findIndex((p) => !p.name.startsWith(MY_HOME_PREFIX))

    expect(firstMyIndex).toBe(0)
    // All my projects should come before other projects
    expect(myProjects.every((_, i) => i < otherProjects.length || i < firstOtherIndex)).toBe(true)
  })

  it('should sort alphabetically within same priority group', () => {
    const sorted = sortProjects(projects, { homeDir: MY_HOME })

    // Within my projects, should be alphabetical by displayName
    const myProjects = sorted.filter((p) => p.name.startsWith(MY_HOME_PREFIX))
    expect(myProjects[0].displayName).toBe('/home/me/work/project-a')
    expect(myProjects[1].displayName).toBe('/home/me/work/project-b')
  })

  it('should work without homeDir option', () => {
    const otherProjectName = '-home-other-work-project-a'
    const sorted = sortProjects(projects, { currentProjectName: otherProjectName })
    expect(sorted[0].name).toBe(otherProjectName)
    // Rest should be alphabetical
  })

  it('should work without any options', () => {
    const sorted = sortProjects(projects)
    // Should just filter empty and sort alphabetically
    expect(sorted.length).toBe(4)
    // /home/me/work/project-a has displayName that sorts first alphabetically
    expect(sorted[0].displayName).toBe('/home/me/work/project-a')
  })
})

describe('groupProjects', () => {
  const mkProject = (displayName: string, sessionCount = 1): Project => ({
    name: displayName.replace(/[^a-zA-Z0-9]/g, '-'),
    displayName,
    path: `/sessions/${displayName.replace(/[^a-zA-Z0-9]/g, '-')}`,
    sessionCount,
  })

  const isGroup = (node: ProjectTreeNode): node is ProjectGroup => node.kind === 'group'
  const isLeaf = (node: ProjectTreeNode): node is ProjectLeaf => node.kind === 'project'

  it('returns empty array for empty input', () => {
    expect(groupProjects([])).toEqual([])
  })

  it('returns a single leaf with collapsed path when only one project exists', () => {
    const projects = [mkProject('~/ghq/github.com/es6kr/skills', 3)]
    const result = groupProjects(projects)

    expect(result).toHaveLength(1)
    expect(isLeaf(result[0])).toBe(true)
    const leaf = result[0] as ProjectLeaf
    expect(leaf.collapsedPath).toBe('~/ghq/github.com/es6kr/skills')
    expect(leaf.project.sessionCount).toBe(3)
    expect(leaf.depth).toBe(0)
  })

  it('creates a group when two projects share the same prefix', () => {
    const projects = [
      mkProject('~/ghq/github.com/es6kr/skills'),
      mkProject('~/ghq/github.com/es6kr/blog'),
    ]
    const result = groupProjects(projects)

    expect(result).toHaveLength(1)
    expect(isGroup(result[0])).toBe(true)
    const group = result[0] as ProjectGroup
    expect(group.name).toBe('~/ghq/github.com/es6kr')
    expect(group.displayName).toBe('es6kr')
    expect(group.children).toHaveLength(2)
    expect(group.totalSessions).toBe(2)
    expect(group.children.every(isLeaf)).toBe(true)
    expect(group.depth).toBe(0)
    // Leaf depth is parent + 1
    expect(group.children[0].depth).toBe(1)
  })

  it('auto-flattens a single-child group into a path-collapsed leaf', () => {
    const projects = [
      // Two top-level branches under ~/ghq: github.com (with 2 leaves) and local (with 1 leaf).
      mkProject('~/ghq/github.com/es6kr/skills'),
      mkProject('~/ghq/github.com/es6kr/blog'),
      mkProject('~/ghq/local/myapp'),
    ]
    const result = groupProjects(projects)

    // After walk-down ~/ghq has children [github.com (group), local/myapp (leaf)].
    // Top-level walks down ~ -> ~/ghq to the first branching point.
    expect(result).toHaveLength(1)
    const top = result[0] as ProjectGroup
    expect(isGroup(top)).toBe(true)
    expect(top.name).toBe('~/ghq')

    const githubGroup = top.children.find(
      (c): c is ProjectGroup => isGroup(c) && c.name.includes('es6kr')
    )
    expect(githubGroup).toBeDefined()
    expect(githubGroup!.name).toBe('~/ghq/github.com/es6kr')
    expect(githubGroup!.children).toHaveLength(2)

    const localLeaf = top.children.find(
      (c): c is ProjectLeaf => isLeaf(c) && c.collapsedPath.endsWith('local/myapp')
    )
    expect(localLeaf).toBeDefined()
    expect(localLeaf!.collapsedPath).toBe('~/ghq/local/myapp')
  })

  it('handles mixed-depth groups at multiple top-level paths', () => {
    const projects = [
      mkProject('~/ghq/github.com/es6kr/a'),
      mkProject('~/ghq/github.com/es6kr/b'),
      mkProject('/opt/projects/c'),
      mkProject('/opt/projects/d'),
    ]
    const result = groupProjects(projects)

    // Two distinct top-level chains: '~' (-> github.com/es6kr group) and '/opt' (-> projects group).
    // Absolute paths preserve their leading '/' as part of the root segment.
    expect(result).toHaveLength(2)
    const names = result.filter(isGroup).map((g) => g.name)
    expect(names).toContain('~/ghq/github.com/es6kr')
    expect(names).toContain('/opt/projects')
  })

  it('preserves leading "~" as the root segment', () => {
    const projects = [mkProject('~/ghq/foo'), mkProject('~/ghq/bar')]
    const result = groupProjects(projects)
    expect(result).toHaveLength(1)
    const group = result[0] as ProjectGroup
    expect(isGroup(group)).toBe(true)
    expect(group.name).toBe('~/ghq')
    expect(group.children.every(isLeaf)).toBe(true)
  })

  it('respects custom minGroupSize', () => {
    const projects = [mkProject('~/ghq/github.com/es6kr/a'), mkProject('~/ghq/github.com/es6kr/b')]
    // With minGroupSize=3, the two-leaf cluster should flatten instead of forming a group.
    const result = groupProjects(projects, { minGroupSize: 3 })
    expect(result.every(isLeaf)).toBe(true)
    expect(result).toHaveLength(2)
  })

  it('filters empty projects by default and keeps them when filterEmpty is false', () => {
    const projects = [mkProject('~/ghq/foo/a', 0), mkProject('~/ghq/foo/b', 5)]
    const filtered = groupProjects(projects)
    // Only one project remains; auto-flattens to a single leaf.
    expect(filtered).toHaveLength(1)
    expect(isLeaf(filtered[0])).toBe(true)

    const unfiltered = groupProjects(projects, { filterEmpty: false })
    // Both projects present; same prefix → group with two leaves.
    expect(unfiltered).toHaveLength(1)
    const group = unfiltered[0] as ProjectGroup
    expect(isGroup(group)).toBe(true)
    expect(group.children).toHaveLength(2)
  })

  it('puts ancestors of the current project first at each level', () => {
    const projects = [
      mkProject('~/ghq/github.com/es6kr/a'),
      mkProject('~/ghq/github.com/es6kr/b'),
      mkProject('~/ghq/github.com/alpha-org/repo'),
      mkProject('~/ghq/github.com/alpha-org/repo2'),
    ]
    const result = groupProjects(projects, {
      sort: { currentProjectDisplayName: '~/ghq/github.com/es6kr/a' },
    })

    // Top-level walks down to ~/ghq/github.com with es6kr and alpha-org as direct subgroups.
    const top = result[0] as ProjectGroup
    expect(isGroup(top)).toBe(true)
    expect(top.name).toBe('~/ghq/github.com')
    // Ancestor 'es6kr' should be first sibling.
    const firstChild = top.children[0]
    expect(isGroup(firstChild)).toBe(true)
    expect((firstChild as ProjectGroup).displayName).toBe('es6kr')
  })

  it('computes totalSessions across nested descendants', () => {
    const projects = [
      mkProject('~/ghq/x/a', 3),
      mkProject('~/ghq/x/b', 7),
      mkProject('~/ghq/y/c', 2),
      mkProject('~/ghq/y/d', 5),
    ]
    const result = groupProjects(projects)

    // ~/ghq is the top-level group, containing x and y subgroups.
    const top = result[0] as ProjectGroup
    expect(isGroup(top)).toBe(true)
    expect(top.totalSessions).toBe(3 + 7 + 2 + 5)

    const xGroup = top.children.find((n): n is ProjectGroup => isGroup(n) && n.displayName === 'x')
    expect(xGroup).toBeDefined()
    expect(xGroup!.totalSessions).toBe(10)
  })

  describe('absolute root segments (e.g. /mnt/c WSL paths)', () => {
    it('preserves the leading "/" as part of the root segment for /mnt-style paths (group)', () => {
      const projects = [mkProject('/mnt/c/Users/foo/app-a'), mkProject('/mnt/c/Users/foo/app-b')]
      const result = groupProjects(projects)
      expect(result).toHaveLength(1)
      const group = result[0] as ProjectGroup
      expect(isGroup(group)).toBe(true)
      // Root segment must be "/mnt", not "mnt" — distinguishes absolute mount path
      // from a relative "mnt" directory.
      expect(group.name.startsWith('/mnt/')).toBe(true)
      expect(group.name).toBe('/mnt/c/Users/foo')
    })

    it('preserves the leading "/" when emitting a single auto-flattened leaf', () => {
      const projects = [mkProject('/mnt/c/Users/foo/only-app')]
      const result = groupProjects(projects)
      expect(result).toHaveLength(1)
      const leaf = result[0] as ProjectLeaf
      expect(isLeaf(leaf)).toBe(true)
      expect(leaf.collapsedPath).toBe('/mnt/c/Users/foo/only-app')
    })

    it('treats "/mnt" root separately from a relative "mnt" segment', () => {
      const projects = [
        mkProject('/mnt/c/Users/foo/app-a'),
        mkProject('/mnt/c/Users/foo/app-b'),
        mkProject('relative/mnt/other/app-c'),
        mkProject('relative/mnt/other/app-d'),
      ]
      const result = groupProjects(projects)
      // Two distinct roots, NOT merged under a shared "mnt" group.
      const groupRoots = result.filter(isGroup).map((g) => g.name)
      const hasAbsoluteMnt = groupRoots.some((n) => n.startsWith('/mnt/'))
      const hasRelativeMnt = groupRoots.some((n) => !n.startsWith('/') && n.includes('mnt'))
      expect(hasAbsoluteMnt).toBe(true)
      expect(hasRelativeMnt).toBe(true)
      // No single merged group whose name is just "mnt" or "mnt/c" without the leading slash.
      expect(groupRoots).not.toContain('mnt')
      expect(groupRoots).not.toContain('mnt/c')
    })
  })

  describe('Windows-style C:/Users/<username> root on non-Windows OS', () => {
    it('keeps "C:/Users/<username>" as a visible root group when walk-down would otherwise stop at "ghq"', () => {
      const projects = [
        // Two C:/Users/foo/ghq/... siblings that branch at "ghq" (github.com vs local).
        // Current walk-down stops at "ghq" → displayName "ghq" alone, indistinguishable
        // from a host OS's "~/ghq" group.
        mkProject('C:/Users/foo/ghq/github.com/org/repo-a'),
        mkProject('C:/Users/foo/ghq/local/myapp'),
      ]
      const result = groupProjects(projects)
      expect(result).toHaveLength(1)
      const top = result[0] as ProjectGroup
      expect(isGroup(top)).toBe(true)
      // "ghq" must NOT become the displayed top-level group name.
      // The Windows-home segment must be preserved analogous to how '~' is.
      expect(top.displayName).not.toBe('ghq')
      // Root must include the Windows-home prefix.
      expect(top.name.startsWith('C:/Users/foo')).toBe(true)
      // Stronger expectation: root is exactly the Windows-home — descendants live underneath.
      expect(top.name).toBe('C:/Users/foo')
    })

    it('keeps Windows-home paths separate from host-OS "~/ghq" paths even when both contain "ghq"', () => {
      const projects = [
        mkProject('~/ghq/github.com/org/host-a'),
        mkProject('~/ghq/github.com/org/host-b'),
        mkProject('C:/Users/foo/ghq/github.com/org/win-a'),
        mkProject('C:/Users/foo/ghq/github.com/org/win-b'),
      ]
      const result = groupProjects(projects)
      // Two distinct top-level roots: "~" tree and "C:/Users/foo" tree.
      // The two "ghq" subtrees must NOT merge into a shared top-level "ghq" group.
      expect(result).toHaveLength(2)
      const roots = result.filter(isGroup).map((g) => g.name)
      const hasHostHome = roots.some((n) => n.startsWith('~'))
      const hasWinHome = roots.some((n) => n.startsWith('C:/Users/foo'))
      expect(hasHostHome).toBe(true)
      expect(hasWinHome).toBe(true)
      // No root should be just "ghq" on its own.
      expect(roots).not.toContain('ghq')
    })

    it('preserves the full Windows path when a single C:/Users/<u>/... leaf is auto-flattened', () => {
      const projects = [mkProject('C:/Users/foo/ghq/github.com/org/only-repo')]
      const result = groupProjects(projects)
      expect(result).toHaveLength(1)
      const leaf = result[0] as ProjectLeaf
      expect(isLeaf(leaf)).toBe(true)
      expect(leaf.collapsedPath).toBe('C:/Users/foo/ghq/github.com/org/only-repo')
    })
  })
})
