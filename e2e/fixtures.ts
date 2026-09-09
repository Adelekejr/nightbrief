import type { Page } from '@playwright/test'

/** Two holdings, one event, enough to exercise every screen. */
export const UNIVERSE = {
  source: { venue: 'Bitget', capturedOn: '2026-09-08', complete: false },
  count: 2,
  tokens: [
    { symbol: 'rNVDA', name: 'Nvidia', underlying: 'NVDA', sector: 'semiconductors' },
    { symbol: 'rINTC', name: 'Intel', underlying: 'INTC', sector: 'semiconductors' },
  ],
}

export const OVERNIGHT = {
  ok: true,
  checkedAt: new Date().toISOString(),
  marketNow: {
    phase: 'overnight',
    label: 'Overnight — US market shut',
    closed: true,
    newYorkTime: 'Sep 9, 2026, 1:00 AM',
    holidayAware: false,
  },
  windowHours: 36,
  holdings: {
    verified: [
      { symbol: 'rNVDA', name: 'Nvidia' },
      { symbol: 'rINTC', name: 'Intel' },
    ],
    unverified: [],
    touchedCount: 1,
  },
  triage: { state: 'ok', model: 'gemini-3.5-flash-lite' },
  coverage: {
    storiesConsidered: 40,
    tickerFeedsLive: 2,
    duplicatesRemoved: 4,
    liveSources: [{ id: 'cnbc-top', publisher: 'CNBC' }],
    unavailableSources: [],
  },
  events: [
    {
      id: 'cnbc-top:1',
      title: 'Should You Buy Intel Stock After a Nearly Fourfold Year?',
      publisher: 'fool.com',
      via: 'Yahoo Finance',
      url: 'https://example.invalid/intel',
      publishedAt: new Date().toISOString(),
      session: {
        phase: 'overnight',
        label: 'Overnight — US market shut',
        closed: true,
        newYorkTime: 'Sep 9, 2026, 1:00 AM',
        holidayAware: false,
      },
      summary: 'Data centre profits have nearly quadrupled.',
      score: 164,
      direct: [{ symbol: 'rINTC', term: 'Intel', where: 'title', broad: false }],
      inferred: [],
      symbols: ['rINTC'],
    },
  ],
}

/**
 * Serves the interface's dependencies deterministically. Nothing here reaches
 * the network, so a failing test means the interface is wrong rather than that
 * a publisher was slow.
 */
export async function stubApi(page: Page, overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    '**/api/universe*': UNIVERSE,
    '**/api/overnight*': OVERNIGHT,
    '**/api/prices*': { ok: true, fetchedAt: new Date().toISOString(), closes: [], unavailable: [] },
    '**/api/feed*': {
      fetchedAt: new Date().toISOString(),
      marketNow: OVERNIGHT.marketNow,
      liveSources: [],
      unavailableSources: [],
      itemCount: 0,
      items: [],
    },
    ...overrides,
  }

  for (const [pattern, body] of Object.entries(routes)) {
    await page.route(pattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
    )
  }
}
