import { expect, test } from '@playwright/test'
import { stubApi } from './fixtures'

/**
 * The check that would have caught the invisible Portfolio button.
 *
 * A stylesheet rename moved the button's text to a dark ink meant for amber
 * blocks while its background was still a ten-percent tint of that amber.
 * Nothing failed: not the build, not the type checker, not sixty-five unit
 * tests. It was dark ink on a near-black field, and the only way to know was
 * to look. So this looks — at computed colour, in a real browser, on every
 * visible run of text.
 */

const KEY = 'nightdesk.holdings'

/** WCAG AA: 4.5 for body text, 3.0 once text is large or bold. */
const AA_NORMAL = 4.5
const AA_LARGE = 3

type Offender = { text: string; ratio: number; fg: string; bg: string; needs: number }

const audit = `(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/)
    if (!m) return null
    const [r, g, b, a = '1'] = m[1].split(/[,\\s/]+/).filter(Boolean)
    return [+r, +g, +b, +a]
  }

  // Resolve what a translucent colour actually renders as, by compositing it
  // over whatever is behind it. A tint is not a colour until it lands.
  const backdrop = (el) => {
    let layers = []
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (!c || c[3] === 0) continue
      layers.push(c)
      if (c[3] === 1) break
    }
    layers.push([0, 0, 0, 1])
    let out = layers[layers.length - 1].slice(0, 3)
    for (let i = layers.length - 2; i >= 0; i--) {
      const [r, g, b, a] = layers[i]
      out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)]
    }
    return out
  }

  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }

  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }

  const out = []
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim())
      .join(' ')
    if (!own) continue

    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue
    const box = el.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) continue

    const fg = parse(s.color)
    if (!fg) continue
    const bg = backdrop(el)
    const onPaper = fg[3] === 1 ? fg.slice(0, 3) : fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]))

    const px = parseFloat(s.fontSize)
    const bold = +s.fontWeight >= 700
    const large = px >= 24 || (bold && px >= 18.66)

    out.push({
      text: own.slice(0, 60),
      ratio: +ratio(onPaper, bg).toFixed(2),
      fg: s.color,
      bg: 'rgb(' + bg.map(Math.round).join(', ') + ')',
      needs: large ? 3 : 4.5,
    })
  }
  return out
})()`

async function offenders(page: import('@playwright/test').Page): Promise<Offender[]> {
  const all = (await page.evaluate(audit)) as Offender[]
  return all.filter((r) => r.ratio < r.needs)
}

const report = (o: Offender[]) =>
  o.map((r) => `  ${r.ratio}:1 (needs ${r.needs}) — "${r.text}" ${r.fg} on ${r.bg}`).join('\n')

for (const [name, hash] of [
  ['the gate', '#/'],
  ['the holdings editor', '#/holdings'],
  ['the overnight desk', '#/overnight'],
  ['the worked example', '#/example'],
  ['browse', '#/browse'],
  ['the validation report', '#/validation'],
  ['the checks page', '#/checks'],
] as const) {
  test(`${name} reads at AA`, async ({ page }) => {
    await stubApi(page)
    await page.addInitScript(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      [KEY, JSON.stringify(['rNVDA', 'rINTC'])],
    )
    await page.goto(hash)
    await page.waitForTimeout(600) // let the fetches settle into their rendered state

    const bad = await offenders(page)
    expect(bad, `unreadable text on ${name}:\n${report(bad)}`).toEqual([])
  })
}

test('the selected state is legible, not a tint', async ({ page }) => {
  await stubApi(page)
  await page.goto('#/')
  const chip = page.getByRole('button', { name: 'rNVDA' })
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  // Colours transition over 120ms and hover fills differ from resting ones.
  // Measure the state a reader actually sits looking at, not a frame of it.
  await page.mouse.move(0, 0)
  await page.waitForTimeout(400)

  const bad = await offenders(page)
  expect(bad, `unreadable text once selected:\n${report(bad)}`).toEqual([])
})

test('the primary action carries more weight than the secondary', async ({ page }) => {
  await stubApi(page)
  await page.goto('#/')
  await page.getByRole('button', { name: 'rNVDA' }).click()

  const weight = async (name: RegExp) =>
    page.getByRole('button', { name }).evaluate((el) => {
      const s = getComputedStyle(el)
      return { fill: s.backgroundColor, weight: +s.fontWeight }
    })

  const primary = await weight(/check the overnight against/i)
  const secondary = await weight(/use the sample portfolio/i)

  // Weight and fill only — the brief forbids gradients, glass and shadows.
  expect(primary.weight).toBeGreaterThan(secondary.weight)
  expect(primary.fill).not.toBe(secondary.fill)
})

test('nothing uses a shadow, gradient or blur to carry meaning', async ({ page }) => {
  await stubApi(page)
  await page.goto('#/')

  const cheats = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .map((el) => {
        const s = getComputedStyle(el)
        const found = [
          s.boxShadow !== 'none' ? `box-shadow: ${s.boxShadow}` : '',
          s.backgroundImage.includes('gradient') ? `gradient: ${s.backgroundImage}` : '',
          s.backdropFilter && s.backdropFilter !== 'none' ? `backdrop-filter: ${s.backdropFilter}` : '',
        ].filter(Boolean)
        return found.length ? `${el.tagName.toLowerCase()} — ${found.join('; ')}` : ''
      })
      .filter(Boolean),
  )

  expect(cheats).toEqual([])
})
