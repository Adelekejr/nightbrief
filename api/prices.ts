import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchClose, fetchFrom, PROVIDERS } from '../lib/prices.js'
import { resolve } from '../lib/universe.js'

/**
 * Last closing price of the US-listed shares behind a set of rTokens.
 *
 * Real, dated, and explicitly not a live quote or an rToken price. Tickers are
 * resolved against the verified listing first, so this cannot be used to fetch
 * a price for something Nightbrief has not confirmed exists.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = typeof req.query.holdings === 'string' ? req.query.holdings : ''
  const requested = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 25)

  const underlying = new Map<string, string>() // underlying ticker -> rToken symbol
  for (const input of requested) {
    const r = resolve(input)
    if (r.known) underlying.set(r.token.underlying, r.token.symbol)
  }

  if (underlying.size === 0) {
    res.setHeader('cache-control', 'no-store')
    res.status(400).json({ ok: false, reason: 'No verified holdings named.' })
    return
  }

  // ?probe=1 reports how each provider behaved for one ticker, so a dead
  // price source is diagnosed from measurement rather than guessed at.
  if (req.query.probe === '1') {
    const ticker = [...underlying.keys()][0]
    const tried = await Promise.all(
      PROVIDERS.map(async (provider) => {
        const out = await fetchFrom(provider, ticker, 8000)
        return out.ok
          ? { provider: provider.id, ok: true, close: out.close }
          : { provider: provider.id, ok: false, reason: out.reason, sample: out.sample }
      }),
    )
    res.setHeader('cache-control', 'no-store')
    res.status(200).json({ probedAt: new Date().toISOString(), ticker, tried })
    return
  }

  const looked = await Promise.all([...underlying.keys()].map((t) => fetchClose(t)))

  // Closing prices change once a day; there is no reason to ask again sooner.
  res.setHeader('cache-control', 's-maxage=3600, stale-while-revalidate=86400')
  res.status(200).json({
    ok: true,
    fetchedAt: new Date().toISOString(),
    kind: 'end-of-day close',
    meaning:
      'The last closing price of the US-listed share this rToken tracks. Not a live quote, and not the rToken price — an rToken trades 24/7 and can move apart from the share, especially while the US market is shut.',
    closes: looked
      .filter((l): l is Extract<typeof l, { ok: true }> => l.ok)
      // Attribution travels with each figure: providers are tried in order, so
      // two closes in the same response can come from different sources.
      .map((l) => ({ ...l.close, symbol: underlying.get(l.close.ticker) })),
    unavailable: looked
      .filter((l): l is Extract<typeof l, { ok: false }> => !l.ok)
      .map((l) => ({
        ticker: l.ticker,
        symbol: underlying.get(l.ticker),
        reason: l.reason,
        sample: req.query.debug === '1' ? l.sample : undefined,
      })),
  })
}
