import type { Brief, Evidence } from './brief.js'
import { DEMO_ARTICLE } from './demo.js'

/**
 * A deliberately corrupted model output, used to show the checks working.
 *
 * THIS IS NOT A BRIEF AND MUST NEVER BE PRESENTED AS ONE. Every claim below is
 * written to break one specific rule, so that the real validator — the same
 * code path every Brief goes through — can be watched rejecting it.
 *
 * The evidence it is checked against is real: the same CNBC article the worked
 * example uses. That matters, because a check against invented evidence would
 * prove nothing.
 */
export const CHECKS_EVIDENCE: Evidence[] = [DEMO_ARTICLE]

export const CHECKS_DECLARED = ['rNVDA', 'rAMD', 'rINTC']

/** What each planted fault is meant to demonstrate, in reading order. */
export const CHECKS_FAULTS = [
  {
    label: 'A citation to a source that was never supplied',
    detail:
      'The link claims it was retrieved, and cites src9. Only src1 was given to the model. A claim resting on a source nobody provided is dropped rather than shown with a broken reference.',
  },
  {
    label: 'A figure that appears in no source',
    detail:
      'No supplied source mentions $1.2 billion. The whole link is dropped: a mechanism resting on an invented number is not repairable by deleting the number.',
  },
  {
    label: 'An exposure for a holding the reader never listed',
    detail:
      'The reader declared rNVDA, rAMD and rINTC. An exposure for rMSFT is analysis of somebody else’s portfolio.',
  },
  {
    label: 'An exposure to a symbol outside the verified listing',
    detail:
      'rGOOGL is not in the eighteen pairs confirmed from Bitget. Nightdesk will not reason about a token it has not verified exists.',
  },
  {
    label: 'A quote that is not in the article',
    detail:
      'The words are plausible and the attribution is real. They do not appear in the source, so the quote is dropped.',
  },
  {
    label: 'An invented figure inside the headline',
    detail:
      'Narrative cannot be dropped without destroying the Brief, so the figure is struck out in place and counted. The reader sees the redaction rather than a quietly corrected sentence.',
  },
  {
    label: 'An empty list of unknowns',
    detail:
      'The schema requires gaps and the model returned none. Rather than print a Brief implying nothing is uncertain, the absence is itself reported as a gap.',
  },
] as const

export const CORRUPTED_BRIEF: Brief = {
  // Fault 6: $740 appears in no source.
  headline:
    'Foundry commitments secure the AI chip roadmap, with $740 of upside per share for holders.',
  event: {
    summary:
      'TSMC and Samsung committed to ASML High NA EUV tools for advanced chipmaking.',
    category: 'company-specific',
    occurredAt: '2026-09-08T08:32:02.000Z',
    entities: ['TSMC', 'Samsung', 'ASML'],
    magnitude: 'notable',
    magnitudeBasis: 'A commitment by the two largest foundries to next-generation lithography.',
    surprise: 'partly-expected',
  },
  chain: [
    {
      // Survives: honestly labelled inference, citing nothing, no figures.
      step: 1,
      from: 'TSMC and Samsung adopting High NA EUV tools',
      to: 'Advanced foundry capability',
      mechanism:
        'Newer lithography lets a foundry print smaller and more intricate patterns, which is what leading-edge designs require.',
      confidence: 'high',
      basis: 'inferred',
      sourceIds: [],
    },
    {
      // Fault 1: claims retrieval, cites a source that was never supplied.
      step: 2,
      from: 'Advanced foundry capability',
      to: 'Nvidia product roadmap',
      mechanism: 'Nvidia depends on leading-edge foundry capacity for its accelerators.',
      confidence: 'high',
      basis: 'retrieved',
      sourceIds: ['src9'],
    },
    {
      // Fault 2: a figure present in no supplied source.
      step: 3,
      from: 'Foundry capital spending of $1.2 billion',
      to: 'Equipment suppliers',
      mechanism: 'Spending at that scale flows through to the equipment makers.',
      confidence: 'moderate',
      basis: 'inferred',
      sourceIds: [],
    },
  ],
  exposures: [
    {
      // Survives: declared, verified, no invented figures.
      symbol: 'rNVDA',
      direction: 'sensitive-positive',
      rationale:
        'Nvidia relies on the foundries making this commitment, so its manufacturing path is reinforced.',
      confidence: 'high',
      chainSteps: [1, 2],
    },
    {
      // Fault 3: never declared by the reader.
      symbol: 'rMSFT',
      direction: 'sensitive-positive',
      rationale: 'Microsoft buys large volumes of AI compute.',
      confidence: 'moderate',
      chainSteps: [1],
    },
    {
      // Fault 4: outside the verified listing entirely.
      symbol: 'rGOOGL',
      direction: 'sensitive-positive',
      rationale: 'Alphabet designs its own accelerators.',
      confidence: 'low',
      chainSteps: [1],
    },
  ],
  watchAtOpen: ['Whether equipment makers move at the US open.'],
  falsifiers: ['The foundries delay or cancel the commitment.'],
  // Fault 7: the schema requires gaps; none were given.
  unknowns: [],
  quotes: [
    {
      // Survives: word for word in the article.
      text: "TSMC and Samsung will adopt ASML's High NA EUV tools",
      sourceId: 'src1',
    },
    {
      // Fault 5: plausible, correctly attributed, and not in the source.
      text: 'ASML said the order book for High NA tools is now full through the decade.',
      sourceId: 'src1',
    },
  ],
}
