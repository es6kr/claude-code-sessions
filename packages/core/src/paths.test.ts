import { describe, it, expect, vi } from 'vitest'
import {
  pathToFolderName,
  folderNameToDisplayPath,
  displayPathToFolderName,
  toRelativePath,
  expandHomePath,
  folderNameToPath,
  findProjectByWorkspacePath,
  extractCwdFromContent,
  isSessionFile,
  tryGetCwdFromFile,
  resolvePathFromClaudeConfig,
  type FileSystem,
  type Logger,
} from './paths.js'

describe('pathToFolderName', () => {
  describe('Unix paths', () => {
    it('converts absolute path to folder name', () => {
      expect(pathToFolderName('/home/user/projects')).toBe('-home-user-projects')
    })

    it('handles dot-prefixed folders', () => {
      expect(pathToFolderName('/home/user/projects/.vscode')).toBe('-home-user-projects--vscode')
    })

    it('handles domain with dot (example.com)', () => {
      expect(pathToFolderName('/home/user/example.com')).toBe('-home-user-example-com')
    })

    it('handles multiple dots in path', () => {
      expect(pathToFolderName('/home/user/api.v2.example.com')).toBe(
        '-home-user-api-v2-example-com'
      )
    })
  })

  describe('Windows paths', () => {
    it('converts Windows absolute path to folder name', () => {
      // Official Claude Code keeps drive letter case as-is
      expect(pathToFolderName('C:\\Users\\david\\projects')).toBe('C--Users-david-projects')
    })

    it('handles Windows path with forward slashes', () => {
      expect(pathToFolderName('C:/Users/david/projects')).toBe('C--Users-david-projects')
    })

    it('handles Windows dot-prefixed folders', () => {
      expect(pathToFolderName('C:\\Users\\david\\.vscode')).toBe('C--Users-david--vscode')
    })

    it('handles Windows path with domain (example.com)', () => {
      expect(pathToFolderName('C:\\Users\\david\\example.com')).toBe('C--Users-david-example-com')
    })
  })

  describe('UTF-8 characters', () => {
    it('handles Korean characters in path', () => {
      expect(pathToFolderName('/home/user/프로젝트')).toBe('-home-user-----')
    })

    it('handles Japanese characters in path', () => {
      expect(pathToFolderName('/home/user/プロジェクト')).toBe('-home-user-------')
    })

    it('handles Chinese characters in path', () => {
      expect(pathToFolderName('/home/user/项目')).toBe('-home-user---')
    })

    it('handles emoji in path', () => {
      // Emoji is a surrogate pair (2 code units) -> 2 dashes
      expect(pathToFolderName('/home/user/📁project')).toBe('-home-user---project')
    })
  })
})

describe('folderNameToDisplayPath', () => {
  describe('Unix paths', () => {
    it('converts folder name to absolute path', () => {
      expect(folderNameToDisplayPath('-home-user-projects')).toBe('/home/user/projects')
    })

    it('handles dot-prefixed folders', () => {
      expect(folderNameToDisplayPath('-home-user-projects--vscode')).toBe(
        '/home/user/projects/.vscode'
      )
    })

    it('limitation: cannot distinguish dot from slash in folder names', () => {
      // This is the known limitation of pattern-based conversion
      // example-com becomes example/com instead of example.com
      // This is why we need getRealPathFromSession to read actual cwd
      expect(folderNameToDisplayPath('-home-user-example-com')).toBe('/home/user/example/com')
    })
  })

  describe('Windows paths', () => {
    it('converts Windows folder name to absolute path', () => {
      expect(folderNameToDisplayPath('C--Users-david-projects')).toBe('C:\\Users\\david\\projects')
    })

    it('handles Windows dot-prefixed folders', () => {
      expect(folderNameToDisplayPath('C--Users-david--vscode')).toBe('C:\\Users\\david\\.vscode')
    })

    it('handles lowercase drive letter', () => {
      expect(folderNameToDisplayPath('c--Users-david')).toBe('c:\\Users\\david')
    })

    it('handles D: drive', () => {
      expect(folderNameToDisplayPath('D--Projects-myapp')).toBe('D:\\Projects\\myapp')
    })
  })

  describe('UTF-8 characters', () => {
    it('handles Korean characters in folder name', () => {
      expect(folderNameToDisplayPath('-home-user-프로젝트')).toBe('/home/user/프로젝트')
    })

    it('handles Windows path with Korean characters', () => {
      expect(folderNameToDisplayPath('C--Users-david-프로젝트')).toBe('C:\\Users\\david\\프로젝트')
    })
  })
})

describe('displayPathToFolderName', () => {
  describe('Unix paths', () => {
    it('converts Unix path to folder name', () => {
      expect(displayPathToFolderName('/home/user/projects')).toBe('-home-user-projects')
    })

    it('handles dot-prefixed folders', () => {
      expect(displayPathToFolderName('/home/user/.vscode')).toBe('-home-user--vscode')
    })
  })

  describe('Windows paths', () => {
    it('converts Windows path to folder name', () => {
      expect(displayPathToFolderName('C:\\Users\\david\\projects')).toBe('C--Users-david-projects')
    })

    it('handles Windows path with forward slashes', () => {
      expect(displayPathToFolderName('C:/Users/david/projects')).toBe('C--Users-david-projects')
    })

    it('handles Windows dot-prefixed folders', () => {
      expect(displayPathToFolderName('C:\\Users\\david\\.vscode')).toBe('C--Users-david--vscode')
    })
  })
})

describe('toRelativePath', () => {
  it('converts path under home directory to ~/...', () => {
    expect(toRelativePath('/Users/david/projects', '/Users/david')).toBe('~/projects')
  })

  it('only converts current user home, not other users', () => {
    // Path under different user should NOT be converted to ~
    expect(toRelativePath('/Users/other/projects', '/Users/david')).toBe('/Users/other/projects')
  })

  it('handles exact home directory match', () => {
    expect(toRelativePath('/Users/david', '/Users/david')).toBe('~')
  })

  it('does not convert partial matches', () => {
    // /Users/david2 should not match /Users/david
    expect(toRelativePath('/Users/david2/projects', '/Users/david')).toBe('/Users/david2/projects')
  })

  it('handles Windows paths', () => {
    // Windows paths return backslash after ~
    expect(toRelativePath('C:\\Users\\david\\projects', 'C:\\Users\\david')).toBe('~\\projects')
  })

  it('does not convert other Windows user paths', () => {
    expect(toRelativePath('C:\\Users\\other\\projects', 'C:\\Users\\david')).toBe(
      'C:\\Users\\other\\projects'
    )
  })
})

describe('Windows path separator issue (issue #14)', () => {
  /**
   * Bug 1: Drive letter case sensitivity
   * - pathToFolderName lowercases drive: C: → c--
   * - folderNameToDisplayPath returns: c:\Users\...
   * - toRelativePath compares case-sensitively with os.homedir() (C:\Users\...)
   * - Comparison fails, returns full path instead of ~/...
   */
  it('toRelativePath should handle drive letter case insensitively on Windows', async () => {
    const nodePath = await import('path')
    const os = await import('os')

    const homeDir = os.homedir()

    // pathToFolderName lowercases drive, folderNameToDisplayPath converts back
    const displayHome = folderNameToDisplayPath(pathToFolderName(homeDir))
    const testPath = displayHome + nodePath.sep + 'projects' + nodePath.sep + 'work'

    const result = toRelativePath(testPath, homeDir)
    expect(result).toBe('~' + nodePath.sep + 'projects' + nodePath.sep + 'work')
  })

  /**
   * Bug 2: Mixed slashes after ~ expansion
   * - toRelativePath returns ~/projects/work (forward slashes)
   * - Simple string replace creates mixed slashes
   * - expandHomePath uses path.join for OS-native separators
   */
  it('should produce consistent path separators after ~ expansion', async () => {
    const nodePath = await import('path')
    const os = await import('os')

    const homeDir = os.homedir()

    // ~/path with forward slashes (common input format)
    const folderPath = '~/projects/work'

    // Use expandHomePath instead of simple replace
    const cwd = expandHomePath(folderPath, homeDir)

    // Expected: OS-native separators only
    const expected = nodePath.join(homeDir, 'projects', 'work')

    // macOS: /Users/david/projects/work ✓
    // Windows: C:\Users\david\projects\work ✓ (expandHomePath fixes this)
    expect(cwd).toBe(expected)
  })

  /**
   * Bug 3: toRelativePath returns forward slashes on Windows
   * - normalizedPath uses forward slashes for comparison
   * - Return value uses normalizedPath, not original separators
   */
  it('toRelativePath should return OS-native separators in relative path', async () => {
    const nodePath = await import('path')
    const os = await import('os')

    const homeDir = os.homedir()
    const testPath = nodePath.join(homeDir, 'projects', 'work')

    const result = toRelativePath(testPath, homeDir)

    // The part after ~ should use OS-native separators
    if (result.startsWith('~')) {
      const relativePart = result.slice(1)
      const hasWrongSeparator =
        nodePath.sep === '\\' ? relativePart.includes('/') : relativePart.includes('\\')
      expect(hasWrongSeparator).toBe(false)
    }
  })

  /**
   * Full integration test: extension.ts resumeSession flow
   */
  it('resumeSession should produce correct cwd path', async () => {
    const nodePath = await import('path')

    // Same as extension.ts line 471
    const homeDir = process.env.HOME || process.env.USERPROFILE || ''
    const originalPath = nodePath.join(homeDir, 'projects', 'work')

    // Step 1: Convert path to folder name (what Claude Code stores)
    const projectName = pathToFolderName(originalPath)

    // Step 2: folderNameToPath (what extension calls) - extension.ts line 470
    const folderPath = await folderNameToPath(projectName)

    // Step 3: Use expandHomePath instead of simple replace
    const cwd = expandHomePath(folderPath, homeDir)

    // Both macOS/Linux and Windows should produce correct path
    expect(cwd).toBe(originalPath)
  })
})

describe('roundtrip conversion', () => {
  describe('Unix paths', () => {
    it('roundtrips simple Unix path via displayPathToFolderName', () => {
      const original = '/home/user/projects'
      const folderName = displayPathToFolderName(original)
      const restored = folderNameToDisplayPath(folderName)
      expect(restored).toBe(original)
    })

    it('roundtrips dot-prefixed Unix path', () => {
      const original = '/home/user/.vscode'
      const folderName = displayPathToFolderName(original)
      const restored = folderNameToDisplayPath(folderName)
      expect(restored).toBe(original)
    })
  })

  describe('Windows paths', () => {
    it('roundtrips simple Windows path', () => {
      const original = 'C:\\Users\\david\\projects'
      const folderName = displayPathToFolderName(original)
      const restored = folderNameToDisplayPath(folderName)
      expect(restored).toBe(original)
    })

    it('roundtrips dot-prefixed Windows path', () => {
      const original = 'C:\\Users\\david\\.vscode'
      const folderName = displayPathToFolderName(original)
      const restored = folderNameToDisplayPath(folderName)
      expect(restored).toBe(original)
    })
  })
})

// ============================================
// Pure function tests
// ============================================

describe('extractCwdFromContent', () => {
  it('extracts cwd from first line', () => {
    const content = '{"cwd":"/home/user/project","type":"user"}\n{"type":"assistant"}'
    expect(extractCwdFromContent(content)).toBe('/home/user/project')
  })

  it('extracts cwd from later line if first line has no cwd', () => {
    const content = '{"type":"system"}\n{"cwd":"/home/user/project","type":"user"}'
    expect(extractCwdFromContent(content)).toBe('/home/user/project')
  })

  it('returns null for empty content', () => {
    expect(extractCwdFromContent('')).toBeNull()
  })

  it('returns null when no cwd field exists', () => {
    const content = '{"type":"user"}\n{"type":"assistant"}'
    expect(extractCwdFromContent(content)).toBeNull()
  })

  it('handles Windows paths in cwd', () => {
    const content = '{"cwd":"C:\\\\Users\\\\david\\\\project"}'
    expect(extractCwdFromContent(content)).toBe('C:\\Users\\david\\project')
  })
})

describe('isSessionFile', () => {
  it('returns true for .jsonl files', () => {
    expect(isSessionFile('abc123.jsonl')).toBe(true)
  })

  it('returns false for agent files', () => {
    expect(isSessionFile('agent-abc123.jsonl')).toBe(false)
  })

  it('returns false for non-jsonl files', () => {
    expect(isSessionFile('readme.md')).toBe(false)
    expect(isSessionFile('config.json')).toBe(false)
  })
})

// ============================================
// I/O function tests with mocks
// ============================================

describe('tryGetCwdFromFile', () => {
  const mockLogger: Logger = {
    debug: vi.fn(),
    warn: vi.fn(),
  }

  it('extracts cwd from valid session file', () => {
    const mockFs: FileSystem = {
      readFileSync: () => '{"cwd":"/home/user/project","type":"user"}',
      readdirSync: () => [],
    }

    const result = tryGetCwdFromFile('/path/to/session.jsonl', mockFs, mockLogger)
    expect(result).toBe('/home/user/project')
  })

  it('returns null for file without cwd', () => {
    const mockFs: FileSystem = {
      readFileSync: () => '{"type":"user"}',
      readdirSync: () => [],
    }

    const result = tryGetCwdFromFile('/path/to/session.jsonl', mockFs, mockLogger)
    expect(result).toBeNull()
  })

  it('returns null and logs warning on read error', () => {
    const warnFn = vi.fn()
    const mockFs: FileSystem = {
      readFileSync: () => {
        throw new Error('ENOENT')
      },
      readdirSync: () => [],
    }

    const result = tryGetCwdFromFile('/path/to/session.jsonl', mockFs, {
      debug: vi.fn(),
      warn: warnFn,
    })
    expect(result).toBeNull()
    expect(warnFn).toHaveBeenCalled()
  })
})

describe('findProjectByWorkspacePath', () => {
  const mockLogger: Logger = {
    debug: vi.fn(),
    warn: vi.fn(),
  }

  it('returns direct match when pathToFolderName matches a project', () => {
    const mockFs: FileSystem = {
      readFileSync: () => '',
      readdirSync: () => [],
    }

    // /home/user/projects -> -home-user-projects
    const result = findProjectByWorkspacePath(
      '/home/user/projects',
      ['-home-user-projects', '-home-user-other'],
      '/tmp/sessions',
      mockFs,
      mockLogger
    )

    expect(result).toBe('-home-user-projects')
  })

  it('finds moved session by searching cwd in session files', () => {
    const mockFs: FileSystem = {
      readFileSync: (filePath: string) => {
        // Session in 'old-folder' has cwd pointing to current workspace
        if (filePath.includes('old-folder')) {
          return '{"cwd":"/home/user/current-project","type":"user"}'
        }
        return '{"cwd":"/some/other/path","type":"user"}'
      },
      readdirSync: (dirPath: string) => {
        if (dirPath.includes('old-folder')) {
          return ['session1.jsonl', 'session2.jsonl']
        }
        if (dirPath.includes('another-folder')) {
          return ['session3.jsonl']
        }
        return []
      },
    }

    // Workspace is /home/user/current-project
    // But pathToFolderName would give -home-user-current-project which doesn't exist
    // However, 'old-folder' has a session with cwd=/home/user/current-project
    const result = findProjectByWorkspacePath(
      '/home/user/current-project',
      ['old-folder', 'another-folder'],
      '/tmp/sessions',
      mockFs,
      mockLogger
    )

    expect(result).toBe('old-folder')
  })

  it('returns null when no matching project found', () => {
    const debugFn = vi.fn()
    const mockFs: FileSystem = {
      readFileSync: () => '{"cwd":"/different/path","type":"user"}',
      readdirSync: () => ['session.jsonl'],
    }

    const result = findProjectByWorkspacePath(
      '/home/user/my-project',
      ['some-project', 'other-project'],
      '/tmp/sessions',
      mockFs,
      { debug: debugFn, warn: vi.fn() }
    )

    expect(result).toBeNull()
    expect(debugFn).toHaveBeenCalledWith(expect.stringContaining('no matching project found'))
  })

  it('returns null for empty project list', () => {
    const mockFs: FileSystem = {
      readFileSync: () => '',
      readdirSync: () => [],
    }

    const result = findProjectByWorkspacePath(
      '/home/user/projects',
      [],
      '/tmp/sessions',
      mockFs,
      mockLogger
    )

    expect(result).toBeNull()
  })

  it('skips inaccessible project directories', () => {
    const mockFs: FileSystem = {
      readFileSync: () => '{"cwd":"/home/user/target","type":"user"}',
      readdirSync: (dirPath: string) => {
        if (dirPath.includes('inaccessible')) {
          throw new Error('EACCES')
        }
        return ['session.jsonl']
      },
    }

    // First project throws, second should still be checked
    const result = findProjectByWorkspacePath(
      '/home/user/target',
      ['inaccessible-project', 'accessible-project'],
      '/tmp/sessions',
      mockFs,
      mockLogger
    )

    expect(result).toBe('accessible-project')
  })

  it('prefers direct match over cwd search', () => {
    const mockFs: FileSystem = {
      readFileSync: () => '{"cwd":"/home/user/projects","type":"user"}',
      readdirSync: () => ['session.jsonl'],
    }

    // Both direct match and cwd match exist
    // -home-user-projects is the direct conversion
    const result = findProjectByWorkspacePath(
      '/home/user/projects',
      ['-home-user-projects', 'moved-project-folder'],
      '/tmp/sessions',
      mockFs,
      mockLogger
    )

    // Should return direct match without even reading files
    expect(result).toBe('-home-user-projects')
  })
})

describe('resolvePathFromClaudeConfig', () => {
  it('resolves path with space in folder name from config', async () => {
    // ~/.claude.json contains project paths, we look up which one matches
    // pathToFolderName converts space to dash, so "New folder" becomes "New-folder"
    const mockFs = {
      readFile: vi.fn(async () =>
        JSON.stringify({
          projects: {
            '/home/user/New folder/project': {},
            '/home/user/other': {},
          },
        })
      ),
    }

    // folderName has dash where original path had space
    const folderName = '-home-user-New-folder-project'
    const result = await resolvePathFromClaudeConfig(folderName, mockFs)

    expect(result).toBe('/home/user/New folder/project')
  })

  it('resolves path with dot in folder name from config', async () => {
    const mockFs = {
      readFile: vi.fn(async () =>
        JSON.stringify({
          projects: {
            '/home/user/my.project': {},
          },
        })
      ),
    }

    // Note: pathToFolderName converts dots to dashes
    const folderName = '-home-user-my-project'
    const result = await resolvePathFromClaudeConfig(folderName, mockFs)

    expect(result).toBe('/home/user/my.project')
  })

  it('returns null when no matching project in config', async () => {
    const mockFs = {
      readFile: vi.fn(async () =>
        JSON.stringify({
          projects: {
            '/home/user/other': {},
          },
        })
      ),
    }

    const result = await resolvePathFromClaudeConfig('-nonexistent-path', mockFs)
    expect(result).toBeNull()
  })

  it('returns null when config file not found', async () => {
    const mockFs = {
      readFile: vi.fn(async () => {
        throw new Error('ENOENT')
      }),
    }

    const result = await resolvePathFromClaudeConfig('-some-path', mockFs)
    expect(result).toBeNull()
  })

  it('returns null when config has no projects key', async () => {
    const mockFs = {
      readFile: vi.fn(async () => JSON.stringify({ numStartups: 1 })),
    }

    const result = await resolvePathFromClaudeConfig('-some-path', mockFs)
    expect(result).toBeNull()
  })
})
