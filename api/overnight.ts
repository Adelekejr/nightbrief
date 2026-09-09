import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SOURCES } from '../lib/sources.js'
import { fetchSource, type FeedItem } from '../lib/rss.js'
import { sessionAt } from '../lib/market.js'
import { resolve, type RToken } from '../lib/universe.js'
import { rank } from '../lib/match.js'
import { generateJson, hasKey } from '../lib/gemini.js'

const TRIAGE_MODEL = 'gemini-3.5-flash-lite'
const WINDOW_HOURS = 36
const CANDIDATES = 40

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

Stories that already name a holding are handled elsewhere, so do not bother
reporting those. What is wanted from you is the connection a reader would
miss: the foundry story that matters to a chip designer, the energy story
that matters to a data-centre operator.

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

  const settled = await Promise.all(SOURCES.map((s) => fetchSource(s)))
  const liveSources = settled.filter((s) => s.result.ok && s.result.itemCount > 0)
  const cutoff = Date.now() - WINDOW_HOURS * 3_600_000

  const recent: FeedItem[] = settled
    .flatMap((s) => s.items)
    .filter((i) => i.publishedAt && new Date(i.publishedAt).getTime() >= cutoff)
    .sort((a, b) => (a.publishedAt! < b.publishedAt! ? 1 : -1))
    .slice(0, CANDIDATES)

  // Model triage. Degraded rather than broken: if this fails, the deterministic
  // layer still stands on its own and the response says triage was unavailable.
  let triage = new Map<string, Array<{ symbol: string; why: string }>>()
  let triageState: 'ok' | 'unavailable' | 'no-key' = 'no-key'
  let triageDetail: string | undefined

  if (hasKey() && recent.length > 0) {
    const holdingsBlock = held
      .map((t) => `${t.symbol} — ${t.name}. ${t.business}`)
      .join('\n')
    const storiesBlock = recent
      .map((i) => `[${i.id}] ${i.publisher}: ${i.title}`)
      .join('\n')

    const out = await generateJson<{ links: Array<{ itemId: string; symbol: string; why: string }> }>({
      model: TRIAGE_MODEL,
      systemInstruction: TRIAGE_INSTRUCTION,
      prompt: `THE READER'S HOLDINGS\n\n${holdingsBlock}\n\nOVERNIGHT STORIES\n\n${storiesBlock}`,
      schema: TRIAGE_SCHEMA,
      timeoutMs: 25_000,
      maxOutputTokens: 4096,
    })

    if (out.ok) {
      triageState = 'ok'
      const grouped = new Map<string, Array<{ symbol: string; why: string }>>()
      for (const link of out.data.links ?? []) {
        const r = resolve(link.symbol)
        if (!r.known) continue
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

  const ranked = rank(recent, held, triage)
  const touched = new Set(ranked.flatMap((e) => e.symbols))

  res.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=900')
  res.status(200).json({
    ok: true,
    checkedAt: new Date().toISOString(),
    marketNow: sessionAt(new Date()),
    windowHours: WINDOW_HOURS,
    holdings: {
      verified: held.map((t) => ({ symbol: t.symbol, name: t.name })),
      unverified,
      touchedCount: touched.size,
    },
    triage: { state: triageState, model: triageState === 'ok' ? TRIAGE_MODEL : undefined, detail: triageDetail },
    coverage: {
      storiesConsidered: recent.length,
      liveSources: liveSources.map((s) => ({ id: s.result.sourceId, publisher: s.result.publisher })),
      unavailableSources: settled
        .filter((s) => !s.result.ok || s.result.itemCount === 0)
        .map((s) => ({ id: s.result.sourceId, publisher: s.result.publisher })),
    },
    events: ranked.slice(0, 12).map((e) => ({
      id: e.item.id,
      title: e.item.title,
      publisher: e.item.publisher,
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
