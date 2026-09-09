/**
 * End-of-day closing prices for the US-listed stocks the rTokens track.
 *
 * Source: Stooq, which serves daily CSV without a key. What comes back is a
 * REAL, dated closing price for the underlying share — not a live quote, and
 * emphatically not the rToken's price. An rToken trades around the clock and
 * can drift from the share it tracks, most of all overnight when the US market
 * is shut, which is precisely when this tool is used.
 *
 * That distinction is carried in the type and stated wherever a figure is
 * shown. A number labelled as something it is not would be worse than no
 * number at all.
 */

export type Close = {
  /** The US-listed ticker, e.g. NVDA — never the rToken symbol. */
  ticker: string
  close: number
  /** Trading date of that close, as the source gives it. */
  date: string
}

export type PriceLookup =
  | { ok: true; close: Close }
  | { ok: false; ticker: string; reason: string }

const CSV = (ticker: string) =>
  `https://stooq.com/q/d/l/?s=${encodeURIComponent(ticker.toLowerCase())}.us&i=d`

/**
 * Stooq returns `Date,Open,High,Low,Close,Volume` with the most recent row
 * last. Anything that does not parse as a finite number is rejected rather
 * than coerced — a zero here would read as a price.
 */
export function lastCloseFromCsv(csv: string, ticker: string): PriceLookup {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return { ok: false, ticker, reason: 'no rows returned' }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const dateAt = header.indexOf('date')
  const closeAt = header.indexOf('close')
  if (dateAt === -1 || closeAt === -1) {
    return { ok: false, ticker, reason: 'unexpected columns' }
  }

  const cells = lines[lines.length - 1].split(',')
  const close = Number(cells[closeAt])
  const date = (cells[dateAt] ?? '').trim()

  if (!Number.isFinite(close) || close <= 0) {
    return { ok: false, ticker, reason: 'no usable close in the last row' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, ticker, reason: 'no usable date in the last row' }
  }

  return { ok: true, close: { ticker: ticker.toUpperCase(), close, date } }
}

export async function fetchClose(ticker: string, timeoutMs = 6000): Promise<PriceLookup> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(CSV(ticker), {
      signal: controller.signal,
      headers: {
        'user-agent':
          'Nightdesk/0.1 (research prototype; https://github.com/Adelekejr/nightdesk)',
      },
    })
    if (!res.ok) return { ok: false, ticker, reason: `source returned ${res.status}` }
    return lastCloseFromCsv(await res.text(), ticker)
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return { ok: false, ticker, reason: aborted ? 'source timed out' : 'source unreachable' }
  } finally {
    clearTimeout(timer)
  }
}
