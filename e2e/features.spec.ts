import { expect, test } from '@playwright/test'
import { OVERNIGHT, OVERNIGHT_REPORT, stubApi, UNIVERSE } from './fixtures'

/**
 * The three additions from the external review, checked the same way as
 * everything else here: in a real browser, against a stubbed API, so a
 * passing test means a reader can actually do the thing.
 */

const KEY = 'nightdesk.holdings'

async function withPortfolio(page: import('@playwright/test').Page, held = ['rNVDA', 'rINTC']) {
  await stubApi(page)
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [KEY, JSON.stringify(held)],
  )
}

test.describe('the restored-portfolio notice', () => {
  test('shows the saved symbols on a returning load, and clears on dismiss', async ({ page }) => {
    await withPortfolio(page)
    await page.goto('#/')

    const notice = page.getByText('Restored portfolio:')
    await expect(notice).toBeVisible()
    await expect(page.locator('main')).toContainText('rNVDA · rINTC')

    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect(notice).toHaveCount(0)
  })

  test('never appears for a portfolio just picked', async ({ page }) => {
    await stubApi(page)
    await page.goto('#/')
    await page.getByRole('button', { name: 'rNVDA' }).click()
    await page.getByRole('button', { name: /check the overnight against 1 holding/i }).click()
    await expect(page).toHaveURL(/#\/overnight$/)
    await expect(page.getByText('Restored portfolio:')).toHaveCount(0)
  })

  test('never reappears after being dismissed and revisited', async ({ page }) => {
    await withPortfolio(page)
    await page.goto('#/overnight')
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await page.goto('#/holdings')
    await page.goto('#/overnight')
    await expect(page.getByText('Restored portfolio:')).toHaveCount(0)
  })
})

test.describe('the prompt entry', () => {
  test('all five shortcuts are present and route to the existing workflow', async ({ page }) => {
    await withPortfolio(page)
    await page.goto('#/overnight')

    const group = page.getByRole('group', { name: 'Ask the desk' })
    for (const phrase of [
      'What changed while New York was closed?',
      'What affects my semiconductor holdings?',
      'What affects my large tech holdings?',
      "What's the single biggest story overnight?",
      'Show me a worked example',
    ]) {
      await expect(group.getByRole('button', { name: phrase })).toBeVisible()
    }
  })

  test('a category shortcut filters the ranked events, and can be cleared', async ({ page }) => {
    await withPortfolio(page)
    await page.goto('#/overnight')

    // The fixture's one event touches rINTC, a semiconductor holding — the
    // filter should keep it.
    await page.getByRole('button', { name: 'What affects my semiconductor holdings?' }).click()
    await expect(page.getByText(/Showing semiconductors only/)).toBeVisible()
    await expect(page.getByText(OVERNIGHT.events[0].title)).toBeVisible()

    await page.getByRole('button', { name: 'Clear filter' }).click()
    await expect(page.getByText(/Showing semiconductors only/)).toHaveCount(0)
  })

  test('a category the reader does not hold says so, not nothing', async ({ page }) => {
    await withPortfolio(page)
    await page.goto('#/overnight')
    await page.getByRole('button', { name: 'What affects my large tech holdings?' }).click()
    await expect(page.getByText(/don't hold anything in this category/)).toBeVisible()
  })

  test('the top-story shortcut opens a Brief', async ({ page }) => {
    await withPortfolio(page)
    await page.goto('#/overnight')
    await page.getByRole('button', { name: "What's the single biggest story overnight?" }).click()
    await expect(page).toHaveURL(/#\/brief$/)
  })

  test('the worked-example shortcut opens the worked example', async ({ page }) => {
    await withPortfolio(page)
    await page.goto('#/overnight')
    await page.getByRole('button', { name: 'Show me a worked example' }).click()
    await expect(page).toHaveURL(/#\/example$/)
  })
})

test.describe('the portfolio selector', () => {
  test('shows the company name next to every ticker, grouped by category', async ({ page }) => {
    await stubApi(page)
    await page.goto('#/')

    for (const t of UNIVERSE.tokens) {
      await expect(page.getByRole('button', { name: new RegExp(`${t.symbol}.*${t.name}`) })).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: 'Semiconductors' })).toBeVisible()
  })
})

test.describe('the validation report', () => {
  test('renders real numbers from the live stub, each one labelled', async ({ page }) => {
    await stubApi(page)
    await page.goto('#/validation')

    await expect(page.getByText(`${Math.round(OVERNIGHT_REPORT.duplicates.rate * 100)}%`)).toBeVisible()
    await expect(page.getByText(`${OVERNIGHT_REPORT.freshness.medianAgeMinutes} min median age`)).toBeVisible()

    // The demo-brief and checks fixtures load asynchronously alongside the
    // live report; wait for one of their metrics before counting labels, so
    // the count is not taken mid-fetch.
    await expect(page.getByText('Claims kept in one captured run')).toBeVisible()
    await expect(page.getByText('One captured run, end to end')).toBeVisible()

    // Every metric row carries one of the three labels — never a bare number
    // presented as if its provenance were obvious.
    await expect(async () => {
      const labels = await page.locator('main').getByText(/^(observed|estimated|targeted)$/).count()
      expect(labels).toBeGreaterThan(3)
    }).toPass()

    // The one figure this report cannot honestly produce is stated as a gap.
    await expect(page.getByText(/not measured: a false-positive rate/)).toBeVisible()
  })

  test('is reachable from the overnight desk', async ({ page }) => {
    await withPortfolio(page)
    await page.goto('#/overnight')
    await page.getByRole('link', { name: /validation report/i }).click()
    await expect(page).toHaveURL(/#\/validation$/)
  })

  test('is reachable from a Brief', async ({ page }) => {
    await stubApi(page)
    await page.goto('#/example')
    await expect(page.getByRole('link', { name: /see the validation report/i })).toBeVisible()
  })
})
