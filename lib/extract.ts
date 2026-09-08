/**
 * Pulls the readable body out of a news page.
 *
 * The feed gives one syndicated sentence, which caps how far the reasoning can
 * go: a chain built from a headline is a chain built from very little. Fetching
 * the article itself gives the model something to reason over — and gives the
 * validator a much larger pool of real figures to check claims against, which
 * makes the fabrication check stricter rather than looser.
 *
 * Publishers block scrapers routinely, so failure is expected and reported
 * rather than hidden. When the body cannot be read, the summary is used and
 * the interface says the body was not retrieved.
 */

export type Extraction =
  | { ok: true; text: string; chars: number; ms: number }
  | { ok: false; reason: string; ms: number }

const STRIP_BLOCKS = /<(script|style|noscript|svg|form|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
}

const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    const b = body.toLowerCase()
    if (b.startsWith('#x')) {
      const c = Number.parseInt(b.slice(2), 16)
      return Number.isNaN(c) ? whole : String.fromCodePoint(c)
    }
    if (b.startsWith('#')) {
      const c = Number.parseInt(b.slice(1), 10)
      return Number.isNaN(c) ? whole : String.fromCodePoint(c)
    }
    return NAMED[b] ?? whole
  })

/**
 * Paragraphs only. Navigation, promos and cookie notices are rarely wrapped in
 * <p> with real sentences in them, and short fragments are dropped, which
 * removes most of what survives.
 */
export function paragraphsFrom(html: string, maxChars = 6000): string {
  const cleaned = html.replace(STRIP_BLOCKS, ' ')
  const paragraphs: string[] = []

  for (const match of cleaned.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = decode(match[1].replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      // Inline links leave a gap before punctuation once their tags go:
      // "Samsung and TSMC , the world's biggest". Quotes are checked verbatim
      // against this text, so tidying here keeps them clean too.
      .replace(/\s+([,.;:!?%])/g, '$1')
      // "<a>ASML</a>'s" leaves "ASML 's" once the tag goes.
      .replace(/\s+([’'])(s\b|\s)/g, '$1$2')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .trim()

    // Real prose, not a caption or a "Sign up" fragment.
    if (text.length < 60 || !/[.!?]/.test(text)) continue
    paragraphs.push(text)
  }

  const seen = new Set<string>()
  const unique = paragraphs.filter((p) => !seen.has(p) && seen.add(p))

  let out = ''
  for (const p of unique) {
    if (out.length + p.length + 1 > maxChars) break
    out += (out ? '\n' : '') + p
  }
  return out
}

export async function extractArticle(url: string, timeoutMs = 8000): Promise<Extraction> {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent':
          'Nightdesk/0.1 (research prototype; https://github.com/Adelekejr/nightdesk)',
        accept: 'text/html,application/xhtml+xml',
      },
    })

    if (!res.ok) return { ok: false, reason: `publisher returned ${res.status}`, ms: Date.now() - started }

    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('html')) return { ok: false, reason: 'not an HTML page', ms: Date.now() - started }

    const text = paragraphsFrom(await res.text())
    if (text.length < 200) {
      return { ok: false, reason: 'no readable article body found', ms: Date.now() - started }
    }

    return { ok: true, text, chars: text.length, ms: Date.now() - started }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      reason: aborted ? 'publisher timed out' : 'could not reach the publisher',
      ms: Date.now() - started,
    }
  } finally {
    clearTimeout(timer)
  }
}
