/**
 * Integration tests for path utilities using mocked file system
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'

// Mock fs and os modules
vi.mock('node:fs')
vi.mock('node:os')

describe('getRealPathFromSession (mocked)', () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue('/home/user')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for non-existent project', async () => {
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })

    // Re-import to get fresh module with mocks
    const { getRealPathFromSession } = await import('./paths.js')
    const result = getRealPathFromSession('-nonexistent-project')
    expect(result).toBeNull()
  })

  it('returns real cwd from session file when cwd matches folder name', async () => {
    const mockCwd = '/home/user/example.com'
    const folderName = '-home-user-example-com'
    const sessionContent = JSON.stringify({ cwd: mockCwd, type: 'user' })

    vi.mocked(fs.readdirSync).mockReturnValue(['session1.jsonl'] as unknown as fs.Dirent[])
    vi.mocked(fs.readFileSync).mockReturnValue(sessionContent)

    const { getRealPathFromSession } = await import('./paths.js')
    const result = getRealPathFromSession(folderName)

    expect(result).toBe(mockCwd)
  })

  it('returns null when session cwd does not match folder name (moved session)', async () => {
    // Session was created in /home/user/other-project but moved to example-com folder
    const mockCwd = '/home/user/other-project'
    const folderName = '-home-user-example-com'
    const sessionContent = JSON.stringify({ cwd: mockCwd, type: 'user' })

    vi.mocked(fs.readdirSync).mockReturnValue(['session1.jsonl'] as unknown as fs.Dirent[])
    vi.mocked(fs.readFileSync).mockReturnValue(sessionContent)

    const { getRealPathFromSession } = await import('./paths.js')
    const result = getRealPathFromSession(folderName)

    expect(result).toBeNull()
  })
})

describe('folderNameToPath (mocked)', () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue('/home/user')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to pattern conversion when no session exists', async () => {
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const { folderNameToPath } = await import('./paths.js')
    const displayPath = folderNameToPath('-home-user-nonexistent-folder')

    // Falls back to pattern-based conversion (under home dir shows ~/)
    expect(displayPath).toBe('~/nonexistent/folder')
  })

  it('returns correct display path using session cwd for domain with dot', async () => {
    const mockCwd = '/home/user/example.com'
    const folderName = '-home-user-example-com'
    const sessionContent = JSON.stringify({ cwd: mockCwd, type: 'user' })

    vi.mocked(fs.readdirSync).mockReturnValue(['session1.jsonl'] as unknown as fs.Dirent[])
    vi.mocked(fs.readFileSync).mockReturnValue(sessionContent)

    const { folderNameToPath } = await import('./paths.js')
    const displayPath = folderNameToPath(folderName)

    // Should return ~/example.com (not ~/example/com)
    expect(displayPath).toBe('~/example.com')
  })
})
