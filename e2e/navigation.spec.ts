import { expect, test } from '@playwright/test'
import { stubApi, UNIVERSE } from './fixtures'

/**
 * Every check here corresponds to a defect a reader had to report by hand.
 * A control that renders but does nothing passes the type checker and every
 * unit test in this repo; it only fails in a browser.
 */

const KEY = 'nightdesk.holdings'

async function withPortfolio(page: import('@playwright/test').Page, held = ['rNVDA', 'rINTC']) {
  await stubApi(page)
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [KEY, JSON.stringify(held)],
  )
}

/** Scoped to the banner: a Brief carries its own "back to the desk" button,
 *  and the point of these checks is the masthead specifically. */
const masthead = (page: import('@playwright/test').Page) => page.getByRole('banner')

const wordmark = (page: import('@playwright/test').Page) =>
  masthead(page).getByRole('button', { name: /back to the (top|overnight desk)/i })

const portfolioButton = (page: import('@playwright/test').Page) =>
  masthead(page).getByRole('button', { name: /portfolio ·|set your portfolio/i })

test.describe('the masthead', () => {
  test('is present and live on every screen', async ({ page }) => {
    await withPortfolio(page)

    for (const hash of ['#/', '#/overnight', '#/holdings', '#/browse', '#/example']) {
      await page.goto(hash)
      const mark = wordmark(page)
      await expect(mark, `wordmark missing at ${hash}`).toBeVisible()
      await expect(mark, `wordmark dead at ${hash}`).toBeEnabled()
      await expect(portfolioButton(page), `portfolio control missing at ${hash}`).toBeEnabled()
    }
  })

  test('returns to the desk from a Brief', async ({ page }) => {
    await withPortfolio(page)
    await page.goto('#/example')
    await wordmark(page).click()
    await expect(page).toHaveURL(/#\/overnight$/)
  })

  test('opens the holdings editor from anywhere', async ({ page }) => {
    await withPortfolio(page)
    await page.goto('#/overnight')
    await portfolioButton(page).click()
    await expect(page).toHaveURL(/#\/holdings$/)
    await expect(page.getByRole('button', { name: 'rNVDA' })).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('clearing the portfolio', () => {
  // The reader's words: "if i press clear all it means I want to check
  // something else entirely not been forced to the previous selection again".
  for (const [where, hash] of [['the editor', '#/holdings'], ['the gate', '#/']] as const) {
    test(`from ${where} leaves nothing behind`, async ({ page }) => {
      await withPortfolio(page)
      await page.goto(hash)
      // The gate forwards when a portfolio exists; reach it the way a reader does.
      if (hash === '#/') await portfolioButton(page).click()

      await page.getByRole('button', { name: 'Clear all' }).click()

      await expect(page.getByRole('button', { name: 'rNVDA' })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
      await expect(portfolioButton(page)).toHaveText(/set your portfolio/i)

      const saved = await page.evaluate((k) => window.localStorage.getItem(k), KEY)
      expect(saved, 'the cleared portfolio was still on disk').toBe('[]')

      // The reader must not be stranded on a screen with every exit closed.
      await wordmark(page).click()
      await expect(page).toHaveURL(/#\/$/)
      await expect(page.getByRole('button', { name: 'rNVDA' })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    })
  }
})

test.describe('the first run', () => {
  test('gate offers the whole verified universe and forwards once picked', async ({ page }) => {
    await stubApi(page)
    await page.goto('#/')

    for (const t of UNIVERSE.tokens) {
      await expect(page.getByRole('button', { name: t.symbol })).toBeVisible()
    }

    const go = page.getByRole('button', { name: /pick at least one holding/i })
    await expect(go).toBeDisabled()

    await page.getByRole('button', { name: 'rNVDA' }).click()
    await page.getByRole('button', { name: /check the overnight against 1 holding/i }).click()
    await expect(page).toHaveURL(/#\/overnight$/)
  })

  test('no route renders a blank screen', async ({ page }) => {
    await stubApi(page)
    // #/checks was linked from every Brief and every route before it for a
    // stretch of this project's history without ever being wired into the
    // router — a dead link nothing in this list had caught until it did.
    for (const hash of [
      '#/',
      '#/holdings',
      '#/browse',
      '#/example',
      '#/brief',
      '#/checks',
      '#/validation',
      '#/nonsense',
    ]) {
      await page.goto(hash)
      const text = ((await page.locator('main').innerText()) ?? '').trim()
      expect(text.length, `${hash} rendered nothing`).toBeGreaterThan(40)
    }
  })
})
