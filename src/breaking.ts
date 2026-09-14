import type { Basis, Confidence, Sensitivity } from './types'

/**
 * Choosing the one event that goes at the top of the desk.
 *
 * Pure: no model call, no network, no clock. Given the events the overnight
 * desk already ranked and the portfolio they were ranked against, it picks
 * the single one worth putting above everything else — or nothing, which is
 * a real answer and the one this file returns most nights.
 *
 * It composes no text. Every value it returns is either a symbol, a name or
 * a timestamp that arrived in the response, or a label derived from the
 * match layer by a rule written down here. Nothing is guessed.
 */

/**
 * The four directions the card can state. The first three are the app's
 * existing sensitivity vocabulary, shared with a Brief's exposures; the
 * fourth is the honest one for an event whose direction nothing has decided.
 */
export type BreakingDirection = Sensitivity | 'unclear'

export type BreakingDirect = {
  symbol: string
  term: string
  where: 'title' | 'summary'
  /** A broad-market index rather than a single company. */
  broad: boolean
}

/**
 * Structural, and deliberately narrower than the desk's RankedEvent: this
 * function reads only what it ranks on, so a test can build a candidate
 * without inventing a headline, a publisher or a URL it would never read.
 */
export type BreakingCandidate = {
  id: string
  score: number
  publishedAt: string | null
  direct: BreakingDirect[]
  inferred: Array<{ symbol: string; why: string }>
}

export type BreakingHolding = { symbol: string; name: string }

export type BreakingPick<E extends BreakingCandidate> = {
  event: E
  /** The holding the card names: ticker and company name, as held. */
  holding: BreakingHolding
  /** How the event reaches that holding — named in the story, or inferred. */
  basis: Basis
  /** Why, in the words the match layer already produced. Never composed. */
  because: string
  direction: BreakingDirection
  confidence: Confidence
  /**
   * How many further holdings this event reaches, beyond the one named. A
   * count, not a list: the card names the strongest match and the Brief
   * carries the rest, so that a reader is given one thing to look at rather
   * than a row of tickers to work through.
   */
  alsoReached: number
}

/**
 * Direction, in words and in one tone.
 *
 * The rest of Nightbrief refuses red and green on purpose — it never says buy
 * or sell, so it does not borrow a trading terminal's palette. This rail is
 * the one exception the card asks for, and it is bounded: red belongs to
 * downward alone, green to upward alone, and everything else is the page's
 * own amber. The word is printed beside the rail in every case, so colour is
 * never what carries the meaning.
 */
export const DIRECTION: Record<
  BreakingDirection,
  { word: string; tone: 'rise' | 'fall' | 'neutral' }
> = {
  'sensitive-positive': { word: 'sensitive, upward', tone: 'rise' },
  'sensitive-negative': { word: 'sensitive, downward', tone: 'fall' },
  ambiguous: { word: 'cuts both ways', tone: 'neutral' },
  unclear: { word: 'unclear', tone: 'neutral' },
}

/**
 * SUBSTITUTION — direction.
 *
 * A ranked event carries no direction. Sensitivity is decided in the Brief
 * pipeline, one event at a time, by a model call whose output the validator
 * then checks; the desk stage runs before any of that and has no field for
 * it. The safest field that does exist is none, so the card says `unclear`
 * and points at the Brief, rather than reading a direction off a headline —
 * which is exactly the fabrication this project exists to refuse.
 *
 * If a validated direction is ever carried on an event, this is the only
 * place that has to change.
 */
export const DIRECTION_ON_THE_DESK: BreakingDirection = 'unclear'

const CONFIDENCE_ORDER: Record<Confidence, number> = { high: 0, moderate: 1, low: 2 }

/**
 * SUBSTITUTION — confidence.
 *
 * A ranked event carries no confidence mark either; those live on a Brief's
 * chain links and exposures. What the desk does have is the match layer, and
 * it is a statement about exactly this: how well supported the claim "this
 * event reaches this holding" is.
 *
 *   high      the story names the holding in its headline — a string the
 *             reader can check by opening the source
 *   moderate  the story names it further down, or names an index rather than
 *             a company, both of which the matcher already treats as weaker
 *   low       the story never names it and a model judged the link
 *
 * So this is confidence in the *reach*, which is what the card claims, and
 * not confidence in any conclusion about the holding — the card draws none.
 */
function confidenceOf(named: BreakingDirect[]): Confidence {
  if (named.some((d) => d.where === 'title' && !d.broad)) return 'high'
  if (named.length > 0) return 'moderate'
  return 'low'
}

/**
 * Strongest named match first: a company before a broad-market index, a
 * headline before body copy — the same two distinctions the matcher already
 * draws and `confidenceOf` already reads.
 *
 * Which matters because the card names one holding out of however many the
 * story touches. Taking whichever the matcher happened to return first let it
 * print `confidence: high` — earned by a company named in the headline —
 * beside a ticker that was only mentioned in body copy. The number and the
 * name now come from the same ordering, so they cannot disagree.
 */
const strength = (d: BreakingDirect) => (d.broad ? 2 : 0) + (d.where === 'title' ? 0 : 1)

const strongestFirst = (named: BreakingDirect[]) =>
  named
    .map((d, order) => ({ d, order }))
    .sort((a, b) => strength(a.d) - strength(b.d) || a.order - b.order)
    .map((x) => x.d)

const at = (iso: string | null): number => {
  if (!iso) return Number.NEGATIVE_INFINITY
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY
}

/**
 * The single most important validated event currently reaching the portfolio.
 *
 * "Validated" here is what the desk can stand behind without a model call:
 * the holding is one the reader actually selected and the pipeline verified,
 * and the event reaches it either by a string match the reader can check or
 * by a link whose symbol was resolved against the verified rToken listing
 * server-side. Anything reaching a symbol outside the portfolio is dropped.
 *
 * Order:
 *   1. Highest score. SUBSTITUTION — nothing on a ranked event carries an
 *      alert level or a magnitude; those belong to a Brief's event block.
 *      `score` is the ranking pipeline's own composite weight and the safest
 *      field that exists. It also keeps the card agreeing with the numbered
 *      list below it, which would be a defect of its own if it did not.
 *   2. A named match before an inferred one.
 *   3. Newer before older. An event with no published time sorts oldest.
 *   4. Higher confidence, as derived above.
 *   5. The order the desk returned, so the result never depends on sort
 *      stability in the engine underneath.
 */
export function selectBreakingNews<E extends BreakingCandidate>(
  events: readonly E[],
  holdings: readonly BreakingHolding[],
): BreakingPick<E> | null {
  const held = new Map(holdings.map((h) => [h.symbol, h]))

  const reaching = events
    .map((event, order) => ({
      event,
      order,
      named: event.direct.filter((d) => held.has(d.symbol)),
      inferred: event.inferred.filter((i) => held.has(i.symbol)),
    }))
    .filter((c) => c.named.length > 0 || c.inferred.length > 0)

  if (reaching.length === 0) return null

  const [top] = reaching.sort((a, b) => {
    if (a.event.score !== b.event.score) return b.event.score - a.event.score

    const named = Number(b.named.length > 0) - Number(a.named.length > 0)
    if (named !== 0) return named

    const when = at(a.event.publishedAt)
    const other = at(b.event.publishedAt)
    if (when !== other) return when > other ? -1 : 1

    const confidence =
      CONFIDENCE_ORDER[confidenceOf(a.named)] - CONFIDENCE_ORDER[confidenceOf(b.named)]
    if (confidence !== 0) return confidence

    return a.order - b.order
  })

  // The holding the card names. A named match wins over an inferred one for
  // the same reason it wins the sort: the reader can check it. Among named
  // matches, the strongest one wins.
  const named = strongestFirst(top.named)
  const lead = named[0] ?? top.inferred[0]
  const holding = held.get(lead.symbol)
  if (!holding) return null

  const reached = new Set([
    ...named.map((d) => d.symbol),
    ...top.inferred.map((i) => i.symbol),
  ])

  return {
    event: top.event,
    holding,
    basis: named.length > 0 ? 'retrieved' : 'inferred',
    because:
      named.length > 0
        ? // The matched string and where it was found, both already checked.
          `named in the ${named[0].where === 'title' ? 'headline' : 'story'} as “${named[0].term}”`
        : // The model's own clause, as the triage pass wrote it and the desk
          // already prints it under every story row.
          top.inferred[0].why,
    direction: DIRECTION_ON_THE_DESK,
    confidence: confidenceOf(named),
    alsoReached: reached.size - 1,
  }
}
