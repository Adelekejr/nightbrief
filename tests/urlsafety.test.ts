import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALLOWED_ARTICLE_HOSTS,
  ARTICLE_URL_REJECTED,
  checkArticleUrl,
  checkRedirect,
} from '../lib/urlsafety.ts'
import { SOURCES } from '../lib/sources.ts'

const allow = (url: string) => {
  const r = checkArticleUrl(url)
  assert.ok(r.ok, `${url} should be allowed, got ${r.ok ? '' : r.code}`)
  return r
}

const refuse = (url: string, code: string) => {
  const r = checkArticleUrl(url)
  assert.ok(!r.ok, `${url} should be refused`)
  assert.equal(r.code, code, `${url} refused as ${r.code}, expected ${code}`)
  // Every refusal says the same thing outward. A caller that could tell a
  // private address apart from an unlisted domain would be learning the shape
  // of the network behind this.
  assert.equal(r.reason, ARTICLE_URL_REJECTED)
}

test('an approved publisher over https is accepted', () => {
  allow('https://www.cnbc.com/2026/09/14/chip-export-rules.html')
  allow('https://finance.yahoo.com/news/intel-stock-after-fourfold-year-120000123.html')
  allow('https://www.fool.com/investing/2026/09/14/should-you-buy-intel/')
  allow('https://247wallst.com/investing/2026/09/14/nvidia-leads-chip-selloff/')
  allow('https://www.federalreserve.gov/newsevents/pressreleases/monetary20260914a.htm')
})

test('subdomains of an approved publisher are accepted, and nothing above them', () => {
  allow('https://search.cnbc.com/rs/search/combinedcms/view.xml')
  // The config names the ECB's own host, so the ECB is admitted and the rest
  // of europa.eu is not.
  allow('https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.pr260914.en.html')
  refuse('https://europa.eu/some/page', 'not-allowed')
  refuse('https://notcnbc.com/a', 'not-allowed')
  // The classic suffix trick: a domain that merely ends with the allowed one.
  refuse('https://evilcnbc.com/a', 'not-allowed')
  refuse('https://cnbc.com.example.invalid/a', 'not-allowed')
})

test('http is refused', () => {
  refuse('http://www.cnbc.com/2026/09/14/story.html', 'not-https')
})

test('a malformed URL is refused', () => {
  refuse('not a url', 'malformed')
  refuse('://missing-scheme', 'malformed')
  refuse('', 'malformed')
})

test('every other protocol is refused', () => {
  for (const url of [
    'file:///etc/passwd',
    'data:text/html,<p>hello there this is a long enough paragraph.</p>',
    'javascript:alert(1)',
    'ftp://www.cnbc.com/a',
    'gopher://www.cnbc.com/a',
  ]) {
    refuse(url, 'not-https')
  }
})

test('a URL with no usable hostname is refused', () => {
  // Not as `no-host`: WHATWG parsing reads the first path segment of
  // `https:///a/b` as the host, so this arrives as the host "just" and the
  // allowlist is what refuses it. Either way it never reaches fetch.
  refuse('https:///just/a/path', 'not-allowed')
  refuse('https://', 'malformed')
})

test('localhost is refused', () => {
  refuse('https://localhost/admin', 'blocked-host')
  refuse('https://localhost:443/admin', 'blocked-host')
  refuse('https://ip6-localhost/admin', 'blocked-host')
})

test('127.0.0.1 and the rest of loopback are refused', () => {
  refuse('https://127.0.0.1/', 'blocked-host')
  refuse('https://127.0.0.1:443/', 'blocked-host')
  refuse('https://127.1.2.3/', 'blocked-host')
})

test('0.0.0.0 and private IPv4 ranges are refused', () => {
  for (const host of [
    '0.0.0.0',
    '10.0.0.1',
    '10.255.255.254',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '100.64.0.1', // carrier-grade NAT
    '224.0.0.1', // multicast
  ]) {
    refuse(`https://${host}/`, 'blocked-host')
  }
})

test('link-local is refused, including where cloud metadata lives', () => {
  refuse('https://169.254.169.254/latest/meta-data/', 'blocked-host')
  refuse('https://169.254.0.1/', 'blocked-host')
})

test('IPv6 loopback, link-local and unique-local are refused', () => {
  for (const host of ['[::1]', '[::]', '[fe80::1]', '[fc00::1]', '[fd12:3456::1]', '[::ffff:127.0.0.1]']) {
    refuse(`https://${host}/`, 'blocked-host')
  }
})

test('a public IP literal is still refused, because no publisher is one', () => {
  // Not private, so the address rules pass it — and the allowlist does not.
  refuse('https://93.184.216.34/', 'not-allowed')
})

test('an unapproved public domain is refused', () => {
  refuse('https://example.invalid/article', 'not-allowed')
  refuse('https://pastebin.com/raw/abc', 'not-allowed')
  // HTTPS alone buys nothing.
  refuse('https://attacker-controlled.test/looks-like-news.html', 'not-allowed')
})

test('credentials in the authority are refused', () => {
  // Reads as CNBC, resolves to something else.
  refuse('https://www.cnbc.com@example.invalid/a', 'blocked-host')
  refuse('https://user:pass@www.cnbc.com/a', 'blocked-host')
})

test('a non-default port is refused', () => {
  refuse('https://www.cnbc.com:8080/a', 'blocked-host')
  // The default, written out, is still the default.
  allow('https://www.cnbc.com:443/a')
})

test('a redirect to an unapproved domain is refused', () => {
  const from = new URL('https://finance.yahoo.com/news/story.html')

  const away = checkRedirect('https://example.invalid/elsewhere', from)
  assert.ok(!away.ok)
  assert.equal(away.code, 'not-allowed')
  assert.equal(away.reason, ARTICLE_URL_REJECTED)
})

test('a redirect into the private network is refused', () => {
  const from = new URL('https://finance.yahoo.com/news/story.html')

  for (const location of [
    'https://169.254.169.254/latest/meta-data/',
    'https://127.0.0.1/',
    'http://www.cnbc.com/a',
    'file:///etc/passwd',
  ]) {
    const hop = checkRedirect(location, from)
    assert.ok(!hop.ok, `${location} should be refused`)
    assert.equal(hop.reason, ARTICLE_URL_REJECTED)
  }
})

test('a relative redirect resolves against the page it came from', () => {
  const from = new URL('https://finance.yahoo.com/news/story.html')

  const same = checkRedirect('/news/story-final.html', from)
  assert.ok(same.ok)
  assert.equal(same.url.href, 'https://finance.yahoo.com/news/story-final.html')

  // And a redirect between two approved publishers is fine.
  const across = checkRedirect('https://www.fool.com/investing/final/', from)
  assert.ok(across.ok)
})

test('the allowlist is taken from the source configuration, not retyped', () => {
  // Every publisher this desk already reads can have its articles read too.
  // If a source is added, this passes without anyone remembering to edit the
  // allowlist; if one is removed, the allowlist narrows with it.
  for (const source of SOURCES) {
    const host = new URL(source.homepage).hostname.replace(/^www\./, '')
    assert.ok(
      ALLOWED_ARTICLE_HOSTS.includes(host),
      `${source.id} (${host}) is configured but its articles cannot be read`,
    )
  }

  // And it stays short. A long list is a list nobody has checked.
  assert.ok(ALLOWED_ARTICLE_HOSTS.length <= 20, `${ALLOWED_ARTICLE_HOSTS.length} hosts is too many`)
})

test('the publisher URLs the deployed desk actually produces still work', () => {
  // Shapes taken from the live feed: CNBC's own copy, a Fool story arriving
  // through a Yahoo ticker feed, and a Yahoo-hosted one.
  for (const url of [
    'https://www.cnbc.com/2026/09/14/stocks-making-the-biggest-moves-premarket.html',
    'https://www.fool.com/investing/2026/09/14/should-you-buy-intel-stock-after-a-nearly-fourfold/',
    'https://finance.yahoo.com/news/nvidia-leads-chip-selloff-210000456.html',
    'https://www.marketwatch.com/story/sp-500-dow-end-lower-as-oil-rallies-11694000000',
    'https://www.sec.gov/news/press-release/2026-140',
  ]) {
    allow(url)
  }
})
