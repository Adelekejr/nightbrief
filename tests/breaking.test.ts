import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIRECTION,
  DIRECTION_ON_THE_DESK,
  selectBreakingNews,
  type BreakingCandidate,
  type BreakingHolding,
} from '../src/breaking.ts'

const HELD: BreakingHolding[] = [
  { symbol: 'rNVDA', name: 'Nvidia' },
  { symbol: 'rINTC', name: 'Intel' },
]

/** A ranked event with nothing reaching anything. Each test adds only the
 *  field it is about, so a passing test says what it claims to. */
const event = (over: Partial<BreakingCandidate> = {}): BreakingCandidate => ({
  id: 'e1',
  score: 100,
  publishedAt: '2026-09-09T01:00:00.000Z',
  direct: [],
  inferred: [],
  ...over,
})

const named = (symbol: string, where: 'title' | 'summary' = 'title', broad = false) => ({
  symbol,
  term: 'Intel',
  where,
  broad,
})

const guessed = (symbol: string) => ({ symbol, why: 'a shared foundry supplier' })

test('a named match beats an inferred one when everything else is equal', () => {
  const pick = selectBreakingNews(
    [
      event({ id: 'inferred', inferred: [guessed('rNVDA')] }),
      event({ id: 'named', direct: [named('rINTC')] }),
    ],
    HELD,
  )

  assert.equal(pick?.event.id, 'named')
  assert.equal(pick?.basis, 'retrieved')
  assert.equal(pick?.holding.name, 'Intel')
})

test('a newer event beats an older one when priority is equal', () => {
  const pick = selectBreakingNews(
    [
      event({ id: 'older', publishedAt: '2026-09-08T12:00:00.000Z', direct: [named('rINTC')] }),
      event({ id: 'newer', publishedAt: '2026-09-09T04:00:00.000Z', direct: [named('rINTC')] }),
    ],
    HELD,
  )

  assert.equal(pick?.event.id, 'newer')
})

test('an event with no published time sorts oldest rather than first', () => {
  const pick = selectBreakingNews(
    [
      event({ id: 'undated', publishedAt: null, direct: [named('rINTC')] }),
      event({ id: 'dated', publishedAt: '2026-09-08T12:00:00.000Z', direct: [named('rINTC')] }),
    ],
    HELD,
  )

  assert.equal(pick?.event.id, 'dated')
})

test('an empty event list returns null', () => {
  assert.equal(selectBreakingNews([], HELD), null)
})

test('a portfolio with no matches returns null', () => {
  // The event reaches a real holding — just not one this reader holds.
  const pick = selectBreakingNews(
    [event({ direct: [named('rAMD')], inferred: [guessed('rMU')] })],
    HELD,
  )

  assert.equal(pick, null)
})

test('the sort is stable given two identical events', () => {
  const identical = (id: string) => event({ id, direct: [named('rINTC')] })
  const pick = selectBreakingNews([identical('first'), identical('second')], HELD)

  assert.equal(pick?.event.id, 'first')

  // And the other way round, so the result is the input order rather than
  // whatever the id happens to sort as.
  const reversed = selectBreakingNews([identical('second'), identical('first')], HELD)
  assert.equal(reversed?.event.id, 'second')
})

test('a higher score outranks everything under it', () => {
  const pick = selectBreakingNews(
    [
      event({ id: 'quiet', score: 100, direct: [named('rINTC')] }),
      event({ id: 'loud', score: 240, inferred: [guessed('rNVDA')] }),
    ],
    HELD,
  )

  // The card must not disagree with the numbered list underneath it, which
  // is ordered by this same score.
  assert.equal(pick?.event.id, 'loud')
})

test('confidence follows the match layer, and nothing else', () => {
  const of = (over: Partial<BreakingCandidate>) => selectBreakingNews([event(over)], HELD)?.confidence

  assert.equal(of({ direct: [named('rINTC', 'title')] }), 'high')
  assert.equal(of({ direct: [named('rINTC', 'summary')] }), 'moderate')
  // An index named in a headline is the weaker signal the matcher already
  // treats it as, not a company being reported on.
  assert.equal(of({ direct: [named('rINTC', 'title', true)] }), 'moderate')
  assert.equal(of({ inferred: [guessed('rNVDA')] }), 'low')
})

test('a headline match wins over a body match when the score ties', () => {
  const pick = selectBreakingNews(
    [
      event({ id: 'body', direct: [named('rINTC', 'summary')] }),
      event({ id: 'headline', direct: [named('rINTC', 'title')] }),
    ],
    HELD,
  )

  assert.equal(pick?.event.id, 'headline')
})

test('the reason is carried over, never composed', () => {
  const inferred = selectBreakingNews([event({ inferred: [guessed('rNVDA')] })], HELD)
  assert.equal(inferred?.because, 'a shared foundry supplier')

  const direct = selectBreakingNews([event({ direct: [named('rINTC', 'title')] })], HELD)
  assert.match(direct!.because, /named in the headline as .Intel./)
})

test('the desk states no direction, because it has none to state', () => {
  const pick = selectBreakingNews([event({ direct: [named('rINTC')] })], HELD)

  // Direction is settled in the Brief, by a model call the desk never makes.
  // Reading one off a headline here would be the fabrication the validator
  // exists to catch, arriving by a route that has no validator on it.
  assert.equal(pick?.direction, 'unclear')
  assert.equal(DIRECTION_ON_THE_DESK, 'unclear')
  assert.equal(DIRECTION.unclear.tone, 'neutral')
})

test('red belongs to downward alone and green to upward alone', () => {
  assert.equal(DIRECTION['sensitive-negative'].tone, 'fall')
  assert.equal(DIRECTION['sensitive-positive'].tone, 'rise')

  const toned = Object.values(DIRECTION)
  assert.equal(toned.filter((d) => d.tone === 'fall').length, 1)
  assert.equal(toned.filter((d) => d.tone === 'rise').length, 1)

  // And every direction is stated in words, so the rail is never the only
  // carrier of what it means.
  for (const d of toned) assert.ok(d.word.length > 0)
})
