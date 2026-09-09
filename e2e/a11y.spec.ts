import { expect, test } from '@playwright/test'
import { stubApi } from './fixtures'

/**
 * The interface has to work for a reader who is half awake at 1am, on a phone,
 * possibly not looking at it directly. That means every control reachable and
 * announceable without sight, targets big enough for a thumb, and no motion
 * for anyone who has asked the system for none.
 */

const KEY = 'nightdesk.holdings'

async function seeded(page: import('@playwright/test').Page) {
  await stubApi(page)
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k as string, v as string),
    [KEY, JSON.stringify(['rNVDA', 'rINTC'])],
  )
}

test('every control announces itself', async ({ page }) => {
  await seeded(page)

  for (const hash of ['#/', '#/holdings', '#/overnight', '#/example']) {
    await page.goto(hash)
    await page.waitForTimeout(400)

    const mute = await page.evaluate(() =>
      [...document.querySelectorAll('button, a[href], [role="button"]')]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => {
          const name =
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            (el.textContent ?? '').trim()
          return name.length === 0
        })
        .map((el) => el.outerHTML.slice(0, 120)),
    )

    expect(mute, `nameless controls at ${hash}`).toEqual([])
  }
})

test('the masthead is the first thing a keyboard reaches', async ({ page }) => {
  await seeded(page)
  await page.goto('#/overnight')
  await page.waitForTimeout(400)

  await page.keyboard.press('Tab')
  const first = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
  expect(first).toMatch(/back to the/i)

  // And the focus ring must actually be drawn — a keyboard reader who cannot
  // see where they are is no better off than one with no focus order at all.
  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement as Element)
    return { width: parseFloat(s.outlineWidth), style: s.outlineStyle }
  })
  expect(ring.style).not.toBe('none')
  expect(ring.width).toBeGreaterThanOrEqual(2)
})

test('the whole gate can be driven from the keyboard', async ({ page }) => {
  await stubApi(page)
  await page.goto('#/')
  await page.waitForTimeout(400)

  // Walk forward until the first token chip has focus, then select it. The
  // chip's text is the ticker and the company name together, so this matches
  // on the ticker rather than on the whole label.
  let reached = false
  for (let i = 0; i < 40 && !reached; i++) {
    await page.keyboard.press('Tab')
    reached = Boolean(
      (await page.evaluate(() => document.activeElement?.textContent?.trim()))?.startsWith('rNVDA'),
    )
  }
  expect(reached, 'no keyboard path to the token list').toBe(true)

  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'rNVDA' })).toHaveAttribute('aria-pressed', 'true')

  const submit = page.getByRole('button', { name: /check the overnight against/i })
  await submit.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/overnight$/)
})

test('nothing moves when motion is declined', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await seeded(page)
  await page.goto('#/overnight')
  await page.waitForTimeout(400)

  const moving = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((el) => {
        const s = getComputedStyle(el)
        const dur = (v: string) => v.split(',').some((d) => parseFloat(d) > 0)
        return dur(s.transitionDuration) || (s.animationName !== 'none' && dur(s.animationDuration))
      })
      .map((el) => el.tagName.toLowerCase() + '.' + (el.className || '').toString().slice(0, 60)),
  )

  expect(moving).toEqual([])
})

test('the page has one first-level heading and a document title', async ({ page }) => {
  await seeded(page)
  await page.goto('#/overnight')
  await expect(page).toHaveTitle(/nightbrief/i)
})

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'thumb targets only matter on a touch screen')

  /** WCAG 2.2 AA, Target Size (Minimum). */
  const MIN = 24
  /** Navigation gets more: it is what a reader reaches for without looking. */
  const NAV_MIN = 40

  test('the masthead controls are reachable without aiming', async ({ page }) => {
    await seeded(page)
    await page.goto('#/overnight')
    await page.waitForTimeout(400)

    for (const label of [/back to the/i, /portfolio ·/i]) {
      const box = await page.getByRole('banner').getByRole('button', { name: label }).boundingBox()
      expect(box, `${label} has no box`).not.toBeNull()
      expect(box!.height, `${label} is ${box!.height}px tall`).toBeGreaterThanOrEqual(NAV_MIN)
    }
  })

  test('every target is big enough for a thumb', async ({ page }) => {
    await seeded(page)

    for (const hash of ['#/holdings', '#/overnight']) {
      await page.goto(hash)
      await page.waitForTimeout(400)

      const small = await page.evaluate((min) =>
        [...document.querySelectorAll('button, a[href]')]
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          // Inline links inside running prose are exempt; they are part of a
          // line of text, not a control standing on its own.
          .filter(({ el }) => !el.closest('p'))
          .filter(({ box }) => box.height < min || box.width < min)
          .map(({ el, box }) => `${(el.textContent ?? '').trim().slice(0, 30)} — ${Math.round(box.width)}×${Math.round(box.height)}`),
        MIN,
      )

      expect(small, `targets too small at ${hash}`).toEqual([])
    }
  })

  test('the page never scrolls sideways', async ({ page }) => {
    await seeded(page)

    for (const hash of ['#/', '#/holdings', '#/overnight', '#/example']) {
      await page.goto(hash)
      await page.waitForTimeout(400)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `${hash} overflows horizontally`).toBeLessThanOrEqual(1)
    }
  })
})
