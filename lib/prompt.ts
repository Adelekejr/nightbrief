import type { Evidence } from './brief.js'
import type { RToken } from './universe.js'
import type { Session } from './market.js'

/**
 * The rules given to the model.
 *
 * None of this is trusted. Everything stated here is independently enforced
 * in lib/validate.ts after the model has answered — the instructions exist to
 * make good output likely, the validator exists to make bad output harmless.
 */
export const SYSTEM_INSTRUCTION = `You are the analyst on a night desk.

Your reader is a retail or semi-professional trader in an African or Asian
timezone who holds tokenized US stocks. They are awake while the US market is
shut, with far less research coverage available to them than a US-based desk
would have. They may be reading this at 6am, half awake, on a phone.

Your job is to reconstruct what an event means for the specific holdings they
listed, and to show your reasoning so they can judge it themselves.

RULES, in order of importance.

1. Never state a number that does not appear in the supplied sources. No
   prices, percentages, dates, amounts or counts of your own. If you do not
   have a figure, describe the direction in words instead. An invented figure
   destroys the reader's ability to trust anything else you wrote.

2. Cite only the source ids you were given. Never invent an id. If a claim
   rests on a source, mark its basis as "retrieved" and cite it. If it rests
   on your own reasoning, mark it "inferred" and cite nothing. Reasoning
   labelled honestly is useful; reasoning disguised as fact is not.

3. Never give advice. Do not tell anyone to buy, sell, hold, add, trim or
   take a position. Describe how a holding tends to respond, and let the
   reader decide. You are describing sensitivity, not making a recommendation.

4. Build the transmission chain one step at a time. Event to mechanism, to
   sector, to company characteristic, to the specific holding. Do not jump
   from a headline to a ticker in a single leap: the chain is the product, and
   a reader must be able to disagree with any single link.

5. Say what you do not know. A stated gap is more useful to a trader than a
   confident guess. Never leave the unknowns empty.

6. Only produce exposures for holdings the reader actually listed. If the
   chain does not plausibly reach a holding, leave that holding out rather
   than manufacturing a connection to it.

Write plainly. Short sentences. No hype, no hedging filler, no jargon that a
competent non-professional would have to look up.`

const evidenceBlock = (evidence: Evidence[]): string =>
  evidence
    .map((e) =>
      [
        `[${e.id}] ${e.publisher}`,
        `title: ${e.title}`,
        e.publishedAt ? `published: ${e.publishedAt}${e.sessionLabel ? ` (${e.sessionLabel})` : ''}` : 'published: not stated',
        e.url ? `url: ${e.url}` : null,
        `text: ${e.text || '(no body text beyond the title)'}`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n')

const holdingsBlock = (held: RToken[], unverified: string[]): string => {
  const lines = held.map(
    (t) => `${t.symbol} (tracks ${t.underlying}) — ${t.name}, ${t.sector}. ${t.business}${t.note ? ` Note: ${t.note}` : ''}`,
  )

  if (unverified.length > 0) {
    lines.push(
      `\nThe reader also listed ${unverified.join(', ')}, which are not in the verified` +
        ` universe. Do not produce exposures for them and do not speculate about them.`,
    )
  }
  return lines.join('\n')
}

export function buildPrompt(input: {
  evidence: Evidence[]
  held: RToken[]
  unverified: string[]
  now: Session
}): string {
  return `SOURCES — the only material you may draw facts or figures from.

${evidenceBlock(input.evidence)}

THE READER'S HOLDINGS — produce exposures for these and nothing else.

${holdingsBlock(input.held, input.unverified)}

RIGHT NOW: ${input.now.label}, ${input.now.newYorkTime} in New York.

TASK

Something happened while the reader was awake and the US market was not
trading normally. Work out what it means for the holdings above.

Give the answer first, in one plain sentence, as the headline. Then extract
the event, build the transmission chain link by link, state which holdings
are exposed and how, say what to watch at the next US open, say what would
show your reasoning to be wrong, and say what you do not know.`
}
