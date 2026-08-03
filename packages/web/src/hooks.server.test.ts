import { describe, it, expect, vi } from 'vitest'
import { isAllowedHost, handle } from './hooks.server'

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

describe('handle', () => {
  it('rejects a disallowed Host header with 403 and never calls resolve', async () => {
    const event = {
      request: new Request('http://evil.com/api/projects', { headers: { host: 'evil.com' } }),
    }
    const resolve = vi.fn()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(handle({ event, resolve } as any)).rejects.toMatchObject({ status: 403 })
    expect(resolve).not.toHaveBeenCalled()
  })

  it('resolves normally for an allowed Host header', async () => {
    const response = new Response('ok')
    const event = {
      request: new Request('http://127.0.0.1:5174/api/projects', {
        headers: { host: '127.0.0.1:5174' },
      }),
    }
    const resolve = vi.fn().mockResolvedValue(response)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await handle({ event, resolve } as any)
    expect(result).toBe(response)
    expect(resolve).toHaveBeenCalledWith(event)
  })
})
