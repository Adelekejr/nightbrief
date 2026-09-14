import type { ReactNode } from 'react'
import { DIRECTION, type BreakingPick } from './breaking'
import type { RankedEvent } from './Overnight'
import { ago } from './states'
import { ConfidenceMark, Mono, TimeStamp } from './ui'

/**
 * The single most important event reaching the portfolio, above the list.
 *
 * Heavier than a story row, lighter than the masthead. Every string on it is
 * either a fixed label or a value that arrived in the overnight response —
 * the headline as published, the publisher, the times, the matched holding,
 * the matcher's own reason. Nothing here is written for the occasion.
 *
 * The card never implies a watch is running. Nightbrief scans when a reader
 * asks it to, so the time it shows is the last scan and says so, and there
 * is no pulse, no blink and no "live".
 *
 * Two modes, one card.
 *
 *   portfolio  above the desk's story list, ranked against holdings the
 *              reader named. Unchanged.
 *   listing    on the landing screen, where there is no portfolio yet. The
 *              same matcher run against the whole verified rToken listing,
 *              through the same selector. Named matches only, and the copy
 *              says whose question it is answering — the listing's, not a
 *              portfolio the reader has not chosen.
 *
 * The frame, the amber, the three states and the scanned-when-you-asked line
 * are the same in both. Only the copy that would otherwise be untrue changes.
 */

type Mode = 'portfolio' | 'listing'

type Props = { mode: Mode } & (
  | { state: 'loading' }
  | { state: 'failed'; onRetry: () => void }
  | {
      state: 'ready'
      /** Null when nothing in the window reached a holding. A real result. */
      pick: BreakingPick<RankedEvent> | null
      checkedAt: string
      windowHours: number
      onOpenBrief: (event: RankedEvent) => void
      onRescan: () => void
    }
)

const RAIL: Record<'rise' | 'fall' | 'neutral', string> = {
  rise: 'border-rise',
  fall: 'border-fall',
  neutral: 'border-signal',
}

/** The frame is the same in all three states, so the card never jumps or
 *  changes shape as the desk resolves — only what is printed inside it. */
function Card({
  tone,
  children,
}: {
  tone: 'rise' | 'fall' | 'neutral'
  children: ReactNode
}) {
  return (
    <section
      aria-label="Breaking"
      className={`settle mb-7 border-l-2 pl-4 ${RAIL[tone]}`}
    >
      {children}
    </section>
  )
}

function Label({ trailing }: { trailing: string }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <Mono className="text-micro font-bold tracking-wider text-signal">BREAKING</Mono>
      <Mono className="text-micro text-paper-low">{trailing}</Mono>
    </p>
  )
}

export default function BreakingNews(props: Props) {
  const listing = props.mode === 'listing'

  if (props.state === 'loading') {
    return (
      <Card tone="neutral">
        <Label trailing="scanning" />
        <p className="mt-2 font-serif text-lede text-paper">
          {listing
            ? 'Reading the overnight window against the verified rToken listing.'
            : 'Reading the overnight window against your holdings.'}
        </p>
        <p className="mt-1.5 font-serif text-caption text-paper-mid">
          {listing
            ? 'Every live news source, matched by name against every rToken this desk has confirmed exists.'
            : 'Every live news source, plus the news filed against your own tickers, matched by name and then read again for links the stories never state.'}
        </p>
      </Card>
    )
  }

  if (props.state === 'failed') {
    return (
      <Card tone="neutral">
        <Label trailing="not checked" />
        <p className="mt-2 font-serif text-lede text-paper">
          The source check did not complete.
        </p>
        <p className="mt-1.5 font-serif text-caption text-paper-mid">
          Nothing is being shown here as fact. The last event this desk found is
          not repeated in its place — it was true of a window that has since
          moved, and showing it again would say it is current.
        </p>
        <button
          type="button"
          onClick={props.onRetry}
          className="mt-3 border border-signal bg-signal px-3 py-2 font-serif text-caption font-semibold text-signal-on hover:border-signal-deep hover:bg-signal-deep"
        >
          Check again
        </button>
      </Card>
    )
  }

  const { pick, checkedAt, windowHours, onOpenBrief, onRescan } = props

  if (!pick) {
    return (
      <Card tone="neutral">
        <Label trailing={`last checked ${ago(checkedAt)}`} />
        <p className="mt-2 font-serif text-lede text-paper">
          {listing
            ? `Nothing in the last ${windowHours} hours named a verified rToken.`
            : `Nothing in the last ${windowHours} hours was matched to your holdings.`}
        </p>
        <p className="mt-1.5 font-serif text-caption text-paper-mid">
          {listing
            ? 'The sources were read and none of them named anything in the listing. Name your holdings below and the desk will look for indirect links as well.'
            : 'The sources were read and nothing in them reached a position you hold. What was searched is below.'}
        </p>
        <button
          type="button"
          onClick={onRescan}
          className="mt-3 border border-rule-strong px-3 py-2 font-serif text-caption text-paper hover:border-paper-low"
        >
          Scan again
        </button>
      </Card>
    )
  }

  const { event, holding, basis, because, direction, confidence, alsoReached } = pick
  const { word, tone } = DIRECTION[direction]

  return (
    <Card tone={tone}>
      <Label trailing={`last checked ${ago(checkedAt)}`} />

      <h2 className="mt-2 font-serif text-display text-paper break-words">{event.title}</h2>

      {/* Whose question this answers, in one line. Three sentences of it stood
          between the headline and the ticker and had to be read past; this
          says the same thing in the space of a caption. What to do about it is
          left to the picker directly below, which is the answer.

          Mono rather than the page's serif: it sits under a serif headline,
          and a second serif paragraph there reads as the story continuing. */}
      {listing && (
        <p className="mt-1.5">
          <Mono className="text-caption text-paper-mid">
            Top story across all 18 rTokens — you haven't set a portfolio yet.
          </Mono>
        </p>
      )}

      {/* Which holding, and why — in the same two registers the story rows
          use, so the card needs no legend of its own. */}
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Mono
          className={`text-caption font-bold ${basis === 'retrieved' ? 'text-signal' : 'text-inferred'}`}
        >
          {holding.symbol}
        </Mono>
        <span className="font-serif text-caption text-paper">{holding.name}</span>
        <Mono
          className={`text-micro tracking-wide ${basis === 'retrieved' ? 'text-paper-low' : 'text-inferred'}`}
        >
          {basis === 'retrieved' ? 'fact' : 'inference'}
        </Mono>
        <span
          className={`font-serif text-caption ${basis === 'retrieved' ? 'text-paper-mid' : 'text-inferred'}`}
        >
          {because}
        </span>
      </p>

      {/* A count, never a row of tickers. One story naming six rTokens would
          otherwise turn the top of the landing screen into a list to work
          through, which is the thing this card exists instead of. */}
      {listing && alsoReached > 0 && (
        <p className="mt-1.5 font-serif text-caption text-paper-mid">
          This story names {alsoReached} other{' '}
          {alsoReached === 1 ? 'rToken' : 'rTokens'} in the listing. The Brief
          carries {alsoReached === 1 ? 'it' : 'them'}.
        </p>
      )}

      <p className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        <span className="flex items-baseline gap-2">
          <Mono className="text-micro tracking-wide text-paper-low">direction</Mono>
          <span className="font-serif text-caption text-paper-mid">{word}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <Mono className="text-micro tracking-wide text-paper-low">confidence</Mono>
          <ConfidenceMark level={confidence} />
        </span>
      </p>

      {/* Where the answer lives is now carried by the direction value itself,
          so this is left saying only the part that value cannot: why there is
          no answer here. */}
      {direction === 'unclear' && (
        <p className="mt-1.5 font-serif text-caption text-paper-mid">
          The desk does not guess direction from a headline.
        </p>
      )}

      <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Mono className="text-micro text-paper-low">
          {event.publisher}
          {event.via && ` via ${event.via}`}
        </Mono>
        <TimeStamp iso={event.publishedAt} session={event.session?.label} />
      </p>

      <div className="mt-3.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOpenBrief(event)}
          className="border border-signal bg-signal px-3 py-2 font-serif text-caption font-semibold text-signal-on hover:border-signal-deep hover:bg-signal-deep"
        >
          Open the full Brief →
        </button>
        {/* A rule at `rule-strong` measures 1.83:1 on the stock — under the
            3:1 WCAG asks of a control's boundary, and it read as a disabled
            control sitting beside the amber one. The border carries the whole
            shape here, since there is no fill, so it is the part that had to
            move; the label was already at 14.9:1 and only wanted the weight
            to match the primary's. */}
        <a
          href={event.url}
          target="_blank"
          rel="noreferrer noopener"
          className="border border-paper-low px-3 py-2 font-serif text-caption font-medium text-paper hover:border-paper-mid"
        >
          Read the source ↗
        </a>
      </div>

      <p className="mt-3">
        <Mono className="text-micro text-paper-low">
          Scanned when you asked. Nothing here updates on its own.
        </Mono>
      </p>
    </Card>
  )
}
