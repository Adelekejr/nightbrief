import type { ReactNode } from 'react'
import { Mono } from './ui'

/**
 * The signature spine, made structural rather than decorative.
 *
 *   EVENT → EVIDENCE → TRANSMISSION → EXPOSURE → CONFIDENCE → GAPS
 *
 * Every Brief walks these six stages in this order, and the rail is always
 * visible at the left edge so a reader knows where they are in the argument
 * and what is still below them. This is the one piece of the layout that never
 * varies between Briefs.
 */
export const STAGES = [
  'event',
  'evidence',
  'transmission',
  'exposure',
  'confidence',
  'gaps',
] as const

export type Stage = (typeof STAGES)[number]

export function StageRail({ current }: { current: Stage }) {
  return (
    <nav aria-label="Where this is in the reasoning" className="flex flex-wrap gap-x-2 gap-y-1">
      {STAGES.map((s, i) => {
        const here = s === current
        const passed = STAGES.indexOf(current) > i
        return (
          <span key={s} className="flex items-baseline gap-2">
            <Mono
              className={`text-[10px] tracking-wide ${
                here ? 'text-signal' : passed ? 'text-paper/35' : 'text-paper/20'
              }`}
            >
              {s}
            </Mono>
            {i < STAGES.length - 1 && (
              <span aria-hidden className="font-mono text-[10px] text-paper/15">
                ›
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}

/** One stage of the argument, anchored to the rail. */
export function StageSection({
  stage,
  title,
  lede,
  children,
}: {
  stage: Stage
  title: string
  lede?: string
  children: ReactNode
}) {
  const index = STAGES.indexOf(stage) + 1

  return (
    <section className="relative mt-11 border-t border-rule pt-5" id={`stage-${stage}`}>
      <div className="mb-4">
        <p className="flex items-baseline gap-2">
          <Mono className="text-[10px] text-signal">
            {String(index).padStart(2, '0')}
          </Mono>
          <Mono className="text-[10px] tracking-wide text-paper/40">{stage}</Mono>
        </p>
        <h2 className="mt-1.5 font-serif text-[19px] leading-snug text-paper">{title}</h2>
        {lede && (
          <p className="mt-1.5 font-serif text-[13px] leading-relaxed text-paper/50">{lede}</p>
        )}
      </div>
      {children}
    </section>
  )
}

/**
 * The three epistemic states, each with its own unmistakable treatment.
 * A reader should never have to work out which one they are looking at.
 */
export function Marker({ kind }: { kind: 'fact' | 'inference' | 'unknown' }) {
  const style = {
    fact: 'text-signal',
    inference: 'text-inferred',
    unknown: 'text-paper/45',
  }[kind]

  return <Mono className={`text-[10px] tracking-wide ${style}`}>{kind}</Mono>
}
