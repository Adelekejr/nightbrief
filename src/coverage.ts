/**
 * The two sentences on the desk that describe what the scan actually did.
 *
 * Pure, and in their own file, because the thing that went wrong with them
 * could only be caught by rendering them against real numbers. Every count
 * was written plural and never varied: "1 market sources", "1 stories were
 * checked". That is what a string looks like when it has only ever been seen
 * against one fixture whose numbers happened to be the same every time.
 *
 * The counts are derived here from the scan result itself rather than passed
 * in as numbers, so the sentence cannot describe a different scan from the one
 * that produced it.
 */

/** The part of an overnight response these sentences report on. Structural,
 *  so it is satisfied by the desk's own response without restating it. */
export type ScanCoverage = {
  windowHours: number
  coverage: {
    storiesConsidered: number
    /** Per-holding feeds that answered, counted apart from the market ones. */
    tickerFeedsLive: number
    duplicatesRemoved: number
    /** The market sources that answered this scan. The count comes from here
     *  and nowhere else, so it is always the scan being described. */
    liveSources: Array<{ id: string; publisher: string }>
  }
}

/** `n` with its noun in the right number. Defaults to the regular plural, so
 *  only the irregulars have to say so. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** The mono line under the answer. The "checked X ago" prefix is not here:
 *  it is a clock reading, and this is what the scan covered. */
export function coverageSummary(scan: ScanCoverage): string {
  const { coverage } = scan
  const sources =
    count(coverage.liveSources.length, 'market source') +
    // "1 of your own tickers" is a partitive and correct as it stands — the
    // plural belongs to the set being drawn from, not to the number.
    (coverage.tickerFeedsLive > 0 ? ` + ${coverage.tickerFeedsLive} of your own tickers` : '')

  const parts = [count(coverage.storiesConsidered, 'story', 'stories'), sources, `${scan.windowHours}h window`]
  if (coverage.duplicatesRemoved > 0) parts.push(`${count(coverage.duplicatesRemoved, 'duplicate')} merged`)
  return parts.join(' · ')
}

/** What "nothing reached your holdings" means, in terms of what was searched.
 *  An empty desk is only readable as a finding if the work behind it is. */
export function nothingFoundLine(scan: ScanCoverage): string {
  const { coverage } = scan
  const searched = count(coverage.storiesConsidered, 'story', 'stories')
  const verb = coverage.storiesConsidered === 1 ? 'was' : 'were'
  const tickers =
    coverage.tickerFeedsLive > 0
      ? `, plus the news filed against ${coverage.tickerFeedsLive} of your own tickers`
      : ''

  return (
    `That is a finding, not a failure. ${searched} ${verb} checked against your ` +
    `positions in the last ${scan.windowHours} hours — from ` +
    `${count(coverage.liveSources.length, 'market source')}${tickers} — and none reached one.`
  )
}
