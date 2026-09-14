import { test } from 'node:test'
import assert from 'node:assert/strict'
import { count, coverageSummary, nothingFoundLine, type ScanCoverage } from '../src/coverage.ts'

/** A scan result shaped like the desk's own response. Each test varies only
 *  the field it is about, so a passing test says what it claims to. */
const scan = (over: Partial<ScanCoverage['coverage']> = {}, windowHours = 36): ScanCoverage => ({
  windowHours,
  coverage: {
    storiesConsidered: 40,
    tickerFeedsLive: 2,
    duplicatesRemoved: 4,
    liveSources: [],
    ...over,
  },
})

const sources = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `source-${i}`, publisher: `Publisher ${i}` }))

test('the reported source count is the number that answered the scan', () => {
  // The count has one origin: the live sources on the result being described.
  // It cannot drift from the scan because it is not passed in separately.
  for (const n of [0, 1, 2, 8, 9]) {
    const result = scan({ liveSources: sources(n) })
    const expected = `${n} market source${n === 1 ? '' : 's'}`
    assert.ok(
      coverageSummary(result).includes(expected),
      `${n} live sources should render "${expected}", got: ${coverageSummary(result)}`,
    )
    assert.ok(nothingFoundLine(result).includes(expected))
  }
})

test('eight of nine answering reports eight, not one', () => {
  // The case that prompted this: the feed probe reports 8 of 9 live, and the
  // desk has to say the same thing about the same scan.
  const line = coverageSummary(scan({ liveSources: sources(8) }))
  assert.ok(line.includes('8 market sources'), line)
  assert.ok(!line.includes('1 market sources'), line)
})

test('a single source is singular', () => {
  // "1 market sources" is what a hardcoded plural looks like once a real
  // number finally reaches it.
  const line = coverageSummary(scan({ liveSources: sources(1) }))
  assert.ok(line.includes('1 market source ·') || line.includes('1 market source +'), line)
  assert.ok(!line.includes('1 market sources'), line)
})

test('every other count in the line agrees in number', () => {
  const one = coverageSummary(
    scan({ storiesConsidered: 1, liveSources: sources(1), duplicatesRemoved: 1, tickerFeedsLive: 0 }),
  )
  assert.equal(one, '1 story · 1 market source · 36h window · 1 duplicate merged')

  const many = coverageSummary(
    scan({ storiesConsidered: 40, liveSources: sources(8), duplicatesRemoved: 4, tickerFeedsLive: 2 }),
  )
  assert.equal(
    many,
    '40 stories · 8 market sources + 2 of your own tickers · 36h window · 4 duplicates merged',
  )
})

test('a ticker-feed count stays plural, because it is a partitive', () => {
  // "1 of your own tickers" is correct: the plural belongs to the set being
  // drawn from, not to the number drawn. Pluralising by count would break it.
  const line = coverageSummary(scan({ tickerFeedsLive: 1, liveSources: sources(8) }))
  assert.ok(line.includes('1 of your own tickers'), line)
})

test('nothing merged and no ticker feeds drop their clauses entirely', () => {
  const line = coverageSummary(
    scan({ storiesConsidered: 12, liveSources: sources(8), duplicatesRemoved: 0, tickerFeedsLive: 0 }),
  )
  assert.equal(line, '12 stories · 8 market sources · 36h window')
})

test('the empty-desk sentence agrees in number too', () => {
  const one = nothingFoundLine(
    scan({ storiesConsidered: 1, liveSources: sources(1), tickerFeedsLive: 0 }),
  )
  assert.ok(one.includes('1 story was checked'), one)

  const many = nothingFoundLine(
    scan({ storiesConsidered: 40, liveSources: sources(8), tickerFeedsLive: 2 }),
  )
  assert.ok(many.includes('40 stories were checked'), many)
  assert.ok(many.includes('8 market sources'), many)
  assert.ok(many.includes('2 of your own tickers'), many)
})

test('the window is reported as given, not assumed', () => {
  assert.ok(coverageSummary(scan({ liveSources: sources(8) }, 12)).includes('12h window'))
  assert.ok(nothingFoundLine(scan({ liveSources: sources(8) }, 12)).includes('last 12 hours'))
})

test('count pluralises regulars and takes irregulars as given', () => {
  assert.equal(count(1, 'story', 'stories'), '1 story')
  assert.equal(count(2, 'story', 'stories'), '2 stories')
  assert.equal(count(0, 'market source'), '0 market sources')
  assert.equal(count(1, 'market source'), '1 market source')
})
