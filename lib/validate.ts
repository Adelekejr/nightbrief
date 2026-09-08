import type { Brief, ChainStep, Evidence, Exposure, Quote } from './brief.js'
import { resolve } from './universe.js'

/**
 * Server-side validation of what the model returned.
 *
 * The project rule is that a figure which was not retrieved from a real
 * source never appears, and that inference is never presented as fact. A
 * prompt can ask for that. Only code can enforce it, so this is where it is
 * enforced — after the model has spoken and before a reader sees anything.
 *
 * Two different remedies, because two different things are at stake:
 *
 *   - A discrete claim (a chain link, an exposure, a quote) that cites a
 *     source it was never given, or carries a figure not present in the
 *     evidence, is DROPPED. A wrong link is worse than a missing one.
 *   - Narrative prose cannot be dropped without gutting the brief, so an
 *     unsupported figure inside it is REDACTED in place and marked, which is
 *     visible to the reader rather than silently corrected.
 *
 * Every removal is recorded and returned. The count is shown in the
 * interface: a reader should be able to see the mechanism working.
 */

export type Rejection = {
  kind: 'chain-step' | 'exposure' | 'quote' | 'figure'
  reference: string
  reason: string
}

export type ValidatedBrief = {
  brief: Brief
  rejections: Rejection[]
  stats: {
    chainKept: number
    chainDropped: number
    exposuresKept: number
    exposuresDropped: number
    quotesKept: number
    quotesDropped: number
    figuresRedacted: number
  }
}

export const REDACTION = '[unsourced figure removed]'

/**
 * What counts as a market figure.
 *
 * Deliberately not "any digit". "Three sectors" and "the next 24 hours" are
 * prose; "$98", "7%", "1,019.46" and "2026" are claims about the world that
 * must be traceable. Matching only the latter keeps the check precise enough
 * to act on rather than merely noisy.
 */
const FIGURE_PATTERNS: RegExp[] = [
  /[$€£]\s?\d[\d,]*(?:\.\d+)?/g, // currency amounts
  /\d[\d,]*(?:\.\d+)?\s?%/g, // percentages
  /\d[\d,]*(?:\.\d+)?\s?(?:bn|billion|mn|million|tn|trillion|bps|basis points)\b/gi,
  /\b\d+\.\d+\b/g, // any decimal
  /\b\d{1,3}(?:,\d{3})+\b/g, // thousands separators
  /\b(?:19|20)\d{2}\b/g, // years
]

const numericCore = (raw: string): string =>
  raw.replace(/[^\d.]/g, "").replace(/\.$/, "")

type FigureSpan = { start: number; end: number; raw: string }

/**
 * Non-overlapping figure spans, longest match winning.
 *
 * The patterns deliberately overlap — "3.2%" is both a percentage and a
 * decimal — so without this the same figure is reported twice and redaction
 * rewrites its own output into "[unsourced figure removed]%".
 */
function figureSpans(text: string): FigureSpan[] {
  const candidates: FigureSpan[] = []

  for (const pattern of FIGURE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue
      candidates.push({
        start: match.index,
        end: match.index + match[0].length,
        raw: match[0],
      })
    }
  }

  candidates.sort((a, b) => a.start - b.start || b.end - a.end)

  const chosen: FigureSpan[] = []
  for (const span of candidates) {
    if (chosen.some((c) => span.start < c.end && c.start < span.end)) continue
    chosen.push(span)
  }
  return chosen
}

/** Every number appearing anywhere in the supplied evidence. */
export function evidenceNumbers(evidence: Evidence[]): Set<string> {
  const corpus = evidence
    .map((e) => `${e.title} ${e.text} ${e.publishedAt ?? ""}`)
    .join(" ")

  const found = new Set<string>()
  for (const match of corpus.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const core = numericCore(match[0])
    if (core) found.add(core)
  }
  return found
}

/** Figures in `text` that cannot be traced to any supplied source. */
export function unsupportedFigures(text: string, known: Set<string>): string[] {
  return figureSpans(text)
    .filter((span) => {
      const core = numericCore(span.raw)
      return core !== "" && !known.has(core)
    })
    .map((span) => span.raw.trim())
}

function redact(text: string, known: Set<string>): { text: string; removed: string[] } {
  const doomed = figureSpans(text).filter((span) => {
    const core = numericCore(span.raw)
    return core !== "" && !known.has(core)
  })

  // Right to left, so earlier offsets stay valid as the string is rewritten.
  let out = text
  for (const span of [...doomed].reverse()) {
    out = out.slice(0, span.start) + REDACTION + out.slice(span.end)
  }

  return { text: out, removed: doomed.map((s) => s.raw.trim()) }
}

const whitespace = (s: string) => s.replace(/\s+/g, ' ').trim()

export function validateBrief(input: {
  brief: Brief
  evidence: Evidence[]
  /** Symbols the user actually declared. Exposures outside this are invented. */
  declaredSymbols: string[]
}): ValidatedBrief {
  const { brief, evidence, declaredSymbols } = input

  const validIds = new Set(evidence.map((e) => e.id))
  const byId = new Map(evidence.map((e) => [e.id, e]))
  const known = evidenceNumbers(evidence)
  const declared = new Set(declaredSymbols.map((s) => s.toLowerCase()))

  const rejections: Rejection[] = []
  let figuresRedacted = 0

  const clean = (text: string, reference: string): string => {
    const { text: out, removed } = redact(text, known)
    for (const figure of removed) {
      figuresRedacted++
      rejections.push({
        kind: 'figure',
        reference,
        reason: `"${figure}" does not appear in any supplied source`,
      })
    }
    return out
  }

  // ---- chain -------------------------------------------------------------
  const chain: ChainStep[] = []
  let chainDropped = 0

  for (const step of brief.chain ?? []) {
    const cited = (step.sourceIds ?? []).filter((id) => validIds.has(id))
    const label = `chain step ${step.step}`

    if (step.basis === 'retrieved' && cited.length === 0) {
      chainDropped++
      rejections.push({
        kind: 'chain-step',
        reference: label,
        reason: 'claimed to be retrieved but cited no source that was supplied',
      })
      continue
    }

    const text = `${step.from} ${step.to} ${step.mechanism}`
    if (unsupportedFigures(text, known).length > 0) {
      chainDropped++
      rejections.push({
        kind: 'chain-step',
        reference: label,
        reason: 'carried a figure that appears in no supplied source',
      })
      continue
    }

    chain.push({ ...step, sourceIds: cited })
  }

  const liveSteps = new Set(chain.map((s) => s.step))

  // ---- exposures ---------------------------------------------------------
  const exposures: Exposure[] = []
  let exposuresDropped = 0

  for (const exposure of brief.exposures ?? []) {
    const resolved = resolve(exposure.symbol)
    const label = `exposure ${exposure.symbol}`

    if (!resolved.known) {
      exposuresDropped++
      rejections.push({
        kind: 'exposure',
        reference: label,
        reason: 'not a symbol in the verified rToken universe',
      })
      continue
    }

    if (!declared.has(resolved.token.symbol.toLowerCase())) {
      exposuresDropped++
      rejections.push({
        kind: 'exposure',
        reference: label,
        reason: 'not among the holdings the user declared',
      })
      continue
    }

    if (unsupportedFigures(exposure.rationale, known).length > 0) {
      exposuresDropped++
      rejections.push({
        kind: 'exposure',
        reference: label,
        reason: 'rationale carried a figure that appears in no supplied source',
      })
      continue
    }

    exposures.push({
      ...exposure,
      symbol: resolved.token.symbol,
      chainSteps: (exposure.chainSteps ?? []).filter((n) => liveSteps.has(n)),
    })
  }

  // ---- quotes ------------------------------------------------------------
  const quotes: Quote[] = []
  let quotesDropped = 0

  for (const quote of brief.quotes ?? []) {
    const source = byId.get(quote.sourceId)
    const label = `quote from ${quote.sourceId}`

    if (!source) {
      quotesDropped++
      rejections.push({
        kind: 'quote',
        reference: label,
        reason: 'attributed to a source that was not supplied',
      })
      continue
    }

    const haystack = whitespace(`${source.title} ${source.text}`)
    if (!haystack.includes(whitespace(quote.text))) {
      quotesDropped++
      rejections.push({
        kind: 'quote',
        reference: label,
        reason: 'does not appear verbatim in the cited source',
      })
      continue
    }

    quotes.push(quote)
  }

  // ---- narrative ---------------------------------------------------------
  const unknowns = (brief.unknowns ?? []).filter(Boolean)
  if (unknowns.length === 0) {
    // The schema requires this and the model still left it empty. Saying so is
    // more honest than printing a brief that implies nothing is uncertain.
    unknowns.push(
      'The model stated no gaps in its own knowledge. Treat that as a gap in itself.',
    )
  }

  return {
    brief: {
      ...brief,
      headline: clean(brief.headline ?? '', 'headline'),
      event: {
        ...brief.event,
        summary: clean(brief.event?.summary ?? '', 'event summary'),
        magnitudeBasis: clean(brief.event?.magnitudeBasis ?? '', 'magnitude basis'),
      },
      chain,
      exposures,
      watchAtOpen: (brief.watchAtOpen ?? []).map((s, i) => clean(s, `watch item ${i + 1}`)),
      falsifiers: (brief.falsifiers ?? []).map((s, i) => clean(s, `falsifier ${i + 1}`)),
      unknowns,
      quotes,
    },
    rejections,
    stats: {
      chainKept: chain.length,
      chainDropped,
      exposuresKept: exposures.length,
      exposuresDropped,
      quotesKept: quotes.length,
      quotesDropped,
      figuresRedacted,
    },
  }
}
