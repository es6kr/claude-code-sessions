import { error, redirect, type Handle, type RequestEvent } from '@sveltejs/kit'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '$env/dynamic/private'

// DNS-rebinding / LAN-access defense (Layer 2): reject any request whose Host
// header doesn't name this loopback server itself. GET requests carry no
// Origin header, so Host is the only anchor available — see
// plan-claude-sessions-security-hardening.md §Q3 for why Host validation
// (not Origin/CORS/Private-Network-Access) is the necessary-and-sufficient,
// browser-agnostic defense against a remote page rebinding to 127.0.0.1.
export function isAllowedHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false

  let hostname: string
  if (hostHeader.startsWith('[')) {
    // IPv6 literal in bracket notation, e.g. "[::1]:5174" or "[::1]".
    // host.split(':')[0] would truncate at the first colon inside the
    // brackets — extract everything between the brackets instead.
    const closeBracket = hostHeader.indexOf(']')
    if (closeBracket === -1) return false
    hostname = hostHeader.slice(1, closeBracket)
  } else {
    // hostname[:port] or IPv4[:port] — at most one colon, so split(':')[0]
    // is safe here (only the bracketed-IPv6 case above needs special care).
    hostname = hostHeader.split(':')[0]
  }

  hostname = hostname.toLowerCase().replace(/\.$/, '')

  if (hostname === 'localhost' || hostname === '::1') return true

  // 127.0.0.0/8
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number)
    if (octets.every((octet) => octet <= 255) && octets[0] === 127) {
      return true
    }
  }

  return false
}

// Layer 3 — one-time token exchange + session cookie. Fixes the 3 flaws the
// plan doc's §Q2 review found in the original brief sketch: (1) the token
// wasn't actually single-use, (2) the cookie value was a guessable constant,
// (3) the token leaked via the URL indefinitely. Auth only activates when
// CLAUDE_SESSIONS_AUTH_TOKEN is set — its absence preserves today's no-auth
// behavior for the standalone `npx @claude-sessions/web` CLI, which (like
// HOST/loopback-binding) doesn't provision one.
const SESSION_COOKIE = 'session'
// A fresh random secret for the cookie, independent of AUTH_TOKEN — issued
// once per server process and never exposed in a URL or log the way the
// one-time exchange token is.
const SESSION_SECRET = randomBytes(32).toString('hex')
let tokenConsumed = false

// The extension's own health-check polling (ensureWebServer in
// extension.ts) hits this before it has any token to send — exempt it.
// Read-only, minimal information disclosure (a version string).
const PUBLIC_PATHS = new Set(['/api/version'])

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

// Synchronous check-and-set: no `await` between the check and the set, so
// two concurrent requests racing with the correct token cannot both pass
// (the plan doc's TOCTOU fix vs. the brief sketch, which set `used` in a
// separate step after the comparison). A wrong token never touches
// `tokenConsumed`, so a probing attacker can't burn the real one-time slot.
function tryConsumeToken(candidate: string, authToken: string): boolean {
  if (tokenConsumed) return false
  if (!timingSafeStringEqual(candidate, authToken)) return false
  tokenConsumed = true
  return true
}

function hasValidSessionCookie(event: RequestEvent): boolean {
  const cookie = event.cookies.get(SESSION_COOKIE)
  return cookie !== undefined && timingSafeStringEqual(cookie, SESSION_SECRET)
}

function enforceTokenAuth(event: RequestEvent): void {
  const authToken = env.CLAUDE_SESSIONS_AUTH_TOKEN
  if (!authToken) return // Layer 3 disabled — no token configured
  if (PUBLIC_PATHS.has(event.url.pathname)) return
  if (hasValidSessionCookie(event)) return

  const queryToken = event.url.searchParams.get('token')
  if (queryToken && tryConsumeToken(queryToken, authToken)) {
    event.cookies.set(SESSION_COOKIE, SESSION_SECRET, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      // Loopback-only plain HTTP (never TLS) — `secure: true` would silently
      // drop the cookie. See plan doc §Q2 for the SameSite=Lax / Simple
      // Browser cookie-retransmission rationale.
      secure: false,
    })
    // Strip the one-time token from the URL immediately — query params can
    // leak via Referer headers, browser history, and server access logs.
    const stripped = new URL(event.url)
    stripped.searchParams.delete('token')
    throw redirect(302, stripped.pathname + stripped.search)
  }

  throw error(401, 'Unauthorized: missing or invalid session')
}

export const handle: Handle = async ({ event, resolve }) => {
  if (!isAllowedHost(event.request.headers.get('host'))) {
    throw error(403, 'Forbidden: untrusted Host header')
  }
  enforceTokenAuth(event)
  return resolve(event)
}
