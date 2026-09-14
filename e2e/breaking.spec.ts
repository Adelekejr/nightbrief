import { expect, test } from '@playwright/test'
import { LISTING, OVERNIGHT, stubApi } from './fixtures'

/**
 * The breaking card, checked the way everything else here is: in a real
 * browser, against a stubbed API, so a passing test means a reader can
 * actually see and use the thing.
 *
 * Three states, three checks. The card's whole claim is that it never says
 * more than the desk knows, so most of what follows is about what it refuses
 * to print: no direction it has not been given, no older event standing in
 * for a failed check, no wording that implies a watch is running.
 *
 * The last block covers the landing screen, where the same card answers a
 * different question — the listing's rather than a portfolio's — and has one
 * more thing to refuse: implying that any of it is about positions the reader
 * has not named.
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

/**
 * WCAG 1.4.11: a control's boundary has to hold 3:1 against what is behind
 * it. The contrast sweep measures text only, so a button carrying its whole
 * shape in a rule — which is every secondary control here, there being no
 * fills outside the amber — was never being checked at all.
 */
const borderContrast = (locator: ReturnType<typeof card>) =>
  locator.evaluate((el) => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const [r, g, b, a = '1'] = m[1].split(/[,\s/]+/).filter(Boolean)
      return [+r, +g, +b, +a] as const
    }
    const backdrop = (node: Element): number[] => {
      for (let n: Element | null = node; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor)
        if (c && c[3] === 1) return [c[0], c[1], c[2]]
      }
      return [0, 0, 0]
    }
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const edge = parse(getComputedStyle(el).borderTopColor)
    if (!edge) return 0
    const bg = backdrop(el)
    const on = edge[3] === 1 ? [edge[0], edge[1], edge[2]] : [edge[0], edge[1], edge[2]].map((v, i) => v * edge[3] + bg[i] * (1 - edge[3]))
    const [hi, lo] = [lum(on), lum(bg)].sort((a, b) => b - a)
    return +((hi + 0.05) / (lo + 0.05)).toFixed(2)
  })

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
    // direction to report. The displayed value says where the answer is
    // settled instead; the value behind it is still `unclear`, which is what
    // the selector's own tests assert.
    await expect(card(page)).toContainText('direction')
    await expect(card(page)).toContainText('settled in the Brief')
    await expect(card(page)).toContainText('The desk does not guess direction from a headline.')
    // The bare word it used to print told a reader nothing they could act on.
    expect(await card(page).innerText()).not.toContain('unclear')

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

  test('the source button reads as a control, not a disabled one', async ({ page }) => {
    await seeded(page)
    await page.goto('#/overnight')
    await settled(page, EVENT.title)
    await page.mouse.move(0, 0) // measure the resting state, not a hover

    const source = card(page).getByRole('link', { name: /read the source/i })
    const ratio = await borderContrast(source)
    expect(ratio, `the source button's border is ${ratio}:1`).toBeGreaterThanOrEqual(3)

    // And it still reads as the secondary of the pair: the amber one is the
    // only one carrying a fill.
    const fills = await card(page).evaluate((el) =>
      [...el.querySelectorAll('button, a[href]')].map(
        (n) => getComputedStyle(n).backgroundColor,
      ),
    )
    const filled = fills.filter((c) => c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent')
    expect(filled, 'exactly one action should carry a fill').toHaveLength(1)
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

test.describe('on the landing screen', () => {
  const LEAD = LISTING.events[0]

  /** No portfolio on disk: the state a reader arrives in. */
  const cold = (page: import('@playwright/test').Page, overrides = {}) =>
    stubApi(page, overrides)

  test('renders above the picker, and says whose question it answers', async ({ page }) => {
    await cold(page)
    await page.goto('#/')
    await settled(page, LEAD.title)

    // The scope, in words, before anything else on the card.
    await expect(card(page)).toContainText(/across the whole verified rToken listing/i)
    await expect(card(page)).toContainText(/not your portfolio/i)

    const cardTop = (await card(page).boundingBox())!.y
    const pickerTop = (await page.getByRole('button', { name: 'rNVDA' }).boundingBox())!.y
    expect(cardTop, 'the card is below the picker').toBeLessThan(pickerTop)
  })

  test('leads with the headline, and puts the caveat under it', async ({ page }) => {
    await cold(page)
    await page.goto('#/')
    await settled(page, LEAD.title)

    const headline = card(page).getByRole('heading', { name: LEAD.title })
    const caveat = card(page).getByText(/across the whole verified rToken listing/i)

    const headlineTop = (await headline.boundingBox())!.y
    const caveatTop = (await caveat.boundingBox())!.y
    expect(caveatTop, 'the caveat is still above the headline').toBeGreaterThan(headlineTop)

    // Secondary register: smaller than the headline, and the quieter ink.
    const type = await caveat.evaluate((el) => {
      const s = getComputedStyle(el)
      return { px: parseFloat(s.fontSize), colour: s.color }
    })
    expect(type.px).toBeLessThanOrEqual(14)
    expect(type.colour).toBe('rgb(167, 157, 141)') // --color-paper-mid

    // And it still comes before the ticker, which is what it qualifies.
    const tickerTop = (await card(page).getByText('rNVDA').first().boundingBox())!.y
    expect(caveatTop).toBeLessThan(tickerTop)
  })

  test('names one holding and counts the rest, never a row of tickers', async ({ page }) => {
    await cold(page)
    await page.goto('#/')
    await settled(page, LEAD.title)

    // The fixture's story names Nvidia in the headline and Intel in the body,
    // so the headline match is the one the card names.
    await expect(card(page)).toContainText('rNVDA')
    await expect(card(page)).toContainText(/named in the headline as .Nvidia./)
    // The weaker match is counted, not printed as a second ticker.
    await expect(card(page)).toContainText(/names 1 other rToken in the listing/)
    expect(await card(page).innerText()).not.toContain('rINTC')
  })

  test('shows named matches only, never an inference', async ({ page }) => {
    // Even if the endpoint were to answer with indirect links, this screen
    // does not run that layer and must not print one.
    await cold(page, {
      '**/api/overnight*': {
        ...LISTING,
        events: [
          {
            ...LEAD,
            inferred: [{ symbol: 'rINTC', why: 'competes for the same foundry capacity' }],
          },
        ],
      },
    })
    await page.goto('#/')
    await settled(page, LEAD.title)

    const text = await card(page).innerText()
    expect(text).toContain('fact')
    expect(text).not.toContain('inference')
    expect(text).not.toContain('competes for the same foundry capacity')
  })

  test('keeps the amber, the timestamp and the scanned line', async ({ page }) => {
    await cold(page)
    await page.goto('#/')
    await settled(page, LEAD.title)

    const text = await card(page).innerText()
    expect(text).toMatch(/last checked/)
    expect(text).toMatch(/Nothing here updates on its own/)
    expect(text).not.toMatch(/\bLIVE\b/)

    // Same rail and the same direction copy as the portfolio card.
    const rail = await card(page).evaluate((el) => getComputedStyle(el).borderLeftColor)
    expect(rail).not.toMatch(/217,\s*97,\s*76/)
    await expect(card(page)).toContainText('settled in the Brief')
  })

  test('the three states hold here too', async ({ page }) => {
    // Loading.
    await cold(page)
    await page.route('**/api/overnight*', async (r) => {
      await new Promise((res) => setTimeout(res, 3000))
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(LISTING),
      })
    })
    await page.goto('#/')
    await expect(card(page)).toContainText(/against the verified rToken listing/)
    await settled(page, LEAD.title)
  })

  test('nothing named is a result, not an error', async ({ page }) => {
    await cold(page, { '**/api/overnight*': { ...LISTING, events: [] } })
    await page.goto('#/')

    await expect(card(page)).toContainText(/Nothing in the last 36 hours named a verified rToken/)
    await expect(card(page).getByRole('button', { name: 'Scan again' })).toBeEnabled()
    // The picker is still the way forward, and still there.
    await expect(page.getByRole('button', { name: 'rNVDA' })).toBeVisible()
  })

  test('a failed check shows no event, and offers a retry', async ({ page }) => {
    await cold(page)
    await page.route('**/api/overnight*', (r) =>
      r.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false}' }),
    )
    await page.goto('#/')

    await expect(card(page)).toContainText(/did not complete/)
    await expect(card(page).getByRole('button', { name: 'Check again' })).toBeEnabled()
    await expect(card(page)).not.toContainText(LEAD.title)
  })

  test('the Brief it opens carries every holding the story reaches', async ({ page }) => {
    await cold(page)

    let posted: Record<string, unknown> | null = null
    await page.route('**/api/analyze', async (route) => {
      posted = route.request().postDataJSON()
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    })

    await page.goto('#/')
    await settled(page, LEAD.title)
    await card(page).getByRole('button', { name: /open the full brief/i }).click()
    await expect(page).toHaveURL(/#\/brief$/)

    // There is no portfolio to reason against, so the Brief is run against
    // the holdings this event reaches — including the one the card counted
    // rather than named. Without this it would be sent an empty portfolio.
    expect(posted).toMatchObject({ url: LEAD.url, holdings: ['rNVDA', 'rINTC'] })
  })

  test('hands over to the portfolio card once holdings are named', async ({ page }) => {
    await cold(page)
    await page.goto('#/')
    await settled(page, LEAD.title)

    await page.getByRole('button', { name: 'rNVDA' }).click()
    await page.getByRole('button', { name: /check the overnight against 1 holding/i }).click()
    await expect(page).toHaveURL(/#\/overnight$/)

    // The desk's own event, and none of the landing copy.
    await settled(page, OVERNIGHT.events[0].title)
    await expect(card(page)).not.toContainText(/not your portfolio/i)
    await expect(card(page)).not.toContainText(/across the whole verified rToken listing/i)
  })

  test('holds together at 360px, with every control named and reachable', async ({ page }) => {
    await cold(page)
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('#/')
    await settled(page, LEAD.title)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'the landing card overflows at 360px').toBeLessThanOrEqual(1)

    const faults = await card(page).evaluate((el) =>
      [...el.querySelectorAll('button, a[href]')]
        .map((n) => ({ n, box: n.getBoundingClientRect() }))
        .filter(
          ({ n, box }) =>
            box.height < 24 ||
            box.width < 24 ||
            ((n.getAttribute('aria-label') || n.textContent || '').trim().length === 0),
        )
        .map(({ n, box }) => `${n.textContent?.trim()} — ${Math.round(box.width)}×${Math.round(box.height)}`),
    )
    expect(faults, 'unnamed or undersized controls on the landing card').toEqual([])
  })
})
