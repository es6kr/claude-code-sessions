import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './+server'
import { Effect } from 'effect'

vi.mock('$lib/server/session', () => ({
  compressSession: vi.fn(),
}))

import * as session from '$lib/server/session'

describe('POST /api/session/compress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 400 when project is missing', async () => {
    const request = new Request('http://localhost/api/session/compress', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'sess-1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(POST({ request } as never)).rejects.toThrow()
  })

  it('should return 400 when sessionId is missing', async () => {
    const request = new Request('http://localhost/api/session/compress', {
      method: 'POST',
      body: JSON.stringify({ project: 'test-project' }),
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(POST({ request } as never)).rejects.toThrow()
  })

  it('should call compressSession with expected args and options', async () => {
    const mockResult = {
      success: true as const,
      originalSize: 1000,
      compressedSize: 500,
      removedCustomTitles: 0,
      removedProgress: 3,
      removedSnapshots: 1,
      truncatedOutputs: 1,
    }
    vi.mocked(session.compressSession).mockReturnValue(Effect.succeed(mockResult))

    const request = new Request('http://localhost/api/session/compress', {
      method: 'POST',
      body: JSON.stringify({ project: 'test-project', sessionId: 'sess-1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST({ request } as never)
    const data = await response.json()

    expect(session.compressSession).toHaveBeenCalledWith('test-project', 'sess-1', {
      keepSnapshots: 'first_last',
      maxToolOutputLength: 0,
    })
    expect(data).toEqual(mockResult)
  })
})
