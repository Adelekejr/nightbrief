import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lastCloseFromCsv } from '../lib/prices.ts'

const CSV = `Date,Open,High,Low,Close,Volume
2026-09-04,220.10,224.00,219.50,223.40,41000000
2026-09-08,224.00,227.30,223.10,225.95,38500000`

test('takes the closing price from the most recent row', () => {
  const out = lastCloseFromCsv(CSV, 'nvda')
  assert.equal(out.ok, true)
  assert.equal(out.ok && out.close.close, 225.95)
  assert.equal(out.ok && out.close.date, '2026-09-08')
  assert.equal(out.ok && out.close.ticker, 'NVDA')
})

test('refuses a response with no data rows', () => {
  assert.equal(lastCloseFromCsv('Date,Open,High,Low,Close,Volume', 'nvda').ok, false)
  assert.equal(lastCloseFromCsv('', 'nvda').ok, false)
})

test('refuses an unparseable price rather than coercing it', () => {
  // A zero or a NaN rendered on screen would read as a price.
  const bad = 'Date,Open,High,Low,Close,Volume\n2026-09-08,1,1,1,N/A,1'
  assert.equal(lastCloseFromCsv(bad, 'nvda').ok, false)

  const zero = 'Date,Open,High,Low,Close,Volume\n2026-09-08,1,1,1,0,1'
  assert.equal(lastCloseFromCsv(zero, 'nvda').ok, false)
})

test('refuses a row whose date is not a date', () => {
  const bad = 'Date,Open,High,Low,Close,Volume\nyesterday,1,1,1,225.95,1'
  assert.equal(lastCloseFromCsv(bad, 'nvda').ok, false)
})

test('handles columns arriving in another order', () => {
  const out = lastCloseFromCsv('Close,Date\n225.95,2026-09-08', 'nvda')
  assert.equal(out.ok && out.close.close, 225.95)
})
