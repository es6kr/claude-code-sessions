import { describe, it, expect } from 'vitest'
import {
  pathToFolderName,
  folderNameToDisplayPath,
  displayPathToFolderName,
  toRelativePath,
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
      // Drive letter is normalized to lowercase (Claude Code convention)
      expect(pathToFolderName('C:\\Users\\david\\projects')).toBe('c--Users-david-projects')
    })

    it('handles Windows path with forward slashes', () => {
      expect(pathToFolderName('C:/Users/david/projects')).toBe('c--Users-david-projects')
    })

    it('handles Windows dot-prefixed folders', () => {
      expect(pathToFolderName('C:\\Users\\david\\.vscode')).toBe('c--Users-david--vscode')
    })

    it('handles Windows path with domain (example.com)', () => {
      expect(pathToFolderName('C:\\Users\\david\\example.com')).toBe('c--Users-david-example-com')
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
      expect(pathToFolderName('/home/user/📁project')).toBe('-home-user--project')
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
    expect(toRelativePath('C:\\Users\\david\\projects', 'C:\\Users\\david')).toBe('~/projects')
  })

  it('does not convert other Windows user paths', () => {
    expect(toRelativePath('C:\\Users\\other\\projects', 'C:\\Users\\david')).toBe(
      'C:\\Users\\other\\projects'
    )
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
