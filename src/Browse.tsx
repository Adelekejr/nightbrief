import { useEffect, useState } from 'react'
import type { FeedItem, FeedResponse } from './types'
import { Heading, Mono, TimeStamp } from './ui'

export type BriefRequest = {
  title: string
  text: string
  publisher?: string
  url?: string
  publishedAt?: string
}

/**
 * The secondary surface. The ranked overnight desk answers "does any of this
 * reach me"; this is for when the reader already knows what they want to look
 * at, or wants to hand Nightbrief something it did not fetch.
 */
export default function Browse({ onOpen }: { onOpen: (req: BriefRequest) => void }) {
  const [mode, setMode] = useState<'feed' | 'paste'>('feed')
  const [feed, setFeed] = useState<FeedResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [pasted, setPasted] = useState('')

  useEffect(() => {
    fetch('/api/feed')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setFeed)
      .catch(() => setFailed(true))
  }, [])

  const openItem = (item: FeedItem) =>
    onOpen({
      title: item.title,
      text: item.title,
      publisher: item.publisher,
      url: item.link,
      publishedAt: item.publishedAt ?? undefined,
    })

  return (
    <div>
      <div className="mb-5 flex gap-4 border-b border-rule">
        {(['feed', 'paste'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`-mb-px border-b-2 pb-2 font-serif text-[14px] ${
              mode === m ? 'border-signal text-paper' : 'border-transparent text-paper/45'
            }`}
          >
            {m === 'feed' ? 'Everything fetched' : 'Something else'}
          </button>
        ))}
      </div>

      {mode === 'paste' ? (
        <div>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={6}
            placeholder="Paste a headline, or a few paragraphs of an article."
            className="w-full rounded-[2px] border border-rule bg-ink-raised p-3 font-serif text-[15px] leading-relaxed text-paper placeholder:text-paper/30 focus:border-signal/60 focus:outline-none"
          />
          <p className="mt-2 font-serif text-[13px] leading-relaxed text-paper/45">
            Anything pasted here is treated as unverified — Nightbrief has not
            checked where it came from, and the Brief will say so.
          </p>
          <button
            type="button"
            disabled={pasted.trim().length < 20}
            onClick={() => onOpen({ title: pasted.trim().slice(0, 160), text: pasted.trim() })}
            className="mt-4 w-full rounded-[2px] border border-signal bg-signal/10 py-3 font-serif text-[16px] text-signal disabled:border-rule disabled:bg-transparent disabled:text-paper/25"
          >
            Investigate this
          </button>
        </div>
      ) : failed ? (
        <p className="font-serif text-[15px] leading-relaxed text-inferred">
          The feed could not be reached. Nothing is listed here that was not
          actually fetched, so there is nothing to show until it returns.
        </p>
      ) : !feed ? (
        <Mono className="text-[11px] text-paper/40">fetching…</Mono>
      ) : (
        <div>
          <p className="mb-4 font-mono text-[10px] leading-relaxed text-paper/40">
            {feed.itemCount} stories · live from{' '}
            {feed.liveSources.map((s) => s.publisher).join(', ')}
            {feed.unavailableSources.length > 0 && (
              <> · unreachable: {feed.unavailableSources.map((s) => s.publisher).join(', ')}</>
            )}
          </p>

          <Heading>Not filtered against your holdings</Heading>

          <ul>
            {feed.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className="w-full border-t border-rule py-3.5 text-left hover:bg-paper/[0.02]"
                >
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <Mono className="text-[10px] text-paper/45">{item.publisher}</Mono>
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
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
