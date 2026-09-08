/**
 * The shape of a Nightdesk brief, and the schema the model must fill.
 *
 * The vocabulary is deliberate. Exposure has a DIRECTION OF SENSITIVITY,
 * never a recommendation: "sensitive-negative" is a statement about how a
 * holding tends to respond, "bearish" or "sell" would be advice. The tool
 * does not give advice, so the words for it do not exist in the schema.
 */

export type Confidence = 'high' | 'moderate' | 'low'
export type Basis = 'retrieved' | 'inferred'

export type EventCategory =
  | 'monetary-policy'
  | 'macro-data'
  | 'geopolitics'
  | 'trade-policy'
  | 'commodity'
  | 'company-specific'
  | 'regulatory'
  | 'other'

export type Sensitivity = 'sensitive-positive' | 'sensitive-negative' | 'ambiguous'

/** One item of source material, as handed to the model. */
export type Evidence = {
  id: string
  publisher: string
  title: string
  url: string
  publishedAt: string | null
  sessionLabel: string | null
  text: string
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

export type Quote = { text: string; sourceId: string }

export type Brief = {
  headline: string
  event: {
    summary: string
    category: EventCategory
    occurredAt: string | null
    entities: string[]
    magnitude: 'routine' | 'notable' | 'major'
    magnitudeBasis: string
    surprise: 'expected' | 'partly-expected' | 'surprise' | 'unclear'
  }
  chain: ChainStep[]
  exposures: Exposure[]
  watchAtOpen: string[]
  falsifiers: string[]
  unknowns: string[]
  quotes: Quote[]
}

const enumOf = (values: readonly string[]) => ({ type: 'STRING', enum: [...values] })

/**
 * Response schema in the OpenAPI subset Gemini accepts. Everything the
 * project's rules depend on is `required`, so the model cannot quietly omit
 * the uncomfortable parts — falsifiers and unknowns above all.
 */
export const BRIEF_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: {
      type: 'STRING',
      description: 'One plain sentence: the answer, before any reasoning.',
    },
    event: {
      type: 'OBJECT',
      properties: {
        summary: { type: 'STRING' },
        category: enumOf([
          'monetary-policy',
          'macro-data',
          'geopolitics',
          'trade-policy',
          'commodity',
          'company-specific',
          'regulatory',
          'other',
        ]),
        occurredAt: {
          type: 'STRING',
          description:
            'ISO 8601 if a date or time is stated in the sources. Empty string if the sources do not say. Never estimated.',
        },
        entities: { type: 'ARRAY', items: { type: 'STRING' } },
        magnitude: enumOf(['routine', 'notable', 'major']),
        magnitudeBasis: {
          type: 'STRING',
          description: 'Why that magnitude, in one sentence.',
        },
        surprise: enumOf(['expected', 'partly-expected', 'surprise', 'unclear']),
      },
      required: [
        'summary',
        'category',
        'occurredAt',
        'entities',
        'magnitude',
        'magnitudeBasis',
        'surprise',
      ],
    },
    chain: {
      type: 'ARRAY',
      description:
        'The transmission chain, one link per step, in order. Each link moves one step closer to the holdings. Do not jump from event to ticker in a single link.',
      items: {
        type: 'OBJECT',
        properties: {
          step: { type: 'INTEGER' },
          from: { type: 'STRING' },
          to: { type: 'STRING' },
          mechanism: { type: 'STRING', description: 'How the first affects the second.' },
          confidence: enumOf(['high', 'moderate', 'low']),
          basis: enumOf(['retrieved', 'inferred']),
          sourceIds: {
            type: 'ARRAY',
            description:
              'Source ids supporting this link. Required when basis is retrieved. Only ids from the supplied evidence.',
            items: { type: 'STRING' },
          },
        },
        required: ['step', 'from', 'to', 'mechanism', 'confidence', 'basis', 'sourceIds'],
      },
    },
    exposures: {
      type: 'ARRAY',
      description: 'Only holdings the user actually listed. Omit any that the chain does not reach.',
      items: {
        type: 'OBJECT',
        properties: {
          symbol: { type: 'STRING' },
          direction: {
            ...enumOf(['sensitive-positive', 'sensitive-negative', 'ambiguous']),
            description:
              'How this holding tends to respond. This is sensitivity, not a recommendation.',
          },
          rationale: { type: 'STRING' },
          confidence: enumOf(['high', 'moderate', 'low']),
          chainSteps: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['symbol', 'direction', 'rationale', 'confidence', 'chainSteps'],
      },
    },
    watchAtOpen: {
      type: 'ARRAY',
      description: 'Concrete things to watch at the next US open.',
      items: { type: 'STRING' },
    },
    falsifiers: {
      type: 'ARRAY',
      description: 'Observations that would show this reasoning is wrong. At least two.',
      items: { type: 'STRING' },
    },
    unknowns: {
      type: 'ARRAY',
      description:
        'What you do not know and could not determine from the sources. Never empty — a gap is more useful to a trader than a confident guess.',
      items: { type: 'STRING' },
    },
    quotes: {
      type: 'ARRAY',
      description: 'Short verbatim extracts from the sources. Must appear word for word.',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          sourceId: { type: 'STRING' },
        },
        required: ['text', 'sourceId'],
      },
    },
  },
  required: [
    'headline',
    'event',
    'chain',
    'exposures',
    'watchAtOpen',
    'falsifiers',
    'unknowns',
    'quotes',
  ],
} as const
