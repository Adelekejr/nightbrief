import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Brief, Evidence } from '../lib/brief.ts'
import { REDACTION, unsupportedFigures, evidenceNumbers, validateBrief } from '../lib/validate.ts'

const evidence: Evidence[] = [
  {
    id: 'src1',
    publisher: 'CNBC',
    title: "Brent crude oil hits $98 after Iran's Houthi allies attack Saudi energy facilities",
    url: 'https://example.invalid/oil',
    publishedAt: '2026-09-08T15:30:21.000Z',
    sessionLabel: 'US regular session',
    text: 'Oil prices rose Tuesday on worries over escalating Mideast tensions.',
  },
]

const base: Brief = {
  headline: 'An oil shock is the live risk for your holdings.',
  event: {
    summary: 'Attacks on Saudi energy facilities pushed Brent to $98.',
    category: 'geopolitics',
    occurredAt: '2026-09-08T15:30:21.000Z',
    entities: ['Saudi Arabia'],
    magnitude: 'major',
    magnitudeBasis: 'A supply shock in a major exporter.',
    surprise: 'surprise',
  },
  chain: [],
  exposures: [],
  watchAtOpen: [],
  falsifiers: ['Crude retraces and the move unwinds.'],
  unknowns: ['Whether output was actually curtailed.'],
  quotes: [],
}

const run = (brief: Partial<Brief>, declared = ['rSPY']) =>
  validateBrief({ brief: { ...base, ...brief }, evidence, declaredSymbols: declared })

test('reads every number out of the supplied evidence', () => {
  const nums = evidenceNumbers(evidence)
  assert.ok(nums.has('98'), 'should see the Brent price')
  assert.ok(nums.has('2026'), 'should see the year in the timestamp')
})

test('a figure present in the sources is not flagged', () => {
  assert.deepEqual(unsupportedFigures('Brent reached $98.', evidenceNumbers(evidence)), [])
})

test('a figure absent from the sources is flagged', () => {
  const flagged = unsupportedFigures('Brent reached $147 and OPEC cut 3.2%.', evidenceNumbers(evidence))
  assert.deepEqual(flagged.sort(), ['$147', '3.2%'])
})

test('prose numbers are not mistaken for market figures', () => {
  // "three sectors" and "24 hours" are prose, not claims about the market.
  assert.deepEqual(unsupportedFigures('Watch 3 sectors over the next 24 hours.', new Set()), [])
})

test('drops a chain link that claims retrieval but cites nothing supplied', () => {
  const out = run({
    chain: [
      {
        step: 1,
        from: 'Attacks on Saudi facilities',
        to: 'Crude prices',
        mechanism: 'Supply risk premium.',
        confidence: 'high',
        basis: 'retrieved',
        sourceIds: ['src-that-was-never-given'],
      },
    ],
  })

  assert.equal(out.stats.chainKept, 0)
  assert.equal(out.stats.chainDropped, 1)
  assert.match(out.rejections[0].reason, /cited no source that was supplied/)
})

test('keeps an inferred link that honestly cites nothing', () => {
  const out = run({
    chain: [
      {
        step: 1,
        from: 'Higher crude',
        to: 'Airline input costs',
        mechanism: 'Fuel is a large share of operating cost.',
        confidence: 'moderate',
        basis: 'inferred',
        sourceIds: [],
      },
    ],
  })

  assert.equal(out.stats.chainKept, 1)
  assert.equal(out.stats.chainDropped, 0)
})

test('drops a chain link carrying an invented figure', () => {
  const out = run({
    chain: [
      {
        step: 1,
        from: 'Crude at $147',
        to: 'Equity risk premium',
        mechanism: 'Energy costs compress margins.',
        confidence: 'high',
        basis: 'inferred',
        sourceIds: [],
      },
    ],
  })

  assert.equal(out.stats.chainDropped, 1)
  assert.match(out.rejections[0].reason, /figure that appears in no supplied source/)
})

test('drops exposures outside the verified universe', () => {
  const out = run({ exposures: [expo('rGOOGL')] }, ['rGOOGL'])
  assert.equal(out.stats.exposuresDropped, 1)
  assert.match(out.rejections[0].reason, /verified rToken universe/)
})

test('drops exposures the user never declared', () => {
  const out = run({ exposures: [expo('rNVDA')] }, ['rSPY'])
  assert.equal(out.stats.exposuresDropped, 1)
  assert.match(out.rejections[0].reason, /holdings the user declared/)
})

test('keeps a declared exposure and prunes references to dropped links', () => {
  const out = run({
    chain: [
      {
        step: 1,
        from: 'Crude',
        to: 'Broad equities',
        mechanism: 'Risk sentiment.',
        confidence: 'moderate',
        basis: 'inferred',
        sourceIds: [],
      },
    ],
    exposures: [{ ...expo('rSPY'), chainSteps: [1, 9] }],
  })

  assert.equal(out.stats.exposuresKept, 1)
  // Step 9 never survived validation, so the reference to it must not either.
  assert.deepEqual(out.brief.exposures[0].chainSteps, [1])
})

test('drops a quote that is not verbatim in its cited source', () => {
  const out = run({ quotes: [{ text: 'Brent crude soared to record highs', sourceId: 'src1' }] })
  assert.equal(out.stats.quotesDropped, 1)
  assert.match(out.rejections[0].reason, /verbatim/)
})

test('keeps a genuinely verbatim quote', () => {
  const out = run({ quotes: [{ text: 'Oil prices rose Tuesday', sourceId: 'src1' }] })
  assert.equal(out.stats.quotesKept, 1)
})

test('redacts an unsourced figure from narrative rather than deleting the brief', () => {
  const out = run({ headline: 'Crude at $147 threatens your holdings.' })
  assert.ok(out.brief.headline.includes(REDACTION))
  assert.ok(!out.brief.headline.includes('$147'))
  assert.equal(out.stats.figuresRedacted, 1)
})

test('overlapping figure patterns redact once, not twice', () => {
  // "3.2%" matches both the percentage and the decimal pattern. Redacting
  // both would leave "[unsourced figure removed]%" in the text.
  const out = run({ headline: 'Margins fell 3.2% on the move.' })
  assert.equal(out.stats.figuresRedacted, 1)
  assert.equal(out.brief.headline, `Margins fell ${REDACTION} on the move.`)
})

test('an empty unknowns list is itself reported as a gap', () => {
  const out = run({ unknowns: [] })
  assert.equal(out.brief.unknowns.length, 1)
  assert.match(out.brief.unknowns[0], /Treat that as a gap/)
})

function expo(symbol: string) {
  return {
    symbol,
    direction: 'sensitive-negative' as const,
    rationale: 'Broad market exposure to an energy shock.',
    confidence: 'moderate' as const,
    chainSteps: [],
  }
}
