import { useCallback, useEffect, useRef, useState } from 'react'
import BriefView from './Brief'
import Composer, { type Submission } from './Composer'
import type { AnalysisResponse, Session } from './types'
import { Mono, SampleStamp } from './ui'

type View =
  | { at: 'compose' }
  | { at: 'running'; since: number }
  | { at: 'result'; data: AnalysisResponse }
  | { at: 'error'; kind: string; reason: string }

/** The masthead doubles as the dateline: a night desk stamps the hour it filed. */
function Masthead({ session }: { session: Session | null }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="border-b border-rule pb-5">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-paper">Nightdesk</h1>
      <p className="mt-1 max-w-md font-serif text-[15px] leading-snug text-paper/60">
        What moved while the US market was shut, and which of your tokenized
        holdings it touches.
      </p>
      <p className="mt-3 font-mono text-[11px] tracking-wide text-paper/45">
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        {' · '}
        {Intl.DateTimeFormat().resolvedOptions().timeZone}
        {session && (
          <>
            {' · '}
            <span className={session.closed ? 'text-signal' : ''}>{session.label}</span>
          </>
        )}
      </p>
    </header>
  )
}

/**
 * Honest progress. There is one request in flight, so the interface says so
 * and counts the seconds rather than animating invented sub-steps.
 */
function Working({ since }: { since: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.round((Date.now() - since) / 1000)), 500)
    return () => clearInterval(t)
  }, [since])

  return (
    <div className="mt-10">
      <p className="font-serif text-[18px] leading-relaxed text-paper/85">
        Reading the story, building the chain, checking every claim against its
        source.
      </p>
      <p className="mt-3 font-mono text-[11px] text-paper/45">
        {elapsed}s elapsed · the free model tier usually takes 10 to 30 seconds
      </p>
      <div className="mt-4 h-px w-full bg-rule">
        <div
          className="h-px bg-signal transition-[width] duration-500"
          style={{ width: `${Math.min(95, elapsed * 4)}%` }}
        />
      </div>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<View>({ at: 'compose' })
  const [session, setSession] = useState<Session | null>(null)
  const top = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/feed')
      .then((r) => r.json())
      .then((d) => setSession(d.marketNow ?? null))
      .catch(() => {})
  }, [])

  const showDemo = useCallback(() => {
    fetch('/demo-brief.json')
      .then((r) => r.json())
      .then((data: AnalysisResponse) => {
        setView({ at: 'result', data })
        top.current?.scrollIntoView({ behavior: 'smooth' })
      })
      .catch(() =>
        setView({
          at: 'error',
          kind: 'demo-unavailable',
          reason: 'The worked example could not be loaded.',
        }),
      )
  }, [])

  useEffect(() => {
    if (window.location.hash === '#example') showDemo()
  }, [showDemo])

  const analyse = async (s: Submission) => {
    setView({ at: 'running', since: Date.now() })

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(s),
      })
      const body = await res.json()

      if (res.ok && body.ok) {
        setView({ at: 'result', data: body as AnalysisResponse })
        top.current?.scrollIntoView({ behavior: 'smooth' })
      } else {
        setView({
          at: 'error',
          kind: body.kind ?? String(res.status),
          reason: body.reason ?? 'The brief could not be produced.',
        })
      }
    } catch {
      setView({
        at: 'error',
        kind: 'network',
        reason: 'The request did not complete. Check your connection and try again.',
      })
    }
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[38rem] px-5 py-10">
      <div ref={top} />
      <Masthead session={session} />

      <main className="mt-8">
        {view.at === 'compose' && (
          <>
            <div className="mb-9 border-b border-rule pb-8">
              <p className="font-serif text-[15px] leading-relaxed text-paper/70">
                A judge, or anyone in a hurry, can read a complete worked example
                first — a real story that broke while New York was shut, followed
                all the way to the holdings it touches.
              </p>
              <button
                type="button"
                onClick={showDemo}
                className="mt-3 font-serif text-[15px] text-signal underline underline-offset-4"
              >
                Read the worked example →
              </button>
            </div>
            <Composer onSubmit={analyse} disabled={false} />
          </>
        )}

        {view.at === 'running' && <Working since={view.since} />}

        {view.at === 'result' && (
          <>
            {view.data.captured && (
              <p className="mb-6 flex flex-wrap items-center gap-2">
                <SampleStamp label="Worked example" />
                <span className="font-serif text-[13px] text-paper/55">
                  A real run, captured and replayed.
                </span>
              </p>
            )}
            {view.data.demo && (
              <p className="mb-6 flex flex-wrap items-center gap-2">
                <SampleStamp />
                <span className="font-serif text-[13px] text-paper/55">{view.data.demo}</span>
              </p>
            )}

            <BriefView data={view.data} />

            <button
              type="button"
              onClick={() => setView({ at: 'compose' })}
              className="mt-2 w-full rounded-[2px] border border-rule py-3 font-serif text-[15px] text-paper/70 hover:border-paper/30"
            >
              Write another brief
            </button>
          </>
        )}

        {view.at === 'error' && (
          <div className="mt-6">
            <p className="font-serif text-[18px] leading-relaxed text-paper">
              {view.kind === 'rate-limited'
                ? 'The free model tier is rate limited right now.'
                : 'That did not work.'}
            </p>
            <p className="mt-3 font-serif text-[15px] leading-relaxed text-inferred">
              {view.reason}
            </p>
            <p className="mt-2">
              <Mono className="text-[10px] text-paper/40">{view.kind}</Mono>
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={showDemo}
                className="w-full rounded-[2px] border border-signal py-3 font-serif text-[15px] text-signal"
              >
                Read the worked example instead
              </button>
              <button
                type="button"
                onClick={() => setView({ at: 'compose' })}
                className="w-full rounded-[2px] border border-rule py-3 font-serif text-[15px] text-paper/70"
              >
                Start again
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
