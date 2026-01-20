import { describe, it, expect } from 'vitest'
import {
  cleanupSplitFirstMessage,
  extractTitle,
  getDisplayTitle,
  maskHomePath,
  sortProjects,
} from './utils.js'
import type { Message, Project } from './types.js'

describe('extractTitle', () => {
  it('should extract command name from slash command message', () => {
    const text =
      '<command-message>session</command-message>\n<command-name>/session</command-name>\n<command-args>  repair --dry-run e15f9f9a-db7a-4729-965c-c0beb8d75039</command-args>'
    expect(extractTitle(text)).toBe('/session')
  })

  it('should return first line as title for normal text', () => {
    expect(extractTitle('Hello World\n\nThird line')).toBe('Hello World')
  })

  it('should return Untitled for empty text', () => {
    expect(extractTitle('')).toBe('Untitled')
  })
})

describe('cleanupSplitFirstMessage', () => {
  it('should return message unchanged if no toolUseResult', () => {
    const msg: Message = {
      type: 'user',
      uuid: 'test-uuid',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    }

    const result = cleanupSplitFirstMessage(msg)
    expect(result).toEqual(msg)
  })

  it('should return message unchanged if toolUseResult has no rejection marker', () => {
    const msg: Message = {
      type: 'user',
      uuid: 'test-uuid',
      toolUseResult: 'Some other tool result without rejection',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'result' }],
      },
    }

    const result = cleanupSplitFirstMessage(msg)
    expect(result).toEqual(msg)
  })

  it('should extract user message from tool rejection', () => {
    const msg: Message = {
      type: 'user',
      uuid: 'test-uuid',
      toolUseResult:
        "Error: The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). The user provided the following reason for the rejection:  core의 변환함수가 미적용이라",
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            content:
              "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). The user provided the following reason for the rejection:  core의 변환함수가 미적용이라",
            is_error: true,
            tool_use_id: 'toolu_01HhwMx5SXcsJv96qa9TXrxu',
          },
        ],
      },
    }

    const result = cleanupSplitFirstMessage(msg)

    expect(result.toolUseResult).toBeUndefined()
    expect(result.message?.content).toEqual([
      { type: 'text', text: 'core의 변환함수가 미적용이라' },
    ])
    expect(result.uuid).toBe('test-uuid')
  })

  it('should handle rejection with empty reason', () => {
    const msg: Message = {
      type: 'user',
      uuid: 'test-uuid',
      toolUseResult:
        "Error: The user doesn't want to proceed with this tool use. The user provided the following reason for the rejection:  ",
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'result' }],
      },
    }

    const result = cleanupSplitFirstMessage(msg)
    // Empty reason after trim, should return original
    expect(result).toEqual(msg)
  })

  it('should preserve other message properties', () => {
    const msg: Message = {
      type: 'user',
      uuid: 'test-uuid',
      parentUuid: 'parent-uuid',
      sessionId: 'session-123',
      timestamp: '2025-01-01T00:00:00Z',
      toolUseResult: 'The user provided the following reason for the rejection: 이건 테스트입니다',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'result' }],
      },
    }

    const result = cleanupSplitFirstMessage(msg)

    expect(result.uuid).toBe('test-uuid')
    expect(result.parentUuid).toBe('parent-uuid')
    expect(result.sessionId).toBe('session-123')
    expect(result.timestamp).toBe('2025-01-01T00:00:00Z')
    expect(result.toolUseResult).toBeUndefined()
    expect(result.message?.content).toEqual([{ type: 'text', text: '이건 테스트입니다' }])
  })
})

describe('getDisplayTitle', () => {
  it('should return customTitle when provided', () => {
    expect(getDisplayTitle('Custom Title', 'Summary', 'Original Title')).toBe('Custom Title')
  })

  it('should return currentSummary when customTitle is undefined', () => {
    expect(getDisplayTitle(undefined, 'Summary Text', 'Original Title')).toBe('Summary Text')
  })

  it('should truncate currentSummary when exceeds maxLength', () => {
    const longSummary = 'A'.repeat(70) // 70 chars
    const result = getDisplayTitle(undefined, longSummary, 'Title')
    expect(result).toBe('A'.repeat(57) + '...')
    expect(result.length).toBe(60)
  })

  it('should return title when customTitle and currentSummary are undefined', () => {
    expect(getDisplayTitle(undefined, undefined, 'Original Title')).toBe('Original Title')
  })

  it('should return fallback when title is "Untitled"', () => {
    expect(getDisplayTitle(undefined, undefined, 'Untitled')).toBe('Untitled')
  })

  it('should return fallback when all are undefined', () => {
    expect(getDisplayTitle(undefined, undefined, undefined)).toBe('Untitled')
  })

  it('should use custom fallback when provided', () => {
    expect(getDisplayTitle(undefined, undefined, undefined, 60, 'No Title')).toBe('No Title')
  })

  it('should use custom maxLength for truncation', () => {
    const summary = 'A'.repeat(60) // 60 chars
    // With maxLength=50, should truncate at 47+...=50
    const result = getDisplayTitle(undefined, summary, undefined, 50)
    expect(result).toBe('A'.repeat(47) + '...')
    expect(result.length).toBe(50)
  })

  it('should not truncate currentSummary when exactly at maxLength', () => {
    const summary = 'A'.repeat(60) // Exactly 60 chars
    const result = getDisplayTitle(undefined, summary, undefined, 60)
    expect(result).toBe(summary)
  })

  it('should prefer customTitle over currentSummary even when both are provided', () => {
    expect(getDisplayTitle('Custom', 'Summary', 'Title')).toBe('Custom')
  })

  it('should skip empty string values', () => {
    // Empty string is falsy, so it should fall through to next option
    expect(getDisplayTitle('', 'Summary', 'Title')).toBe('Summary')
    expect(getDisplayTitle('', '', 'Title')).toBe('Title')
    expect(getDisplayTitle('', '', '')).toBe('Untitled')
  })
})

describe('maskHomePath', () => {
  it('should mask current user home directory with ~', () => {
    expect(maskHomePath('/Users/david/projects/app', '/Users/david')).toBe('~/projects/app')
  })

  it('should not mask other users home directories', () => {
    expect(maskHomePath('/Users/alice/projects/app', '/Users/david')).toBe(
      '/Users/alice/projects/app'
    )
  })

  it('should mask multiple occurrences', () => {
    expect(maskHomePath('/Users/david/a and /Users/david/b', '/Users/david')).toBe('~/a and ~/b')
  })

  it('should handle Windows paths', () => {
    expect(maskHomePath('C:\\Users\\david\\projects', 'C:\\Users\\david')).toBe('~\\projects')
  })

  it('should return original text if homeDir is empty', () => {
    expect(maskHomePath('/Users/david/projects', '')).toBe('/Users/david/projects')
  })

  it('should mask exact home directory path', () => {
    expect(maskHomePath('/Users/david', '/Users/david')).toBe('~')
  })

  it('should not mask partial matches', () => {
    // /Users/davidsmith should not be masked when homeDir is /Users/david
    expect(maskHomePath('/Users/davidsmith/projects', '/Users/david')).toBe(
      '/Users/davidsmith/projects'
    )
  })
})

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
