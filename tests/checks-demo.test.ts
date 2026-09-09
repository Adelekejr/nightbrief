import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHECKS_DECLARED, CHECKS_EVIDENCE, CORRUPTED_BRIEF } from '../lib/checks-demo.ts'
import { REDACTION, validateBrief } from '../lib/validate.ts'

const run = () =>
  validateBrief({
    brief: CORRUPTED_BRIEF,
    evidence: CHECKS_EVIDENCE,
    declaredSymbols: CHECKS_DECLARED,
  })

test('every planted fault is actually caught', () => {
  const { brief, validation, rejections, stats } = { ...run(), validation: null }
  void validation

  assert.equal(stats.chainDropped, 2, 'the fabricated citation and the invented figure')
  assert.equal(stats.exposuresDropped, 2, 'the undeclared holding and the unverified symbol')
  assert.equal(stats.quotesDropped, 1, 'the quote that is not in the article')
  assert.equal(stats.figuresRedacted, 1, 'the invented figure in the headline')

  const reasons = rejections.map((r) => r.reason).join(' | ')
  assert.match(reasons, /cited no source that was supplied/)
  assert.match(reasons, /figure that appears in no supplied source/)
  assert.match(reasons, /holdings the user declared/)
  assert.match(reasons, /verified rToken universe/)
  assert.match(reasons, /verbatim/)

  assert.ok(brief.headline.includes(REDACTION), 'the headline figure is struck out in place')
  assert.ok(!brief.headline.includes('$740'))
})

test('the honest parts survive intact', () => {
  const { brief, stats } = run()

  assert.equal(stats.chainKept, 1)
  assert.equal(brief.chain[0].basis, 'inferred', 'an inference citing nothing is legitimate')

  assert.equal(stats.exposuresKept, 1)
  assert.equal(brief.exposures[0].symbol, 'rNVDA')

  assert.equal(stats.quotesKept, 1)
  assert.match(brief.quotes[0].text, /High NA EUV tools/)
})

test('references to dropped links do not survive on the exposure that cited them', () => {
  const { brief } = run()
  // Step 2 was dropped, so the surviving exposure must not still point at it.
  assert.deepEqual(brief.exposures[0].chainSteps, [1])
})

test('an empty unknowns list is reported rather than printed as nothing', () => {
  const { brief } = run()
  assert.equal(CORRUPTED_BRIEF.unknowns.length, 0, 'the fixture supplies none')
  assert.equal(brief.unknowns.length, 1)
  assert.match(brief.unknowns[0], /Treat that as a gap/)
})
