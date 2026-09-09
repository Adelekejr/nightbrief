import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attribute, canonicalTitle, canonicalUrl, dedupe } from '../lib/dedupe.ts'
import type { FeedItem } from '../lib/rss.ts'

test('strips the tracking parameters each feed adds', () => {
  assert.equal(
    canonicalUrl('https://www.fool.com/investing/2026/09/08/why-coreweave/?.tsrc=rss'),
    canonicalUrl('https://fool.com/investing/2026/09/08/why-coreweave'),
  )
  assert.equal(
    canonicalUrl('https://www.marketwatch.com/story/memory-607a4622?mod=mw_rss_topstories'),
    'marketwatch.com/story/memory-607a4622',
  )
})

test('ignores re-punctuation in syndicated headlines', () => {
  assert.equal(
    canonicalTitle('Why Micron’s reign could be here to stay.'),
    canonicalTitle('Why Micron\'s reign could be here to stay'),
  )
})

test('keeps one copy of a story that arrived twice', () => {
  const { kept, removed } = dedupe([
    item('a', 'Micron and Sandisk Soar as Goldman Sees Rally', 'https://x.com/a?utm=1'),
    item('b', 'Micron and Sandisk Soar as Goldman Sees Rally', 'https://y.com/b'),
  ])
  assert.equal(kept.length, 1)
  assert.equal(removed, 1)
  assert.equal(kept[0].id, 'a', 'the first, more authoritative feed wins')
})

test('does not collapse genuinely different stories', () => {
  const { kept } = dedupe([
    item('a', 'Why CoreWeave Stock Soared 12% Today', 'https://x.com/a'),
    item('b', 'Why Nebius Stock Jumped Today', 'https://x.com/b'),
  ])
  assert.equal(kept.length, 2)
})

test('does not collapse two short headlines that merely rhyme', () => {
  const { kept } = dedupe([
    item('a', 'Street Calls', 'https://x.com/a'),
    item('b', 'Street Calls', 'https://y.com/b'),
  ])
  assert.equal(kept.length, 2, 'short titles are too weak a signal to dedupe on')
})

test('credits the publisher who wrote it, naming the route', () => {
  assert.deepEqual(attribute('https://www.fool.com/investing/x/?.tsrc=rss', 'Yahoo Finance'), {
    publisher: 'fool.com',
    via: 'Yahoo Finance',
  })
  assert.deepEqual(attribute('https://247wallst.com/investing/x/', 'Yahoo Finance'), {
    publisher: '247wallst.com',
    via: 'Yahoo Finance',
  })
})

test('does not invent a route when the aggregator wrote it itself', () => {
  assert.deepEqual(
    attribute('https://finance.yahoo.com/markets/stocks/articles/x.html', 'Yahoo Finance'),
    { publisher: 'Yahoo Finance' },
  )
})

function item(id: string, title: string, link: string): FeedItem {
  return {
    id,
    sourceId: 'test',
    publisher: 'Test',
    title,
    link,
    publishedAt: '2026-09-08T20:00:00.000Z',
    summary: '',
    session: null,
  }
}
