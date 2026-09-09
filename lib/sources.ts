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

/**
 * Measured 2026-09-09 from the deployed function, not assumed.
 *
 * The US Treasury and Nasdaq feeds were removed after every candidate URL
 * timed out. They were not merely useless: the sources are fetched together,
 * so two that never answer set a six-second floor under every request.
 *
 * The Bureau of Labor Statistics stays listed even though it refuses this
 * client on all four of its feed paths. It fails in well under a tenth of a
 * second, so it costs nothing, and the interface reports it as unavailable —
 * which is more honest than quietly dropping a source a reader might expect.
 */
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
    feed: 'https://apps.bea.gov/rss/rss.xml',
    homepage: 'https://www.bea.gov/news/current-releases',
    kind: 'macro',
    rationale: 'GDP and PCE inflation, the Fed’s preferred gauge.',
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
    id: 'sec-press',
    publisher: 'US SEC',
    feed: 'https://www.sec.gov/news/pressreleases.rss',
    homepage: 'https://www.sec.gov/news/pressreleases',
    kind: 'regulatory',
    rationale:
      'Enforcement and rulemaking affecting listed issuers. The litigation feed refuses this client; the press feed answers.',
  },
]

export const byId = (id: string): Source | undefined =>
  SOURCES.find((s) => s.id === id)

/**
 * A feed of news filed against one ticker, rather than whatever the market
 * page happened to lead with.
 *
 * General market feeds cover the largest names well and the rest barely at
 * all: a Lumentum or Nebius story rarely reaches CNBC's top stories, so a
 * holder of those positions can see an empty desk on a night when there is
 * real news about what they hold. This closes that gap for exactly the
 * tickers a reader owns.
 */
export const tickerFeed = (ticker: string): Source => ({
  id: `ticker-${ticker.toLowerCase()}`,
  publisher: 'Yahoo Finance',
  feed: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`,
  homepage: `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`,
  kind: 'markets',
  rationale: `News filed against ${ticker.toUpperCase()} itself.`,
})
