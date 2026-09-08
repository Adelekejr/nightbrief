import type { ReactNode } from 'react'
import type { Basis, Confidence, Sensitivity } from './types'

/**
 * The typographic system carries the epistemics.
 *
 * Monospace means machine-retrieved: tickers, times, source ids, figures.
 * Serif means prose the model wrote. A reader can tell fact from inference at
 * a glance, half awake, without consulting a legend.
 */

export function Mono({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono ${className}`}>{children}</span>
}

/** Section heading. Sentence case — no all-caps eyebrow labels. */
export function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 font-serif text-[13px] font-semibold tracking-wide text-paper/50">
      {children}
    </h2>
  )
}

const CONFIDENCE_FILLED: Record<Confidence, number> = { high: 3, moderate: 2, low: 1 }

/**
 * Confidence as a printed stamp, not a coloured pill. Three segments and the
 * word itself, so it survives being read in bad light on a phone.
 */
export function ConfidenceMark({ level }: { level: Confidence }) {
  const filled = CONFIDENCE_FILLED[level]

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 align-middle">
      <span aria-hidden className="inline-flex gap-[2px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`block h-[3px] w-[7px] ${i < filled ? 'bg-signal' : 'bg-paper/20'}`}
          />
        ))}
      </span>
      <Mono className="text-[10px] tracking-wide text-paper/55">{level}</Mono>
    </span>
  )
}

/**
 * Retrieved or inferred, stated in words. The surrounding type does the
 * heavier lifting; this removes any remaining doubt.
 */
export function BasisMark({ basis }: { basis: Basis }) {
  return (
    <Mono
      className={`text-[10px] tracking-wide ${basis === 'retrieved' ? 'text-paper/55' : 'text-inferred/80'}`}
    >
      {basis}
    </Mono>
  )
}

const SENSITIVITY: Record<Sensitivity, { glyph: string; word: string }> = {
  'sensitive-positive': { glyph: '+', word: 'sensitive, upward' },
  'sensitive-negative': { glyph: '−', word: 'sensitive, downward' },
  ambiguous: { glyph: '±', word: 'cuts both ways' },
}

/**
 * Deliberately not red and green. This tool never says buy or sell, so it does
 * not borrow the visual language of a trading terminal. What is described is
 * how a holding tends to respond — a sensitivity, not a recommendation.
 */
export function SensitivityMark({ direction }: { direction: Sensitivity }) {
  const { glyph, word } = SENSITIVITY[direction] ?? SENSITIVITY.ambiguous

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <Mono className="text-[13px] text-signal">{glyph}</Mono>
      <span className="font-serif text-[13px] text-paper/70">{word}</span>
    </span>
  )
}

/** A source id, rendered as the machine reference it is. */
export function SourceChip({ id, href }: { id: string; href?: string }) {
  const body = (
    <Mono className="rounded-[2px] border border-rule px-1 py-px text-[10px] text-paper/60">
      {id}
    </Mono>
  )
  return href ? (
    <a href={href} target="_blank" rel="noreferrer noopener" className="hover:text-signal">
      {body}
    </a>
  ) : (
    body
  )
}

/**
 * An overprint stamp, angled and hard to miss — not a grey chip in a corner.
 * Anything not retrieved live wears one of these next to the thing itself.
 */
export function SampleStamp({ label = 'Sample data' }: { label?: string }) {
  return (
    <span className="inline-block -rotate-2 border border-signal/60 px-1.5 py-px align-middle">
      <Mono className="text-[10px] font-bold tracking-wider text-signal">{label}</Mono>
    </span>
  )
}

export function TimeStamp({ iso, session }: { iso: string | null; session?: string | null }) {
  if (!iso) return <Mono className="text-[11px] text-paper/40">time not stated</Mono>

  const d = new Date(iso)
  const text = Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <Mono className="text-[11px] text-paper/45">
      {text}
      {session ? ` · ${session}` : ''}
    </Mono>
  )
}
