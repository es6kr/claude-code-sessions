import { describe, it, expect } from 'vitest'
import { sortProjects } from './projects.js'
import type { Project } from './types.js'

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
