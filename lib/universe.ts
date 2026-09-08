/**
 * The tokenized-stock universe Nightdesk will reason about.
 *
 * PROVENANCE — this matters more than the list itself.
 *
 * Captured from the Bitget mobile app, "Spot stocks" tab, on 2026-09-08 by
 * the project author. Every symbol and company name below was read off that
 * screen. Bitget's own category tabs on that screen ("AI", "Storage & optical
 * communications") are where the `bitgetCategory` values come from.
 *
 * Prices were visible in that capture and are deliberately NOT recorded here.
 * A price read off a screenshot is stale the moment it is taken, and a judge
 * cannot verify it. Nightdesk will not show a figure it cannot source live.
 *
 * This is a PARTIAL listing. Bitget publishes considerably more rTokens than
 * the eighteen confirmed here, so an unrecognised symbol means "not verified
 * by us", never "not tradeable" — see `resolve` below.
 *
 * Sector and business descriptions are general reference knowledge, not
 * retrieved market data. They carry no figures, and the analysis layer treats
 * them as context for reasoning rather than as facts to quote.
 */

export const UNIVERSE_SOURCE = {
  venue: 'Bitget',
  surface: 'Spot stocks',
  capturedOn: '2026-09-08',
  method: 'Screen capture by the project author',
  complete: false,
  note: 'Eighteen pairs confirmed by direct observation. Bitget lists more.',
} as const

export type Sector =
  | 'index-etf'
  | 'semiconductors'
  | 'memory-and-storage'
  | 'optical-networking'
  | 'ai-cloud'
  | 'software-and-cloud'
  | 'internet-platform'
  | 'consumer-hardware'
  | 'automotive-and-energy'
  | 'aerospace'
  | 'power-equipment'

export type RToken = {
  /** As Bitget lists it. */
  symbol: string
  pair: string
  /** The US-listed ticker the token tracks. */
  underlying: string
  name: string
  sector: Sector
  /** What the company does. No figures, by design. */
  business: string
  bitgetCategory?: string
  note?: string
}

export const UNIVERSE: RToken[] = [
  {
    symbol: 'rSPY',
    pair: 'rSPY/USDT',
    underlying: 'SPY',
    name: 'SPDR S&P 500 ETF',
    sector: 'index-etf',
    business:
      'Tracks the S&P 500. Moves with the broad US market rather than any single company, so it responds to macro and policy news more than to company events.',
  },
  {
    symbol: 'rQQQ',
    pair: 'rQQQ/USDT',
    underlying: 'QQQ',
    name: 'Invesco QQQ Trust',
    sector: 'index-etf',
    business:
      'Tracks the Nasdaq-100. Heavily weighted toward large technology companies, so it amplifies technology-sector news relative to a broad index.',
  },
  {
    symbol: 'rNVDA',
    pair: 'rNVDA/USDT',
    underlying: 'NVDA',
    name: 'Nvidia',
    sector: 'semiconductors',
    business:
      'Designs GPUs and accelerators used for AI training and inference. Demand is tied to data-centre capital spending by cloud providers and AI labs.',
    bitgetCategory: 'AI',
  },
  {
    symbol: 'rAMD',
    pair: 'rAMD/USDT',
    underlying: 'AMD',
    name: 'Advanced Micro Devices',
    sector: 'semiconductors',
    business:
      'Designs CPUs and GPUs for data centres, PCs and embedded systems. Competes directly with Nvidia in AI accelerators and with Intel in processors.',
    bitgetCategory: 'AI',
  },
  {
    symbol: 'rINTC',
    pair: 'rINTC/USDT',
    underlying: 'INTC',
    name: 'Intel',
    sector: 'semiconductors',
    business:
      'Designs and manufactures processors, and operates its own fabrication plants. Exposed both to PC and server demand and to the economics of running foundries.',
  },
  {
    symbol: 'rAVGO',
    pair: 'rAVGO/USDT',
    underlying: 'AVGO',
    name: 'Broadcom',
    sector: 'semiconductors',
    business:
      'Supplies networking and custom silicon alongside infrastructure software. Custom AI accelerators for large cloud customers are a significant driver.',
    bitgetCategory: 'AI',
  },
  {
    symbol: 'rMU',
    pair: 'rMU/USDT',
    underlying: 'MU',
    name: 'Micron Technology',
    sector: 'memory-and-storage',
    business:
      'Manufactures DRAM and NAND memory, including high-bandwidth memory used in AI accelerators. Highly cyclical: pricing swings with industry supply.',
    bitgetCategory: 'Storage & optical communications',
  },
  {
    symbol: 'rSNDK',
    pair: 'rSNDK/USDT',
    underlying: 'SNDK',
    name: 'Sandisk',
    sector: 'memory-and-storage',
    business:
      'Makes NAND flash memory and storage products. Shares the memory industry’s exposure to supply, pricing and capacity decisions.',
    bitgetCategory: 'Storage & optical communications',
  },
  {
    symbol: 'rSTX',
    pair: 'rSTX/USDT',
    underlying: 'STX',
    name: 'Seagate Technology',
    sector: 'memory-and-storage',
    business:
      'Makes hard disk drives, largely for data-centre mass storage. Demand tracks data-centre buildout rather than consumer PCs.',
    bitgetCategory: 'Storage & optical communications',
  },
  {
    symbol: 'rLITE',
    pair: 'rLITE/USDT',
    underlying: 'LITE',
    name: 'Lumentum Holdings',
    sector: 'optical-networking',
    business:
      'Supplies optical components and lasers used to move data inside and between data centres. Demand follows network capacity upgrades.',
    bitgetCategory: 'Storage & optical communications',
  },
  {
    symbol: 'rCRWV',
    pair: 'rCRWV/USDT',
    underlying: 'CRWV',
    name: 'CoreWeave',
    sector: 'ai-cloud',
    business:
      'Rents GPU compute capacity for AI workloads. Revenue is concentrated in large AI customers and the business is capital-intensive.',
    bitgetCategory: 'AI',
  },
  {
    symbol: 'rNBIS',
    pair: 'rNBIS/USDT',
    underlying: 'NBIS',
    name: 'Nebius Group',
    sector: 'ai-cloud',
    business:
      'Operates AI-focused cloud infrastructure. Like other GPU cloud providers, its economics depend on securing accelerators and power.',
    bitgetCategory: 'AI',
  },
  {
    symbol: 'rMSFT',
    pair: 'rMSFT/USDT',
    underlying: 'MSFT',
    name: 'Microsoft',
    sector: 'software-and-cloud',
    business:
      'Enterprise software and the Azure cloud platform. One of the largest buyers of AI data-centre capacity, which links it to the semiconductor chain.',
  },
  {
    symbol: 'rMETA',
    pair: 'rMETA/USDT',
    underlying: 'META',
    name: 'Meta',
    sector: 'internet-platform',
    business:
      'Social platforms funded by advertising, alongside heavy AI infrastructure spending. Advertising revenue is sensitive to the economic cycle.',
  },
  {
    symbol: 'rAAPL',
    pair: 'rAAPL/USDT',
    underlying: 'AAPL',
    name: 'Apple',
    sector: 'consumer-hardware',
    business:
      'Consumer hardware and services. Manufacturing is concentrated in Asia, which makes it sensitive to tariffs and supply-chain disruption.',
  },
  {
    symbol: 'rTSLA',
    pair: 'rTSLA/USDT',
    underlying: 'TSLA',
    name: 'Tesla',
    sector: 'automotive-and-energy',
    business:
      'Electric vehicles and energy storage. Exposed to consumer demand, interest rates, raw material costs and trade policy.',
  },
  {
    symbol: 'rBE',
    pair: 'rBE/USDT',
    underlying: 'BE',
    name: 'Bloom Energy',
    sector: 'power-equipment',
    business:
      'Builds fuel-cell systems for on-site power generation, increasingly sold to data centres facing grid constraints.',
  },
  {
    symbol: 'rSPCX',
    pair: 'rSPCX/USDT',
    underlying: 'SPCX',
    name: 'SpaceX',
    sector: 'aerospace',
    business:
      'Launch services and satellite internet. Unlike the rest of this list it is not a publicly listed US company, so ordinary public-market disclosure does not apply.',
    note: 'Privately held. Public reporting on it is thinner and less regular than for listed issuers, so treat claims about it with more caution.',
  },
]

const INDEX = new Map<string, RToken>()
for (const t of UNIVERSE) {
  INDEX.set(t.symbol.toLowerCase(), t)
  INDEX.set(t.underlying.toLowerCase(), t)
  INDEX.set(t.name.toLowerCase(), t)
}

export type Resolution =
  | { known: true; token: RToken; input: string }
  | { known: false; input: string }

/**
 * Accepts what a half-awake trader would actually type: "rNVDA", "NVDA",
 * "nvidia", "rNVDA/USDT".
 *
 * An unknown symbol resolves to `known: false` rather than a guess. The
 * interface says "we have not verified this one" instead of silently
 * analysing a ticker nobody confirmed exists.
 */
export function resolve(input: string): Resolution {
  const cleaned = input.trim().replace(/\/.*$/, '').toLowerCase()
  if (!cleaned) return { known: false, input }

  const hit = INDEX.get(cleaned) ?? INDEX.get(cleaned.replace(/^r/, ''))
  return hit ? { known: true, token: hit, input } : { known: false, input }
}

export const resolveAll = (inputs: string[]): Resolution[] => inputs.map(resolve)
