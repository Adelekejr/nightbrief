export type Confidence = 'high' | 'moderate' | 'low'
export type Basis = 'retrieved' | 'inferred'
export type Sensitivity = 'sensitive-positive' | 'sensitive-negative' | 'ambiguous'

export type Session = {
  phase: 'regular' | 'pre-market' | 'after-hours' | 'overnight' | 'weekend'
  label: string
  closed: boolean
  newYorkTime: string
  holidayAware: false
}

export type SourceRef = {
  id: string
  publisher: string
  title: string
  url: string
  publishedAt: string | null
  sessionLabel: string | null
  unverifiedOrigin?: boolean
}

export type ChainStep = {
  step: number
  from: string
  to: string
  mechanism: string
  confidence: Confidence
  basis: Basis
  sourceIds: string[]
}

export type Exposure = {
  symbol: string
  direction: Sensitivity
  rationale: string
  confidence: Confidence
  chainSteps: number[]
}

export type Brief = {
  headline: string
  event: {
    summary: string
    category: string
    occurredAt: string | null
    entities: string[]
    magnitude: 'routine' | 'notable' | 'major'
    magnitudeBasis: string
    surprise: string
  }
  chain: ChainStep[]
  exposures: Exposure[]
  watchAtOpen: string[]
  falsifiers: string[]
  unknowns: string[]
  quotes: Array<{ text: string; sourceId: string }>
}

export type Rejection = { kind: string; reference: string; reason: string }

export type AnalysisResponse = {
  ok: true
  demo?: string
  captured?: { note: string; capturedAt: string; model: string; latencyMs: number }
  generatedAt: string
  model: string
  latencyMs: number
  fallbacksUsed: Array<{ model: string; kind: string; detail: string }>
  marketNow: Session
  sources: SourceRef[]
  holdings: {
    verified: Array<{ symbol: string; name: string; underlying: string }>
    unverified: string[]
  }
  brief: Brief
  validation: {
    rejections: Rejection[]
    chainKept: number
    chainDropped: number
    exposuresKept: number
    exposuresDropped: number
    quotesKept: number
    quotesDropped: number
    figuresRedacted: number
  }
}

export type FeedItem = {
  id: string
  sourceId: string
  publisher: string
  title: string
  link: string
  publishedAt: string | null
  session: Session | null
}

export type FeedResponse = {
  fetchedAt: string
  marketNow: Session
  liveSources: Array<{ id: string; publisher: string }>
  unavailableSources: Array<{ id: string; publisher: string; status: number | null }>
  itemCount: number
  items: FeedItem[]
}
