import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

const mockSpawn = vi.mocked(spawn)

// Create a minimal mock ChildProcess
const createMockChild = (pid = 12345): Partial<ChildProcess> => ({
  pid,
  unref: vi.fn(),
})

describe('openExternalTerminal', () => {
  let originalPlatform: PropertyDescriptor | undefined

  beforeEach(() => {
    vi.resetAllMocks()
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  })

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
  })

  const setPlatform = (platform: string) => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  }

  it('should open Terminal.app via osascript on macOS', async () => {
    setPlatform('darwin')
    mockSpawn.mockReturnValue(createMockChild(100) as ChildProcess)

    const { openExternalTerminal } = await import('../resume.js')
    const result = openExternalTerminal({ cwd: '/test/project' })

    expect(result.success).toBe(true)
    expect(result.pid).toBe(100)
    expect(mockSpawn).toHaveBeenCalledWith(
      'osascript',
      ['-e', expect.stringContaining('Terminal')],
      { detached: true, stdio: 'ignore' }
    )
  })

  it('should include correct cwd in macOS AppleScript', async () => {
    setPlatform('darwin')
    mockSpawn.mockReturnValue(createMockChild() as ChildProcess)

    const { openExternalTerminal } = await import('../resume.js')
    openExternalTerminal({ cwd: '/Users/test/my project' })

    const scriptArg = mockSpawn.mock.calls[0][1]![1] as string
    expect(scriptArg).toContain('/Users/test/my project')
    expect(scriptArg).toContain('cd')
  })

  it('should open cmd on Windows', async () => {
    setPlatform('win32')
    mockSpawn.mockReturnValue(createMockChild(200) as ChildProcess)

    const { openExternalTerminal } = await import('../resume.js')
    const result = openExternalTerminal({ cwd: 'C:\\Users\\test' })

    expect(result.success).toBe(true)
    expect(result.pid).toBe(200)
    expect(mockSpawn).toHaveBeenCalledWith(
      'cmd',
      ['/c', 'start', 'cmd', '/k', expect.stringContaining('C:\\Users\\test')],
      expect.objectContaining({ cwd: 'C:\\Users\\test', detached: true })
    )
  })

  it('should try terminal emulators on Linux', async () => {
    setPlatform('linux')
    mockSpawn.mockReturnValue(createMockChild(300) as ChildProcess)

    const { openExternalTerminal } = await import('../resume.js')
    const result = openExternalTerminal({ cwd: '/home/user/project' })

    expect(result.success).toBe(true)
    expect(result.pid).toBe(300)
    // Should try gnome-terminal first
    expect(mockSpawn).toHaveBeenCalledWith(
      'gnome-terminal',
      ['--working-directory', '/home/user/project'],
      { detached: true, stdio: 'ignore' }
    )
  })

  it('should return error when spawn throws', async () => {
    setPlatform('darwin')
    mockSpawn.mockImplementation(() => {
      throw new Error('spawn failed')
    })

    const { openExternalTerminal } = await import('../resume.js')
    const result = openExternalTerminal({ cwd: '/test' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('spawn failed')
  })

  it('should return error on unsupported platform', async () => {
    setPlatform('freebsd')
    // Linux terminals all fail
    mockSpawn.mockImplementation(() => {
      throw new Error('not found')
    })

    const { openExternalTerminal } = await import('../resume.js')
    const result = openExternalTerminal({ cwd: '/test' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('No supported terminal emulator found')
  })
})

describe('startClaude', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should spawn osascript on macOS with command and cwd', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    mockSpawn.mockReturnValue(createMockChild(400) as ChildProcess)

    const { startClaude } = await import('../resume.js')
    const result = startClaude({ command: 'claude --resume abc', cwd: '/test' })

    expect(result.success).toBe(true)
    expect(result.pid).toBe(400)
    const scriptArg = mockSpawn.mock.calls[0][1]![1] as string
    expect(scriptArg).toContain('claude --resume abc')
    expect(scriptArg).toContain('/test')
  })
})
