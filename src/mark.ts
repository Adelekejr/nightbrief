/**
 * The Nightbrief mark.
 *
 * A masthead rule over a transmission chain: a source, a link, and the holding
 * it reaches. That is the product's whole claim in three marks — something was
 * published, a mechanism carries it, and it arrives somewhere you hold — and
 * it is deliberately not a trading glyph. No candle, no arrow, no coin: this
 * tool never says buy or sell, and its mark should not either.
 *
 * The source is the only amber element, which is the same rule the interface
 * follows everywhere else: amber is the thing to notice, and the thing to
 * notice is that something happened.
 *
 * Geometry lives here rather than in the component so the favicon, the touch
 * icon and the social image are cut from the same shape rather than redrawn
 * to look like it.
 */

export const MARK_VIEWBOX = '0 0 20 20'

/** The masthead. One rule, not two — at 16px a pair closes up into a bar. */
export const MASTHEAD = 'M1.6 3.5h16.8'

/** The link between them. Stops short of both marks so the chain reads as
 *  three things, not one blob, at the size a favicon is actually seen. */
export const LINK = 'M8.4 12.6h3.6'

/** Retrieved: a filled square, the way a printed reference mark is solid. */
export const SOURCE = { x: 1.6, y: 10.2, width: 4.8, height: 4.8 }

/** The holding the chain reaches. Open, because it is the thing being asked
 *  about rather than the thing being asserted. */
export const HOLDING = { cx: 15.6, cy: 12.6, r: 2.8 }

export const STROKE = 1.7

/** Palette literals, for the standalone files that have no stylesheet behind
 *  them. Kept identical to the tokens in index.css. */
export const INK = '#16130f'
export const PAPER = '#ede6d8'
export const SIGNAL = '#e8a33d'
