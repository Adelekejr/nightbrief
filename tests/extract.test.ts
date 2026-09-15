import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractArticle, paragraphsFrom } from '../lib/extract.ts'
import { ARTICLE_URL_REJECTED } from '../lib/urlsafety.ts'

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

test('closes the gap before a possessive left by a stripped link', () => {
  const html =
    `<p><a href="/asml">ASML</a> 's newest machines are being adopted, the company said today.</p>`
  assert.match(paragraphsFrom(html), /^ASML's newest machines/)
})

test('drops duplicated paragraphs', () => {
  const p = '<p>This exact paragraph appears twice in the markup, as publishers often do.</p>'
  assert.equal(paragraphsFrom(p + p).split('\n').length, 1)
})

test('respects the character budget', () => {
  const long = `<p>${'word '.repeat(400)}.</p>`.repeat(10)
  assert.ok(paragraphsFrom(long, 1000).length <= 1000)
})

/**
 * The gate, checked where it actually sits: in front of fetch.
 *
 * These stub the global fetch so a test failing means a request was about to
 * leave the machine, rather than meaning a network was slow.
 */
test('a refused URL never reaches the network, and says only the safe thing', async () => {
  const real = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    throw new Error('fetch should not have been called')
  }) as typeof fetch

  try {
    for (const url of [
      'http://www.cnbc.com/a',
      'file:///etc/passwd',
      'https://127.0.0.1/',
      'https://169.254.169.254/latest/meta-data/',
      'https://localhost/',
      'https://example.invalid/article',
      'not a url',
    ]) {
      const out = await extractArticle(url)
      assert.equal(out.ok, false, `${url} was extracted`)
      assert.equal(
        out.ok ? '' : out.reason,
        ARTICLE_URL_REJECTED,
        `${url} leaked a reason more specific than the public one`,
      )
    }
    assert.equal(calls, 0, 'a refused URL still went to the network')
  } finally {
    globalThis.fetch = real
  }
})

test('a refused URL is a failed extraction, which the Brief already falls back from', async () => {
  // The contract api/analyze.ts depends on: `extraction.ok === false` means
  // "use the feed's own summary and mark the body as not retrieved". Refusing
  // a URL is that same shape, not a new error path — which is why the Brief
  // keeps working for a story this desk is not allowed to fetch.
  const out = await extractArticle('https://example.invalid/article')

  assert.equal(out.ok, false)
  assert.ok(!out.ok && typeof out.reason === 'string' && out.reason.length > 0)
  assert.ok(!out.ok && typeof out.ms === 'number')
  // Nothing in the refusal names a host, an address or a rule.
  assert.ok(!out.ok && !/127\.|169\.254|localhost|private|internal/i.test(out.reason))
})
