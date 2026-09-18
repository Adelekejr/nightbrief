import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  attributionFor,
  BITGET_UNAVAILABLE,
  clearBitgetCache,
  fetchUnderlyingQuote,
  freshness,
  quoteFromPayload,
} from '../lib/providers/bitget-mcp.ts'

/**
 * The fixture is the real payload recorded in Phase 1, byte for byte, not a
 * shape written from the documentation. Everything below is measured against
 * what the provider actually sent — including its Pydantic deprecation
 * warnings and its mislabelled `market: "a_share"`, both of which are in the
 * file precisely because a composed fixture would have omitted them.
 */
const FIXTURE = readFileSync(
  new URL('./fixtures/bitget-equity-price-quote-AAPL.json', import.meta.url),
  'utf8',
)

/** Fifteen minutes after the fixture's own `last_timestamp`. */
const READ_AT = '2026-09-17T19:26:28.000Z'

test('reads the price and the previous close off the recorded payload', () => {
  const out = quoteFromPayload(FIXTURE, 'aapl', READ_AT)
  assert.equal(out.ok, true)
  assert.equal(out.ok && out.quote.ticker, 'AAPL')
  assert.equal(out.ok && out.quote.price, 337.1)
  assert.equal(out.ok && out.quote.previousClose, 332.41)
})

test('carries the payload’s own observation time, not the time we asked', () => {
  const out = quoteFromPayload(FIXTURE, 'AAPL', READ_AT)
  assert.ok(out.ok)
  assert.equal(out.quote.provenance.observedAt, '2026-09-17T19:11:25.619Z')
  assert.equal(out.quote.provenance.retrievedAt, READ_AT)
  // The measured fifteen-minute IEX delay, derived rather than asserted.
  assert.equal(out.quote.provenance.delaySeconds, 902)
  assert.equal(out.quote.provenance.sourceType, 'delayed-intraday-quote')
})

test('ignores extra.metadata.timestamp, which is naive and eight hours ahead', () => {
  const out = quoteFromPayload(FIXTURE, 'AAPL', READ_AT)
  assert.ok(out.ok)
  // Reading that field as UTC would put the quote in the future and make the
  // delay negative. The observation time must come from the result row.
  assert.doesNotMatch(out.quote.provenance.observedAt ?? '', /2026-09-18/)
  assert.ok((out.quote.provenance.delaySeconds ?? -1) > 0)
})

test('attribution names the origin and never presents Bitget as the source', () => {
  const out = quoteFromPayload(FIXTURE, 'AAPL', READ_AT)
  assert.ok(out.ok)
  const { attribution, origin, relay, servedBy } = out.quote.provenance
  assert.equal(origin, 'iex')
  assert.equal(relay, 'massive')
  assert.equal(servedBy, 'Bitget')
  assert.equal(attribution, 'via Bitget, sourced from IEX')
})

test('an undisclosed upstream is printed as undisclosed, not as Bitget', () => {
  assert.equal(attributionFor(null, 'massive'),
    'via Bitget, relayed by massive — original source not disclosed')
  assert.equal(attributionFor(null, null), 'via Bitget — original source not disclosed')
  // The failure mode this guards: a bare "Bitget" reading as the origin.
  assert.doesNotMatch(attributionFor(null, null), /sourced from/)
})

test('no wording this module can produce calls the value live or real-time', () => {
  const out = quoteFromPayload(FIXTURE, 'AAPL', READ_AT)
  assert.ok(out.ok)
  const printable = [
    // Every band of the scale, not just the one the fixture happens to land in.
    ...[null, -10, 0, 902, 5400, 42240, 225000].map((s) =>
      freshness({ ...out.quote.provenance, delaySeconds: s }),
    ),
    out.quote.provenance.attribution,
    out.quote.provenance.doesNotEstablish,
    out.quote.provenance.sourceType,
  ].join(' ')
  assert.doesNotMatch(printable, /\blive\b/i)
  assert.doesNotMatch(printable, /real[- ]?time/i)
})

/** The real provenance shape, with only the age swapped. */
function aged(delaySeconds: number | null) {
  const out = quoteFromPayload(FIXTURE, 'AAPL', READ_AT)
  assert.ok(out.ok)
  return { ...out.quote.provenance, delaySeconds }
}

test('freshness reads in minutes under ninety of them', () => {
  assert.equal(freshness(aged(0)), 'Observed less than a minute before it was read.')
  assert.equal(freshness(aged(60)), 'Observed 1 minute before it was read.')
  assert.equal(freshness(aged(902)), 'Observed 15 minutes before it was read.')
  assert.equal(freshness(aged(89 * 60)), 'Observed 89 minutes before it was read.')
})

test('past ninety minutes it reads in hours, to one decimal', () => {
  assert.equal(freshness(aged(90 * 60)), 'Observed 1.5 hours before it was read.')
  // The reading that prompted this: 704 minutes, arithmetically right and
  // unreadable as prose.
  assert.equal(freshness(aged(704 * 60)), 'Observed 11.7 hours before it was read.')
  assert.equal(freshness(aged(47 * 3600)), 'Observed 47.0 hours before it was read.')
})

test('past two days it reads in days, to one decimal', () => {
  assert.equal(freshness(aged(48 * 3600)), 'Observed 2.0 days before it was read.')
})

test('a weekend-scale gap reads in days, never in thousands of minutes', () => {
  // Friday's 16:00 ET close, read Monday morning in Lagos: 62.5 hours.
  const weekend = Math.round(62.5 * 3600)
  assert.equal(freshness(aged(weekend)), 'Observed 2.6 days before it was read.')
  // What the old formatting would have printed here, and the reason for this
  // whole change.
  assert.doesNotMatch(freshness(aged(weekend)), /\d{3,} minutes/)
})

test('no reading can land on the awkward edge of a band', () => {
  // 47.97 hours rounds to 48.0, which belongs in days rather than at the top
  // of the hours range. The threshold is read off the rounded value for
  // exactly this case.
  assert.equal(freshness(aged(Math.round(47.97 * 3600))), 'Observed 2.0 days before it was read.')
  // And the minutes boundary: 89.6 minutes rounds to 90, so it crosses.
  assert.equal(freshness(aged(Math.round(89.6 * 60))), 'Observed 1.5 hours before it was read.')
  for (const seconds of [0, 60, 902, 5340, 5400, 42240, 169200, 172800, 225000]) {
    const line = freshness(aged(seconds))
    assert.doesNotMatch(line, /\b90 minutes\b/)
    assert.doesNotMatch(line, /\b48\.0 hours\b/)
  }
})

test('delaySeconds itself is untouched by the formatting', () => {
  // The scaling is presentation only. Anything computing from the record must
  // still get the exact figure.
  const out = quoteFromPayload(FIXTURE, 'AAPL', READ_AT)
  assert.ok(out.ok)
  assert.equal(out.quote.provenance.delaySeconds, 902)
  assert.equal(typeof out.quote.provenance.delaySeconds, 'number')
})

test('every record says what it does not establish', () => {
  const out = quoteFromPayload(FIXTURE, 'AAPL', READ_AT)
  assert.ok(out.ok)
  assert.match(out.quote.provenance.doesNotEstablish, /underlying US-listed share/)
  assert.match(out.quote.provenance.doesNotEstablish, /does not establish the rToken/)
})

/* --- the four failure shapes Phase 2 asks for -------------------------- */

test('a response missing a timestamp is dated by nothing and says so', () => {
  const stripped = JSON.parse(FIXTURE)
  delete stripped.data.results[0].last_timestamp
  delete stripped.data.results[0].time

  const out = quoteFromPayload(JSON.stringify(stripped), 'AAPL', READ_AT)
  assert.ok(out.ok, 'a dateless quote is still a real value, not a failure')
  assert.equal(out.quote.provenance.observedAt, null)
  assert.equal(out.quote.provenance.delaySeconds, null)
  assert.equal(out.quote.provenance.sourceType, 'undated-quote')
  // The retrieval time must NOT be substituted for the observation time.
  assert.equal(freshness(out.quote.provenance),
    'Age unknown — this value arrived without a time of its own.')
})

test('an empty result set is a real answer about the symbol, not an outage', () => {
  const empty = JSON.parse(FIXTURE)
  empty.data.results = []
  const out = quoteFromPayload(JSON.stringify(empty), 'ZZZZ', READ_AT)
  assert.equal(out.ok, false)
  // Distinguishable from the provider being down, because a reader acts on
  // the two differently.
  assert.equal(out.ok === false && out.reason, 'Bitget returned no quote for ZZZZ')
  assert.notEqual(out.ok === false && out.reason, BITGET_UNAVAILABLE)
})

test('a malformed payload fails without throwing', () => {
  for (const junk of ['', 'not json at all', '{"data":', '<html>blocked</html>']) {
    const out = quoteFromPayload(junk, 'AAPL', READ_AT)
    assert.equal(out.ok, false)
    assert.equal(out.ok === false && out.reason, BITGET_UNAVAILABLE)
    assert.equal(out.ok === false && out.servedBy, 'Bitget')
    assert.equal(out.ok === false && out.attemptedAt, READ_AT)
  }
})

test('a price that is absent, zero or unparseable is rejected, never coerced', () => {
  for (const bad of [undefined, 0, -3, 'n/a', null]) {
    const broken = JSON.parse(FIXTURE)
    broken.data.results[0].last_price = bad
    broken.data.results[0].close = bad
    const out = quoteFromPayload(JSON.stringify(broken), 'AAPL', READ_AT)
    assert.equal(out.ok, false, `expected rejection for last_price=${String(bad)}`)
  }
})

test('a payload answering about a different symbol is refused', () => {
  const swapped = JSON.parse(FIXTURE)
  swapped.data.results[0].symbol = 'MSFT'
  const out = quoteFromPayload(JSON.stringify(swapped), 'AAPL', READ_AT)
  assert.equal(out.ok, false)
})

test('a provider-reported error is a failure even with status 200', () => {
  const errored = JSON.parse(FIXTURE)
  errored.success = false
  errored.error = 'upstream unavailable'
  const out = quoteFromPayload(JSON.stringify(errored), 'AAPL', READ_AT)
  assert.equal(out.ok, false)
})

/* --- the network path, against a stub ---------------------------------- */

/** Replays the recorded payload over the transport Bitget actually uses. */
function stubFetch(opts: { failAt?: string; timeoutAt?: string } = {}) {
  const calls: string[] = []
  const impl = (async (_url: string, init: any) => {
    const method = JSON.parse(init.body).method
    calls.push(method)

    if (opts.timeoutAt === method) {
      const err: any = new Error('aborted')
      err.name = 'AbortError'
      throw err
    }
    if (opts.failAt === method) {
      return new Response('nope', { status: 503, headers: { 'content-type': 'text/plain' } })
    }
    if (method === 'initialize') {
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'bitget-mcp-server' } } }),
        { status: 200, headers: { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' } },
      )
    }
    if (method === 'notifications/initialized') return new Response(null, { status: 202 })
    return new Response(
      `data: ${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: FIXTURE }] },
      })}\n\n`,
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    )
  }) as unknown as typeof fetch

  return { impl, calls }
}

test('a cold call handshakes first, then queries — two round trips', async () => {
  clearBitgetCache()
  const stub = stubFetch()
  const out = await fetchUnderlyingQuote('AAPL', { fetchImpl: stub.impl, now: () => Date.parse(READ_AT) })

  assert.equal(out.ok, true)
  assert.equal(out.ok && out.quote.price, 337.1)
  assert.deepEqual(stub.calls, ['initialize', 'notifications/initialized', 'tools/call'])
})

test('the SSE form of the reply is read, not only the JSON form', async () => {
  clearBitgetCache()
  const stub = stubFetch()
  const out = await fetchUnderlyingQuote('AAPL', { fetchImpl: stub.impl, now: () => Date.parse(READ_AT) })
  assert.ok(out.ok, 'tools/call answers as text/event-stream and must still parse')
})

test('a timeout is a typed failure that names the provider, never a throw', async () => {
  clearBitgetCache()
  const stub = stubFetch({ timeoutAt: 'tools/call' })
  const out = await fetchUnderlyingQuote('AAPL', { fetchImpl: stub.impl, now: () => Date.parse(READ_AT) })

  assert.equal(out.ok, false)
  assert.equal(out.ok === false && out.reason, BITGET_UNAVAILABLE)
  assert.equal(out.ok === false && out.servedBy, 'Bitget')
  assert.match(out.ok === false ? (out.detail ?? '') : '', /timed out/)
})

test('a refused handshake never reaches the query', async () => {
  clearBitgetCache()
  const stub = stubFetch({ failAt: 'initialize' })
  const out = await fetchUnderlyingQuote('AAPL', { fetchImpl: stub.impl, now: () => Date.parse(READ_AT) })

  assert.equal(out.ok, false)
  assert.deepEqual(stub.calls, ['initialize'])
})

test('no failure leaks the endpoint host or path into a printable string', async () => {
  clearBitgetCache()
  const stub = stubFetch({ failAt: 'tools/call' })
  const out = await fetchUnderlyingQuote('AAPL', { fetchImpl: stub.impl, now: () => Date.parse(READ_AT) })
  assert.equal(out.ok, false)
  assert.doesNotMatch(out.ok === false ? out.reason : '', /agent\.bitget\.com|\/mcp|https?:/)
})

test('a success is cached; a failure is not', async () => {
  clearBitgetCache()
  const at = Date.parse(READ_AT)

  const first = stubFetch()
  await fetchUnderlyingQuote('AAPL', { fetchImpl: first.impl, now: () => at })
  const second = stubFetch()
  const cached = await fetchUnderlyingQuote('AAPL', { fetchImpl: second.impl, now: () => at + 1_000 })
  assert.ok(cached.ok)
  assert.deepEqual(second.calls, [], 'a warm read inside the TTL should not call out')

  // A cached outage would outlive the outage, so failures must always retry.
  clearBitgetCache()
  const down = stubFetch({ failAt: 'initialize' })
  await fetchUnderlyingQuote('AAPL', { fetchImpl: down.impl, now: () => at })
  const retry = stubFetch()
  const recovered = await fetchUnderlyingQuote('AAPL', { fetchImpl: retry.impl, now: () => at + 1_000 })
  assert.ok(retry.calls.length > 0, 'a failure must never be cached')
  assert.equal(recovered.ok, true)
})

test('the cache expires', async () => {
  clearBitgetCache()
  const at = Date.parse(READ_AT)
  const first = stubFetch()
  await fetchUnderlyingQuote('AAPL', { fetchImpl: first.impl, now: () => at })

  const later = stubFetch()
  await fetchUnderlyingQuote('AAPL', { fetchImpl: later.impl, now: () => at + 61_000 })
  assert.ok(later.calls.length > 0, 'past the TTL it must call out again')
})

test('the total budget bounds the sequence rather than each call', async () => {
  clearBitgetCache()
  const at = Date.parse(READ_AT)
  let clock = at
  const stub = stubFetch()
  // Every call burns four seconds: the handshake fits, the query cannot.
  const out = await fetchUnderlyingQuote('AAPL', {
    fetchImpl: stub.impl,
    now: () => (clock += 4_000),
  })
  assert.equal(out.ok, false)
  assert.match(out.ok === false ? (out.detail ?? '') : '', /budget exhausted/)
})
