import { useEffect, useState } from 'react'
import { Chip, Mono, PrimaryButton, SecondaryButton } from './ui'

type Token = { symbol: string; name: string; underlying: string; sector: string }

export const SAMPLE = ['rNVDA', 'rAMD', 'rINTC', 'rMU', 'rTSLA', 'rSPY']

/**
 * The first screen. Nightbrief cannot rank anything against a portfolio it does
 * not have, so this is a gate rather than a settings page — but a reader in a
 * hurry is one tap from a populated desk.
 */
export default function PortfolioGate({
  initial,
  onReady,
  onCancel,
  onClear,
  editing = false,
}: {
  initial: string[]
  onReady: (holdings: string[]) => void
  onCancel?: () => void
  /**
   * Clearing takes effect immediately rather than waiting to be confirmed.
   * "Clear all" means the reader is starting over, and a selection that
   * reappears the moment they leave the screen did not clear anything.
   */
  onClear?: () => void
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
      <p className="font-serif text-display text-paper">
        {editing
          ? 'Change what Nightbrief watches on your behalf. The overnight desk is rebuilt against whatever you leave selected.'
          : 'Tell Nightbrief what you hold. It will work out which of the events that broke while New York was shut actually reach your positions.'}
      </p>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-serif text-caption font-semibold tracking-wide text-paper-mid">
            Your portfolio · {picked.length} selected
          </h2>
          {picked.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setPicked([])
                onClear?.()
              }}
              className="-my-1.5 py-1.5 font-serif text-caption text-paper-mid underline underline-offset-2 hover:text-signal"
            >
              Clear all
            </button>
          )}
        </div>

        {failed ? (
          <p className="font-serif text-body text-inferred">
            The verified listing could not be loaded. Nothing is shown here that
            was not fetched, so there is nothing to pick from until it returns.
          </p>
        ) : tokens.length === 0 ? (
          <Mono className="text-micro text-paper-low">loading the verified listing…</Mono>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tokens.map((t) => (
              <Chip
                key={t.symbol}
                label={t.symbol}
                title={t.name}
                selected={picked.includes(t.symbol)}
                onClick={() => toggle(t.symbol)}
              />
            ))}
          </div>
        )}

        <p className="mt-3 font-serif text-caption text-paper-low">
          Eighteen rToken pairs, read off Bitget on 8 September 2026. The listing
          is longer than this — anything absent is unverified by us, not absent
          from the exchange.
        </p>
      </section>

      <div className="mt-8 flex flex-col gap-3">
        <PrimaryButton disabled={picked.length === 0} onClick={() => onReady(picked)}>
          {picked.length === 0
            ? 'Pick at least one holding'
            : editing
              ? `Rebuild the desk against ${picked.length} holding${picked.length > 1 ? 's' : ''}`
              : `Check the overnight against ${picked.length} holding${picked.length > 1 ? 's' : ''}`}
        </PrimaryButton>

        <SecondaryButton onClick={() => onReady(SAMPLE)}>Use the sample portfolio</SecondaryButton>

        {onCancel && picked.length > 0 && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 font-serif text-caption text-paper-low hover:text-paper-mid"
          >
            Leave it as it was
          </button>
        )}
      </div>
    </div>
  )
}
