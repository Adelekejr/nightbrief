import { test } from 'node:test'
import assert from 'node:assert/strict'
import { directMatches } from '../lib/match.ts'
import { UNIVERSE } from '../lib/universe.ts'

/**
 * Real headlines, taken from a recall run against every holding's own Yahoo
 * feed on 2026-09-09. The run found no alias gaps; this locks that in, and
 * records the two cases where NOT matching is the correct answer.
 */
const hit = (title: string) =>
  directMatches({ title, summary: '' }, UNIVERSE)
    .map((m) => m.symbol)
    .sort()

test('catches the company however the publisher spells it', () => {
  assert.deepEqual(hit('Prediction: Sept. 10 Will Be a Big Day for Nvidia Shareholders'), ['rNVDA'])
  assert.deepEqual(hit('STX Stock: The Math Hidden In Its Price'), ['rSTX'])
  assert.deepEqual(hit('CRWV Stock Takes a 13% Hit in 3 Months: Time to Buy, Hold or Bail Out?'), ['rCRWV'])
  assert.deepEqual(hit('Why Broadcom Stock Rallied Tuesday Morning'), ['rAVGO'])
  assert.deepEqual(hit('Nebius Rises 6% as Palantir Names It Preferred Sovereign AI Partner'), ['rNBIS'])
})

test('handles both spellings of SanDisk, which publishers disagree about', () => {
  assert.deepEqual(hit('Sandisk Jumps 12% as AI Storage Trade Keeps Running'), ['rSNDK'])
  assert.deepEqual(hit('Can SanDisk Stock Keep Climbing When It Cannot Make Enough To Sell?'), ['rSNDK'])
})

test('finds every holding named in a multi-company headline', () => {
  assert.deepEqual(hit('Dow Jones Futures: Dow Skids But AMD, HPE Are New Buys; Apple iPhone Event Due'), [
    'rAAPL',
    'rAMD',
  ])
  assert.deepEqual(hit('Bloom Energy Joins the S&P 500 as The Trade Desk Leaves'), ['rBE', 'rSPY'])
})

test('a story in a ticker feed that never names the company does not match it', () => {
  // Nvidia's own feed carried all of these. Matching them to Nvidia because of
  // where they arrived would be exactly the false confidence to avoid.
  for (const title of [
    'Why Okta Stock Soared 22% in August and Why There’s More Upside Ahead',
    'Why Phreesia Stock Got Knocked Down Today',
    "Constellation Energy's Biggest AI Power Deal Doesn't Start Paying Until June 2027",
  ]) {
    assert.deepEqual(hit(title), [], `${title} names no holding`)
  }
})

test('Musk headlines are deliberately left to the inference layer', () => {
  // Both Tesla and SpaceX would claim "Musk", so an alias for it would
  // attribute every Tesla story to SpaceX and the reverse. A named match must
  // stay something the reader can verify against the headline.
  assert.deepEqual(hit('Elon Musk’s Space Data Center Bet Faces a Reality Check'), [])
  assert.deepEqual(
    hit('An Under the Radar Rare Earth Comment From Elon Musk Could Upend Another Industry'),
    [],
  )
})
