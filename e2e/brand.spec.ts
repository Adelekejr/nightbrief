import { expect, test } from '@playwright/test'
import { stubApi } from './fixtures'

/**
 * The identity assets, checked as files rather than as intentions.
 *
 * A social image that is not actually reachable at the URL the meta tag names
 * is worse than none: the card renders blank and the link looks broken. So
 * these fetch the real files out of the built output the preview server is
 * serving, and read their bytes.
 */

const KEY = 'nightdesk.holdings'

test.describe('the assets exist and are what they claim', () => {
  for (const [path, type] of [
    ['/favicon.svg', /image\/svg\+xml/],
    ['/apple-touch-icon.png', /image\/png/],
    ['/og.png', /image\/png/],
  ] as const) {
    test(`${path} is served`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status(), `${path} is not reachable`).toBe(200)
      expect(res.headers()['content-type']).toMatch(type)
      expect((await res.body()).byteLength).toBeGreaterThan(300)
    })
  }

  test('the social image is genuinely 1200x630', async ({ request }) => {
    // Read it out of the PNG header rather than trusting the meta tag: a
    // scraper crops to its own ratio and a mis-sized image is cropped wrong.
    const png = await (await request.get('/og.png')).body()
    expect(png.subarray(1, 4).toString('ascii'), 'not a PNG').toBe('PNG')
    expect(png.subarray(12, 16).toString('ascii'), 'no IHDR').toBe('IHDR')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
  })

  test('the touch icon is genuinely 180x180', async ({ request }) => {
    const png = await (await request.get('/apple-touch-icon.png')).body()
    expect(png.readUInt32BE(16)).toBe(180)
    expect(png.readUInt32BE(20)).toBe(180)
  })

  test('the favicon carries its own background, for light chrome too', async ({ request }) => {
    const svg = await (await request.get('/favicon.svg')).text()
    // An amber-and-cream mark with no tile behind it vanishes against a light
    // tab strip. The tile is what makes it work in both.
    expect(svg).toMatch(/<rect[^>]*fill="#16130f"/)
    expect(svg).toContain('#e8a33d')
  })
})

test.describe('the page head', () => {
  test('carries the social tags, with absolute URLs', async ({ page }) => {
    await stubApi(page)
    await page.goto('/')

    const meta = (selector: string) =>
      page.locator(selector).first().getAttribute('content')

    expect(await page.title()).toMatch(/Nightbrief/)
    expect(await meta('meta[property="og:title"]')).toMatch(/Nightbrief/)
    expect(await meta('meta[property="og:description"]')).toBeTruthy()
    expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image')

    // Relative URLs in these resolve against nothing at the other end.
    for (const selector of ['meta[property="og:url"]', 'meta[property="og:image"]']) {
      expect(await meta(selector), `${selector} is not absolute`).toMatch(/^https:\/\//)
    }
    expect(await meta('meta[property="og:image"]')).toMatch(/\/og\.png$/)

    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      '/apple-touch-icon.png',
    )
  })
})

test.describe('the mark in the masthead', () => {
  test('is present on every screen, and silent to a screen reader', async ({ page }) => {
    await stubApi(page)
    await page.addInitScript(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      [KEY, JSON.stringify(['rNVDA', 'rINTC'])],
    )

    for (const hash of ['#/', '#/overnight', '#/holdings', '#/browse', '#/example']) {
      await page.goto(hash)
      const mark = page.getByRole('banner').locator('svg')
      await expect(mark, `no mark at ${hash}`).toHaveCount(1)
      // The wordmark beside it already says the name; announcing it twice is
      // noise to anyone listening rather than looking.
      await expect(mark).toHaveAttribute('aria-hidden', 'true')
    }
  })

  test('takes the wordmark ink, and spends amber on one element only', async ({ page }) => {
    await stubApi(page)
    await page.goto('/')

    const fills = await page.getByRole('banner').locator('svg *').evaluateAll((nodes) =>
      nodes.map((n) => {
        const s = getComputedStyle(n)
        return { stroke: s.stroke, fill: s.fill }
      }),
    )

    // currentColor resolves to the wordmark's own ink, so the mark moves with
    // it rather than being a second colour decision.
    const paper = 'rgb(237, 230, 216)'
    const signal = 'rgb(232, 163, 61)'
    expect(fills.filter((f) => f.stroke === paper).length).toBeGreaterThanOrEqual(3)
    expect(fills.filter((f) => f.fill === signal), 'amber is not on exactly one element').toHaveLength(1)
  })

  test('does not push the masthead controls out of reach', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'thumb targets only matter on a touch screen')
    await stubApi(page)
    await page.goto('/')

    const box = await page
      .getByRole('banner')
      .getByRole('button', { name: /back to the|nightbrief/i })
      .boundingBox()
    // The mark sits inside the wordmark's button; a taller box would be fine,
    // a shorter one would mean it had displaced the text's line box.
    expect(box!.height).toBeGreaterThanOrEqual(40)
  })
})
