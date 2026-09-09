import type { VercelRequest, VercelResponse } from '@vercel/node'
import { CHECKS_DECLARED, CHECKS_EVIDENCE, CHECKS_FAULTS, CORRUPTED_BRIEF } from '../lib/checks-demo.js'
import { validateBrief } from '../lib/validate.js'

/**
 * Runs a deliberately corrupted model output through the real validator — the
 * same function every Brief passes through — and returns both what went in and
 * what survived.
 *
 * Nothing here is a Brief. The point is to make the checks observable rather
 * than asking a reader to take "it never fabricates" on trust.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  const validated = validateBrief({
    brief: CORRUPTED_BRIEF,
    evidence: CHECKS_EVIDENCE,
    declaredSymbols: CHECKS_DECLARED,
  })

  res.setHeader('cache-control', 's-maxage=86400')
  res.status(200).json({
    ok: true,
    disclaimer:
      'A fixture, not a Brief. Every claim in the input was written to break one rule, so the checks can be watched working on real evidence.',
    evidence: CHECKS_EVIDENCE.map((e) => ({
      id: e.id,
      publisher: e.publisher,
      title: e.title,
      url: e.url,
      text: e.text,
    })),
    declaredHoldings: CHECKS_DECLARED,
    faults: CHECKS_FAULTS,
    submitted: CORRUPTED_BRIEF,
    survived: validated.brief,
    validation: { rejections: validated.rejections, ...validated.stats },
  })
}
