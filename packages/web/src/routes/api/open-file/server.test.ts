import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promisify } from 'util'

const { execFileMock, envMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  envMock: {} as Record<string, string | undefined>,
}))

vi.mock('child_process', () => ({
  execFile: Object.assign(vi.fn(), {
    [promisify.custom]: (...args: unknown[]) => execFileMock(...args),
  }),
}))

vi.mock('$env/dynamic/private', () => ({
  env: envMock,
}))

import { POST } from './+server'

describe('POST /api/open-file', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    execFileMock.mockResolvedValue({ stdout: '', stderr: '' })
    for (const key of Object.keys(envMock)) delete envMock[key]
  })

  it('opens a normal file path via execFile with argv-separated args (no shell)', async () => {
    const request = new Request('http://localhost/api/open-file', {
      method: 'POST',
      body: JSON.stringify({ filePath: '/tmp/example.txt' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST({ request } as never)
    const data = await response.json()

    expect(data).toEqual({ success: true })
    expect(execFileMock).toHaveBeenCalledWith('code', ['/tmp/example.txt'])
  })

  it('treats a shell-injection payload as a literal filename argument, not a command', async () => {
    const payload = '/tmp/foo"; touch /tmp/pwned #'
    const request = new Request('http://localhost/api/open-file', {
      method: 'POST',
      body: JSON.stringify({ filePath: payload }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST({ request } as never)
    await response.json()

    // execFile never spawns a shell, so the entire payload is passed as a
    // single argv element -- there is no way to split it into a second command.
    expect(execFileMock).toHaveBeenCalledWith('code', [payload])
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('splits a multi-token editor command into binary + leading args', async () => {
    envMock.CLAUDE_SESSIONS_EDITOR = 'code --wait'

    const request = new Request('http://localhost/api/open-file', {
      method: 'POST',
      body: JSON.stringify({ filePath: '/tmp/example.txt' }),
      headers: { 'Content-Type': 'application/json' },
    })

    await POST({ request } as never)

    expect(execFileMock).toHaveBeenCalledWith('code', ['--wait', '/tmp/example.txt'])
  })

  it('returns 400 when neither filePath nor sessionId+backupFileName is provided', async () => {
    const request = new Request('http://localhost/api/open-file', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(POST({ request } as never)).rejects.toThrow()
  })
})
