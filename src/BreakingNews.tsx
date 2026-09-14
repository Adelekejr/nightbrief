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
 */

type Props =
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
  if (props.state === 'loading') {
    return (
      <Card tone="neutral">
        <Label trailing="scanning" />
        <p className="mt-2 font-serif text-lede text-paper">
          Reading the overnight window against your holdings.
        </p>
        <p className="mt-1.5 font-serif text-caption text-paper-mid">
          Every live news source, plus the news filed against your own tickers,
          matched by name and then read again for links the stories never state.
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
          Nothing in the last {windowHours} hours was matched to your holdings.
        </p>
        <p className="mt-1.5 font-serif text-caption text-paper-mid">
          The sources were read and nothing in them reached a position you hold.
          What was searched is below.
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

  const { event, holding, basis, because, direction, confidence } = pick
  const { word, tone } = DIRECTION[direction]

  return (
    <Card tone={tone}>
      <Label trailing={`last checked ${ago(checkedAt)}`} />

      <h2 className="mt-2 font-serif text-display text-paper break-words">{event.title}</h2>

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

      {direction === 'unclear' && (
        <p className="mt-1.5 font-serif text-caption text-paper-mid">
          Which way this cuts is settled in the Brief, against the article
          itself. The desk does not guess it from a headline.
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
        <a
          href={event.url}
          target="_blank"
          rel="noreferrer noopener"
          className="border border-rule-strong px-3 py-2 font-serif text-caption text-paper hover:border-paper-low"
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
