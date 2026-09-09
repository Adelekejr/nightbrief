import { useState } from 'react'
import { Mono } from './ui'

export type Shortcut = {
  id: string
  phrase: string
}

export const SHORTCUTS: Shortcut[] = [
  { id: 'overnight', phrase: 'What changed while New York was closed?' },
  { id: 'semiconductors', phrase: 'What affects my semiconductor holdings?' },
  { id: 'large-tech', phrase: 'What affects my large tech holdings?' },
  { id: 'top-story', phrase: "What's the single biggest story overnight?" },
  { id: 'example', phrase: 'Show me a worked example' },
]

/**
 * A prompt box, not a chat. Every shortcut here routes to a screen this app
 * already builds — the overnight desk, a category filter over it, a Brief,
 * the worked example — none of it is a new answer the model improvises for
 * the phrase. Typing is disabled on purpose: this reads as natural language
 * because the phrasing is, not because anything behind it parses free text.
 */
export default function PromptEntry({ onSelect }: { onSelect: (id: string) => void }) {
  const [filled, setFilled] = useState<string | null>(null)

  const choose = (s: Shortcut) => {
    setFilled(s.phrase)
    onSelect(s.id)
  }

  return (
    <div className="mb-7">
      <div
        aria-hidden
        className="flex items-center gap-2 border border-rule-strong bg-ink-sunk px-3 py-2.5"
      >
        <Mono className="text-caption text-signal">›</Mono>
        <Mono className={`truncate text-caption ${filled ? 'text-paper' : 'text-paper-low'}`}>
          {filled ?? 'Ask the desk — pick a question below'}
        </Mono>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Ask the desk">
        {SHORTCUTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => choose(s)}
            className="border border-rule px-2.5 py-1.5 font-serif text-caption text-paper-mid hover:border-rule-strong hover:text-paper"
          >
            {s.phrase}
          </button>
        ))}
      </div>
    </div>
  )
}
