import { describe, it, expect } from 'vitest'
import { pathToFolderName, folderNameToDisplayPath } from './paths.js'

describe('pathToFolderName', () => {
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
    expect(pathToFolderName('/home/user/api.v2.example.com')).toBe('-home-user-api-v2-example-com')
  })
})

describe('folderNameToDisplayPath', () => {
  it('converts folder name to absolute path', () => {
    expect(folderNameToDisplayPath('-home-user-projects')).toBe('/home/user/projects')
  })

  it('handles dot-prefixed folders', () => {
    expect(folderNameToDisplayPath('-home-user-projects--vscode')).toBe('/home/user/projects/.vscode')
  })

  it('limitation: cannot distinguish dot from slash in folder names', () => {
    // This is the known limitation of pattern-based conversion
    // example-com becomes example/com instead of example.com
    // This is why we need getRealPathFromSession to read actual cwd
    expect(folderNameToDisplayPath('-home-user-example-com')).toBe('/home/user/example/com')
  })
})
