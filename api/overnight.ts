import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SOURCES, tickerFeed } from '../lib/sources.js'
import { fetchSource, type FeedItem } from '../lib/rss.js'
import { sessionAt } from '../lib/market.js'
import { categoryOf, resolve, UNIVERSE, type RToken } from '../lib/universe.js'
import { directMatches, rank } from '../lib/match.js'
import { attribute, dedupe } from '../lib/dedupe.js'
import { generateJson, hasKey } from '../lib/gemini.js'

/**
 * Triage gets a fallback chain for the same reason the Brief pipeline has one:
 * a single free-tier call that is merely slow takes the whole indirect-link
 * pass down with it, and the reader loses the layer that finds the connections
 * the text never states.
 *
 * Both rungs were verified usable by real generateContent calls. Per-attempt
 * timeouts are short enough that two attempts still fit inside the function's
 * budget alongside the feed fetches.
 */
const TRIAGE_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] as const
const TRIAGE_TIMEOUT_MS = 14_000
const WINDOW_HOURS = 36
const CANDIDATES = 40
/** Per-holding feeds fan out to one host, so the count is capped. */
const MAX_TICKER_FEEDS = 12

type TriageLinks = { links: Array<{ itemId: string; symbol: string; why: string }> }

const TRIAGE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    links: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          itemId: { type: 'STRING' },
          symbol: { type: 'STRING' },
          why: { type: 'STRING', description: 'One short clause naming the mechanism.' },
        },
        required: ['itemId', 'symbol', 'why'],
      },
    },
  },
  required: ['links'],
}

const TRIAGE_INSTRUCTION = `You are triaging overnight news for a trader who holds tokenized US stocks.

For each story, decide which of the reader's holdings it plausibly touches
THROUGH A REAL MECHANISM — a supplier, a customer, a competitor, a shared
input, a sector-wide cost.

Be sparing. A story that merely mentions technology is not a link to every
technology company. If you cannot name the mechanism in one clause, there is
no link and you should return nothing for that story.

What is most wanted is the connection a reader would miss: the foundry story
that matters to a chip designer, the energy story that matters to a
data-centre operator, the tariff story that matters to a company assembling
hardware abroad. Report those links even when the story also names some other
holding.

Work through every story before answering. Most will link to nothing, and
returning nothing for them is the right answer.

Never invent a figure. The "why" is a mechanism, not a claim about price.`

/**
 * The overnight desk: which events, out of everything that broke while the US
 * market was shut, actually touch this reader's portfolio.
 *
 * Two layers. A deterministic name match, which is a fact the reader can check
 * for themselves, and a model triage pass for links the text never states.
 * Both are reported separately and never merged into one undifferentiated
 * relevance score.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = typeof req.query.holdings === 'string' ? req.query.holdings : ''
  const requested = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 25)

  const held: RToken[] = []
  const unverified: string[] = []
  for (const input of requested) {
    const r = resolve(input)
    if (r.known) {
      if (!held.some((t) => t.symbol === r.token.symbol)) held.push(r.token)
    } else {
      unverified.push(input)
    }
  }

  if (held.length === 0) {
    res.setHeader('cache-control', 'no-store')
    res.status(400).json({
      ok: false,
      reason: 'Name at least one holding from the verified rToken listing.',
      unverified,
    })
    return
  }

  // Recall check. A ticker's own feed is, by construction, news about that
  // company — so running the name matcher over it measures what fraction of
  // stories about a holding we actually recognise. Misses are the point of
  // the output: they name the spellings the alias list lacks. Some misses are
  // correct (a sector story in a ticker's feed need not name the company), so
  // the titles are reported for reading rather than reduced to a score.
  if (req.query.recall === '1') {
    const targets = UNIVERSE
    const rows = await Promise.all(
      targets.map(async (token) => {
        const { result, items } = await fetchSource(tickerFeed(token.underlying), 6000)
        const matched = items.filter((i) => directMatches(i, [token]).length > 0)
        const missed = items.filter((i) => directMatches(i, [token]).length === 0)

        return {
          symbol: token.symbol,
          ok: result.ok,
          items: items.length,
          matched: matched.length,
          missedTitles: missed.slice(0, 6).map((i) => i.title.slice(0, 110)),
        }
      }),
    )

    res.setHeader('cache-control', 'no-store')
    res.status(200).json({
      probedAt: new Date().toISOString(),
      note: 'A ticker feed carries sector stories too, so perfect recall is neither expected nor desirable. Read the missed titles for names the matcher should have caught.',
      rows: rows.sort((a, b) => a.matched / (a.items || 1) - b.matched / (b.items || 1)),
    })
    return
  }

  // Measured rather than asserted: whether Yahoo serves per-ticker feeds to a
  // datacentre IP, and what they cost, decides whether they are worth adding.
  if (req.query.probeTickers === '1') {
    const started = Date.now()
    const tried = await Promise.all(
      held.map(async (t) => {
        const at = Date.now()
        const { result, items } = await fetchSource(tickerFeed(t.underlying), 5000)
        return {
          symbol: t.symbol,
          ticker: t.underlying,
          ok: result.ok,
          status: result.status,
          ms: Date.now() - at,
          items: result.itemCount,
          sampleTitles: items.slice(0, 2).map((i) => i.title),
          sampleLinks: items.slice(0, 2).map((i) => i.link),
        }
      }),
    )
    res.setHeader('cache-control', 'no-store')
    res.status(200).json({ probedAt: new Date().toISOString(), wallMs: Date.now() - started, tried })
    return
  }

  const feedsAt = Date.now()

  // General feeds first: they carry a named publisher's own copy of a story,
  // which should win over a syndicated one when both arrive.
  const [general, perTicker] = await Promise.all([
    Promise.all(SOURCES.map((s) => fetchSource(s))),
    Promise.all(
      held.slice(0, MAX_TICKER_FEEDS).map(async (t) => {
        const { result, items } = await fetchSource(tickerFeed(t.underlying), 4000)
        return {
          result,
          // Yahoo's ticker feeds mostly carry other people's journalism, so the
          // publisher is taken from the link and the route named separately.
          items: items.map((i) => ({ ...i, ...attribute(i.link, 'Yahoo Finance') })),
        }
      }),
    ),
  ])

  const settled = [...general, ...perTicker]
  const feedsMs = Date.now() - feedsAt
  const tickerFeedsLive = perTicker.filter((s) => s.result.ok && s.result.itemCount > 0).length
  const liveSources = general.filter((s) => s.result.ok && s.result.itemCount > 0)
  const cutoff = Date.now() - WINDOW_HOURS * 3_600_000

  const inWindow: FeedItem[] = settled
    .flatMap((s) => s.items)
    .filter((i) => i.publishedAt && new Date(i.publishedAt).getTime() >= cutoff)
    .sort((a, b) => (a.publishedAt! < b.publishedAt! ? 1 : -1))

  // The same story reaches the desk through a market feed and a ticker feed.
  // Left alone it would be ranked twice and inflate whatever it touched.
  const { kept, removed: duplicatesRemoved } = dedupe(inWindow)
  const recent = kept.slice(0, CANDIDATES)

  // The validation report's pipeline metrics. Deliberately stops short of the
  // model call: a page a judge opens to read numbers should not spend the
  // deployment's free-tier quota to render them. Everything below is measured
  // from this fetch, not carried over from a previous one.
  if (req.query.report === '1') {
    const reportedAt = Date.now()
    const ages = recent
      .filter((i) => i.publishedAt)
      .map((i) => (reportedAt - new Date(i.publishedAt!).getTime()) / 60_000)
      .sort((a, b) => a - b)
    const mid = Math.floor(ages.length / 2)

    // A risk proxy, not a measured false-positive rate — that needs a
    // human-labelled sample, which does not exist. A match on a full company
    // name is essentially unambiguous; a match on a bare ticker under four
    // characters is the collision-prone case the standalone-token boundary
    // exists to contain, so counting it separately shows the residual risk
    // rather than hiding it inside one aggregate number.
    const directHits = recent.flatMap((i) => directMatches(i, held))
    const shortTickerHits = directHits.filter(
      (d) => held.some((t) => t.symbol === d.symbol && d.term.length <= 3),
    )

    res.setHeader('cache-control', 'no-store')
    res.status(200).json({
      ok: true,
      reportedAt: new Date(reportedAt).toISOString(),
      windowHours: WINDOW_HOURS,
      feedsMs,
      sources: {
        live: liveSources.map((s) => ({ id: s.result.sourceId, publisher: s.result.publisher })),
        unavailable: general
          .filter((s) => !s.result.ok || s.result.itemCount === 0)
          .map((s) => ({ id: s.result.sourceId, publisher: s.result.publisher })),
        tickerFeedsLive,
        tickerFeedsRequested: perTicker.length,
      },
      duplicates: {
        rawItems: inWindow.length,
        kept: kept.length,
        removed: duplicatesRemoved,
        rate: inWindow.length > 0 ? duplicatesRemoved / inWindow.length : 0,
      },
      freshness:
        ages.length > 0
          ? {
              sampledStories: ages.length,
              medianAgeMinutes: Math.round(ages.length % 2 ? ages[mid] : (ages[mid - 1] + ages[mid]) / 2),
              oldestAgeMinutes: Math.round(ages[ages.length - 1]),
              newestAgeMinutes: Math.round(ages[0]),
            }
          : null,
      matching: {
        directHits: directHits.length,
        shortTickerHits: shortTickerHits.length,
        note: 'shortTickerHits is a collision-risk proxy (a bare ticker of 3 characters or fewer matched as a standalone token), not a confirmed false positive — each one is a real string in the source, checkable by opening it.',
      },
    })
    return
  }

  // Model triage. Degraded rather than broken: if this fails, the deterministic
  // layer still stands on its own and the response says triage was unavailable.
  let triage = new Map<string, Array<{ symbol: string; why: string }>>()
  let triageState: 'ok' | 'unavailable' | 'no-key' = 'no-key'
  let triageDetail: string | undefined
  let rawLinks = 0
  let unknownSymbols: string[] = []
  let triageModel: string = TRIAGE_MODELS[0]
  const triageAttempts: Array<{ model: string; kind: string; detail: string }> = []
  const triageAt = Date.now()

  if (hasKey() && recent.length > 0) {
    const holdingsBlock = held
      .map((t) => `${t.symbol} — ${t.name}. ${t.business}`)
      .join('\n')
    const storiesBlock = recent
      .map((i) => `[${i.id}] ${i.publisher}: ${i.title}`)
      .join('\n')

    const prompt = `THE READER'S HOLDINGS\n\n${holdingsBlock}\n\nOVERNIGHT STORIES\n\n${storiesBlock}`

    let out = await generateJson<TriageLinks>({
      model: TRIAGE_MODELS[0],
      systemInstruction: TRIAGE_INSTRUCTION,
      prompt,
      schema: TRIAGE_SCHEMA,
      timeoutMs: TRIAGE_TIMEOUT_MS,
      maxOutputTokens: 4096,
    })

    for (const model of TRIAGE_MODELS.slice(1)) {
      if (out.ok) break
      // A rate limit applies to the next model too, so trying again only
      // spends the reader's remaining quota to reach the same answer.
      if (out.kind === 'rate-limited') break

      triageAttempts.push({ model: triageModel, kind: out.kind, detail: out.detail })
      triageModel = model
      out = await generateJson<TriageLinks>({
        model,
        systemInstruction: TRIAGE_INSTRUCTION,
        prompt,
        schema: TRIAGE_SCHEMA,
        timeoutMs: TRIAGE_TIMEOUT_MS,
        maxOutputTokens: 4096,
      })
    }

    if (out.ok) {
      triageState = 'ok'
      const grouped = new Map<string, Array<{ symbol: string; why: string }>>()
      rawLinks = (out.data.links ?? []).length
      for (const link of out.data.links ?? []) {
        const r = resolve(link.symbol)
        if (!r.known) {
          unknownSymbols.push(String(link.symbol).slice(0, 12))
          continue
        }
        const list = grouped.get(link.itemId) ?? []
        list.push({ symbol: r.token.symbol, why: String(link.why).slice(0, 240) })
        grouped.set(link.itemId, list)
      }
      triage = grouped
    } else {
      triageState = 'unavailable'
      triageDetail = out.kind === 'rate-limited' ? 'rate limited' : out.detail
    }
  }

  const triageMs = Date.now() - triageAt
  const ranked = rank(recent, held, triage)
  const touched = new Set(ranked.flatMap((e) => e.symbols))

  res.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=900')
  res.status(200).json({
    ok: true,
    checkedAt: new Date().toISOString(),
    marketNow: sessionAt(new Date()),
    windowHours: WINDOW_HOURS,
    timing: { feedsMs, triageMs },
    holdings: {
      verified: held.map((t) => ({ symbol: t.symbol, name: t.name, category: categoryOf(t.sector) })),
      unverified,
      touchedCount: touched.size,
    },
    triage: {
      state: triageState,
      model: triageState === 'ok' ? triageModel : undefined,
      // What was tried before the one that answered, so a degraded pass is
      // diagnosable rather than merely reported.
      attempts: triageAttempts,
      detail: triageDetail,
      // How many links the model proposed, and how many survived. A large gap
      // is worth seeing rather than silently absorbing.
      proposed: rawLinks,
      surfaced: ranked.reduce((n, e) => n + e.inferred.length, 0),
      unknownSymbols: unknownSymbols.slice(0, 8),
    },
    coverage: {
      storiesConsidered: recent.length,
      tickerFeedsLive,
      duplicatesRemoved,
      liveSources: liveSources.map((s) => ({ id: s.result.sourceId, publisher: s.result.publisher })),
      unavailableSources: general
        .filter((s) => !s.result.ok || s.result.itemCount === 0)
        .map((s) => ({ id: s.result.sourceId, publisher: s.result.publisher })),
    },
    events: ranked.slice(0, 12).map((e) => ({
      id: e.item.id,
      title: e.item.title,
      publisher: e.item.publisher,
      via: e.item.via,
      url: e.item.link,
      publishedAt: e.item.publishedAt,
      session: e.item.session,
      summary: e.item.summary,
      score: Math.round(e.score),
      direct: e.direct,
      inferred: e.inferred,
      symbols: e.symbols,
    })),
  })
}
