import { expect, test } from '@playwright/test'
import { MARKET_CONTEXT, MARKET_CONTEXT_DOWN, stubApi } from './fixtures'

/**
 * The market-context block, in a real browser.
 *
 * The claims worth checking here are not "does a number appear" — they are the
 * three things Phase 1 measured and that the wording must never outrun: the
 * quote is delayed, Bitget served it rather than printed it, and it says
 * nothing about the rToken. Each of those is a sentence that a later edit
 * could quietly soften, so each has a test.
 */

const block = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Market context' })

test.describe('with the provider available', () => {
  test('names the underlying share, not the token, and prices it', async ({ page }) => {
    await stubApi(page)
    await page.goto('#/example')

    const context = block(page)
    await expect(context).toBeVisible()
    await expect(context).toContainText('NVDA')
    await expect(context).toContainText('187.42')
    // The token is named only as what the share sits behind.
    await expect(context).toContainText('The US-listed share behind rNVDA.')
  })

  test('never calls the figure live or real-time, and states its age', async ({ page }) => {
    await stubApi(page)
    await page.goto('#/example')

    const context = block(page)
    await expect(context).toContainText('Observed 15 minutes before it was read.')
    // The whole block, not just the freshness line: the word must not appear
    // anywhere near this number by any route.
    await expect(context).not.toContainText(/\blive\b/i)
    await expect(context).not.toContainText(/real[- ]?time/i)
  })

  test('attributes to IEX via Bitget, never to Bitget as the source', async ({ page }) => {
    await stubApi(page)
    await page.goto('#/example')

    const context = block(page)
    await expect(context).toContainText('via Bitget, sourced from IEX')
  })

  test('prints both the observation time and the time it was read', async ({ page }) => {
    await stubApi(page)
    await page.goto('#/example')

    const context = block(page)
    // 19:11 observed, 19:26 read — the fifteen minutes, on screen, checkable.
    await expect(context).toContainText('observed 19:11 UTC')
    await expect(context).toContainText('read 19:26 UTC')
  })

  test('carries the line saying what the quote does not establish', async ({ page }) => {
    await stubApi(page)
    await page.goto('#/example')
    await expect(block(page)).toContainText(
      /does not establish the rToken.s price, its direction, or the outcome of any trade/,
    )
  })

  test('sits after the evidence and before the transmission chain', async ({ page }) => {
    await stubApi(page)
    await page.goto('#/example')
    await expect(block(page)).toBeVisible()

    const order = await page.evaluate(() => {
      const text = (sel: string) => document.querySelector(sel)
      void text
      const headings = [...document.querySelectorAll('h2, h3')].map((h) => h.textContent ?? '')
      return {
        evidence: headings.findIndex((h) => /what the source actually says|evidence/i.test(h)),
        context: headings.findIndex((h) => /market context/i.test(h)),
        chain: headings.findIndex((h) => /how it reaches your holdings/i.test(h)),
      }
    })

    expect(order.context).toBeGreaterThan(-1)
    expect(order.chain).toBeGreaterThan(order.context)
    if (order.evidence > -1) expect(order.context).toBeGreaterThan(order.evidence)
  })

  test('asks for one holding only, not one call per exposure', async ({ page }) => {
    const asked: string[] = []
    await stubApi(page)
    await page.route('**/api/market-context*', (route) => {
      asked.push(new URL(route.request().url()).searchParams.get('holding') ?? '')
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MARKET_CONTEXT),
      })
    })

    await page.goto('#/example')
    await expect(block(page)).toContainText('187.42')

    // The worked example reaches four holdings. A block per exposure would be
    // four calls against a provider that publishes no rate ceiling.
    expect(asked).toEqual(['rNVDA'])
  })

  test('is not fetched on the landing screen, before any Brief is open', async ({ page }) => {
    let calls = 0
    await stubApi(page)
    await page.route('**/api/market-context*', (route) => {
      calls += 1
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MARKET_CONTEXT),
      })
    })

    await page.goto('#/')
    await expect(page.getByRole('button', { name: 'rNVDA' })).toBeVisible()
    expect(calls).toBe(0)
  })
})

test.describe('with the provider unavailable', () => {
  test('the block stays on screen and names who did not answer', async ({ page }) => {
    await stubApi(page, { '**/api/market-context*': MARKET_CONTEXT_DOWN })
    await page.goto('#/example')

    const context = block(page)
    await expect(context).toBeVisible()
    await expect(context).toContainText('Bitget market data was not available')
    await expect(context).toContainText('Bitget was asked at 19:26 UTC and did not answer.')
  })

  test('shows no number in place of the one it could not get', async ({ page }) => {
    await stubApi(page, { '**/api/market-context*': MARKET_CONTEXT_DOWN })
    await page.goto('#/example')

    const context = block(page)
    // The failure mode this guards: the last close from a different provider
    // quietly filling the gap and reading as Bitget's figure.
    await expect(context).not.toContainText(/\d+\.\d\d/)
    await expect(context).toContainText('No quote for NVDA is shown here.')
  })

  test('a transport failure is distinguishable from a provider refusal', async ({ page }) => {
    await stubApi(page)
    await page.route('**/api/market-context*', (route) => route.fulfill({ status: 502, body: '' }))
    await page.goto('#/example')

    await expect(block(page)).toContainText('did not complete')
  })
})

test('fits 360px with no horizontal overflow, in both states', async ({ page }) => {
  for (const body of [MARKET_CONTEXT, MARKET_CONTEXT_DOWN]) {
    await stubApi(page, { '**/api/market-context*': body })
    await page.setViewportSize({ width: 360, height: 780 })
    await page.goto('#/example')
    await expect(block(page)).toBeVisible()

    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      block: (() => {
        const el = document.querySelector('[aria-label="Market context"]') as HTMLElement | null
        return el ? el.scrollWidth - el.clientWidth : 0
      })(),
    }))
    expect(overflow.doc, 'the page must not scroll sideways').toBeLessThanOrEqual(0)
    expect(overflow.block, 'the block must not scroll sideways').toBeLessThanOrEqual(0)
  }
})
