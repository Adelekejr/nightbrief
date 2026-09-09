import type { FeedItem } from './rss.js'

/**
 * The same story arrives more than once.
 *
 * A Micron story reaches the desk through MarketWatch's feed and again through
 * Micron's own ticker feed, usually at a different URL with different tracking
 * parameters and sometimes a slightly different headline. Left alone it would
 * appear twice and be ranked twice, which would quietly inflate whatever it
 * touched.
 */

/** Tracking parameters differ per feed and say nothing about the story. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url)
    u.search = ''
    u.hash = ''
    u.hostname = u.hostname.replace(/^www\./, '')
    return `${u.hostname}${u.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

/** Headlines are re-punctuated in syndication; the words survive. */
export function canonicalTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[‘’“”'"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Keeps the first occurrence of each story. Callers pass the more
 * authoritative feeds first, so a named publisher's own copy wins over a
 * syndicated one.
 */
export function dedupe(items: FeedItem[]): { kept: FeedItem[]; removed: number } {
  const seenUrl = new Set<string>()
  const seenTitle = new Set<string>()
  const kept: FeedItem[] = []
  let removed = 0

  for (const item of items) {
    const url = canonicalUrl(item.link)
    const title = canonicalTitle(item.title)

    if (seenUrl.has(url) || (title.length > 20 && seenTitle.has(title))) {
      removed++
      continue
    }

    seenUrl.add(url)
    if (title) seenTitle.add(title)
    kept.push(item)
  }

  return { kept, removed }
}

/**
 * Who actually published a story that arrived through an aggregator.
 *
 * Yahoo's ticker feeds mostly carry other people's journalism — Fool,
 * 247wallst, Investopedia. Labelling those "Yahoo Finance" would misattribute
 * the work and misstate provenance, so the publisher is taken from the link
 * itself and the route is named separately.
 */
export function attribute(link: string, aggregator: string): { publisher: string; via?: string } {
  let host: string
  try {
    host = new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return { publisher: aggregator }
  }

  if (host.endsWith('yahoo.com')) return { publisher: aggregator }
  return { publisher: host, via: aggregator }
}
