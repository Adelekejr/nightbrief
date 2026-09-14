import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HOLDING, INK, LINK, MARK_VIEWBOX, MASTHEAD, PAPER, SIGNAL, SOURCE, STROKE } from '../src/mark.ts'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const token = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]

test('the standalone assets carry the same palette as the stylesheet', () => {
  // The favicon, the touch icon and the social image have no stylesheet behind
  // them, so their colours are literals. This is the only thing keeping those
  // literals from drifting the day the palette moves — as it already has once.
  assert.equal(INK, token('ink'), 'ink')
  assert.equal(PAPER, token('paper'), 'paper')
  assert.equal(SIGNAL, token('signal'), 'signal')
})

test('the mark stays inside its own box', () => {
  // A glyph that overflows its viewBox is clipped differently by every
  // renderer that touches it — and three separate files render this one.
  const [, , w, h] = MARK_VIEWBOX.split(' ').map(Number)
  const pad = STROKE / 2

  const xs = [
    ...MASTHEAD.matchAll(/([\d.]+)/g),
    ...LINK.matchAll(/([\d.]+)/g),
  ].map((m) => Number(m[1]))
  assert.ok(Math.min(...xs) - pad >= 0, 'a stroke starts outside the box')

  assert.ok(SOURCE.x >= 0 && SOURCE.x + SOURCE.width <= w, 'the source mark overflows')
  assert.ok(SOURCE.y >= 0 && SOURCE.y + SOURCE.height <= h, 'the source mark overflows')
  assert.ok(HOLDING.cx + HOLDING.r + pad <= w, 'the holding mark overflows')
  assert.ok(HOLDING.cy + HOLDING.r + pad <= h, 'the holding mark overflows')
})

test('every stroke stays thick enough to survive a 16px render', () => {
  // At 16px the 20-unit box scales by 0.8, so anything under ~1.5 here lands
  // below a device pixel and disappears into the tab strip.
  assert.ok(STROKE * (16 / 20) >= 1.2, `${STROKE} is too fine for a favicon`)
  // The chain has to read as three marks rather than one. The gaps either
  // side of the link are what does that.
  const linkStart = Number(LINK.match(/M([\d.]+)/)![1])
  assert.ok(linkStart > SOURCE.x + SOURCE.width, 'the link touches the source mark')
  const linkEnd = linkStart + Number(LINK.match(/h([\d.]+)/)![1])
  assert.ok(linkEnd < HOLDING.cx - HOLDING.r, 'the link touches the holding mark')
})
