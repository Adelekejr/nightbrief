import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, UNIVERSE, UNIVERSE_SOURCE } from '../lib/universe.ts'

test('resolves the forms a half-awake trader actually types', () => {
  const expectations: Array<[string, string]> = [
    ['rNVDA', 'rNVDA'],
    ['NVDA', 'rNVDA'],
    ['nvidia', 'rNVDA'],
    ['rNVDA/USDT', 'rNVDA'],
    ['  rmu  ', 'rMU'],
    ['BE', 'rBE'],
    ['SPY', 'rSPY'],
  ]

  for (const [input, symbol] of expectations) {
    const r = resolve(input)
    assert.equal(r.known, true, `expected ${input} to resolve`)
    assert.equal(r.known && r.token.symbol, symbol)
  }
})

test('refuses to guess at symbols nobody confirmed', () => {
  for (const input of ['GOOGL', 'rGOOGL', '', 'not a ticker']) {
    assert.equal(resolve(input).known, false, `${input} should not resolve`)
  }
})

test('every entry carries the fields the analysis layer depends on', () => {
  for (const t of UNIVERSE) {
    assert.match(t.symbol, /^r[A-Z]+$/, `${t.symbol} should be r + ticker`)
    assert.equal(t.pair, `${t.symbol}/USDT`)
    assert.equal(t.symbol, `r${t.underlying}`, `${t.symbol} should match its underlying`)
    assert.ok(t.business.length > 40, `${t.symbol} needs a usable description`)
    // Index names legitimately contain digits ("S&P 500"). What must never
    // appear is a market figure: a price, a percentage, an amount.
    assert.doesNotMatch(t.business, /[$€£%]/, `${t.symbol}: no currency or percent`)
    assert.doesNotMatch(t.business, /\d+\.\d/, `${t.symbol}: no decimal figures`)
    assert.doesNotMatch(t.business, /\b\d{4,}\b/, `${t.symbol}: no large raw numbers`)
  }
})

test('the universe declares itself incomplete', () => {
  // An unrecognised symbol must mean "unverified", never "does not exist".
  assert.equal(UNIVERSE_SOURCE.complete, false)
  assert.ok(UNIVERSE_SOURCE.capturedOn)
})
