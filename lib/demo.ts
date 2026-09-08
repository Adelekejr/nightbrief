import type { Evidence } from './brief.js'

/**
 * The canonical research task, captured end to end.
 *
 * A real article, pulled from Nightdesk's own live feed on 2026-09-08 and
 * pinned here with its publisher, URL and publication time intact. It was
 * filed at 04:32 in New York — inside US pre-market, with the cash market
 * shut — which is exactly the situation the product exists for.
 *
 * Nothing here is invented. The text is the article's own summary as the
 * publisher syndicated it.
 */
export const DEMO_ARTICLE: Evidence = {
  id: 'src1',
  publisher: 'CNBC',
  title: "TSMC, Samsung commit to ASML's newest chipmaking tools as AI drives demand",
  url: 'https://www.cnbc.com/2026/09/08/tsmc-samsung-asml-high-na-euv-machine-ai-chips.html',
  publishedAt: '2026-09-08T08:32:02.000Z',
  sessionLabel: 'US pre-market',
  text: "TSMC and Samsung will adopt ASML's High NA EUV tools for advanced chipmaking as AI drives demand for smaller, more complex semiconductors.",
}

/**
 * A sample portfolio, labelled as sample wherever it is shown. Deliberately
 * mixed: some holdings the chain should reach, and some it should not. A tool
 * that finds every holding exposed to every event is not reasoning.
 */
export const DEMO_HOLDINGS = ['rNVDA', 'rAMD', 'rINTC', 'rMU', 'rTSLA', 'rSPY']

export const DEMO_NOTE =
  'Sample portfolio. The article, its publisher, URL and timestamp are real and were taken from the live feed.'
