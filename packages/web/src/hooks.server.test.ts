import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isAllowedHost } from './hooks.server'

const { envMock } = vi.hoisted(() => ({
  envMock: {} as Record<string, string | undefined>,
}))

vi.mock('$env/dynamic/private', () => ({
  env: envMock,
}))

function makeCookieStore(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial }
  return {
    get: (name: string) => store[name],
    set: (name: string, value: string) => {
      store[name] = value
    },
  }
}

function makeEvent(url: string, opts: { host?: string; cookie?: string } = {}) {
  return {
    request: new Request(url, opts.host !== undefined ? { headers: { host: opts.host } } : {}),
    url: new URL(url),
    cookies: makeCookieStore(opts.cookie !== undefined ? { session: opts.cookie } : {}),
  }
}

describe('isAllowedHost', () => {
  it('allows localhost with and without a port', () => {
    expect(isAllowedHost('localhost')).toBe(true)
    expect(isAllowedHost('localhost:5174')).toBe(true)
  })

  it('allows the 127.0.0.0/8 loopback range', () => {
    expect(isAllowedHost('127.0.0.1')).toBe(true)
    expect(isAllowedHost('127.0.0.1:5174')).toBe(true)
    expect(isAllowedHost('127.255.255.254')).toBe(true)
  })

  it('allows IPv6 loopback in bracket notation, with and without a port', () => {
    expect(isAllowedHost('[::1]')).toBe(true)
    expect(isAllowedHost('[::1]:5174')).toBe(true)
  })

  it('normalizes case and a trailing dot', () => {
    expect(isAllowedHost('LOCALHOST')).toBe(true)
    expect(isAllowedHost('localhost.')).toBe(true)
    expect(isAllowedHost('localhost.:5174')).toBe(true)
  })

  it('rejects an attacker-controlled Host used for DNS rebinding', () => {
    expect(isAllowedHost('evil.com')).toBe(false)
    expect(isAllowedHost('evil.com:5174')).toBe(false)
  })

  it('rejects a same-LAN victim IP outside the loopback range', () => {
    expect(isAllowedHost('192.168.1.10')).toBe(false)
  })

  it('rejects decimal/hex-encoded loopback IPs (unsupported, not a security hole)', () => {
    expect(isAllowedHost('2130706433')).toBe(false)
    expect(isAllowedHost('0x7f000001')).toBe(false)
  })

  it('rejects a missing Host header', () => {
    expect(isAllowedHost(null)).toBe(false)
  })

  it('rejects a malformed IPv6 bracket literal', () => {
    expect(isAllowedHost('[::1')).toBe(false)
  })
})

describe('handle — Layer 2 (Host allow-list)', () => {
  beforeEach(() => {
    vi.resetModules()
    for (const key of Object.keys(envMock)) delete envMock[key]
  })

  it('rejects a disallowed Host header with 403 and never calls resolve', async () => {
    const { handle } = await import('./hooks.server')
    const event = makeEvent('http://evil.com/api/projects', { host: 'evil.com' })
    const resolve = vi.fn()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(handle({ event, resolve } as any)).rejects.toMatchObject({ status: 403 })
    expect(resolve).not.toHaveBeenCalled()
  })

  it('resolves normally for an allowed Host header when no token is configured', async () => {
    const { handle } = await import('./hooks.server')
    const response = new Response('ok')
    const event = makeEvent('http://127.0.0.1:5174/api/projects', { host: '127.0.0.1:5174' })
    const resolve = vi.fn().mockResolvedValue(response)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await handle({ event, resolve } as any)
    expect(result).toBe(response)
    expect(resolve).toHaveBeenCalledWith(event)
  })
})

describe('handle — Layer 3 (one-time token + session cookie)', () => {
  beforeEach(() => {
    vi.resetModules()
    for (const key of Object.keys(envMock)) delete envMock[key]
  })

  it('is disabled (no auth required) when CLAUDE_SESSIONS_AUTH_TOKEN is unset', async () => {
    const { handle } = await import('./hooks.server')
    const response = new Response('ok')
    const event = makeEvent('http://127.0.0.1:5174/session/foo/bar', { host: '127.0.0.1:5174' })
    const resolve = vi.fn().mockResolvedValue(response)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await handle({ event, resolve } as any)
    expect(result).toBe(response)
  })

  it('exempts /api/version from auth even when a token is configured (health-check path)', async () => {
    envMock.CLAUDE_SESSIONS_AUTH_TOKEN = 'the-real-token'
    const { handle } = await import('./hooks.server')
    const response = new Response('ok')
    const event = makeEvent('http://127.0.0.1:5174/api/version', { host: '127.0.0.1:5174' })
    const resolve = vi.fn().mockResolvedValue(response)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await handle({ event, resolve } as any)
    expect(result).toBe(response)
  })

  it('rejects a request with no cookie and no token with 401', async () => {
    envMock.CLAUDE_SESSIONS_AUTH_TOKEN = 'the-real-token'
    const { handle } = await import('./hooks.server')
    const event = makeEvent('http://127.0.0.1:5174/session/foo/bar', { host: '127.0.0.1:5174' })
    const resolve = vi.fn()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(handle({ event, resolve } as any)).rejects.toMatchObject({ status: 401 })
    expect(resolve).not.toHaveBeenCalled()
  })

  it('exchanges a valid ?token= for a session cookie, strips the token, and redirects', async () => {
    envMock.CLAUDE_SESSIONS_AUTH_TOKEN = 'the-real-token'
    const { handle } = await import('./hooks.server')
    const event = makeEvent('http://127.0.0.1:5174/session/foo/bar?token=the-real-token', {
      host: '127.0.0.1:5174',
    })
    const resolve = vi.fn()
    const setSpy = vi.spyOn(event.cookies, 'set')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(handle({ event, resolve } as any)).rejects.toMatchObject({
      status: 302,
      location: '/session/foo/bar',
    })
    expect(resolve).not.toHaveBeenCalled()
    expect(setSpy).toHaveBeenCalledWith(
      'session',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: false, path: '/' })
    )
  })

  it('rejects an invalid token with 401 without consuming the real token slot', async () => {
    envMock.CLAUDE_SESSIONS_AUTH_TOKEN = 'the-real-token'
    const { handle } = await import('./hooks.server')

    const badEvent = makeEvent('http://127.0.0.1:5174/session/foo/bar?token=wrong', {
      host: '127.0.0.1:5174',
    })
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle({ event: badEvent, resolve: vi.fn() } as any)
    ).rejects.toMatchObject({ status: 401 })

    // The real token must still work — a wrong guess must not burn the
    // one-time slot (would otherwise let an attacker DoS the legitimate flow).
    const goodEvent = makeEvent('http://127.0.0.1:5174/session/foo/bar?token=the-real-token', {
      host: '127.0.0.1:5174',
    })
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle({ event: goodEvent, resolve: vi.fn() } as any)
    ).rejects.toMatchObject({ status: 302 })
  })

  it('rejects a replayed (already-consumed) token with 401', async () => {
    envMock.CLAUDE_SESSIONS_AUTH_TOKEN = 'the-real-token'
    const { handle } = await import('./hooks.server')

    const first = makeEvent('http://127.0.0.1:5174/session/foo/bar?token=the-real-token', {
      host: '127.0.0.1:5174',
    })
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle({ event: first, resolve: vi.fn() } as any)
    ).rejects.toMatchObject({ status: 302 })

    const replay = makeEvent('http://127.0.0.1:5174/session/foo/bar?token=the-real-token', {
      host: '127.0.0.1:5174',
    })
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle({ event: replay, resolve: vi.fn() } as any)
    ).rejects.toMatchObject({ status: 401 })
  })

  it('accepts a request carrying a valid session cookie without the token again', async () => {
    envMock.CLAUDE_SESSIONS_AUTH_TOKEN = 'the-real-token'
    const { handle } = await import('./hooks.server')

    // First exchange, to learn the session secret this module instance issues.
    const exchangeEvent = makeEvent('http://127.0.0.1:5174/?token=the-real-token', {
      host: '127.0.0.1:5174',
    })
    let issuedSecret = ''
    vi.spyOn(exchangeEvent.cookies, 'set').mockImplementation((_name, value) => {
      issuedSecret = value
    })
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle({ event: exchangeEvent, resolve: vi.fn() } as any)
    ).rejects.toMatchObject({ status: 302 })
    expect(issuedSecret).not.toBe('')

    const response = new Response('ok')
    const cookieEvent = makeEvent('http://127.0.0.1:5174/session/foo/bar', {
      host: '127.0.0.1:5174',
      cookie: issuedSecret,
    })
    const resolve = vi.fn().mockResolvedValue(response)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await handle({ event: cookieEvent, resolve } as any)
    expect(result).toBe(response)
  })

  it('rejects a forged/guessed session cookie with 401', async () => {
    envMock.CLAUDE_SESSIONS_AUTH_TOKEN = 'the-real-token'
    const { handle } = await import('./hooks.server')
    const event = makeEvent('http://127.0.0.1:5174/session/foo/bar', {
      host: '127.0.0.1:5174',
      cookie: 'guessed-value',
    })

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle({ event, resolve: vi.fn() } as any)
    ).rejects.toMatchObject({ status: 401 })
  })
})
