import { expect, test } from '@playwright/test'
import { OVERNIGHT, stubApi } from './fixtures'

/**
 * Phase 5. Everything the interface does when the world does not cooperate:
 * nothing found, a source down, a slow answer, content longer than the
 * column it sits in.
 *
 * The rule these all check is one this project states about itself — never
 * show nothing, and never let an absence of data read as an absence of
 * events. A screen that says nothing is the failure mode; a screen that says
 * "nothing was found, here is what was searched" is the product.
 */

const KEY = 'nightdesk.holdings'

async function seeded(page: import('@playwright/test').Page, overrides = {}) {
  await stubApi(page, overrides)
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k as string, v as string),
    [KEY, JSON.stringify(['rNVDA', 'rINTC'])],
  )
}

/** Every screen must say something. A heading with nothing under it is the
 *  blank-screen defect wearing a hat. */
async function saysSomething(page: import('@playwright/test').Page, where: string) {
  const text = ((await page.locator('main').innerText()) ?? '').trim()
  expect(text.length, `${where} rendered almost nothing`).toBeGreaterThan(60)
}

test.describe('empty states', () => {
  test('an overnight with no events reads as a finding, not a failure', async ({ page }) => {
    await seeded(page, {
      '**/api/overnight*': { ...OVERNIGHT, events: [], holdings: { ...OVERNIGHT.holdings, touchedCount: 0 } },
    })
    await page.goto('#/overnight')

    await expect(page.getByText('Nothing overnight reached your holdings.')).toBeVisible()
    await expect(page.getByText(/That is a finding, not a failure/)).toBeVisible()
    // What was searched has to be visible, or "nothing" is unreadable.
    await expect(page.getByText(/40 stories/).first()).toBeVisible()
  })

  test('a feed with no stories says so', async ({ page }) => {
    await seeded(page)
    await page.goto('#/browse')

    // Wait for the fetch to land before measuring — innerText does not
    // retry, and the loading state would otherwise be what gets counted.
    await expect(page.getByText(/No stories came back this time/)).toBeVisible()
    // The dangling "live from" with nothing after it, when every source is
    // down, was in this copy until this check went in.
    await expect(page.getByText(/live from\s*$/)).toHaveCount(0)
    await saysSomething(page, '#/browse with an empty feed')
  })

  test('no closing prices at all still says something', async ({ page }) => {
    await seeded(page)
    await page.goto('#/overnight')
    // The stub returns closes: [] and unavailable: [] — the case where the
    // provider answered and had nothing.
    await expect(page.getByText(/no closing prices/i)).toBeVisible()
  })
})

test.describe('source failures', () => {
  const failing = (pattern: string) => ({ [pattern]: null })

  test('a failed overnight explains itself and offers a retry', async ({ page }) => {
    await seeded(page)
    await page.route('**/api/overnight*', (r) =>
      r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'The overnight desk did not respond.' }) }),
    )
    await page.goto('#/overnight')

    await expect(page.getByText('The overnight desk could not be assembled.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled()
    // The key line: an empty desk must not read as "nothing happened".
    await expect(page.getByText(/would read as .nothing happened overnight/)).toBeVisible()
  })

  test('a failed universe leaves the picker honest rather than empty', async ({ page }) => {
    await stubApi(page)
    await page.route('**/api/universe*', (r) => r.fulfill({ status: 500, body: '{}' }))
    await page.goto('#/')
    await expect(page.getByText(/verified listing could not be loaded/)).toBeVisible()
    await saysSomething(page, 'the gate with no universe')
  })

  test('a failed feed says nothing is listed that was not fetched', async ({ page }) => {
    await seeded(page)
    await page.route('**/api/feed*', (r) => r.fulfill({ status: 500, body: '{}' }))
    await page.goto('#/browse')
    await expect(page.getByText(/could not be reached/)).toBeVisible()
  })

  test('a failed checks fixture keeps its framing', async ({ page }) => {
    await seeded(page)
    await page.route('**/api/checks*', (r) => r.fulfill({ status: 500, body: '{}' }))
    await page.goto('#/checks')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/could not be loaded/)).toBeVisible()
    await saysSomething(page, '#/checks with a failed fetch')
  })

  test('a failed live check on the validation page is itself reported', async ({ page }) => {
    await stubApi(page)
    await page.route('**/api/overnight*', (r) => r.fulfill({ status: 500, body: '{}' }))
    await page.goto('#/validation')
    await expect(page.getByText(/The live check did not return/)).toBeVisible()
    // The rest of the page must survive one dead section.
    await expect(page.getByText('0, by construction')).toBeVisible()
  })

  test('unavailable prices are stated, never filled in with a stale figure', async ({ page }) => {
    await seeded(page)
    await page.route('**/api/prices*', (r) => r.fulfill({ status: 500, body: '{}' }))
    await page.goto('#/overnight')
    await expect(page.getByText(/Closing prices could not be fetched/)).toBeVisible()
  })

  test('a degraded triage is a narrower search, not an error', async ({ page }) => {
    await seeded(page, {
      '**/api/overnight*': { ...OVERNIGHT, triage: { state: 'unavailable', detail: 'timed out' } },
    })
    await page.goto('#/overnight')

    const notice = page.getByText(/searched by name only/)
    await expect(notice).toBeVisible()

    // Red is reserved for falsifiers. A reader who sees an error colour here
    // reasonably distrusts results that are in fact verifiable name matches.
    const colour = await notice.evaluate((el) => getComputedStyle(el).color)
    expect(colour, 'the degraded-triage notice is using the falsifier red').not.toMatch(/217,\s*97,\s*76/)
  })
})

test.describe('slow responses', () => {
  test('a slow desk names what it is doing and counts real seconds', async ({ page }) => {
    await seeded(page)
    await page.route('**/api/overnight*', async (r) => {
      await new Promise((res) => setTimeout(res, 4000))
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OVERNIGHT) })
    })
    await page.goto('#/overnight')

    const working = page.getByRole('status')
    await expect(working).toBeVisible()
    await expect(working).toContainText('Fetching every live news source')
    // A counter that actually moves, rather than an indeterminate spinner.
    await expect(working).toContainText(/[0-9]+s elapsed/)
    await expect(page.getByText(/1 of your 2 holdings/)).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('long content', () => {
  const LONG_TITLE =
    'Semiconductor Manufacturing Equipment Suppliers Across Taiwan Japan And The Netherlands Report Unprecedented Order Book Extensions As Advanced Packaging Capacity Constraints Persist Into The Next Fiscal Year According To Multiple People Familiar With The Matter'

  const longEvent = {
    ...OVERNIGHT,
    events: [
      {
        ...OVERNIGHT.events[0],
        title: LONG_TITLE,
        publisher: 'A Publisher With An Unreasonably Long Masthead Name Incorporated',
        summary: LONG_TITLE + ' ' + LONG_TITLE,
        direct: [
          {
            symbol: 'rINTC',
            term: 'Intel',
            where: 'title' as const,
            broad: false,
          },
        ],
      },
    ],
  }

  test('a very long headline does not push the page sideways', async ({ page }) => {
    await seeded(page, { '**/api/overnight*': longEvent })
    await page.goto('#/overnight')
    await expect(page.getByText(/Semiconductor Manufacturing Equipment/)).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'a long headline made the page scroll sideways').toBeLessThanOrEqual(1)
  })

  test('a full eighteen-holding portfolio still fits', async ({ page }) => {
    const all = ['rSPY','rQQQ','rNVDA','rAMD','rINTC','rAVGO','rMU','rSNDK','rSTX','rLITE','rCRWV','rNBIS','rMSFT','rMETA','rAAPL','rTSLA','rBE','rSPCX']
    await stubApi(page, {
      '**/api/overnight*': {
        ...OVERNIGHT,
        holdings: {
          verified: all.map((s) => ({ symbol: s, name: s.slice(1), category: 'semiconductors' })),
          unverified: [],
          touchedCount: 1,
        },
      },
    })
    await page.addInitScript(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      [KEY, JSON.stringify(all)],
    )
    await page.goto('#/overnight')
    await expect(page.getByText(/1 of your 18 holdings/)).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'eighteen holdings made the page scroll sideways').toBeLessThanOrEqual(1)
  })

  test('the worked example holds its measure end to end', async ({ page }) => {
    await stubApi(page)
    await page.goto('#/example')
    await expect(page.getByText(/Sample data|Worked example/).first()).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'the worked example scrolls sideways').toBeLessThanOrEqual(1)
  })
})
