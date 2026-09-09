import { useEffect, useState } from 'react'
import { Mono } from './ui'

type Token = { symbol: string; name: string; underlying: string; sector: string }

export const SAMPLE = ['rNVDA', 'rAMD', 'rINTC', 'rMU', 'rTSLA', 'rSPY']

/**
 * The first screen. Nightdesk cannot rank anything against a portfolio it does
 * not have, so this is a gate rather than a settings page — but a reader in a
 * hurry is one tap from a populated desk.
 */
export default function PortfolioGate({
  initial,
  onReady,
  onCancel,
  editing = false,
}: {
  initial: string[]
  onReady: (holdings: string[]) => void
  onCancel?: () => void
  /** Revisiting an existing portfolio rather than setting one for the first time. */
  editing?: boolean
}) {
  const [tokens, setTokens] = useState<Token[]>([])
  const [picked, setPicked] = useState<string[]>(initial)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch('/api/universe')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => setTokens(d.tokens ?? []))
      .catch(() => setFailed(true))
  }, [])

  const toggle = (symbol: string) =>
    setPicked((p) => (p.includes(symbol) ? p.filter((s) => s !== symbol) : [...p, symbol]))

  return (
    <div>
      <p className="font-serif text-[19px] leading-relaxed text-paper">
        {editing
          ? 'Change what Nightdesk watches on your behalf. The overnight desk is rebuilt against whatever you leave selected.'
          : 'Tell Nightdesk what you hold. It will work out which of the events that broke while New York was shut actually reach your positions.'}
      </p>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-serif text-[13px] font-semibold tracking-wide text-paper/50">
            Your portfolio · {picked.length} selected
          </h2>
          {picked.length > 0 && (
            <button
              type="button"
              onClick={() => setPicked([])}
              className="font-serif text-[13px] text-paper/45 underline underline-offset-2 hover:text-signal"
            >
              Clear all
            </button>
          )}
        </div>

        {failed ? (
          <p className="font-serif text-[15px] leading-relaxed text-inferred">
            The verified listing could not be loaded. Nothing is shown here that
            was not fetched, so there is nothing to pick from until it returns.
          </p>
        ) : tokens.length === 0 ? (
          <Mono className="text-[11px] text-paper/40">loading the verified listing…</Mono>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tokens.map((t) => {
              const on = picked.includes(t.symbol)
              return (
                <button
                  key={t.symbol}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(t.symbol)}
                  title={t.name}
                  className={`rounded-[2px] border px-2.5 py-2 font-mono text-[12px] transition-colors ${
                    on
                      ? 'border-signal bg-signal/10 text-signal'
                      : 'border-rule text-paper/60 hover:border-paper/30'
                  }`}
                >
                  {t.symbol}
                </button>
              )
            })}
          </div>
        )}

        <p className="mt-3 font-serif text-[13px] leading-relaxed text-paper/45">
          Eighteen rToken pairs, read off Bitget on 8 September 2026. The listing
          is longer than this — anything absent is unverified by us, not absent
          from the exchange.
        </p>
      </section>

      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          disabled={picked.length === 0}
          onClick={() => onReady(picked)}
          className="w-full rounded-[2px] border border-signal bg-signal/10 py-3 font-serif text-[16px] text-signal disabled:border-rule disabled:bg-transparent disabled:text-paper/25"
        >
          {picked.length === 0
            ? 'Pick at least one holding'
            : editing
              ? `Rebuild the desk against ${picked.length} holding${picked.length > 1 ? 's' : ''}`
              : `Check the overnight against ${picked.length} holding${picked.length > 1 ? 's' : ''}`}
        </button>

        <button
          type="button"
          onClick={() => onReady(SAMPLE)}
          className="w-full rounded-[2px] border border-rule py-3 font-serif text-[15px] text-paper/70 hover:border-paper/30"
        >
          Use the sample portfolio
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 font-serif text-[14px] text-paper/45 hover:text-paper/70"
          >
            Leave it as it was
          </button>
        )}
      </div>
    </div>
  )
}
