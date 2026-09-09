import Closes from './Closes'
import { ago } from './states'
import { Heading, Mono, TimeStamp } from './ui'
import type { Session } from './types'

export type RankedEvent = {
  id: string
  title: string
  publisher: string
  url: string
  publishedAt: string | null
  session: Session | null
  summary: string
  score: number
  via?: string
  direct: Array<{ symbol: string; term: string; where: 'title' | 'summary'; broad: boolean }>
  inferred: Array<{ symbol: string; why: string }>
  symbols: string[]
}

export type OvernightResponse = {
  ok: true
  checkedAt: string
  marketNow: Session
  windowHours: number
  holdings: {
    verified: Array<{ symbol: string; name: string }>
    unverified: string[]
    touchedCount: number
  }
  triage: { state: 'ok' | 'unavailable' | 'no-key'; model?: string; detail?: string }
  coverage: {
    storiesConsidered: number
    tickerFeedsLive: number
    duplicatesRemoved: number
    liveSources: Array<{ id: string; publisher: string }>
    unavailableSources: Array<{ id: string; publisher: string }>
  }
  events: RankedEvent[]
}

/**
 * FACT — the story names the holding. The reader can check this themselves.
 * INFERENCE — a mechanism nobody wrote down. Marked as reasoning, not fact.
 *
 * These never share a visual treatment, because the whole point is that a
 * reader can tell them apart without reading carefully.
 */
function WhyItMatters({ event }: { event: RankedEvent }) {
  return (
    <div className="mt-2.5 flex flex-col gap-1.5">
      {event.direct.map((d) => (
        <p key={`d-${d.symbol}`} className="flex flex-wrap items-baseline gap-x-2">
          <Mono className="text-caption font-bold text-signal">{d.symbol}</Mono>
          <Mono className="text-micro tracking-wide text-paper-low">fact</Mono>
          <span className="font-serif text-caption text-paper-mid">
            named in the {d.where === 'title' ? 'headline' : 'story'} as “{d.term}”
          </span>
        </p>
      ))}

      {event.inferred.map((i) => (
        <p
          key={`i-${i.symbol}`}
          className="flex flex-wrap items-baseline gap-x-2 border-l-2 border-inferred/30 pl-2"
        >
          <Mono className="text-caption font-bold text-inferred">{i.symbol}</Mono>
          <Mono className="text-micro tracking-wide text-inferred">inference</Mono>
          <span className="font-serif text-caption text-inferred">{i.why}</span>
        </p>
      ))}
    </div>
  )
}

export default function Overnight({
  data,
  onOpen,
  onBrowse,
  onEdit,
}: {
  data: OvernightResponse
  onOpen: (event: RankedEvent) => void
  onBrowse: () => void
  onEdit: () => void
}) {
  const { holdings, events, coverage, triage } = data
  const total = holdings.verified.length

  return (
    <div>
      {/* The answer to "is there anything I need to know", before anything else. */}
      <p className="font-serif text-page text-paper">
        {events.length === 0 ? (
          <>Nothing overnight reached your holdings.</>
        ) : (
          <>
            <span className="text-signal">{holdings.touchedCount}</span> of your{' '}
            {total} holding{total > 1 ? 's' : ''} {holdings.touchedCount === 1 ? 'was' : 'were'}{' '}
            touched by {events.length} event{events.length > 1 ? 's' : ''} while New York was shut.
          </>
        )}
      </p>

      {events.length === 0 && (
        <p className="mt-4 border-l-2 border-rule pl-3 font-serif text-body text-inferred">
          That is a finding, not a failure. {coverage.storiesConsidered} stories were
          checked against your positions in the last {data.windowHours} hours —
          from {coverage.liveSources.length} market sources
          {coverage.tickerFeedsLive > 0 &&
            `, plus the news filed against ${coverage.tickerFeedsLive} of your own tickers`}
          {' '}— and none of them reached one.
        </p>
      )}

      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Mono className="text-micro text-paper-low">
          checked {ago(data.checkedAt)} · {coverage.storiesConsidered} stories ·{' '}
          {coverage.liveSources.length} market sources
          {coverage.tickerFeedsLive > 0 && ` + ${coverage.tickerFeedsLive} of your own tickers`} ·{' '}
          {data.windowHours}h window
          {coverage.duplicatesRemoved > 0 && ` · ${coverage.duplicatesRemoved} duplicates merged`}
        </Mono>
        {triage.state !== 'ok' && (
          <Mono className="text-micro text-falsify/80">
            indirect-link pass unavailable{triage.detail ? ` (${triage.detail})` : ''} — showing
            named matches only
          </Mono>
        )}
      </p>

      {events.length > 0 && (
        <ol className="mt-8">
          {events.map((e, i) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onOpen(e)}
                className="w-full border-t border-rule py-5 text-left hover:border-rule-strong"
              >
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <Mono className="w-6 shrink-0 text-micro font-medium text-signal">
                    {String(i + 1).padStart(2, '0')}
                  </Mono>
                  <Mono className="text-micro text-paper-low">
                    {e.publisher}
                    {e.via && <span className="text-paper-low"> via {e.via}</span>}
                  </Mono>
                  {e.session?.closed && (
                    <Mono className="text-micro text-signal">market shut</Mono>
                  )}
                </span>

                <span className="mt-2 block font-serif text-lede text-paper">{e.title}</span>

                <WhyItMatters event={e} />

                <span className="mt-2.5 block">
                  <TimeStamp iso={e.publishedAt} session={e.session?.label} />
                </span>

                <span className="mt-3 inline-block border-b border-signal pb-px font-serif text-caption font-medium text-signal">
                  Open the Brief →
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      <section className="mt-10 border-t border-rule pt-5">
        <Heading>Your holdings</Heading>
        <p className="flex flex-wrap gap-1.5">
          {holdings.verified.map((h) => (
            <Mono
              key={h.symbol}
              className={`border px-1.5 py-0.5 text-micro ${
                data.events.some((e) => e.symbols.includes(h.symbol))
                  ? 'border-signal text-signal'
                  : 'border-rule text-paper-low'
              }`}
            >
              {h.symbol}
            </Mono>
          ))}
        </p>
        <p className="mt-2 font-serif text-caption text-paper-low">
          Highlighted holdings were reached by at least one event. The rest were
          checked and not reached.
        </p>
        <div className="mt-5">
          <Closes symbols={holdings.verified.map((h) => h.symbol)} />
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={onBrowse}
            className="w-full border border-rule-strong py-3 font-serif text-body text-paper hover:border-paper-low"
          >
            Browse all stories
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="w-full border border-rule-strong py-3 font-serif text-body text-paper hover:border-paper-low"
          >
            Change holdings
          </button>
        </div>
      </section>
    </div>
  )
}
