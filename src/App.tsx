import { useEffect, useState } from 'react'

type Health = {
  ok: boolean
  service: string
  stage: string
  checkedAt: string
  env: { geminiKey: boolean }
}

/** The masthead doubles as the dateline: a night desk stamps the hour it filed. */
function Masthead() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const local = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <header className="border-b border-rule pb-5">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-paper">
        Nightdesk
      </h1>
      <p className="mt-1 max-w-md font-serif text-[15px] leading-snug text-paper/60">
        What moved while the US market was shut, and which of your tokenized
        holdings it touches.
      </p>
      <p className="mt-3 font-mono text-[11px] tracking-wide text-paper/45">
        {local} · {tz} · US cash market closed
      </p>
    </header>
  )
}

function StatusRow({ label, state }: { label: string; state: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5 last:border-b-0">
      <span className="font-serif text-[15px] text-paper/80">{label}</span>
      <span className="shrink-0 font-mono text-[11px] tracking-wide text-paper/45">
        {state}
      </span>
    </div>
  )
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setHealth)
      .catch(() => setFailed(true))
  }, [])

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[38rem] px-5 py-10">
      <Masthead />

      <main className="mt-8">
        <p className="font-mono text-[11px] tracking-wide text-signal">
          Scaffold · no analysis pipeline yet
        </p>
        <p className="mt-3 font-serif text-lg leading-relaxed text-paper/90">
          This URL is live so the demo exists before the deadline, not on it.
          Nothing on this page is market data, because there is no market data
          here yet — the extraction and reasoning pipeline is still being built.
        </p>

        <section className="mt-8">
          <h2 className="font-serif text-[13px] font-semibold tracking-wide text-paper/50">
            Build state
          </h2>
          <div className="mt-2">
            <StatusRow label="Public URL" state="live" />
            <StatusRow
              label="Serverless functions"
              state={failed ? 'unreachable' : health ? 'reachable' : 'checking'}
            />
            <StatusRow
              label="Model key (server-side)"
              state={
                failed
                  ? 'unknown'
                  : health
                    ? health.env.geminiKey
                      ? 'configured'
                      : 'not set'
                    : 'checking'
              }
            />
            <StatusRow label="News sources" state="not wired" />
            <StatusRow label="Price data" state="not wired" />
          </div>
        </section>

        <p className="mt-8 border-l-2 border-rule pl-3 font-serif text-[15px] leading-relaxed text-inferred">
          Nightdesk is a research tool. It never places an order, holds no keys
          to any exchange, and does not tell anyone what to buy or sell.
        </p>
      </main>
    </div>
  )
}
