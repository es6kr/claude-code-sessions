import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './+server'
import { Effect } from 'effect'

// Mock session module
vi.mock('$lib/server/session', () => ({
  deleteMessage: vi.fn(),
}))

import * as session from '$lib/server/session'

describe('DELETE /api/message', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should pass targetType=file-history-snapshot to deleteMessage', async () => {
    vi.mocked(session.deleteMessage).mockReturnValue(
      Effect.succeed({ success: true, deletedMessage: { type: 'file-history-snapshot' } })
    )

    const url = new URL(
      'http://localhost/api/message?project=test&session=sess1&uuid=shared-id&targetType=file-history-snapshot'
    )

    await DELETE({ url } as never)

    expect(session.deleteMessage).toHaveBeenCalledWith(
      'test',
      'sess1',
      'shared-id',
      'file-history-snapshot'
    )
  })

  it('should pass targetType=summary to deleteMessage', async () => {
    vi.mocked(session.deleteMessage).mockReturnValue(
      Effect.succeed({ success: true, deletedMessage: { type: 'summary' } })
    )

    const url = new URL(
      'http://localhost/api/message?project=test&session=sess1&uuid=leaf-id&targetType=summary'
    )

    await DELETE({ url } as never)

    expect(session.deleteMessage).toHaveBeenCalledWith('test', 'sess1', 'leaf-id', 'summary')
  })

  it('should pass undefined when targetType is not specified', async () => {
    vi.mocked(session.deleteMessage).mockReturnValue(
      Effect.succeed({ success: true, deletedMessage: { type: 'user' } })
    )

    const url = new URL('http://localhost/api/message?project=test&session=sess1&uuid=user-id')

    await DELETE({ url } as never)

    expect(session.deleteMessage).toHaveBeenCalledWith('test', 'sess1', 'user-id', undefined)
  })
})
