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
  /** Already on the desk, so the wordmark has nowhere to take you. */
  atHome: boolean
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-rule bg-ink">
      <div className="mx-auto flex w-full max-w-[38rem] items-center justify-between gap-3 px-5 py-2.5">
        <button
          type="button"
          onClick={onHome}
          disabled={atHome}
          aria-label={atHome ? 'Nightbrief' : 'Back to the overnight desk'}
          className="group flex items-baseline gap-1.5 font-serif text-lede font-semibold tracking-tight text-paper disabled:cursor-default enabled:hover:text-signal"
        >
          {/* A wordmark that is also a control has to admit it. The mark only
              appears when there is somewhere to go, so tapping it on the desk
              is never a dead action. */}
          {!atHome && <span className="font-mono text-caption font-normal text-signal">‹</span>}
          Nightbrief
        </button>

        <button
          type="button"
          onClick={onEditHoldings}
          aria-current={editing ? 'page' : undefined}
          className={`border px-2.5 py-1.5 ${
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
    </div>
  )
}
