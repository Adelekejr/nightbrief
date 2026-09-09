import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHash } from '../src/routes.ts'

test('the holdings editor is its own route', () => {
  // Regression guard. The editor used to live on the first-run gate, which
  // redirected away whenever a portfolio existed — so "Change holdings" was a
  // button that silently did nothing. Only '/' may ever forward.
  assert.equal(parseHash('#/holdings').name, 'holdings')
  assert.notEqual(parseHash('#/holdings').name, 'gate')
})

test('parses the routes the interface links to', () => {
  assert.equal(parseHash('#/').name, 'gate')
  assert.equal(parseHash('').name, 'gate')
  assert.equal(parseHash('#/overnight').name, 'overnight')
  assert.equal(parseHash('#/brief').name, 'brief')
  assert.equal(parseHash('#/browse').name, 'browse')
  assert.equal(parseHash('#/example').name, 'example')
})

test('an unknown hash lands somewhere valid rather than blank', () => {
  assert.equal(parseHash('#/nonsense').name, 'gate')
})
