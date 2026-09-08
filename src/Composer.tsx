import { useEffect, useState } from 'react'
import type { FeedItem, FeedResponse } from './types'
import { Heading, Mono, TimeStamp } from './ui'

type Token = { symbol: string; name: string; underlying: string; sector: string }

/** A portfolio for the worked example. Shown as sample wherever it appears. */
const SAMPLE = ['rNVDA', 'rAMD', 'rINTC', 'rMU', 'rTSLA', 'rSPY']

export type Submission = {
  holdings: string[]
  title: string
  text: string
  publisher?: string
  url?: string
  publishedAt?: string
}

export default function Composer({
  onSubmit,
  disabled,
}: {
  onSubmit: (s: Submission) => void
  disabled: boolean
}) {
  const [tokens, setTokens] = useState<Token[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [mode, setMode] = useState<'feed' | 'paste'>('feed')
  const [feed, setFeed] = useState<FeedResponse | null>(null)
  const [feedError, setFeedError] = useState(false)
  const [selected, setSelected] = useState<FeedItem | null>(null)
  const [pasted, setPasted] = useState('')

  useEffect(() => {
    fetch('/api/universe')
      .then((r) => r.json())
      .then((d) => setTokens(d.tokens ?? []))
      .catch(() => setTokens([]))

    fetch('/api/feed')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setFeed)
      .catch(() => setFeedError(true))
  }, [])

  const toggle = (symbol: string) =>
    setPicked((p) => (p.includes(symbol) ? p.filter((s) => s !== symbol) : [...p, symbol]))

  const ready =
    picked.length > 0 && (mode === 'feed' ? Boolean(selected) : pasted.trim().length > 20)

  const submit = () => {
    if (!ready || disabled) return

    if (mode === 'feed' && selected) {
      onSubmit({
        holdings: picked,
        title: selected.title,
        text: selected.title,
        publisher: selected.publisher,
        url: selected.link,
        publishedAt: selected.publishedAt ?? undefined,
      })
      return
    }

    const text = pasted.trim()
    onSubmit({ holdings: picked, title: text.slice(0, 160), text })
  }

  return (
    <div>
      {/* ---- holdings ------------------------------------------------ */}
      <section>
        <Heading>What do you hold?</Heading>
        <div className="flex flex-wrap gap-1.5">
          {tokens.map((t) => {
            const on = picked.includes(t.symbol)
            return (
              <button
                key={t.symbol}
                type="button"
                onClick={() => toggle(t.symbol)}
                title={t.name}
                className={`rounded-[2px] border px-2 py-1.5 font-mono text-[12px] transition-colors ${
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

        <div className="mt-2 flex items-baseline gap-4">
          <button
            type="button"
            onClick={() => setPicked(SAMPLE)}
            className="font-serif text-[13px] text-paper/45 underline underline-offset-2 hover:text-signal"
          >
            Use the sample portfolio
          </button>
          {picked.length > 0 && (
            <button
              type="button"
              onClick={() => setPicked([])}
              className="font-serif text-[13px] text-paper/45 underline underline-offset-2 hover:text-signal"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* ---- the event ----------------------------------------------- */}
      <section className="mt-8">
        <Heading>What happened?</Heading>

        <div className="mb-3 flex gap-4 border-b border-rule">
          {(['feed', 'paste'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`-mb-px border-b-2 pb-2 font-serif text-[14px] ${
                mode === m ? 'border-signal text-paper' : 'border-transparent text-paper/45'
              }`}
            >
              {m === 'feed' ? 'From the live feed' : 'Paste your own'}
            </button>
          ))}
        </div>

        {mode === 'feed' ? (
          <FeedList
            feed={feed}
            failed={feedError}
            selected={selected}
            onSelect={setSelected}
          />
        ) : (
          <div>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={5}
              placeholder="Paste a headline or a few paragraphs of an article."
              className="w-full rounded-[2px] border border-rule bg-ink-raised p-3 font-serif text-[15px] leading-relaxed text-paper placeholder:text-paper/30 focus:border-signal/60 focus:outline-none"
            />
            <p className="mt-1.5 font-serif text-[13px] leading-relaxed text-paper/45">
              Pasted text is treated as unverified. It gets labelled that way in
              the brief, because we have not checked where it came from.
            </p>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={submit}
        disabled={!ready || disabled}
        className="mt-8 w-full rounded-[2px] border border-signal bg-signal/10 py-3 font-serif text-[16px] text-signal disabled:border-rule disabled:bg-transparent disabled:text-paper/25"
      >
        {picked.length === 0
          ? 'Pick your holdings first'
          : !ready
            ? mode === 'feed'
              ? 'Now choose a story'
              : 'Now paste something to read'
            : 'Work out what this means'}
      </button>
    </div>
  )
}

function FeedList({
  feed,
  failed,
  selected,
  onSelect,
}: {
  feed: FeedResponse | null
  failed: boolean
  selected: FeedItem | null
  onSelect: (i: FeedItem) => void
}) {
  if (failed) {
    return (
      <p className="font-serif text-[15px] leading-relaxed text-inferred">
        The live feed could not be reached just now. Paste a story instead —
        nothing is shown here that was not actually fetched.
      </p>
    )
  }

  if (!feed) {
    return <Mono className="text-[11px] text-paper/40">fetching the night feed…</Mono>
  }

  // Events that landed while the US market was shut are the reason this
  // exists, so they come first.
  const items = [...feed.items].sort(
    (a, b) => Number(b.session?.closed ?? false) - Number(a.session?.closed ?? false),
  )

  return (
    <div>
      <p className="mb-3 font-mono text-[10px] leading-relaxed text-paper/40">
        {feed.itemCount} stories · live from {feed.liveSources.map((s) => s.publisher).join(', ')}
        {feed.unavailableSources.length > 0 && (
          <>
            {' '}
            · unreachable: {feed.unavailableSources.map((s) => s.publisher).join(', ')}
          </>
        )}
      </p>

      <ul className="max-h-[24rem] overflow-y-auto">
        {items.slice(0, 40).map((item) => {
          const on = selected?.id === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className={`w-full border-t border-rule py-3 text-left ${on ? 'bg-signal/5' : ''}`}
              >
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <Mono className={`text-[10px] ${on ? 'text-signal' : 'text-paper/45'}`}>
                    {item.publisher}
                  </Mono>
                  {item.session?.closed && (
                    <Mono className="text-[10px] text-signal">market shut</Mono>
                  )}
                </span>
                <span className="mt-1 block font-serif text-[15px] leading-snug text-paper/90">
                  {item.title}
                </span>
                <span className="mt-1 block">
                  <TimeStamp iso={item.publishedAt} session={item.session?.label} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
