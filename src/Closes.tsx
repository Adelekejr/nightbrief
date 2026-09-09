import { useEffect, useState } from 'react'
import type { Close, PricesResponse } from './types'
import { Mono } from './ui'

/**
 * Last closing prices for the shares behind a set of rTokens.
 *
 * Two things this must never do: imply the figure is live, and imply it is the
 * rToken's price. It is neither. Both the date and the distinction are stated
 * next to the numbers rather than in a footnote somewhere else.
 */
export function useCloses(symbols: string[]) {
  const [data, setData] = useState<PricesResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const key = symbols.join(',')

  useEffect(() => {
    if (!key) return
    let live = true

    fetch(`/api/prices?holdings=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((body: PricesResponse) => live && setData(body))
      .catch(() => live && setFailed(true))

    return () => {
      live = false
    }
  }, [key])

  return { data, failed }
}

export default function Closes({ symbols }: { symbols: string[] }) {
  const { data, failed } = useCloses(symbols)

  if (failed) {
    return (
      <p className="font-serif text-caption text-inferred">
        Closing prices could not be fetched. None are shown rather than a stale
        one being presented as current.
      </p>
    )
  }

  if (!data) return <Mono className="text-micro text-paper-low">fetching closes…</Mono>

  const byDate = new Map<string, Close[]>()
  for (const c of data.closes) byDate.set(c.date, [...(byDate.get(c.date) ?? []), c])

  return (
    <div>
      {data.closes.length > 0 && (
        <ul className="divide-y divide-rule border-y border-rule">
          {data.closes.map((c) => (
            <li key={c.symbol} className="flex items-baseline justify-between gap-4 py-2">
              <Mono className="text-caption text-paper-mid">
                {c.symbol}
                <span className="text-paper-low"> · {c.ticker}</span>
              </Mono>
              <Mono className="text-caption text-paper">
                {c.close.toFixed(2)}
                <span className="text-paper-low"> USD · {c.date}</span>
              </Mono>
            </li>
          ))}
        </ul>
      )}

      {data.unavailable.length > 0 && (
        <p className="mt-2 font-mono text-micro text-paper-low">
          no close for {data.unavailable.map((u) => u.symbol ?? u.ticker).join(', ')} —{' '}
          {data.unavailable[0].reason}
        </p>
      )}

      {data.closes.length > 0 && (
        <p className="mt-3 font-serif text-caption text-paper-mid">
          Closing price of the <span className="text-paper-mid">underlying US share</span>, from{' '}
          {[...new Set(data.closes.map((c) => c.providerLabel))].join(' and ')}. Not a live quote,
          and <span className="text-paper-mid">not the rToken price</span> — an rToken trades around
          the clock and can move apart from the share it tracks, most of all while the US market is
          shut.
        </p>
      )}
    </div>
  )
}
