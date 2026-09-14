import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { HOLDING, INK, LINK, MASTHEAD, PAPER, SIGNAL, SOURCE, STROKE } from '../src/mark.ts'

/**
 * Cuts the three standalone brand assets from the same geometry the header
 * mark uses, so they cannot drift into merely resembling each other.
 *
 * Run with `npm run brand`. The output is committed to `public/` rather than
 * produced during the deploy: rendering needs a real browser, and the build
 * that runs on the host has no Chromium in it. Vite copies `public/` into
 * `dist/` verbatim, so the files are static in the output either way — which
 * is the part that matters, because a scraper fetching the social image will
 * not execute anything to get it.
 */

const OUT = new URL('../public/', import.meta.url)

/** The mark alone, sized to a box, on the near-black tile. The tile is the
 *  point: browser chrome is light in some places and dark in others, and a
 *  mark that carried its own background is legible in both. */
const markSvg = (box: number) => {
  const pad = box * 0.14
  const inner = box - pad * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}">
  <rect width="${box}" height="${box}" fill="${INK}"/>
  <g transform="translate(${pad} ${pad}) scale(${inner / 20})" fill="none">
    <path d="${MASTHEAD}" stroke="${PAPER}" stroke-width="${STROKE}" stroke-linecap="square"/>
    <rect x="${SOURCE.x}" y="${SOURCE.y}" width="${SOURCE.width}" height="${SOURCE.height}" fill="${SIGNAL}"/>
    <path d="${LINK}" stroke="${PAPER}" stroke-width="${STROKE}" stroke-linecap="square"/>
    <circle cx="${HOLDING.cx}" cy="${HOLDING.cy}" r="${HOLDING.r}" stroke="${PAPER}" stroke-width="${STROKE}"/>
  </g>
</svg>`
}

const FONTS =
  'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400..700&family=JetBrains+Mono:wght@400;500&display=swap'

/** 1200x630, in the app's own palette and faces. Every line on it is either
 *  the product's one-sentence claim or a fact stated elsewhere in the README. */
const ogHtml = () => `<!doctype html>
<html><head><meta charset="utf-8"><link href="${FONTS}" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; background: ${INK}; color: ${PAPER};
    font-family: Newsreader, Georgia, serif;
    padding: 78px 96px; display: flex; flex-direction: column; justify-content: space-between;
  }
  .rule { height: 2px; background: ${SIGNAL}; width: 148px; }
  .lockup { display: flex; align-items: center; gap: 20px; margin-top: 30px; }
  .wordmark { font-size: 50px; font-weight: 600; letter-spacing: -0.015em; }
  h1 { font-size: 56px; font-weight: 400; line-height: 1.22; letter-spacing: -0.012em; max-width: 25ch; }
  footer { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 22px; color: #a89f93; }
  footer b { color: ${SIGNAL}; font-weight: 500; }
</style></head>
<body>
  <div>
    <div class="rule"></div>
    <div class="lockup">
      ${markSvg(58).replace('<svg ', '<svg style="display:block" ').replace(`<rect width="58" height="58" fill="${INK}"/>`, '')}
      <span class="wordmark">Nightbrief</span>
    </div>
  </div>
  <h1>What broke while New York was shut, and whether it reaches what you hold</h1>
  <footer><b>8 live sources</b> · every claim labelled fact, inference or gap</footer>
</body></html>`

await mkdir(OUT, { recursive: true })

// The favicon is a vector: it is the one that has to stay sharp at 16px in a
// tab strip and at whatever size a bookmark bar decides on.
await writeFile(new URL('favicon.svg', OUT), markSvg(64) + '\n')

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

const icon = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 })
await icon.setContent(`<body style="margin:0">${markSvg(180)}</body>`)
await icon.screenshot({ path: new URL('apple-touch-icon.png', OUT).pathname, omitBackground: false })

const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await og.setContent(ogHtml(), { waitUntil: 'networkidle' })
// Without this the headline renders in the fallback serif and the whole point
// of using the app's own faces is lost to a race.
await og.evaluate(() => document.fonts.ready)
await og.screenshot({ path: new URL('og.png', OUT).pathname })

await browser.close()

const { statSync } = await import('node:fs')
for (const f of ['favicon.svg', 'apple-touch-icon.png', 'og.png']) {
  console.log(`public/${f}  ${statSync(new URL(f, OUT).pathname).size} bytes`)
}
