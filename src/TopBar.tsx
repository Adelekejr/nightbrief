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
}: {
  count: number
  onHome: () => void
  onEditHoldings: () => void
  editing: boolean
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-rule bg-ink">
      <div className="mx-auto flex w-full max-w-[38rem] items-center justify-between gap-3 px-5 py-2.5">
        <button
          type="button"
          onClick={onHome}
          className="font-serif text-[15px] font-semibold tracking-tight text-paper hover:text-signal"
        >
          Nightbrief
        </button>

        <button
          type="button"
          onClick={onEditHoldings}
          aria-current={editing ? 'page' : undefined}
          className={`rounded-[2px] border px-2.5 py-1.5 transition-colors ${
            editing
              ? 'border-signal bg-signal/10'
              : 'border-rule hover:border-paper/30'
          }`}
        >
          <Mono className={`text-[11px] ${editing ? 'text-signal' : 'text-paper/70'}`}>
            {count === 0 ? 'Set your portfolio' : `Portfolio · ${count}`}
          </Mono>
        </button>
      </div>
    </div>
  )
}
