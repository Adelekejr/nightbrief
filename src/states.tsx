import { useEffect, useState } from 'react'
import { Mono } from './ui'

/** How long ago, in words. Freshness matters more than a raw timestamp here. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return 'time not stated'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return 'time not stated'

  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Honest progress.
 *
 * There is one request in flight, so the interface names the steps that
 * request performs and counts real seconds. It does not animate steps
 * completing, because it does not know when they complete — inventing that
 * would be the same sin as inventing a figure.
 */
export function Working({
  since,
  headline,
  steps,
}: {
  since: number
  headline: string
  steps: string[]
}) {
  const [elapsed, setElapsed] = useState(0)
  const still = elapsed >= 45

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.round((Date.now() - since) / 1000)), 500)
    return () => clearInterval(t)
  }, [since])

  return (
    <div className="mt-10" role="status" aria-live="polite">
      <p className="font-serif text-[18px] leading-relaxed text-paper/85">{headline}</p>

      <ul className="mt-4 space-y-1.5">
        {steps.map((s) => (
          <li key={s} className="flex items-baseline gap-2">
            <Mono className="text-[10px] text-paper/25">·</Mono>
            <span className="font-serif text-[14px] leading-relaxed text-paper/55">{s}</span>
          </li>
        ))}
      </ul>

      <p className="mt-5 font-mono text-[11px] text-paper/45">
        {elapsed}s elapsed · typically 15 to 40 seconds on the free model tier
      </p>

      {still && (
        <p className="mt-2 font-serif text-[14px] leading-relaxed text-inferred">
          Still working. The free tier queues requests when it is busy, and this
          one has not been dropped.
        </p>
      )}

      <div className="mt-4 h-px w-full bg-rule" aria-hidden>
        <div
          className={`h-px bg-signal ${prefersReducedMotion() ? '' : 'transition-[width] duration-500'}`}
          style={{ width: `${Math.min(95, elapsed * 3)}%` }}
        />
      </div>
    </div>
  )
}

type Copy = { title: string; body: string; retry: boolean }

/**
 * Failures explained in terms of what happened and what the reader can do,
 * never as a bare code. The code is still shown, small, for anyone who wants it.
 */
export function failureCopy(kind: string, reason: string): Copy {
  switch (kind) {
    case 'rate-limited':
      return {
        title: 'The free model tier is rate limited right now.',
        body: 'Nightdesk runs on Gemini’s free tier, which allows a limited number of requests per day. The worked example below is a real run captured earlier, and shows the same flow end to end.',
        retry: false,
      }
    case 'model-unavailable':
      return {
        title: 'No model was available to write this Brief.',
        body: 'Every model in the fallback chain reported itself busy. This is upstream capacity, not a fault in your request — the same Brief will usually work a few minutes later.',
        retry: true,
      }
    case 'no-key':
      return {
        title: 'This deployment has no model key configured.',
        body: 'The reasoning step cannot run without one. Everything that does not need a model — the feed, the ranking by name, the verified listing — still works.',
        retry: false,
      }
    case 'no-verified-holdings':
      return {
        title: 'None of those symbols are in the verified listing.',
        body: 'Nightdesk only reasons about rTokens it has confirmed exist. Rather than guess at an unrecognised symbol, it declines the request.',
        retry: false,
      }
    case 'network':
      return {
        title: 'The request did not complete.',
        body: 'Nothing was received back. This is usually a connection dropping mid-request rather than a problem at the other end.',
        retry: true,
      }
    default:
      return { title: 'That did not work.', body: reason, retry: true }
  }
}

/** What the three confidence levels are actually claiming. */
export function ConfidenceLegend() {
  return (
    <dl className="grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-1.5">
      {[
        ['high', 'Stated in the source, or following from it by a mechanism that is hard to dispute.'],
        ['moderate', 'A reasonable reading, but resting on a step the source does not state.'],
        ['low', 'Plausible and worth knowing, but the evidence is thin. Treat as a prompt to check, not a finding.'],
      ].map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-mono text-[11px] text-paper/50">{k}</dt>
          <dd className="font-serif text-[13px] leading-relaxed text-paper/65">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
