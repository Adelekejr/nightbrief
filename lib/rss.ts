import { XMLParser } from 'fast-xml-parser'
import type { Source } from './sources.js'
import { sessionAt, type Session } from './market.js'

export type FeedItem = {
  /** Stable per item, so a brief can cite exactly what it read. */
  id: string
  sourceId: string
  publisher: string
  /** Named when the story reached us through an aggregator that did not write it. */
  via?: string
  title: string
  link: string
  publishedAt: string | null
  summary: string
  /** Where publication fell relative to the US session. */
  session: Session | null
}

export type SourceResult = {
  sourceId: string
  publisher: string
  /** Named when the story reached us through an aggregator that did not write it. */
  via?: string
  ok: boolean
  status: number | null
  ms: number
  itemCount: number
  error?: string
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
})

const asArray = <T,>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v]

/** Feed values arrive as strings, numbers, or {"#text": …} objects. */
const text = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text'] ?? '')
  }
  return ''
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
}

/**
 * Publishers escape aggressively and inconsistently — MarketWatch ships
 * hex entities, others decimal or named. Undecoded, they reach both the
 * model and the reader as literal noise.
 */
const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    const b = body.toLowerCase()
    if (b.startsWith("#x")) {
      const code = Number.parseInt(b.slice(2), 16)
      return Number.isNaN(code) ? whole : String.fromCodePoint(code)
    }
    if (b.startsWith("#")) {
      const code = Number.parseInt(b.slice(1), 10)
      return Number.isNaN(code) ? whole : String.fromCodePoint(code)
    }
    return NAMED_ENTITIES[b] ?? whole
  })

const stripTags = (html: string): string =>
  decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()

const toIso = (raw: string): string | null => {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Atom links are attribute-bearing objects; RSS links are plain text. */
const atomLink = (link: unknown): string => {
  const candidates = asArray(link) as Array<Record<string, unknown> | undefined>
  for (const l of candidates) {
    const rel = l?.['@_rel']
    if (rel === undefined || rel === 'alternate') return String(l?.['@_href'] ?? '')
  }
  return ''
}

function itemsFrom(xml: string, source: Source): FeedItem[] {
  const doc = parser.parse(xml) as Record<string, any>
  const channel = doc?.rss?.channel ?? doc?.['rdf:RDF'] ?? doc?.feed
  if (!channel) return []

  // RSS 2.0 uses <item>, RDF puts items at the root, Atom uses <entry>.
  const raw = [...asArray(channel.item), ...asArray(channel.entry)]

  return raw.flatMap((entry, i): FeedItem[] => {
    const title = stripTags(text(entry.title))
    const link = text(entry.link) || atomLink(entry.link) || text(entry.id)
    if (!title || !link) return []

    const publishedAt = toIso(
      text(entry.pubDate) ||
        text(entry.published) ||
        text(entry.updated) ||
        text(entry['dc:date']),
    )

    const summary = stripTags(
      text(entry.description) || text(entry.summary) || text(entry['content:encoded']),
    ).slice(0, 600)

    return [
      {
        id: `${source.id}:${i}`,
        sourceId: source.id,
        publisher: source.publisher,
        title,
        link,
        publishedAt,
        summary,
        session: publishedAt ? sessionAt(new Date(publishedAt)) : null,
      },
    ]
  })
}

/**
 * Fetches one source. Never throws: a dead feed is a reportable fact, not a
 * reason to fail the whole request. Nothing is invented to fill the gap.
 */
export async function fetchSource(
  source: Source,
  timeoutMs = 6000,
  /** Probe a candidate URL instead of the configured one. */
  urlOverride?: string,
): Promise<{ result: SourceResult; items: FeedItem[] }> {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const base = { sourceId: source.id, publisher: source.publisher }

  try {
    const res = await fetch(urlOverride ?? source.feed, {
      signal: controller.signal,
      headers: {
        // Several publishers reject unidentified clients outright.
        'user-agent':
          'Nightbrief/0.1 (research prototype; https://github.com/Adelekejr/nightdesk)',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    })

    if (!res.ok) {
      return {
        result: { ...base, ok: false, status: res.status, ms: Date.now() - started, itemCount: 0 },
        items: [],
      }
    }

    const items = itemsFrom(await res.text(), source)
    return {
      result: { ...base, ok: true, status: res.status, ms: Date.now() - started, itemCount: items.length },
      items,
    }
  } catch (err) {
    return {
      result: {
        ...base,
        ok: false,
        status: null,
        ms: Date.now() - started,
        itemCount: 0,
        error: err instanceof Error ? err.name : 'unknown',
      },
      items: [],
    }
  } finally {
    clearTimeout(timer)
  }
}
