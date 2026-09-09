import { useState } from 'react'
import Closes from './Closes'
import PromptEntry from './PromptEntry'
import { ago } from './states'
import { Heading, Mono, TimeStamp } from './ui'
import type { Session } from './types'
import { CATEGORY_LABEL, type Category } from '../lib/universe'

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
    verified: Array<{ symbol: string; name: string; category: Category }>
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
  restoredHoldings,
  onDismissRestored,
  onOpen,
  onBrowse,
  onEdit,
  onExample,
}: {
  data: OvernightResponse
  /** Set only when this portfolio was found already saved on load — never
   *  for one just picked. Null once dismissed, cleared, or replaced. */
  restoredHoldings: string[] | null
  onDismissRestored: () => void
  onOpen: (event: RankedEvent) => void
  onBrowse: () => void
  onEdit: () => void
  onExample: () => void
}) {
  const { holdings, events, coverage, triage } = data
  const total = holdings.verified.length

  const [categoryFilter, setCategoryFilter] = useState<Category | null>(null)
  const heldInFilter = categoryFilter
    ? holdings.verified.filter((h) => h.category === categoryFilter)
    : []
  const heldSymbolsInFilter = new Set(heldInFilter.map((h) => h.symbol))
  const visibleEvents = categoryFilter
    ? events.filter((e) => e.symbols.some((s) => heldSymbolsInFilter.has(s)))
    : events

  const handlePrompt = (id: string) => {
    switch (id) {
      case 'overnight':
        setCategoryFilter(null)
        break
      case 'semiconductors':
        setCategoryFilter('semiconductors')
        break
      case 'large-tech':
        setCategoryFilter('large-tech')
        break
      case 'top-story':
        // The overall top story, never the filtered one — "biggest overnight"
        // means biggest, not biggest-within-whatever-filter-happens-to-be-set.
        if (events[0]) onOpen(events[0])
        break
      case 'example':
        onExample()
        break
    }
  }

  return (
    <div>
      {restoredHoldings && restoredHoldings.length > 0 && (
        <p className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-l-2 border-rule-strong pl-3">
          <span className="font-serif text-caption text-paper-mid">
            Restored portfolio: <Mono className="text-caption text-paper">{restoredHoldings.join(' · ')}</Mono>
          </span>
          <button
            type="button"
            onClick={onDismissRestored}
            aria-label="Dismiss"
            className="font-serif text-caption text-paper-low underline underline-offset-2 hover:text-signal"
          >
            Dismiss
          </button>
        </p>
      )}

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
          /* A narrower search, not an error. Red belongs to falsifiers alone,
             and a reader who sees an error colour reasonably distrusts the
             results underneath it — which would be the wrong lesson, because
             everything shown here is a verifiable name match. */
          <Mono className="text-micro text-paper-mid">
            searched by name only — the pass that finds indirect links did not
            answer this time
          </Mono>
        )}
      </p>

      <div className="mt-6">
        <PromptEntry onSelect={handlePrompt} />
      </div>

      {categoryFilter && (
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-l-2 border-signal pl-3">
          <span className="font-serif text-caption text-paper-mid">
            Showing {CATEGORY_LABEL[categoryFilter].toLowerCase()} only — {heldInFilter.length}{' '}
            of your holdings, {visibleEvents.length} event{visibleEvents.length === 1 ? '' : 's'}.
            {heldInFilter.length === 0 && " You don't hold anything in this category."}
          </span>
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className="font-serif text-caption text-paper-low underline underline-offset-2 hover:text-signal"
          >
            Clear filter
          </button>
        </p>
      )}

      {visibleEvents.length > 0 && (
        <ol className="mt-8">
          {visibleEvents.map((e, i) => (
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

        <p className="mt-5">
          <a href="#/validation" className="font-serif text-caption text-signal underline underline-offset-4">
            How well does this actually work? The validation report →
          </a>
        </p>
      </section>
    </div>
  )
}
