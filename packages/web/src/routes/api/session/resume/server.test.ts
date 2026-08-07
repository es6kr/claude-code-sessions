import { describe, it, expect, vi, beforeEach } from 'vitest'

const { resumeSessionMock } = vi.hoisted(() => ({
  resumeSessionMock: vi.fn(),
}))

vi.mock('@claude-sessions/core/server', () => ({
  resumeSession: resumeSessionMock,
}))

vi.mock('@claude-sessions/core', () => ({
  folderNameToPath: vi.fn().mockResolvedValue('/project'),
  expandHomePath: vi.fn((path: string) => path),
}))

import { POST } from './+server'

describe('POST /api/session/resume', () => {
  beforeEach(() => {
    resumeSessionMock.mockReset()
    resumeSessionMock.mockReturnValue({ success: true, pid: 1234 })
  })

  it('resumes a session with a valid sessionId', async () => {
    const request = new Request('http://localhost/api/session/resume', {
      method: 'POST',
      body: JSON.stringify({ projectName: 'test-project', sessionId: 'session-id-abc123' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST({ request } as never)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ success: true, pid: 1234 })
    expect(resumeSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-id-abc123' })
    )
  })

  it('rejects a sessionId carrying a shell-injection payload without ever calling resumeSession', async () => {
    const payload = 'session-id"; touch /tmp/pwned #'
    const request = new Request('http://localhost/api/session/resume', {
      method: 'POST',
      body: JSON.stringify({ projectName: 'test-project', sessionId: payload }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST({ request } as never)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data).toEqual({ error: 'Invalid session id' })
    expect(resumeSessionMock).not.toHaveBeenCalled()
  })

  it('rejects a sessionId containing whitespace or other disallowed characters', async () => {
    const request = new Request('http://localhost/api/session/resume', {
      method: 'POST',
      body: JSON.stringify({ projectName: 'test-project', sessionId: 'not a valid id' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST({ request } as never)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data).toEqual({ error: 'Invalid session id' })
    expect(resumeSessionMock).not.toHaveBeenCalled()
  })

  it('accepts a real UUID-shaped sessionId', async () => {
    const request = new Request('http://localhost/api/session/resume', {
      method: 'POST',
      body: JSON.stringify({
        projectName: 'test-project',
        sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST({ request } as never)

    expect(response.status).toBe(200)
    expect(resumeSessionMock).toHaveBeenCalledTimes(1)
  })
})
