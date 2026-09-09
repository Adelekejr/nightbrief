/**
 * Candidate news sources. Every one of these is keyless and free — no paid
 * API, nothing that could expire mid-hackathon.
 *
 * Which of these actually respond is a question about the network, not about
 * this file, so it is answered by probing them from the deployed function
 * (`/api/feed?probe=1`) rather than asserted here.
 */
export type SourceKind = 'macro' | 'markets' | 'regulatory'

export type Source = {
  id: string
  /** Shown in the interface next to anything retrieved from here. */
  publisher: string
  feed: string
  homepage: string
  kind: SourceKind
  /** Why a night-desk user should care that this source exists. */
  rationale: string
  /**
   * Other URLs the same publisher may serve this feed from. Publishers move
   * and retire feed paths without notice, and which one answers is a question
   * about the live network — so the candidates are probed rather than assumed.
   */
  alternates?: string[]
}

export const SOURCES: Source[] = [
  {
    id: 'fed-press',
    publisher: 'Federal Reserve',
    feed: 'https://www.federalreserve.gov/feeds/press_all.xml',
    homepage: 'https://www.federalreserve.gov/newsevents/pressreleases.htm',
    kind: 'macro',
    rationale:
      'Rate decisions and statements are the single largest scheduled mover of US equities, and land at 14:00 ET — deep into the evening across Africa and Asia.',
  },
  {
    id: 'bls-news',
    publisher: 'US Bureau of Labor Statistics',
    feed: 'https://www.bls.gov/feed/bls_latest.rss',
    homepage: 'https://www.bls.gov/bls/newsrels.htm',
    kind: 'macro',
    rationale:
      'CPI and the employment situation report release at 08:30 ET, before the US open — the classic "priced in overnight" event.',
    alternates: [
      'https://www.bls.gov/feed/news_release.rss',
      'https://www.bls.gov/feed/bls_latest.rss',
      'https://www.bls.gov/feed/cpi.rss',
      'https://www.bls.gov/feed/empsit.rss',
    ],
  },
  {
    id: 'bea-news',
    publisher: 'US Bureau of Economic Analysis',
    feed: 'https://www.bea.gov/rss.xml',
    homepage: 'https://www.bea.gov/news/current-releases',
    kind: 'macro',
    rationale: 'GDP and PCE inflation, the Fed’s preferred gauge.',
    alternates: [
      'https://www.bea.gov/rss/news-release-rss.xml',
      'https://apps.bea.gov/rss/rss.xml',
      'https://www.bea.gov/news/rss.xml',
    ],
  },
  {
    id: 'treasury-press',
    publisher: 'US Treasury',
    feed: 'https://home.treasury.gov/rss/press.xml',
    homepage: 'https://home.treasury.gov/news/press-releases',
    kind: 'macro',
    rationale: 'Sanctions and tariff actions, which move sectors rather than single names.',
    alternates: [
      'https://home.treasury.gov/rss/press-releases.xml',
      'https://home.treasury.gov/news/press-releases/feed',
      'https://home.treasury.gov/system/files/126/press-releases.xml',
    ],
  },
  {
    id: 'cnbc-top',
    publisher: 'CNBC',
    feed: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
    homepage: 'https://www.cnbc.com/world/',
    kind: 'markets',
    rationale: 'Broad market coverage that keeps running after the US close.',
  },
  {
    id: 'cnbc-markets',
    publisher: 'CNBC Markets',
    feed: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
    homepage: 'https://www.cnbc.com/markets/',
    kind: 'markets',
    rationale: 'Market-specific desk copy.',
  },
  {
    id: 'marketwatch-top',
    publisher: 'MarketWatch',
    feed: 'https://feeds.marketwatch.com/marketwatch/topstories/',
    homepage: 'https://www.marketwatch.com/',
    kind: 'markets',
    rationale: 'Fast headlines, often the first English write-up of an overnight move.',
  },
  {
    id: 'nasdaq-markets',
    publisher: 'Nasdaq',
    feed: 'https://www.nasdaq.com/feed/rssoutbound?category=Markets',
    homepage: 'https://www.nasdaq.com/news-and-insights/markets',
    kind: 'markets',
    rationale: 'Exchange-side commentary on listed names.',
    alternates: [
      'https://www.nasdaq.com/feed/rssoutbound?category=Markets',
      'https://www.nasdaq.com/feed/nasdaq-original/rss.xml',
    ],
  },
  {
    id: 'yahoo-market',
    publisher: 'Yahoo Finance',
    feed: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US',
    homepage: 'https://finance.yahoo.com/',
    kind: 'markets',
    rationale: 'Index-level headlines, keyed to the S&P 500.',
  },
  {
    id: 'ecb-press',
    publisher: 'European Central Bank',
    feed: 'https://www.ecb.europa.eu/rss/press.html',
    homepage: 'https://www.ecb.europa.eu/press/html/index.en.html',
    kind: 'macro',
    rationale:
      'European decisions land during the African and Asian working day and transmit to US futures long before the US open.',
  },
  {
    id: 'sec-litigation',
    publisher: 'US SEC',
    feed: 'https://www.sec.gov/rss/litigation/litreleases.xml',
    homepage: 'https://www.sec.gov/litigation/litreleases',
    kind: 'regulatory',
    rationale: 'Enforcement actions against listed issuers.',
    alternates: [
      'https://www.sec.gov/news/pressreleases.rss',
      'https://www.sec.gov/rss/news/press.xml',
      'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom',
    ],
  },
]

export const byId = (id: string): Source | undefined =>
  SOURCES.find((s) => s.id === id)
