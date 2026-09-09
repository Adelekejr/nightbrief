import { useCallback, useEffect, useRef, useState } from 'react'
import BriefView from './Brief'
import Browse, { type BriefRequest } from './Browse'
import Overnight, { type OvernightResponse, type RankedEvent } from './Overnight'
import PortfolioGate from './PortfolioGate'
import { loadHoldings, navigate, saveHoldings, useRoute } from './routes'
import type { AnalysisResponse, Session } from './types'
import { Mono, SampleStamp } from './ui'

type Async<T> =
  | { at: 'idle' }
  | { at: 'loading'; since: number }
  | { at: 'ready'; data: T }
  | { at: 'failed'; kind: string; reason: string }

function Masthead({ session, onHome }: { session: Session | null; onHome: () => void }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="border-b border-rule pb-5">
      <button type="button" onClick={onHome} className="text-left">
        <h1 className="font-serif text-[28px] font-semibold tracking-tight text-paper">
          Nightdesk
        </h1>
      </button>
      <p className="mt-1 max-w-md font-serif text-[14px] leading-snug text-paper/55">
        Investigates what broke while the US market was shut, and works out
        which of your tokenized holdings it reaches.
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

function Working({ since, what }: { since: number; what: string }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.round((Date.now() - since) / 1000)), 500)
    return () => clearInterval(t)
  }, [since])

  return (
    <div className="mt-10">
      <p className="font-serif text-[18px] leading-relaxed text-paper/85">{what}</p>
      <p className="mt-3 font-mono text-[11px] text-paper/45">{elapsed}s elapsed</p>
      <div className="mt-4 h-px w-full bg-rule">
        <div
          className="h-px bg-signal transition-[width] duration-500"
          style={{ width: `${Math.min(95, elapsed * 3)}%` }}
        />
      </div>
    </div>
  )
}

export default function App() {
  const route = useRoute()
  const [holdings, setHoldings] = useState<string[]>(() => loadHoldings())
  const [overnight, setOvernight] = useState<Async<OvernightResponse>>({ at: 'idle' })
  const [brief, setBrief] = useState<Async<AnalysisResponse>>({ at: 'idle' })
  const [session, setSession] = useState<Session | null>(null)
  const top = useRef<HTMLDivElement>(null)

  const fetchOvernight = useCallback((symbols: string[]) => {
    if (symbols.length === 0) return
    setOvernight({ at: 'loading', since: Date.now() })

    fetch(`/api/overnight?holdings=${encodeURIComponent(symbols.join(','))}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok || !body.ok) throw new Error(body.reason ?? 'The overnight desk did not respond.')
        setOvernight({ at: 'ready', data: body as OvernightResponse })
        setSession(body.marketNow ?? null)
      })
      .catch((err: Error) =>
        setOvernight({ at: 'failed', kind: 'overnight', reason: err.message }),
      )
  }, [])

  // The desk is only meaningful once there is a portfolio to rank against.
  useEffect(() => {
    if (holdings.length > 0 && overnight.at === 'idle') fetchOvernight(holdings)
  }, [holdings, overnight.at, fetchOvernight])

  useEffect(() => {
    if (route.name === 'gate' && holdings.length > 0) navigate('overnight')
  }, [route.name, holdings.length])

  const runBrief = useCallback(
    async (req: BriefRequest) => {
      setBrief({ at: 'loading', since: Date.now() })
      navigate('brief')

      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...req, holdings }),
        })
        const body = await res.json()

        if (res.ok && body.ok) setBrief({ at: 'ready', data: body as AnalysisResponse })
        else
          setBrief({
            at: 'failed',
            kind: body.kind ?? String(res.status),
            reason: body.reason ?? 'The Brief could not be produced.',
          })
      } catch {
        setBrief({
          at: 'failed',
          kind: 'network',
          reason: 'The request did not complete. Check your connection and try again.',
        })
      }
    },
    [holdings],
  )

  const openExample = useCallback(() => {
    navigate('example')
    setBrief({ at: 'loading', since: Date.now() })
    fetch('/demo-brief.json')
      .then((r) => r.json())
      .then((data: AnalysisResponse) => setBrief({ at: 'ready', data }))
      .catch(() =>
        setBrief({
          at: 'failed',
          kind: 'example-unavailable',
          reason: 'The worked example could not be loaded.',
        }),
      )
  }, [])

  const commitHoldings = (picked: string[]) => {
    saveHoldings(picked)
    setHoldings(picked)
    setOvernight({ at: 'idle' })
    navigate('overnight')
  }

  const briefPane = (
    <>
      {brief.at === 'loading' && (
        <Working
          since={brief.since}
          what="Reading the story, tracing how it reaches your holdings, and checking every claim against its source."
        />
      )}

      {brief.at === 'ready' && (
        <>
          {brief.data.captured && (
            <p className="mb-6 flex flex-wrap items-center gap-2">
              <SampleStamp label="Worked example" />
              <span className="font-serif text-[13px] text-paper/55">
                A real run, captured and replayed.
              </span>
            </p>
          )}
          {brief.data.demo && (
            <p className="mb-6 flex flex-wrap items-center gap-2">
              <SampleStamp />
              <span className="font-serif text-[13px] text-paper/55">{brief.data.demo}</span>
            </p>
          )}
          <BriefView data={brief.data} />
          <button
            type="button"
            onClick={() => navigate('overnight')}
            className="mt-2 w-full rounded-[2px] border border-rule py-3 font-serif text-[15px] text-paper/70 hover:border-paper/30"
          >
            Back to the overnight desk
          </button>
        </>
      )}

      {brief.at === 'failed' && (
        <div className="mt-6">
          <p className="font-serif text-[18px] leading-relaxed text-paper">
            {brief.kind === 'rate-limited'
              ? 'The free model tier is rate limited right now.'
              : 'That Brief could not be produced.'}
          </p>
          <p className="mt-3 font-serif text-[15px] leading-relaxed text-inferred">
            {brief.reason}
          </p>
          <p className="mt-2">
            <Mono className="text-[10px] text-paper/40">{brief.kind}</Mono>
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={openExample}
              className="w-full rounded-[2px] border border-signal py-3 font-serif text-[15px] text-signal"
            >
              Read the worked example instead
            </button>
            <button
              type="button"
              onClick={() => navigate('overnight')}
              className="w-full rounded-[2px] border border-rule py-3 font-serif text-[15px] text-paper/70"
            >
              Back to the overnight desk
            </button>
          </div>
        </div>
      )}
    </>
  )

  // Discovery wants width; a finished Brief wants a reading measure.
  const reading = route.name === 'brief' || route.name === 'example'

  return (
    <div
      className={`mx-auto min-h-dvh w-full px-5 py-10 ${reading ? 'max-w-[34rem]' : 'max-w-[38rem]'}`}
    >
      <div ref={top} />
      <Masthead session={session} onHome={() => navigate(holdings.length ? 'overnight' : 'gate')} />

      <main className="mt-8">
        {route.name === 'gate' && (
          <>
            <PortfolioGate initial={holdings} onReady={commitHoldings} />
            <div className="mt-8 border-t border-rule pt-6">
              <p className="font-serif text-[14px] leading-relaxed text-paper/60">
                Or read a complete worked example first — a real story that broke
                while New York was shut, followed all the way to the holdings it
                reaches.
              </p>
              <button
                type="button"
                onClick={openExample}
                className="mt-2 font-serif text-[15px] text-signal underline underline-offset-4"
              >
                Read the worked example →
              </button>
            </div>
          </>
        )}

        {route.name === 'overnight' && (
          <>
            {overnight.at === 'loading' && (
              <Working
                since={overnight.since}
                what="Checking everything that broke overnight against your holdings."
              />
            )}
            {overnight.at === 'ready' && (
              <Overnight
                data={overnight.data}
                onOpen={(e: RankedEvent) =>
                  runBrief({
                    title: e.title,
                    text: e.summary || e.title,
                    publisher: e.publisher,
                    url: e.url,
                    publishedAt: e.publishedAt ?? undefined,
                  })
                }
                onBrowse={() => navigate('browse')}
                onEdit={() => navigate('gate')}
              />
            )}
            {overnight.at === 'failed' && (
              <div className="mt-6">
                <p className="font-serif text-[18px] leading-relaxed text-paper">
                  The overnight desk could not be assembled.
                </p>
                <p className="mt-3 font-serif text-[15px] leading-relaxed text-inferred">
                  {overnight.reason}
                </p>
                <button
                  type="button"
                  onClick={() => fetchOvernight(holdings)}
                  className="mt-6 w-full rounded-[2px] border border-signal py-3 font-serif text-[15px] text-signal"
                >
                  Try again
                </button>
              </div>
            )}
          </>
        )}

        {route.name === 'browse' && <Browse onOpen={runBrief} />}
        {(route.name === 'brief' || route.name === 'example') && briefPane}
      </main>
    </div>
  )
}
