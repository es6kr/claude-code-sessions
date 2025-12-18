import { describe, it, expect } from 'vitest'
import { pathToFolderName, folderNameToDisplayPath, displayPathToFolderName } from './paths.js'

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
