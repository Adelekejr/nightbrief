import { useEffect, useState } from 'react'
import type { MarketContextResponse } from './types'
import { Mono } from './ui'

/**
 * Where the underlying share was trading, for the one holding this Brief
 * reaches most directly.
 *
 * Fetched when a Brief is opened, for a single symbol — never for the whole
 * portfolio and never on page load. The provider publishes no rate ceiling,
 * which makes the ceiling unknown rather than generous.
 *
 * Three things this block must never do, all of them measured rather than
 * assumed (`docs/bitget-mcp-notes.md`):
 *
 *   - imply the figure is current. It is an IEX quote delayed by about a
 *     quarter of an hour, and the age comes from the payload's own timestamp.
 *     The sentence that states it is composed server-side by the adapter, so
 *     this component cannot word it more generously.
 *   - imply Bitget is the source. Bitget served it; IEX printed it. The
 *     attribution string carries both.
 *   - imply it says anything about the rToken. It is the share, not the token,
 *     and the two come apart most while the US market is shut — which is when
 *     this tool is used.
 *
 * A failure renders. It does not vanish, and it never shows the last close
 * from `/api/prices` in its place: two different numbers from two different
 * providers, and swapping one for the other would be a fabrication of exactly
 * the kind the rest of this app exists to prevent.
 */

function useMarketContext(holding: string | null) {
  const [data, setData] = useState<MarketContextResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!holding) return
    let live = true
    setData(null)
    setFailed(false)

    fetch(`/api/market-context?holding=${encodeURIComponent(holding)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((body: MarketContextResponse) => live && setData(body))
      .catch(() => live && setFailed(true))

    return () => {
      live = false
    }
  }, [holding])

  return { data, failed }
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-8" aria-label="Market context">
      <h3 className="mb-3 font-serif text-caption font-semibold tracking-wide text-paper-mid">
        Market context
      </h3>
      {children}
    </section>
  )
}

export default function MarketContext({ holding }: { holding: string | null }) {
  const { data, failed } = useMarketContext(holding)

  if (!holding) return null

  if (failed) {
    return (
      <Frame>
        <p className="font-serif text-caption text-inferred">
          The request for market context did not complete. Nothing is shown in
          its place — the last close below comes from a different provider and
          is a different measurement.
        </p>
      </Frame>
    )
  }

  if (!data) {
    return (
      <Frame>
        <Mono className="text-micro text-paper-low">reading the underlying…</Mono>
      </Frame>
    )
  }

  // The provider answered and could not serve it. Named, timed, and kept on
  // screen: a reader who cannot see that the source was tried cannot tell it
  // apart from a source that was never consulted.
  if (!data.ok) {
    return (
      <Frame>
        <p className="font-serif text-caption text-inferred">
          {data.reason}
          {data.underlying && ` No quote for ${data.underlying} is shown here.`}
        </p>
        {data.attemptedAt && (
          <p className="mt-1.5">
            <Mono className="text-micro text-paper-low">
              {data.servedBy ?? 'The provider'} was asked at{' '}
              {new Date(data.attemptedAt).toISOString().slice(11, 16)} UTC and did
              not answer.
            </Mono>
          </p>
        )}
      </Frame>
    )
  }

  const { underlying, price, previousClose, freshness, provenance, holding: symbol } = data
  const move =
    previousClose !== null && previousClose > 0
      ? Math.round(((price - previousClose) / previousClose) * 1000) / 10
      : null

  return (
    <Frame>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Mono className="text-body font-bold text-signal">{underlying}</Mono>
        <span className="font-serif text-lede text-paper">{price.toFixed(2)}</span>
        {move !== null && (
          <Mono className={`text-caption ${move >= 0 ? 'text-rise' : 'text-fall'}`}>
            {move >= 0 ? '+' : ''}
            {move.toFixed(1)}% on the previous close
          </Mono>
        )}
      </p>

      {/* The share, not the token — said next to the number rather than in a
          footnote, because the footnote is the part nobody reads. */}
      <p className="mt-1.5 font-serif text-caption text-paper-mid">
        The US-listed share behind {symbol}.
      </p>

      {/* Recency and attribution, both composed by the adapter. Neither string
          is assembled here, so no wording in this file can outrun what was
          actually measured. */}
      <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Mono className="text-micro text-paper-low">{freshness}</Mono>
      </p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Mono className="text-micro text-paper-low">{provenance.attribution}</Mono>
      </p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Mono className="text-micro text-paper-low">
          observed{' '}
          {provenance.observedAt
            ? `${new Date(provenance.observedAt).toISOString().slice(11, 16)} UTC`
            : 'time not given'}
          {' · '}
          read {new Date(provenance.retrievedAt).toISOString().slice(11, 16)} UTC
        </Mono>
      </p>

      {/* Required, and carried on the record itself so that removing it here
          would mean deleting a field rather than deleting a sentence. */}
      <p className="mt-2.5 border-l-2 border-rule-strong pl-3 font-serif text-caption text-paper-mid">
        {provenance.doesNotEstablish}
      </p>
    </Frame>
  )
}
