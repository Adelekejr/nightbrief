import { Mono } from './ui'

/**
 * The one element on every screen.
 *
 * Nightbrief is portfolio-driven, so the portfolio has to be visible and
 * editable from wherever the reader is — including halfway down a Brief. It
 * sticks to the top rather than sitting at the foot of a long scroll, which
 * is where the control used to be and where nobody found it.
 */
export default function TopBar({
  count,
  onHome,
  onEditHoldings,
  editing,
  atHome,
}: {
  count: number
  onHome: () => void
  onEditHoldings: () => void
  editing: boolean
  /** Only decides whether to show the back mark — never whether the
   *  wordmark works. A masthead that is dead on the screen a reader spends
   *  most of their time on is worse than one that occasionally just returns
   *  them to the top. */
  atHome: boolean
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-ink">
      <div className="mx-auto flex w-full max-w-[38rem] items-center justify-between gap-3 px-5 py-2">
        <button
          type="button"
          onClick={onHome}
          aria-label={atHome ? 'Back to the top' : 'Back to the overnight desk'}
          /* The negative margin keeps the bar its own height while the hit
             area grows to a thumb. This is the control a reader reaches for
             first on a phone; 24px of it was not enough to hit. */
          className="-my-2 flex items-baseline gap-1.5 py-2 font-serif text-lede font-semibold tracking-tight text-paper hover:text-signal"
        >
          {/* The mark appears when the wordmark leaves the current screen. On
              the desk it stays put and the wordmark returns you to the top. */}
          {!atHome && <span className="font-mono text-caption font-normal text-signal">‹</span>}
          Nightbrief
        </button>

        <button
          type="button"
          onClick={onEditHoldings}
          aria-current={editing ? 'page' : undefined}
          className={`border px-2.5 py-2 ${
            editing
              ? 'border-signal bg-signal'
              : 'border-rule-strong hover:border-paper-low'
          }`}
        >
          <Mono className={`text-micro font-medium ${editing ? 'text-signal-on' : 'text-paper-mid'}`}>
            {count === 0 ? 'Set your portfolio' : `Portfolio · ${count}`}
          </Mono>
        </button>
      </div>
    </header>
  )
}
