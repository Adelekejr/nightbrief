import { SOURCES } from './sources.js'

/**
 * What the article extractor is allowed to fetch.
 *
 * `/api/analyze` takes a URL from the request and the server fetches it. Left
 * open, that is a request forgery primitive: a caller can aim the deployment's
 * own network position at anything it can reach, including addresses no
 * outside client could. The checks here are the boundary.
 *
 * Two layers, and both are needed. The address rules refuse loopback, private
 * and link-local destinations outright. The allowlist then refuses everything
 * that is not a publisher this desk already reads — which is the layer that
 * actually holds, because a name that resolves somewhere private is not on it
 * either. The address rules matter anyway: they are what a redirect chain is
 * checked against at every hop, and what would still stand if the allowlist
 * were ever widened.
 */

export type UrlCheck =
  | { ok: true; url: URL }
  | { ok: false; code: UrlRejection; reason: string }

export type UrlRejection =
  | 'malformed'
  | 'not-https'
  | 'no-host'
  | 'blocked-host'
  | 'not-allowed'

/**
 * One sentence for every rejection, deliberately.
 *
 * A caller learning *which* rule it tripped learns the shape of the network
 * behind this — that a host resolved, that an address was private, that a
 * redirect went somewhere unexpected. The `code` is for this repository's own
 * tests; this is what anyone outside gets.
 */
export const ARTICLE_URL_REJECTED = 'article URL is not an allowed public HTTPS source'

const deny = (code: UrlRejection): UrlCheck => ({ ok: false, code, reason: ARTICLE_URL_REJECTED })

/**
 * Publishers this desk already reads, taken from the source configuration
 * rather than typed out again, so the two cannot drift apart.
 *
 * A host is kept as configured with any leading `www.` dropped, and matches
 * itself or anything under it. Nothing is truncated below what the config
 * names — `ecb.europa.eu` admits the ECB, not all of `europa.eu`.
 */
const fromSources = (): string[] => {
  const hosts = new Set<string>()
  for (const source of SOURCES) {
    for (const candidate of [source.feed, source.homepage, ...(source.alternates ?? [])]) {
      try {
        hosts.add(new URL(candidate).hostname.replace(/^www\./, '').toLowerCase())
      } catch {
        // A malformed entry in the config is not something this file fixes.
      }
    }
  }
  return [...hosts]
}

/**
 * Publishers whose work arrives through an aggregator rather than through a
 * feed of their own. Yahoo's ticker feeds mostly carry other people's
 * journalism, and `attribute()` in dedupe.ts already names these as the ones
 * it carries — so a story that reaches the desk can be read at its source
 * instead of being reduced to its headline.
 *
 * Kept short on purpose. Anything not here still reaches the reader; it just
 * reaches them as the feed's own summary, which is the existing fallback.
 */
const SYNDICATED = ['fool.com', '247wallst.com']

export const ALLOWED_ARTICLE_HOSTS: readonly string[] = [...fromSources(), ...SYNDICATED].sort()

/** Names that never leave the machine, whatever they resolve to. */
const BLOCKED_NAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback'])

const isIpv4 = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host)

/** Anything not routable on the public internet, plus anything malformed —
 *  an address this cannot parse is not one to hand to fetch(). */
function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true

  const [a, b] = parts
  return (
    a === 0 || // this network, and 0.0.0.0
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, which is where cloud metadata lives
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    a >= 224 // multicast and reserved
  )
}

function isPrivateIpv6(bracketed: string): boolean {
  const addr = bracketed.slice(1, -1).toLowerCase()
  if (addr === '::1' || addr === '::') return true
  // Link-local, and both unique-local prefixes.
  if (/^fe[89ab]/.test(addr) || /^f[cd]/.test(addr)) return true
  // ::ffff:127.0.0.1 is loopback wearing an IPv6 hat — and URL normalises it
  // to ::ffff:7f00:1 before this ever sees it, so both spellings are read.
  const dotted = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dotted) return isPrivateIpv4(dotted[1])

  const hex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const high = Number.parseInt(hex[1], 16)
    const low = Number.parseInt(hex[2], 16)
    return isPrivateIpv4([high >> 8, high & 255, low >> 8, low & 255].join('.'))
  }
  return false
}

const allowed = (host: string): boolean =>
  ALLOWED_ARTICLE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))

/**
 * The single gate. Everything the extractor fetches — the URL it was handed
 * and every redirect destination after it — goes through this.
 */
export function checkArticleUrl(raw: string): UrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return deny('malformed')
  }

  // Exactly https. This refuses http, and with it file:, data:, javascript:
  // and everything else in one comparison rather than a blocklist that has to
  // anticipate what it is blocking.
  if (url.protocol !== 'https:') return deny('not-https')

  // Credentials in the authority are the oldest way to make a URL read as one
  // host and resolve to another: https://cnbc.com@example.invalid/.
  if (url.username || url.password) return deny('blocked-host')

  // Only the default port. A publisher does not serve articles from :8080,
  // and an odd port is usually someone reaching for something internal.
  if (url.port !== '' && url.port !== '443') return deny('blocked-host')

  // WHATWG parsing reads the first path segment of `https:///a/b` as the host,
  // so an empty one does not arrive here for https. Kept anyway: it costs a
  // comparison, and it is the guard that would matter if this were ever handed
  // a URL built some other way.
  const host = url.hostname.toLowerCase()
  if (!host) return deny('no-host')
  if (BLOCKED_NAMES.has(host)) return deny('blocked-host')

  if (host.startsWith('[')) {
    if (!host.endsWith(']')) return deny('malformed')
    if (isPrivateIpv6(host)) return deny('blocked-host')
  } else if (isIpv4(host)) {
    if (isPrivateIpv4(host)) return deny('blocked-host')
  }

  // No publisher on the list is reached by address, so a bare literal is
  // refused here even when it is a public one.
  if (!allowed(host)) return deny('not-allowed')

  return { ok: true, url }
}

/**
 * Where a redirect is allowed to land.
 *
 * Following a chain blindly undoes every check above: the first hop passes,
 * and the destination is whatever the publisher — or whoever controls the
 * response — decided. So each hop is resolved against the URL it came from
 * and then put through exactly the same gate.
 */
export function checkRedirect(location: string, from: URL): UrlCheck {
  let next: URL
  try {
    next = new URL(location, from)
  } catch {
    return deny('malformed')
  }
  return checkArticleUrl(next.href)
}
