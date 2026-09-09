import type { FeedItem } from './rss.js'
import type { RToken } from './universe.js'

/**
 * Ranking overnight events against a portfolio.
 *
 * Two layers, kept separate all the way to the screen:
 *
 *   DIRECT   — the story names the company. A string match, checkable by the
 *              reader, and reported as a fact.
 *   INFERRED — the story does not name it, but a model judged the link real.
 *              Reported as inference, never as fact.
 *
 * The second layer is not a luxury. The best brief this project has produced
 * came from a story about TSMC and ASML that never mentions Nvidia; a
 * keyword-only ranking would have scored it zero against a portfolio holding
 * Nvidia and buried it.
 */

export type DirectMatch = {
  symbol: string
  term: string
  where: 'title' | 'summary'
  /** A broad-market index rather than a single company. */
  broad: boolean
}

/**
 * An index ETF is not "mentioned" in the way a company is. Financial copy says
 * "the S&P 500" constantly as a benchmark — "1 S&P 500 Stock We Ignore",
 * "cheaper than the S&P 500" — and none of that is an event touching the
 * index. So a broad holding only matches on the headline, where a passing
 * benchmark reference is far less likely, and it scores lower than a named
 * company when it does.
 */
const isBroad = (token: RToken) => token.sector === 'index-etf'

/** Tickers are short enough to collide with ordinary words, so they must be
 *  matched as standalone uppercase tokens. Names are matched case-insensitively. */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function hits(text: string, token: RToken): string | null {
  // rNVDA / NVDA — uppercase, standalone. Avoids "BE" matching "to be".
  for (const ticker of [token.symbol, token.underlying]) {
    if (new RegExp(`(?<![A-Za-z0-9])${escape(ticker)}(?![A-Za-z0-9])`).test(text)) {
      return ticker
    }
  }

  for (const name of [token.name, ...(token.aliases ?? [])]) {
    if (new RegExp(`(?<![A-Za-z0-9])${escape(name)}(?![A-Za-z0-9])`, 'i').test(text)) {
      return name
    }
  }
  return null
}

export function directMatches(
  item: { title: string; summary?: string },
  held: RToken[],
): DirectMatch[] {
  const found: DirectMatch[] = []

  for (const token of held) {
    const broad = isBroad(token)

    const inTitle = hits(item.title, token)
    if (inTitle) {
      found.push({ symbol: token.symbol, term: inTitle, where: 'title', broad })
      continue
    }

    if (broad) continue // benchmark mentions in body copy are not events

    const inSummary = hits(item.summary ?? '', token)
    if (inSummary) {
      found.push({ symbol: token.symbol, term: inSummary, where: 'summary', broad })
    }
  }
  return found
}

export type RankInput = {
  /** Named companies. */
  directCount: number
  /** Named broad-market indices, which are a weaker signal. */
  broadCount: number
  inferredCount: number
  /** Did the story land while the US cash market was shut? */
  closed: boolean
  publishedAt: string | null
  now: number
}

/**
 * Weights, and why they are what they are.
 *
 * A named company outranks an inferred link, because the reader can verify it.
 * Breadth beats depth: a story touching three holdings matters more than one
 * touching a single holding twice. Events that landed while the market was
 * shut are what this product exists for, so they carry weight of their own.
 * Recency decays over a day and a half and then stops mattering.
 */
export function score(input: RankInput): number {
  const direct = Math.min(input.directCount, 4) * 100
  const broad = Math.min(input.broadCount, 2) * 40
  const inferred = Math.min(input.inferredCount, 4) * 45
  const shut = input.closed ? 30 : 0

  let recency = 0
  if (input.publishedAt) {
    const hours = (input.now - new Date(input.publishedAt).getTime()) / 3_600_000
    if (Number.isFinite(hours)) recency = Math.max(0, 36 - Math.max(0, hours))
  }

  return direct + broad + inferred + shut + recency
}

export type RankedEvent = {
  item: FeedItem
  direct: DirectMatch[]
  inferred: Array<{ symbol: string; why: string }>
  /** Every holding the event touches, by either layer. */
  symbols: string[]
  score: number
}

export function rank(
  items: FeedItem[],
  held: RToken[],
  triage: Map<string, Array<{ symbol: string; why: string }>>,
  now = Date.now(),
): RankedEvent[] {
  const known = new Set(held.map((t) => t.symbol))

  return items
    .map((item): RankedEvent => {
      const direct = directMatches(item, held)
      const directSymbols = new Set(direct.map((d) => d.symbol))

      // A holding already named in the story does not also need inferring.
      const inferred = (triage.get(item.id) ?? []).filter(
        (i) => known.has(i.symbol) && !directSymbols.has(i.symbol),
      )

      return {
        item,
        direct,
        inferred,
        symbols: [...directSymbols, ...inferred.map((i) => i.symbol)],
        score: score({
          directCount: direct.filter((d) => !d.broad).length,
          broadCount: direct.filter((d) => d.broad).length,
          inferredCount: inferred.length,
          closed: item.session?.closed ?? false,
          publishedAt: item.publishedAt,
          now,
        }),
      }
    })
    .filter((e) => e.symbols.length > 0)
    .sort((a, b) => b.score - a.score)
}
