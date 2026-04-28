import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ChildProcess } from 'node:child_process'

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}))

import { execSync, spawn } from 'node:child_process'
import { startClaude, openExternalTerminal } from '../resume.js'

const mockExecSync = vi.mocked(execSync)
const mockSpawn = vi.mocked(spawn)

function createMockChild(pid = 1234): ChildProcess {
  return { pid, unref: vi.fn() } as unknown as ChildProcess
}

const setPlatform = (platform: string) => {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

describe('startClaude', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!

  beforeEach(() => {
    vi.resetAllMocks()
    mockSpawn.mockReturnValue(createMockChild())
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform)
  })

  it('should spawn osascript on macOS with command and cwd', () => {
    setPlatform('darwin')

    const result = startClaude({ command: 'claude --resume abc', cwd: '/test' })

    expect(result.success).toBe(true)
    const scriptArg = mockSpawn.mock.calls[0][1]![1] as string
    expect(scriptArg).toContain('claude --resume abc')
    expect(scriptArg).toContain('/test')
  })

  it('should open cmd on Windows', () => {
    setPlatform('win32')

    const result = startClaude({ command: 'claude --resume abc', cwd: 'C:\\Users\\test' })

    expect(result.success).toBe(true)
    expect(mockSpawn).toHaveBeenCalledWith(
      'cmd',
      ['/c', 'start', 'cmd', '/k', 'claude --resume abc'],
      expect.objectContaining({ cwd: 'C:\\Users\\test', detached: true })
    )
  })
})

describe('startClaude - Linux terminal fallback', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!

  beforeEach(() => {
    vi.resetAllMocks()
    setPlatform('linux')
    mockSpawn.mockReturnValue(createMockChild())
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform)
  })

  it('should use --working-directory for gnome-terminal', () => {
    mockExecSync.mockReturnValueOnce(Buffer.from('/usr/bin/gnome-terminal'))

    const result = startClaude({ command: 'claude --resume abc', cwd: '/home/user/project' })

    expect(result.success).toBe(true)
    expect(mockExecSync).toHaveBeenCalledWith('command -v gnome-terminal', { stdio: 'ignore' })
    expect(mockSpawn).toHaveBeenCalledWith(
      'gnome-terminal',
      ['--working-directory', '/home/user/project', '--', 'bash', '-c', 'claude --resume abc'],
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    )
  })

  it('should use --workdir for konsole when gnome-terminal is missing', () => {
    mockExecSync
      .mockImplementationOnce(() => {
        throw new Error('not found')
      })
      .mockReturnValueOnce(Buffer.from('/usr/bin/konsole'))

    const result = startClaude({ command: 'claude --resume abc', cwd: '/home/user/project' })

    expect(result.success).toBe(true)
    expect(mockSpawn).toHaveBeenCalledWith(
      'konsole',
      ['--workdir', '/home/user/project', '-e', 'bash', '-c', 'claude --resume abc'],
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    )
  })

  it('should use shell wrapper for xterm (no --workdir support)', () => {
    mockExecSync
      .mockImplementationOnce(() => {
        throw new Error('not found')
      })
      .mockImplementationOnce(() => {
        throw new Error('not found')
      })
      .mockReturnValueOnce(Buffer.from('/usr/bin/xterm'))

    const result = startClaude({ command: 'claude --resume abc', cwd: '/home/user/project' })

    expect(result.success).toBe(true)
    expect(mockSpawn).toHaveBeenCalledWith(
      'xterm',
      ['-e', 'cd "/home/user/project" && claude --resume abc; exec $SHELL'],
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    )
  })

  it('should return error when no terminal emulator is found', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not found')
    })

    const result = startClaude({ command: 'claude --resume abc', cwd: '/home/user/project' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('No supported terminal emulator found')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('should skip to next terminal when command -v fails', () => {
    mockExecSync
      .mockImplementationOnce(() => {
        throw new Error('not found')
      })
      .mockReturnValueOnce(Buffer.from('/usr/bin/konsole'))

    startClaude({ command: 'claude --resume abc', cwd: '/tmp' })

    expect(mockExecSync).toHaveBeenCalledTimes(2)
    expect(mockSpawn).toHaveBeenCalledTimes(1)
    expect(mockSpawn.mock.calls[0][0]).toBe('konsole')
  })
})

describe('openExternalTerminal', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!

  beforeEach(() => {
    vi.resetAllMocks()
    mockSpawn.mockReturnValue(createMockChild())
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform)
  })

  it('should open Terminal.app via osascript on macOS', () => {
    setPlatform('darwin')

    const result = openExternalTerminal({ cwd: '/test/project' })

    expect(result.success).toBe(true)
    expect(mockSpawn).toHaveBeenCalledWith(
      'osascript',
      ['-e', expect.stringContaining('Terminal')],
      { detached: true, stdio: 'ignore' }
    )
  })

  it('should open cmd on Windows', () => {
    setPlatform('win32')

    const result = openExternalTerminal({ cwd: 'C:\\Users\\test' })

    expect(result.success).toBe(true)
    expect(mockSpawn).toHaveBeenCalledWith(
      'cmd',
      ['/c', 'start', 'cmd', '/k', expect.stringContaining('C:\\Users\\test')],
      expect.objectContaining({ cwd: 'C:\\Users\\test', detached: true })
    )
  })
})

describe('openExternalTerminal - Linux terminal fallback', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!

  beforeEach(() => {
    vi.resetAllMocks()
    setPlatform('linux')
    mockSpawn.mockReturnValue(createMockChild())
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform)
  })

  it('should use --working-directory for gnome-terminal', () => {
    mockExecSync.mockReturnValueOnce(Buffer.from('/usr/bin/gnome-terminal'))

    const result = openExternalTerminal({ cwd: '/home/user/project' })

    expect(result.success).toBe(true)
    expect(mockSpawn).toHaveBeenCalledWith(
      'gnome-terminal',
      ['--working-directory', '/home/user/project'],
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    )
  })

  it('should use --workdir for konsole', () => {
    mockExecSync
      .mockImplementationOnce(() => {
        throw new Error('not found')
      })
      .mockReturnValueOnce(Buffer.from('/usr/bin/konsole'))

    const result = openExternalTerminal({ cwd: '/home/user/project' })

    expect(result.success).toBe(true)
    expect(mockSpawn).toHaveBeenCalledWith(
      'konsole',
      ['--workdir', '/home/user/project'],
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    )
  })

  it('should use shell wrapper for xterm (no --workdir support)', () => {
    mockExecSync
      .mockImplementationOnce(() => {
        throw new Error('not found')
      })
      .mockImplementationOnce(() => {
        throw new Error('not found')
      })
      .mockReturnValueOnce(Buffer.from('/usr/bin/xterm'))

    const result = openExternalTerminal({ cwd: '/home/user/project' })

    expect(result.success).toBe(true)
    expect(mockSpawn).toHaveBeenCalledWith(
      'xterm',
      ['-e', 'cd "/home/user/project" && exec $SHELL'],
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    )
  })

  it('should return error when no terminal is found', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not found')
    })

    const result = openExternalTerminal({ cwd: '/home/user/project' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('No supported terminal emulator found')
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})
