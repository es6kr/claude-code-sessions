import { error, type Handle } from '@sveltejs/kit'

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

export const handle: Handle = async ({ event, resolve }) => {
  if (!isAllowedHost(event.request.headers.get('host'))) {
    throw error(403, 'Forbidden: untrusted Host header')
  }
  return resolve(event)
}
