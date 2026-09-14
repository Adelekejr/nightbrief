import type { Page } from '@playwright/test'

/** Two holdings, one event, enough to exercise every screen. */
export const UNIVERSE = {
  source: { venue: 'Bitget', capturedOn: '2026-09-08', complete: false },
  count: 2,
  tokens: [
    { symbol: 'rNVDA', name: 'Nvidia', underlying: 'NVDA', sector: 'semiconductors', category: 'semiconductors' },
    { symbol: 'rINTC', name: 'Intel', underlying: 'INTC', sector: 'semiconductors', category: 'semiconductors' },
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
      { symbol: 'rNVDA', name: 'Nvidia', category: 'semiconductors' },
      { symbol: 'rINTC', name: 'Intel', category: 'semiconductors' },
    ],
    unverified: [],
    touchedCount: 1,
  },
  triage: { state: 'ok', model: 'gemini-3.5-flash-lite' },
  coverage: {
    storiesConsidered: 40,
    tickerFeedsLive: 2,
    duplicatesRemoved: 4,
    // Eight of nine answering, which is what the deployed feed actually does
    // and what /api/feed?probe=1 reports. The stub used to carry a single
    // source, so every count in the coverage line rendered as "1" and its
    // hardcoded plurals were never once seen against a real number.
    liveSources: [
      { id: 'fed-press', publisher: 'Federal Reserve' },
      { id: 'bea-news', publisher: 'Bureau of Economic Analysis' },
      { id: 'cnbc-top', publisher: 'CNBC' },
      { id: 'cnbc-markets', publisher: 'CNBC Markets' },
      { id: 'marketwatch', publisher: 'MarketWatch' },
      { id: 'yahoo-finance', publisher: 'Yahoo Finance' },
      { id: 'ecb-press', publisher: 'European Central Bank' },
      { id: 'sec-news', publisher: 'SEC' },
    ],
    unavailableSources: [{ id: 'bls-news', publisher: 'US Bureau of Labor Statistics' }],
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
 * What the landing screen reads from `/api/overnight?universe=1`: the same
 * shape, asked of the whole verified listing instead of a portfolio, and with
 * the indirect layer not run at all.
 *
 * Its one event names two rTokens — one in the headline, one in the body — so
 * a check of the card here is also a check that the stronger match is the one
 * named and the other is counted rather than listed.
 */
export const LISTING = {
  ...OVERNIGHT,
  mode: 'listing',
  holdings: {
    verified: [
      { symbol: 'rNVDA', name: 'Nvidia', category: 'semiconductors' },
      { symbol: 'rINTC', name: 'Intel', category: 'semiconductors' },
    ],
    unverified: [],
    touchedCount: 2,
  },
  triage: {
    state: 'unavailable',
    detail: 'not run: the indirect pass is a model call, and is not made across the whole listing',
  },
  coverage: { ...OVERNIGHT.coverage, tickerFeedsLive: 0 },
  events: [
    {
      ...OVERNIGHT.events[0],
      id: 'cnbc-top:listing',
      title: 'Nvidia Leads Chip Selloff As Export Rules Tighten Overnight',
      url: 'https://example.invalid/export-rules',
      direct: [
        { symbol: 'rNVDA', term: 'Nvidia', where: 'title', broad: false },
        { symbol: 'rINTC', term: 'Intel', where: 'summary', broad: false },
      ],
      inferred: [],
      symbols: ['rNVDA', 'rINTC'],
    },
  ],
}

/** What Validation.tsx reads from `/api/overnight?report=1` — a distinct
 *  shape from OVERNIGHT above, so it is stubbed as its own response. */
export const OVERNIGHT_REPORT = {
  ok: true,
  reportedAt: new Date().toISOString(),
  windowHours: 36,
  feedsMs: 640,
  sources: {
    live: [{ id: 'cnbc-top', publisher: 'CNBC' }],
    unavailable: [{ id: 'bls-news', publisher: 'US Bureau of Labor Statistics' }],
    tickerFeedsLive: 2,
    tickerFeedsRequested: 2,
  },
  duplicates: { rawItems: 10, kept: 6, removed: 4, rate: 0.4 },
  freshness: { sampledStories: 6, medianAgeMinutes: 45, oldestAgeMinutes: 120, newestAgeMinutes: 5 },
  matching: { directHits: 2, shortTickerHits: 0, note: 'a collision-risk proxy, not a confirmed false positive' },
}

/** What Checks.tsx reads from `/api/checks`. */
export const CHECKS = {
  ok: true,
  disclaimer: 'A fixture, not a Brief.',
  evidence: [{ id: 'src1', publisher: 'CNBC', title: 'A real article', url: 'https://example.invalid/a', text: 'Evidence text.' }],
  declaredHoldings: ['rNVDA', 'rINTC'],
  faults: [{ label: 'A fabricated figure', detail: 'Cited a number no source carries.' }],
  submitted: { headline: 'bad', chain: [], exposures: [], quotes: [] },
  survived: { headline: 'good', unknowns: ['The model stated no gaps in its own knowledge.'] },
  validation: {
    rejections: [{ kind: 'figure', reference: 'headline', reason: 'not in any supplied source' }],
    chainKept: 1,
    chainDropped: 1,
    exposuresKept: 1,
    exposuresDropped: 1,
    quotesKept: 1,
    quotesDropped: 1,
    figuresRedacted: 1,
  },
}

/**
 * Serves the interface's dependencies deterministically. Nothing here reaches
 * the network, so a failing test means the interface is wrong rather than that
 * a publisher was slow.
 */
export async function stubApi(page: Page, overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    '**/api/universe*': UNIVERSE,
    '**/api/prices*': { ok: true, fetchedAt: new Date().toISOString(), closes: [], unavailable: [] },
    '**/api/checks*': CHECKS,
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

  // The overnight endpoint answers three different shapes from one path,
  // switched on ?report=1 and ?universe=1 — kept as one handler rather than
  // three static bodies so a test cannot accidentally stub the wrong one.
  await page.route('**/api/overnight*', (route) => {
    const query = new URL(route.request().url()).searchParams
    const body =
      query.get('report') === '1'
        ? OVERNIGHT_REPORT
        : query.get('universe') === '1'
          ? LISTING
          : OVERNIGHT
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  for (const [pattern, body] of Object.entries(routes)) {
    await page.route(pattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
    )
  }
}
