import { expect, test } from '@playwright/test'
import { CHECKS } from './fixtures'

/**
 * The two links a judge opens first, reached the way a judge reaches them:
 * a URL pasted into a browser that has never seen this site.
 *
 * No seeded localStorage, no prior navigation, no warm React state. Both of
 * these routes have rendered blank in this project's history — #/example
 * because the worked example only loaded as a side effect of the button that
 * opened it, and #/checks because it returned a loading line in place of the
 * whole page. Both were fixed; this is what keeps them fixed.
 */

test.describe('cold link, fresh browser', () => {
  test('#/example renders the worked example with no prior state', async ({ page, context }) => {
    // Prove the context really is cold before doing anything else.
    expect(await context.cookies()).toEqual([])

    // Only the checks fixture is stubbed; /demo-brief.json is the real static
    // file the deployment serves, so this exercises the true path.
    await page.route('**/api/checks*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHECKS) }),
    )

    await page.goto('/#/example')

    const stored = await page.evaluate(() => window.localStorage.length)
    expect(stored, 'the browser was not actually cold').toBe(0)

    // Real captured content, not a loading state.
    await expect(page.getByText(/Worked example|Sample data/).first()).toBeVisible()
    await expect(page.getByText(/TSMC|Samsung|ASML/).first()).toBeVisible()
    await expect(page.getByRole('banner')).toBeVisible()

    const body = ((await page.locator('main').innerText()) ?? '').trim()
    expect(body.length, '#/example rendered almost nothing').toBeGreaterThan(400)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, '#/example scrolls sideways').toBeLessThanOrEqual(1)
  })

  test('#/checks renders the validator demonstration with no prior state', async ({ page }) => {
    await page.route('**/api/checks*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHECKS) }),
    )

    await page.goto('/#/checks')

    const stored = await page.evaluate(() => window.localStorage.length)
    expect(stored, 'the browser was not actually cold').toBe(0)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/claims removed/)).toBeVisible()
    await expect(page.getByText(/What was planted, and what happened/)).toBeVisible()

    const body = ((await page.locator('main').innerText()) ?? '').trim()
    expect(body.length, '#/checks rendered almost nothing').toBeGreaterThan(400)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, '#/checks scrolls sideways').toBeLessThanOrEqual(1)
  })

  test('both cold links offer a way onward, not a dead end', async ({ page }) => {
    await page.route('**/api/checks*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHECKS) }),
    )

    for (const hash of ['/#/example', '/#/checks']) {
      await page.goto(hash)
      // The masthead is the way back and must be live on a cold load too.
      const mark = page.getByRole('banner').getByRole('button', { name: /back to the/i })
      await expect(mark, `no live masthead at ${hash}`).toBeEnabled()
      await mark.click()
      await expect(page, `${hash} did not lead anywhere`).toHaveURL(/#\/$/)
    }
  })
})
