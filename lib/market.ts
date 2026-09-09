/**
 * Where a moment in time falls relative to the US equity session.
 *
 * The whole premise of Nightbrief is that events land while the US market is
 * shut, so "was it closed?" has to be computed, never assumed.
 */
export type SessionPhase = 'regular' | 'pre-market' | 'after-hours' | 'overnight' | 'weekend'

export type Session = {
  phase: SessionPhase
  /** Plain-language label for the interface. */
  label: string
  /** True when the US cash market was not in its regular session. */
  closed: boolean
  /** The same instant, expressed in exchange local time. */
  newYorkTime: string
  /**
   * Exchange holidays are NOT accounted for. On Thanksgiving this will say
   * "regular session" and be wrong. Surfaced rather than hidden — the
   * interface reports this as a known limitation.
   */
  holidayAware: false
}

const NY = 'America/New_York'

const nyParts = (at: Date) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: NY,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(at).map((p) => [p.type, p.value]),
  ) as Record<string, string>

  return {
    weekday: parts.weekday,
    // Intl renders midnight as "24" in some runtimes; normalise it.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  }
}

export function sessionAt(at: Date): Session {
  const { weekday, hour, minute } = nyParts(at)
  const minutes = hour * 60 + minute

  const newYorkTime = new Intl.DateTimeFormat('en-US', {
    timeZone: NY,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(at)

  const base = { newYorkTime, holidayAware: false } as const

  if (weekday === 'Sat' || weekday === 'Sun') {
    return {
      ...base,
      phase: 'weekend',
      label: 'Weekend — US market shut since Friday 16:00 ET',
      closed: true,
    }
  }

  // 09:30–16:00 ET regular session; 04:00 and 20:00 bound extended trading.
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) {
    return { ...base, phase: 'regular', label: 'US regular session', closed: false }
  }
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) {
    return { ...base, phase: 'pre-market', label: 'US pre-market', closed: true }
  }
  if (minutes >= 16 * 60 && minutes < 20 * 60) {
    return { ...base, phase: 'after-hours', label: 'US after-hours', closed: true }
  }
  return { ...base, phase: 'overnight', label: 'Overnight — US market shut', closed: true }
}
