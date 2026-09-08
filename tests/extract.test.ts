import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paragraphsFrom } from '../lib/extract.ts'

test('keeps real prose and drops furniture', () => {
  const html = `
    <nav><p>Home</p></nav>
    <script>var p = "<p>this is not content and should never be read as prose.</p>";</script>
    <div>
      <p>Sign up</p>
      <p>Brent crude rose sharply on Tuesday after reports of attacks on energy facilities, according to traders.</p>
      <p class="caption">A photo</p>
      <p>Analysts said the move reflected a supply risk premium rather than any change in demand expectations.</p>
    </div>`

  const out = paragraphsFrom(html)
  assert.match(out, /Brent crude rose sharply/)
  assert.match(out, /supply risk premium/)
  assert.doesNotMatch(out, /Sign up/)
  assert.doesNotMatch(out, /Home/)
  assert.doesNotMatch(out, /never be read as prose/)
})

test('decodes entities and collapses whitespace', () => {
  const html = '<p>The company&#x2019;s outlook   improved &amp; margins held, executives said.</p>'
  assert.equal(
    paragraphsFrom(html),
    'The company’s outlook improved & margins held, executives said.',
  )
})

test('closes the gap left where inline tags were removed', () => {
  const html =
    '<p>Samsung and <a href="/tsmc">TSMC</a> , the two biggest chipmakers, committed to the tools ( per ASML ) .</p>'
  assert.equal(
    paragraphsFrom(html),
    'Samsung and TSMC, the two biggest chipmakers, committed to the tools (per ASML).',
  )
})

test('drops duplicated paragraphs', () => {
  const p = '<p>This exact paragraph appears twice in the markup, as publishers often do.</p>'
  assert.equal(paragraphsFrom(p + p).split('\n').length, 1)
})

test('respects the character budget', () => {
  const long = `<p>${'word '.repeat(400)}.</p>`.repeat(10)
  assert.ok(paragraphsFrom(long, 1000).length <= 1000)
})
