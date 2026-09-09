import { test } from 'node:test'
import assert from 'node:assert/strict'
import { directMatches, rank, score } from '../lib/match.ts'
import { UNIVERSE } from '../lib/universe.ts'
import type { FeedItem } from '../lib/rss.ts'

const held = UNIVERSE.filter((t) =>
  ['rNVDA', 'rAMD', 'rINTC', 'rMU', 'rTSLA', 'rSPY', 'rBE'].includes(t.symbol),
)
const symbols = (text: string) => directMatches(text, held).map((m) => m.symbol).sort()

test('matches company names as publishers write them', () => {
  assert.deepEqual(symbols('Micron Holds Steady as memory prices climb'), ['rMU'])
  assert.deepEqual(symbols('Nvidia and AMD rally on AI demand'), ['rAMD', 'rNVDA'])
  assert.deepEqual(symbols('Bloom Energy joins the S&P 500'), ['rBE', 'rSPY'])
})

test('matches tickers only as standalone uppercase tokens', () => {
  assert.deepEqual(symbols('Shares of MU rose'), ['rMU'])
  assert.deepEqual(symbols('rNVDA/USDT saw heavy volume'), ['rNVDA'])
})

test('short tickers do not match ordinary prose', () => {
  // rBE's underlying is "BE" — the classic false positive.
  assert.deepEqual(symbols('This is going to be a long night for traders'), [])
  assert.deepEqual(symbols('Analysts said it would be premature'), [])
})

test('does not match a name embedded in a longer word', () => {
  assert.deepEqual(symbols('Intelligence agencies issued a warning'), [])
  assert.deepEqual(symbols('The metaverse is quiet'), [])
})

test('a named holding outranks an inferred one', () => {
  const named = score({ directCount: 1, inferredCount: 0, closed: false, publishedAt: null, now: 0 })
  const guessed = score({ directCount: 0, inferredCount: 1, closed: false, publishedAt: null, now: 0 })
  assert.ok(named > guessed)
})

test('breadth beats a single holding, and market-shut carries weight', () => {
  const now = Date.now()
  const broad = score({ directCount: 3, inferredCount: 0, closed: false, publishedAt: null, now })
  const narrow = score({ directCount: 1, inferredCount: 0, closed: false, publishedAt: null, now })
  assert.ok(broad > narrow)

  const shut = score({ directCount: 1, inferredCount: 0, closed: true, publishedAt: null, now })
  assert.ok(shut > narrow)
})

test('ranks a real overnight story above a stale one', () => {
  const now = Date.parse('2026-09-08T12:00:00Z')
  const items: FeedItem[] = [
    item('a', 'Micron falls on memory glut', '2026-09-06T12:00:00Z', false),
    item('b', 'Micron surges as DRAM prices climb', '2026-09-08T08:00:00Z', true),
  ]
  const out = rank(items, held, new Map(), now)
  assert.equal(out[0].item.id, 'b')
})

test('drops events that touch nothing held', () => {
  const items = [item('x', 'Novartis drug trial disappoints', '2026-09-08T08:00:00Z', true)]
  assert.equal(rank(items, held, new Map()).length, 0)
})

test('keeps an inferred link the text never names', () => {
  // The story that motivated the second layer: no holding is named in it.
  const items = [
    item('t', "TSMC, Samsung commit to ASML's newest chipmaking tools", '2026-09-08T08:32:00Z', true),
  ]
  assert.equal(rank(items, held, new Map()).length, 0, 'nothing to match on text alone')

  const triage = new Map([
    ['t', [{ symbol: 'rNVDA', why: 'Nvidia depends on TSMC for advanced nodes.' }]],
  ])
  const out = rank(items, held, triage)
  assert.equal(out.length, 1)
  assert.deepEqual(out[0].symbols, ['rNVDA'])
  assert.equal(out[0].direct.length, 0)
})

test('does not infer a holding the story already names', () => {
  const items = [item('m', 'Micron surges on memory demand', '2026-09-08T08:00:00Z', true)]
  const triage = new Map([['m', [{ symbol: 'rMU', why: 'duplicate of the direct match' }]]])
  const out = rank(items, held, triage)
  assert.equal(out[0].direct.length, 1)
  assert.equal(out[0].inferred.length, 0)
})

test('ignores triage for holdings the reader does not own', () => {
  const items = [item('q', 'Broadcom lands a custom silicon deal', '2026-09-08T08:00:00Z', true)]
  const triage = new Map([['q', [{ symbol: 'rAVGO', why: 'not in this portfolio' }]]])
  assert.equal(rank(items, held, triage).length, 0)
})

function item(id: string, title: string, publishedAt: string, closed: boolean): FeedItem {
  return {
    id,
    sourceId: 'test',
    publisher: 'Test Wire',
    title,
    link: 'https://example.invalid/' + id,
    publishedAt,
    summary: '',
    session: closed
      ? { phase: 'overnight', label: 'Overnight — US market shut', closed: true, newYorkTime: '', holidayAware: false }
      : { phase: 'regular', label: 'US regular session', closed: false, newYorkTime: '', holidayAware: false },
  }
}
