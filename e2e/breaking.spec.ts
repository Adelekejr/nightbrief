import { expect, test } from '@playwright/test'
import { OVERNIGHT, stubApi } from './fixtures'

/**
 * The breaking card, checked the way everything else here is: in a real
 * browser, against a stubbed API, so a passing test means a reader can
 * actually see and use the thing.
 *
 * Three states, three checks. The card's whole claim is that it never says
 * more than the desk knows, so most of what follows is about what it refuses
 * to print: no direction it has not been given, no older event standing in
 * for a failed check, no wording that implies a watch is running.
 */

const KEY = 'nightdesk.holdings'
const EVENT = OVERNIGHT.events[0]

async function seeded(page: import('@playwright/test').Page, overrides = {}) {
  await stubApi(page, overrides)
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k as string, v as string),
    [KEY, JSON.stringify(['rNVDA', 'rINTC'])],
  )
}

const card = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Breaking' })

/** The card is one element that re-renders through its three states, so a
 *  handle taken while the desk is still loading is detached by the time the
 *  event arrives — and a detached element reports no computed style at all.
 *  Anything measuring the card has to wait for the state it means to measure. */
async function settled(page: import('@playwright/test').Page, text: string | RegExp) {
  await expect(card(page)).toContainText(text, { timeout: 15_000 })
}

test.describe('the card', () => {
  test('carries every field, read from the event', async ({ page }) => {
    await seeded(page)
    await page.goto('#/overnight')

    const it = card(page)
    await expect(it).toBeVisible()

    await expect(it).toContainText('BREAKING')
    await expect(it).toContainText(/last checked/)
    await expect(it).toContainText(EVENT.title)
    // The matched holding, as ticker and as name.
    await expect(it).toContainText('rINTC')
    await expect(it).toContainText('Intel')
    // The two registers the desk already uses, so no legend is needed.
    await expect(it).toContainText('fact')
    await expect(it).toContainText(/named in the headline as .Intel./)
    await expect(it).toContainText('direction')
    await expect(it).toContainText('confidence')
    // Publisher and route, as the desk attributes them.
    await expect(it).toContainText('fool.com via Yahoo Finance')
  })

  test('sits above the story list, not inside it', async ({ page }) => {
    await seeded(page)
    await page.goto('#/overnight')
    await settled(page, EVENT.title)

    const cardTop = (await card(page).boundingBox())!.y
    const listTop = (await page.locator('main ol').first().boundingBox())!.y
    expect(cardTop).toBeLessThan(listTop)
  })

  test('states a direction in words, and does not invent one', async ({ page }) => {
    await seeded(page)
    await page.goto('#/overnight')
    await settled(page, EVENT.title)

    // The desk runs before any model reads the article, so it has no
    // direction to report and says so rather than reading one off a headline.
    await expect(card(page)).toContainText('unclear')
    await expect(card(page)).toContainText(/settled in the Brief/)

    // Whatever the direction, the rail is never the only thing carrying it.
    const rail = await card(page).evaluate((el) => getComputedStyle(el).borderLeftColor)
    expect(rail, 'the neutral rail is using the falsifier red').not.toMatch(/217,\s*97,\s*76/)
  })

  test('never implies anything is being watched', async ({ page }) => {
    await seeded(page)
    await page.goto('#/overnight')
    await settled(page, EVENT.title)

    const text = await card(page).innerText()
    expect(text).not.toMatch(/\bLIVE\b/)
    expect(text).toMatch(/last checked/)
    expect(text).toMatch(/Nothing here updates on its own/)
  })

  test('opens the Brief for its own event, and links to its own source', async ({ page }) => {
    await seeded(page)

    let posted: Record<string, unknown> | null = null
    await page.route('**/api/analyze', async (route) => {
      posted = route.request().postDataJSON()
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    })

    await page.goto('#/overnight')

    await expect(card(page).getByRole('link', { name: /read the source/i })).toHaveAttribute(
      'href',
      EVENT.url,
    )

    await card(page).getByRole('button', { name: /open the full brief/i }).click()
    await expect(page).toHaveURL(/#\/brief$/)
    // The correct brief: the article the card was describing, not the desk's
    // first row by coincidence.
    expect(posted).toMatchObject({ title: EVENT.title, url: EVENT.url })
  })

  test('picks the named match over the inferred one', async ({ page }) => {
    const inferredOnly = {
      ...EVENT,
      id: 'inferred-only',
      title: 'A foundry in Taiwan raises advanced packaging prices',
      direct: [],
      inferred: [{ symbol: 'rNVDA', why: 'buys advanced packaging from that foundry' }],
      symbols: ['rNVDA'],
    }

    await seeded(page, {
      '**/api/overnight*': { ...OVERNIGHT, events: [inferredOnly, EVENT] },
    })
    await page.goto('#/overnight')

    // Same score, same time in the fixture — so the layer decides, and the
    // one the reader can check for themselves wins.
    await expect(card(page)).toContainText(EVENT.title)
    await expect(card(page)).toContainText('fact')
  })

  test('falls to the inferred layer, labelled as inference, when that is all there is', async ({
    page,
  }) => {
    const inferredOnly = {
      ...EVENT,
      direct: [],
      inferred: [{ symbol: 'rNVDA', why: 'buys advanced packaging from that foundry' }],
      symbols: ['rNVDA'],
    }

    await seeded(page, { '**/api/overnight*': { ...OVERNIGHT, events: [inferredOnly] } })
    await page.goto('#/overnight')

    await expect(card(page)).toContainText('inference')
    await expect(card(page)).toContainText('buys advanced packaging from that foundry')
    await expect(card(page)).toContainText('rNVDA')
  })
})

test.describe('the three states', () => {
  test('loading says what is being scanned, without a spinner', async ({ page }) => {
    await seeded(page)
    await page.route('**/api/overnight*', async (r) => {
      await new Promise((res) => setTimeout(res, 3000))
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(OVERNIGHT),
      })
    })
    await page.goto('#/overnight')

    await expect(card(page)).toContainText(/Reading the overnight window/)
    await expect(card(page)).toContainText(/matched by name/)
    await expect(card(page)).toContainText(EVENT.title, { timeout: 15_000 })
  })

  test('nothing matched is a result, not an error', async ({ page }) => {
    await seeded(page, {
      '**/api/overnight*': {
        ...OVERNIGHT,
        events: [],
        holdings: { ...OVERNIGHT.holdings, touchedCount: 0 },
      },
    })
    await page.goto('#/overnight')

    await expect(card(page)).toContainText(/Nothing in the last 36 hours was matched/)
    // The scan action is offered again rather than the reader being stranded.
    await expect(card(page).getByRole('button', { name: 'Scan again' })).toBeEnabled()

    // Red would make a finding look like a fault.
    const rail = await card(page).evaluate((el) => getComputedStyle(el).borderLeftColor)
    expect(rail).not.toMatch(/217,\s*97,\s*76/)
  })

  test('a failed check shows no event at all, and offers a retry', async ({ page }) => {
    await seeded(page)
    await page.route('**/api/overnight*', (r) =>
      r.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false}' }),
    )
    await page.goto('#/overnight')

    await expect(card(page)).toContainText(/did not complete/)
    await expect(card(page)).toContainText(/Nothing is being shown here as fact/)
    await expect(card(page).getByRole('button', { name: 'Check again' })).toBeEnabled()
    // Never an older event standing in for a check that did not happen.
    await expect(card(page)).not.toContainText(EVENT.title)
  })
})

test.describe('motion', () => {
  test('the entrance is opacity and position only, and under 250ms', async ({ page }) => {
    await seeded(page)
    await page.goto('#/overnight')
    await settled(page, EVENT.title)

    const animation = await card(page).evaluate((el) => {
      const s = getComputedStyle(el)
      return { name: s.animationName, ms: parseFloat(s.animationDuration) * 1000 }
    })
    expect(animation.name).not.toBe('none')
    expect(animation.ms).toBeLessThanOrEqual(250)

    // Read the keyframes themselves rather than trusting the name: the rule
    // is that nothing scales, nothing flashes, and no number moves.
    const properties = await page.evaluate((name) => {
      const found = new Set<string>()

      const walk = (rules: CSSRuleList) => {
        for (const rule of [...rules] as CSSRule[]) {
          if (rule instanceof CSSKeyframesRule) {
            if (rule.name !== name) continue
            for (const frame of [...rule.cssRules] as CSSKeyframeRule[]) {
              for (const property of [...frame.style]) found.add(property)
            }
          } else if ('cssRules' in rule) {
            // Tailwind wraps the project's own CSS in layers, so the
            // keyframes are a rule or two down rather than at the top.
            walk((rule as CSSGroupingRule).cssRules)
          }
        }
      }

      for (const sheet of [...document.styleSheets]) {
        // The webfont sheet is cross-origin and unreadable. It carries no
        // keyframes of this app's, so skipping it costs nothing.
        try {
          walk(sheet.cssRules)
        } catch {
          continue
        }
      }
      return [...found].sort()
    }, animation.name)

    expect(properties).toEqual(['opacity', 'transform'])

    // And nothing inside the card animates at all — a figure counting up
    // reads as a figure being measured right now.
    const inner = await card(page).evaluate((el) =>
      [...el.querySelectorAll('*')]
        .filter((n) => getComputedStyle(n).animationName !== 'none')
        .map((n) => n.tagName.toLowerCase()),
    )
    expect(inner).toEqual([])
  })

  test('nothing animates when motion is declined', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await seeded(page)
    await page.goto('#/overnight')
    await settled(page, EVENT.title)

    const name = await card(page).evaluate((el) => getComputedStyle(el).animationName)
    expect(name, 'the card still animates for a reader who declined motion').toBe('none')
  })
})

test.describe('on a narrow screen', () => {
  const LONG_TITLE =
    'Semiconductor Manufacturing Equipment Suppliers Across Taiwan Japan And The Netherlands Report Unprecedented Order Book Extensions As Advanced Packaging Capacity Constraints Persist'

  for (const width of [360, 390]) {
    test(`holds together at ${width}px`, async ({ page }) => {
      await seeded(page, {
        '**/api/overnight*': {
          ...OVERNIGHT,
          events: [{ ...EVENT, title: LONG_TITLE }],
        },
      })
      await page.setViewportSize({ width, height: 800 })
      await page.goto('#/overnight')
      await settled(page, LONG_TITLE)

      // The headline wraps rather than pushing the page sideways.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `the card overflows at ${width}px`).toBeLessThanOrEqual(1)

      const wide = await card(page).evaluate(
        (el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
      )
      expect(wide, `the card runs past the viewport at ${width}px`).toBe(false)

      // WCAG 2.2 Target Size (Minimum). The card's controls stand on their
      // own rather than sitting in a line of prose, so both have to clear it.
      const small = await card(page).evaluate((el) =>
        [...el.querySelectorAll('button, a[href]')]
          .map((n) => ({ n, box: n.getBoundingClientRect() }))
          .filter(({ box }) => box.height < 24 || box.width < 24)
          .map(({ n, box }) => `${n.textContent?.trim()} — ${Math.round(box.width)}×${Math.round(box.height)}`),
      )
      expect(small, `targets too small at ${width}px`).toEqual([])
    })
  }
})
