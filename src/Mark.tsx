import { HOLDING, LINK, MARK_VIEWBOX, MASTHEAD, SOURCE, STROKE } from './mark'

/**
 * The mark, inline and in the header's own colour.
 *
 * currentColor for the rule, the link and the holding, so it takes the
 * wordmark's ink and its hover with it. Amber is hard-coded on the one
 * element that means "something happened", which is the only place this
 * palette spends it.
 *
 * aria-hidden: the wordmark beside it already says the name, and a second
 * announcement of it is noise to anyone listening rather than looking.
 */
export default function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK_VIEWBOX}
      fill="none"
      aria-hidden="true"
      focusable="false"
      /* self-center, because the row it sits in aligns on the text baseline
         and a box aligned on its own bottom edge would stand a head above
         the wordmark's capitals. */
      className="shrink-0 self-center"
    >
      <path d={MASTHEAD} stroke="currentColor" strokeWidth={STROKE} strokeLinecap="square" />
      <rect {...SOURCE} fill="var(--color-signal)" />
      <path d={LINK} stroke="currentColor" strokeWidth={STROKE} strokeLinecap="square" />
      <circle {...HOLDING} stroke="currentColor" strokeWidth={STROKE} />
    </svg>
  )
}
