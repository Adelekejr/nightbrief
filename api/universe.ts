import type { VercelRequest, VercelResponse } from '@vercel/node'
import { categoryOf, UNIVERSE, UNIVERSE_SOURCE } from '../lib/universe.js'

/**
 * The verified rToken listing, served rather than bundled, so the interface
 * and the analysis reason over exactly the same list — and so its provenance
 * travels with it.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 's-maxage=86400, stale-while-revalidate=604800')
  res.status(200).json({
    source: UNIVERSE_SOURCE,
    count: UNIVERSE.length,
    tokens: UNIVERSE.map((t) => ({
      symbol: t.symbol,
      name: t.name,
      underlying: t.underlying,
      sector: t.sector,
      category: categoryOf(t.sector),
    })),
  })
}
