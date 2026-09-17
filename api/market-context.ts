import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchUnderlyingQuote, freshness } from '../lib/providers/bitget-mcp.js'
import { resolve } from '../lib/universe.js'

/**
 * Market context for ONE holding in ONE open Brief.
 *
 * Deliberately a single-symbol endpoint. The desk lists eighteen rTokens and a
 * Brief can reach several holdings, so a batch version of this would be called
 * for all of them the moment a page loaded — which is exactly what the brief
 * for this work forbids, and what an unpublished rate budget punishes. One
 * holding, on demand, after a reader has opened something.
 *
 * The ticker is resolved against the verified listing first, so this cannot be
 * used to fetch a quote for a symbol Nightbrief has not confirmed exists. That
 * is the same guard `/api/prices` applies, for the same reason.
 *
 * Yahoo and Stooq are untouched by this route. `/api/prices` still serves the
 * last close, and nothing here falls back to it: a Bitget outage must read as a
 * Bitget outage, never as Yahoo's number wearing Bitget's name.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = typeof req.query.holding === 'string' ? req.query.holding : ''
  const asked = raw.trim()

  // Never cached at the edge. The adapter holds its own short cache, and a CDN
  // copy would outlive the minute that cache is willing to vouch for.
  res.setHeader('cache-control', 'no-store')

  if (!asked) {
    res.status(400).json({ ok: false, reason: 'Name one holding.' })
    return
  }

  const found = resolve(asked)
  if (!found.known) {
    res.status(404).json({
      ok: false,
      reason: `${asked.toUpperCase()} is not in the verified rToken listing.`,
    })
    return
  }

  const { symbol, name, underlying } = found.token
  const lookup = await fetchUnderlyingQuote(underlying)

  if (!lookup.ok) {
    // A failure is a rendered state, not an absent one. It carries the name of
    // who did not answer and when, because "no market context" and "the
    // provider was down" are different things to a reader.
    res.status(200).json({
      ok: false,
      holding: symbol,
      name,
      underlying,
      reason: lookup.reason,
      servedBy: lookup.servedBy,
      attemptedAt: lookup.attemptedAt,
    })
    return
  }

  const { quote } = lookup
  res.status(200).json({
    ok: true,
    holding: symbol,
    name,
    underlying: quote.ticker,
    price: quote.price,
    previousClose: quote.previousClose,
    // Composed once, server-side, by the only module allowed to describe
    // recency — so no interface can accidentally call this figure current.
    freshness: freshness(quote.provenance),
    provenance: quote.provenance,
  })
}
