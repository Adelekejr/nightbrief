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
    <h2 className="mb-3 font-serif text-caption font-semibold tracking-wide text-paper-mid">
      {children}
    </h2>
  )
}

/* ---- controls ---------------------------------------------------------
 * Weight is the only tactility available without shadows, so the primary
 * action takes a solid block of amber and the heaviest text on the page.
 * Everything secondary is a rule and nothing more.
 */

type ButtonProps = {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function PrimaryButton({ children, onClick, disabled, className = '' }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full border border-signal bg-signal py-3.5 font-serif text-lede font-semibold text-signal-on
        hover:bg-signal-deep hover:border-signal-deep
        disabled:border-rule disabled:bg-transparent disabled:text-paper-low ${className}`}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, onClick, disabled, className = '' }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full border border-rule-strong py-3 font-serif text-body text-paper
        hover:border-paper-low disabled:border-rule disabled:text-paper-low ${className}`}
    >
      {children}
    </button>
  )
}

/**
 * A selectable token. Selected inverts to a solid amber block — in print,
 * inversion is what a pressed key looks like, and it needs no shadow to read
 * as depressed.
 *
 * The company name sits next to the ticker rather than only in a hover
 * title: a title is invisible to a thumb, and eighteen bare symbols are hard
 * to scan for anyone who has not memorised what an rToken tracks.
 */
export function Chip({
  label,
  name,
  selected,
  onClick,
}: {
  label: string
  name?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`group flex items-baseline gap-1.5 border px-2.5 py-2 ${
        selected
          ? 'border-signal bg-signal'
          : 'border-rule hover:border-rule-strong'
      }`}
    >
      <Mono
        className={`text-caption ${
          selected ? 'font-medium text-signal-on' : 'text-paper-mid group-hover:text-paper'
        }`}
      >
        {label}
      </Mono>
      {name && (
        <span
          className={`font-serif text-caption ${
            selected ? 'text-signal-on' : 'text-paper-low group-hover:text-paper-mid'
          }`}
        >
          {name}
        </span>
      )}
    </button>
  )
}

/* ---- marks ------------------------------------------------------------ */

const CONFIDENCE_FILLED: Record<Confidence, number> = { high: 3, moderate: 2, low: 1 }

/**
 * Confidence as a printed stamp, not a coloured pill. Three solid bars and the
 * word itself, weighted to be legible at arm's length in bad light — the whole
 * point is that it registers before the sentence next to it is read.
 */
export function ConfidenceMark({ level }: { level: Confidence }) {
  const filled = CONFIDENCE_FILLED[level]

  return (
    <span className="inline-flex shrink-0 items-center gap-2 align-middle">
      <span aria-hidden className="inline-flex gap-[2px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`block h-[5px] w-[11px] ${i < filled ? 'bg-signal' : 'bg-rule-strong'}`}
          />
        ))}
      </span>
      <Mono className="text-micro font-medium tracking-wide text-paper-mid">{level}</Mono>
    </span>
  )
}

/** Retrieved or inferred, stated in words where the type register is not enough. */
export function BasisMark({ basis }: { basis: Basis }) {
  return (
    <Mono
      className={`text-micro font-medium tracking-wide ${
        basis === 'retrieved' ? 'text-paper-mid' : 'text-inferred'
      }`}
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
 * not borrow the visual language of a trading terminal. The glyph sits in a
 * fixed-width slot so a column of exposures aligns on it.
 */
export function SensitivityMark({ direction }: { direction: Sensitivity }) {
  const { glyph, word } = SENSITIVITY[direction] ?? SENSITIVITY.ambiguous

  return (
    <span className="inline-flex items-baseline gap-2">
      <Mono className="w-[0.9em] shrink-0 text-lede font-bold text-signal">{glyph}</Mono>
      <span className="font-serif text-caption text-paper-mid">{word}</span>
    </span>
  )
}

type MetricBasis = 'observed' | 'estimated' | 'targeted'

const METRIC_BASIS: Record<MetricBasis, string> = {
  // Measured, just now or from one dated, named run. The strongest claim.
  observed: 'text-paper-mid',
  // Reasoned from a real but partial or historical measurement — a
  // development-time probe, not something re-checked on every load.
  estimated: 'text-inferred',
  // A stated goal or an invariant enforced in code, not a measurement of
  // anything that happened. Amber, because it is this project's annotation
  // colour rather than a fact one.
  targeted: 'text-signal',
}

/** Same register as BasisMark, extended for a metrics report: a reader
 *  should be able to tell "we measured this" from "we are aiming for this"
 *  as fast as they can tell fact from inference elsewhere in the app. */
export function MetricBasisMark({ basis }: { basis: MetricBasis }) {
  return (
    <Mono className={`text-micro font-medium tracking-wide ${METRIC_BASIS[basis]}`}>
      {basis}
    </Mono>
  )
}

/** A source id, rendered as the machine reference it is. */
export function SourceChip({ id, href }: { id: string; href?: string }) {
  const body = (
    <Mono className="border border-rule-strong px-1.5 py-px text-micro text-paper-mid">{id}</Mono>
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
    <span className="inline-block -rotate-2 border-2 border-signal px-1.5 py-px align-middle">
      <Mono className="text-micro font-bold tracking-wider text-signal">{label}</Mono>
    </span>
  )
}

export function TimeStamp({ iso, session }: { iso: string | null; session?: string | null }) {
  if (!iso) return <Mono className="text-micro text-paper-low">time not stated</Mono>

  const d = new Date(iso)
  const text = Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <Mono className="text-micro text-paper-low">
      {text}
      {session ? ` · ${session}` : ''}
    </Mono>
  )
}
