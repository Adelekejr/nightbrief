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
  /** Which provider actually answered. Attribution follows the number. */
  provider: string
  providerLabel: string
}

export type PriceLookup =
  | { ok: true; close: Close }
  | { ok: false; ticker: string; reason: string; sample?: string }

const UA = 'Nightdesk/0.1 (research prototype; https://github.com/Adelekejr/nightdesk)'

/**
 * Candidate providers, tried in order. Which of these will serve a request
 * from a datacentre IP is a question about the live network, so it is measured
 * rather than assumed — the same way the news feeds were.
 */
export type Provider = { id: string; label: string; url: (ticker: string) => string }

export const PROVIDERS: Provider[] = [
  {
    id: 'yahoo-chart',
    label: 'Yahoo Finance',
    url: (t) =>
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?interval=1d&range=10d`,
  },
  {
    id: 'stooq',
    label: 'Stooq',
    url: (t) => `https://stooq.com/q/d/l/?s=${encodeURIComponent(t.toLowerCase())}.us&i=d`,
  },
]

/** Yahoo's chart response, reduced to the two fields that matter. */
export function lastCloseFromYahoo(body: string, ticker: string): PriceLookup {
  let parsed: any
  try {
    parsed = JSON.parse(body)
  } catch {
    return { ok: false, ticker, reason: 'not JSON', sample: body.slice(0, 200) }
  }

  const result = parsed?.chart?.result?.[0]
  const stamps: unknown[] = result?.timestamp ?? []
  const closes: unknown[] = result?.indicators?.quote?.[0]?.close ?? []

  // Walk back from the most recent bar: the latest can be null while a
  // session is still forming, and a null must never become a zero.
  for (let i = closes.length - 1; i >= 0; i--) {
    const close = Number(closes[i])
    const stamp = Number(stamps[i])
    if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(stamp)) continue

    return {
      ok: true,
      close: {
        ticker: ticker.toUpperCase(),
        close: Math.round(close * 100) / 100,
        date: new Date(stamp * 1000).toISOString().slice(0, 10),
        provider: 'yahoo-chart',
        providerLabel: 'Yahoo Finance',
      },
    }
  }

  return { ok: false, ticker, reason: 'no usable close in the response' }
}

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
    // Carry a slice of what actually arrived. A public price feed answering
    // 200 with something other than CSV is usually saying something useful,
    // like that it has throttled the caller.
    return { ok: false, ticker, reason: 'unexpected columns', sample: csv.slice(0, 200) }
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

  return {
    ok: true,
    close: {
      ticker: ticker.toUpperCase(),
      close,
      date,
      provider: 'stooq',
      providerLabel: 'Stooq',
    },
  }
}

export async function fetchFrom(
  provider: Provider,
  ticker: string,
  timeoutMs = 6000,
): Promise<PriceLookup> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(provider.url(ticker), {
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: '*/*' },
    })
    if (!res.ok) return { ok: false, ticker, reason: `${provider.id} returned ${res.status}` }

    const body = await res.text()
    return provider.id === 'yahoo-chart'
      ? lastCloseFromYahoo(body, ticker)
      : lastCloseFromCsv(body, ticker)
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      ticker,
      reason: aborted ? `${provider.id} timed out` : `${provider.id} unreachable`,
    }
  } finally {
    clearTimeout(timer)
  }
}

/** First provider that answers with a usable close wins. */
export async function fetchClose(ticker: string, timeoutMs = 6000): Promise<PriceLookup> {
  let last: PriceLookup = { ok: false, ticker, reason: 'no provider tried' }

  for (const provider of PROVIDERS) {
    last = await fetchFrom(provider, ticker, timeoutMs)
    if (last.ok) return last
  }
  return last
}
