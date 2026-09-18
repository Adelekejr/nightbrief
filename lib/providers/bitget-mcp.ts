/**
 * The only place that knows the Bitget agent MCP wire format.
 *
 * What this returns is a quote for the **US-listed underlying share**, never
 * for the rToken. That distinction is the same one `lib/prices.ts` already
 * carries, and it is carried here too, in the type and in the sentence every
 * record ships with.
 *
 * Three facts about this provider were measured in Phase 1 and are enforced
 * here rather than remembered by whoever writes the interface. They are in
 * `docs/bitget-mcp-notes.md` with the evidence.
 *
 *   1. THE QUOTE IS NEVER CURRENT, and how stale it is depends on the clock.
 *      In-session it is an IEX feed delayed about fifteen minutes, measured
 *      twice at exactly that. Once the market shuts it is simply the last print
 *      of that session and its age keeps growing — forty minutes just after the
 *      close, hours overnight — which is the ordinary case for a tool read
 *      while New York is shut. So the word "live" and the phrase "real-time" do
 *      not appear in this file, and `freshness()` is the only place allowed to
 *      describe recency: it computes the age per reading from the payload's own
 *      timestamp, or says the age is unknown. Hard-coding the fifteen minutes
 *      would have printed a falsehood every night.
 *
 *   2. BITGET IS NOT THE SOURCE. The payload carries `provider: "massive"`
 *      and `source: "iex"`; Bitget is the endpoint that served it. Attribution
 *      follows the same rule this project already applies to syndicated news —
 *      `fool.com via Yahoo Finance`, not "Yahoo Finance". So the attribution
 *      string is "via Bitget, sourced from IEX", and there is no code path
 *      that produces the bare word "Bitget" as an origin.
 *
 *   3. A SESSION IS MANDATORY. A call without `mcp-session-id` is refused, so
 *      every cold invocation costs a handshake plus the query. The timeout
 *      budget below is built for two round trips, not one.
 *
 * Nothing here throws into the UI. A refusal, a timeout and a malformed
 * payload are all typed results that name the provider, because a `null` on
 * this path would render as "no market context" — indistinguishable from a
 * quiet success with nothing to say.
 */

const ENDPOINT = 'https://agent.bitget.com/mcp'
const PROTOCOL_VERSION = '2025-06-18'
const ENTRY_ID = 'equity_price_quote'

/**
 * Budget for the whole two-round-trip sequence. A cold sequence measured
 * ~1.1–1.3s, so 6s is roughly four times the observed cost — enough to absorb
 * a bad minute, short enough that a stalled Bitget can never hold up a Brief.
 * Per-call is the same number: the deadline, not the per-call ceiling, is what
 * actually bounds this.
 */
const TOTAL_BUDGET_MS = 6_000
const CALL_TIMEOUT_MS = 3_500

/**
 * The value is a quarter of an hour behind at best and a whole session behind
 * at worst, so re-fetching it inside a minute buys nothing and spends an
 * unpublished rate budget. Phase 1 saw no `x-ratelimit-*` header of any kind,
 * which means the ceiling is unknown rather than generous.
 */
const CACHE_TTL_MS = 60_000

/** Guards against a pathological payload becoming a parsing problem. */
const MAX_PAYLOAD_BYTES = 256 * 1024

export const BITGET_UNAVAILABLE = 'Bitget market data was not available'

/**
 * Where a value came from, what it is, and what it does not settle.
 *
 * Every field is either observed in the payload or recorded by us at the time
 * of the call. Nothing here is composed for presentation.
 */
export type BitgetProvenance = {
  /** The endpoint we called. Not the origin of the data. */
  servedBy: 'Bitget'
  tool: 'do_query'
  entryId: string
  /** The upstream the payload names, when it names one. `iex` in every run seen. */
  origin: string | null
  /** The intermediary the payload names. `massive` in every run seen. */
  relay: string | null
  /** The one string the interface should print. Never the bare endpoint name. */
  attribution: string
  /** Our clock, when the response arrived. */
  retrievedAt: string
  /** The payload's own time for the value. Null when it carried none. */
  observedAt: string | null
  /** observedAt → retrievedAt, in seconds. Null when there is no observedAt. */
  delaySeconds: number | null
  /**
   * What kind of number this is. Not a close, and not a live quote — a third
   * thing, which is why it needs its own name.
   *
   * Accurate in-session. Once the market shuts the value is the last print of
   * the finished session, which is closer to a close than to a delayed
   * intraday quote, so the name is loose there. It is an internal
   * discriminator and is never rendered, so it misleads no reader today; it
   * would need splitting before anything prints it.
   */
  sourceType: 'delayed-intraday-quote' | 'undated-quote'
  /** Stated on the record so the interface cannot forget to state it. */
  doesNotEstablish: string
}

export type UnderlyingQuote = {
  /** The US-listed ticker, e.g. NVDA. Never an rToken symbol. */
  ticker: string
  price: number
  previousClose: number | null
  provenance: BitgetProvenance
}

export type BitgetFailure = {
  ok: false
  ticker: string
  /** Safe to print. Never carries an internal hostname, path or stack. */
  reason: string
  /** For logs and tests only. */
  detail?: string
  /** A failure is still an observation, and it still has a time and a name. */
  servedBy: 'Bitget'
  attemptedAt: string
}

export type BitgetLookup = { ok: true; quote: UnderlyingQuote } | BitgetFailure

const DOES_NOT_ESTABLISH =
  'This is the underlying US-listed share. It does not establish the rToken’s price, ' +
  'its direction, or the outcome of any trade.'

/** The attribution rule, in one place. Origin first, endpoint second. */
export function attributionFor(origin: string | null, relay: string | null): string {
  if (origin) return `via Bitget, sourced from ${origin.toUpperCase()}`
  // No named upstream is itself a fact worth printing: it means the chain
  // behind the number is not disclosed, which a reader should know.
  if (relay) return `via Bitget, relayed by ${relay} — original source not disclosed`
  return 'via Bitget — original source not disclosed'
}

/**
 * How old the value was when it arrived, in words.
 *
 * The only function permitted to describe recency, and it cannot say "live":
 * there is no branch that produces the word. When the payload carried no time
 * of its own, it says so rather than substituting the retrieval time, because
 * the time we asked is not the time the market printed.
 *
 * The unit scales, because minutes stop being prose long before this value
 * stops growing. An overnight reading printed "Observed 704 minutes before it
 * was read" — arithmetically right and unreadable — and a Monday morning after
 * a long weekend would have reached five figures.
 *
 *   under 90 minutes   minutes, whole        "Observed 42 minutes"
 *   under 48 hours     hours, one decimal    "Observed 11.7 hours"
 *   beyond             days, one decimal     "Observed 2.7 days"
 *
 * The thresholds are read off the ROUNDED value at each step, not the raw
 * seconds, so no reading can land on "90 minutes" or "48.0 hours" — the awkward
 * edge each boundary exists to avoid.
 *
 * `delaySeconds` on the record is untouched and stays exact. This is the
 * human-readable string and nothing computes from it.
 */
export function freshness(provenance: BitgetProvenance): string {
  const { delaySeconds } = provenance
  if (delaySeconds === null) {
    return 'Age unknown — this value arrived without a time of its own.'
  }
  if (delaySeconds < 0) {
    // A clock disagreement, not a prediction. Say the plain thing.
    return 'Observation time disagrees with our clock; treat the age as unknown.'
  }

  const minutes = Math.round(delaySeconds / 60)
  if (minutes < 1) return 'Observed less than a minute before it was read.'
  if (minutes === 1) return 'Observed 1 minute before it was read.'
  if (minutes < 90) return `Observed ${minutes} minutes before it was read.`

  // Rounded to one decimal before the comparison: 47.97 hours reads as 48.0,
  // which belongs in days rather than at the top of the hours range.
  const hours = Math.round(delaySeconds / 360) / 10
  if (hours < 48) return `Observed ${hours.toFixed(1)} hours before it was read.`

  const days = Math.round(delaySeconds / 8_640) / 10
  return `Observed ${days.toFixed(1)} days before it was read.`
}

/**
 * Turn one `do_query` payload into a quote, or into a typed failure.
 *
 * Pure, so the whole shape of this provider is testable against the recorded
 * Phase 1 fixture without touching the network — which is also the only way to
 * test the timeout and malformed branches deterministically.
 */
export function quoteFromPayload(
  text: string,
  ticker: string,
  retrievedAt: string,
): BitgetLookup {
  const fail = (reason: string, detail?: string): BitgetFailure => ({
    ok: false,
    ticker: ticker.toUpperCase(),
    reason,
    ...(detail ? { detail } : {}),
    servedBy: 'Bitget',
    attemptedAt: retrievedAt,
  })

  if (text.length > MAX_PAYLOAD_BYTES) {
    return fail(BITGET_UNAVAILABLE, 'payload exceeded the size guard')
  }

  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    return fail(BITGET_UNAVAILABLE, 'payload was not JSON')
  }

  if (parsed?.success === false || parsed?.error) {
    return fail(BITGET_UNAVAILABLE, 'provider reported an error')
  }

  const results: any[] = parsed?.data?.results ?? []
  if (!Array.isArray(results) || results.length === 0) {
    // An empty result set is a real answer — the provider does not know this
    // symbol — and it is not the same as the provider being down.
    return fail(`Bitget returned no quote for ${ticker.toUpperCase()}`, 'empty results array')
  }

  // Prefer the row that names the symbol we asked for. A provider that
  // silently answers about something else is the failure mode this catches.
  const wanted = ticker.toUpperCase()
  const row =
    results.find((r) => String(r?.symbol ?? '').toUpperCase() === wanted) ?? results[0]

  if (String(row?.symbol ?? '').toUpperCase() !== wanted) {
    return fail(BITGET_UNAVAILABLE, `asked for ${wanted}, payload named ${row?.symbol}`)
  }

  const price = Number(row?.last_price ?? row?.close)
  if (!Number.isFinite(price) || price <= 0) {
    // A zero here would render as a price. Reject rather than coerce.
    return fail(BITGET_UNAVAILABLE, 'no usable price in the payload')
  }

  const prevRaw = Number(row?.prev_close)
  const previousClose = Number.isFinite(prevRaw) && prevRaw > 0 ? round2(prevRaw) : null

  const observedAt = observationTime(row)
  const retrievedMs = Date.parse(retrievedAt)
  const delaySeconds =
    observedAt && Number.isFinite(retrievedMs)
      ? Math.round((retrievedMs - Date.parse(observedAt)) / 1000)
      : null

  // `provider` and `extra` sit INSIDE `data`, alongside `results` — not at the
  // top level beside `success`. Reading them one level too high silently
  // yielded a null origin, which `attributionFor` then rendered as "original
  // source not disclosed" on a payload that disclosed it perfectly well. The
  // top-level fallback is kept only because one recorded shape is thin
  // evidence for where a field will always live.
  const envelope = parsed?.data ?? parsed
  const meta = envelope?.extra?.metadata?.arguments ?? {}
  const origin = stringOrNull(meta?.extra_params?.source)
  const relay = stringOrNull(meta?.provider_choices?.provider ?? envelope?.provider)

  return {
    ok: true,
    quote: {
      ticker: wanted,
      price: round2(price),
      previousClose,
      provenance: {
        servedBy: 'Bitget',
        tool: 'do_query',
        entryId: ENTRY_ID,
        origin,
        relay,
        attribution: attributionFor(origin, relay),
        retrievedAt,
        observedAt,
        delaySeconds,
        sourceType: observedAt ? 'delayed-intraday-quote' : 'undated-quote',
        doesNotEstablish: DOES_NOT_ESTABLISH,
      },
    },
  }
}

/**
 * The payload's own time for the value.
 *
 * `last_timestamp` and `time` were measured agreeing to under a second, so
 * either will do and the ISO string is preferred for being unambiguous.
 *
 * `extra.metadata.timestamp` is deliberately NOT consulted: Phase 1 found it
 * naive, with no zone marker, and eight hours ahead of the UTC wall clock. It
 * is the platform's local processing time. Read as UTC it would place the
 * quote in the future and make the delay look negative.
 */
function observationTime(row: any): string | null {
  const iso = stringOrNull(row?.last_timestamp)
  if (iso) {
    const ms = Date.parse(iso)
    if (Number.isFinite(ms)) return new Date(ms).toISOString()
  }
  const epoch = Number(row?.time)
  if (Number.isFinite(epoch)) {
    const ms = epoch > 1e12 ? epoch : epoch * 1000
    if (ms > 1_000_000_000_000 && ms < 2_500_000_000_000) return new Date(ms).toISOString()
  }
  return null
}

const stringOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null

const round2 = (n: number) => Math.round(n * 100) / 100

/* ------------------------------------------------------------------------ */
/* Network                                                                   */
/* ------------------------------------------------------------------------ */

type CacheEntry = { at: number; lookup: BitgetLookup }
const cache = new Map<string, CacheEntry>()

/** Exposed for tests; a warm serverless instance otherwise keeps this. */
export function clearBitgetCache() {
  cache.clear()
}

type Rpc = { ok: boolean; result?: any; detail?: string }

/**
 * Fetch the latest quote for one US-listed underlying.
 *
 * Failures are typed, never thrown, and never cached — a cached outage would
 * outlive the outage. Successes are cached for a minute.
 */
export async function fetchUnderlyingQuote(
  ticker: string,
  opts: { fetchImpl?: typeof fetch; now?: () => number } = {},
): Promise<BitgetLookup> {
  const doFetch = opts.fetchImpl ?? fetch
  const now = opts.now ?? Date.now
  const key = ticker.toUpperCase()

  const hit = cache.get(key)
  if (hit && now() - hit.at < CACHE_TTL_MS) return hit.lookup

  const deadline = now() + TOTAL_BUDGET_MS
  let sessionId: string | null = null

  const rpc = async (method: string, params: unknown, notification = false): Promise<Rpc> => {
    const remaining = deadline - now()
    if (remaining <= 100) return { ok: false, detail: 'budget exhausted' }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL_VERSION,
      'user-agent': 'Nightbrief/0.1 (research prototype; https://github.com/Adelekejr/nightbrief)',
    }
    if (sessionId) headers['mcp-session-id'] = sessionId

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.min(CALL_TIMEOUT_MS, remaining))
    try {
      const res = await doFetch(ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(
          notification
            ? { jsonrpc: '2.0', method, params }
            : { jsonrpc: '2.0', id: 1, method, params },
        ),
        signal: controller.signal,
      })

      const issued = res.headers.get('mcp-session-id')
      if (issued && !sessionId) sessionId = issued

      if (!res.ok) return { ok: false, detail: `status ${res.status}` }
      if (notification) return { ok: true }

      const body = await res.text()
      const message = parseTransport(body, res.headers.get('content-type') ?? '')
      if (!message) return { ok: false, detail: 'unreadable transport frame' }
      if (message.error) return { ok: false, detail: 'json-rpc error' }
      return { ok: true, result: message.result }
    } catch (err: any) {
      // The endpoint's own words never reach the caller — only whether it was
      // a timeout or a transport failure. A hostname in a UI string is an
      // internal detail leaking through an error path.
      return { ok: false, detail: err?.name === 'AbortError' ? 'timed out' : 'unreachable' }
    } finally {
      clearTimeout(timer)
    }
  }

  const failure = (detail: string): BitgetFailure => ({
    ok: false,
    ticker: key,
    reason: BITGET_UNAVAILABLE,
    detail,
    servedBy: 'Bitget',
    attemptedAt: new Date(now()).toISOString(),
  })

  // Round trip one: the handshake. Mandatory — a query without a session is
  // refused, measured in Phase 1.
  const init = await rpc('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'nightbrief', version: '0.1.0' },
  })
  if (!init.ok) return failure(`handshake: ${init.detail}`)

  await rpc('notifications/initialized', {}, true)

  // Round trip two: the query. One hard-coded read entry — there is no path
  // by which a writing entry could be selected.
  const call = await rpc('tools/call', {
    name: 'do_query',
    arguments: { entry_id: ENTRY_ID, params: { symbol: key } },
  })
  if (!call.ok) return failure(`query: ${call.detail}`)

  const text = textOf(call.result)
  if (!text) return failure('empty content')

  const lookup = quoteFromPayload(text, key, new Date(now()).toISOString())
  if (lookup.ok) cache.set(key, { at: now(), lookup })
  return lookup
}

/** MCP carries its payload in text content blocks. */
function textOf(result: any): string {
  const blocks = result?.content ?? []
  return blocks
    .map((b: any) => (typeof b?.text === 'string' ? b.text : ''))
    .filter(Boolean)
    .join('\n')
}

/** JSON, or the last `data:` frame of an SSE stream. Bitget uses both. */
function parseTransport(raw: string, contentType: string): any | null {
  let text = raw
  if (contentType.includes('text/event-stream')) {
    const frames = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
    if (!frames.length) return null
    text = frames[frames.length - 1]
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
