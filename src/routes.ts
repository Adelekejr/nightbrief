import { useEffect, useState } from 'react'

/**
 * Hash routing, hand-rolled. A router dependency would add weight to a bundle
 * that has to open on a mid-range Android over a patchy connection, for five
 * routes that never nest.
 */
export type Route =
  | { name: 'gate' }
  | { name: 'overnight' }
  | { name: 'brief' }
  | { name: 'browse' }
  | { name: 'example' }

const ROUTES: Record<string, Route['name']> = {
  '': 'gate',
  '/': 'gate',
  '/overnight': 'overnight',
  '/brief': 'brief',
  '/browse': 'browse',
  '/example': 'example',
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '')
  return { name: ROUTES[path] ?? 'gate' } as Route
}

export function navigate(name: Route['name']) {
  const path = name === 'gate' ? '/' : `/${name}`
  if (window.location.hash !== `#${path}`) window.location.hash = path
  else window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))

  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

const KEY = 'nightdesk.holdings'

export function loadHoldings(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

export function saveHoldings(holdings: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(holdings))
  } catch {
    // A blocked storage API is not a reason to fail; the session still works.
  }
}
