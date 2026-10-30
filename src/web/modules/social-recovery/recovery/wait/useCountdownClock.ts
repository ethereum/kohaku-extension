/**
 * The countdown's time left: the attempt's end against the pinned block's
 * time from the last poll, less the seconds the view's own clock counted since
 * that poll. Each poll re-anchors it; the device's wall clock never moves it.
 * Null with no anchor.
 */
import { useEffect, useState } from 'react'

import { COUNTDOWN_TICK_MS } from './constants'
import type { CountdownAnchor, CountdownTicks } from './types'

const useCountdownClock = (anchor: CountdownAnchor | null): number | null => {
  // The ticks counted since the poll of `round`; a tick of an earlier round counts nothing.
  const [counted, setCounted] = useState<CountdownTicks>({ round: null, ticks: 0 })
  const round = anchor?.round ?? null

  useEffect(() => {
    if (round === null) {
      return undefined
    }
    setCounted({ round, ticks: 0 })
    const timer = setInterval(
      () => setCounted((last) => ({ round, ticks: last.round === round ? last.ticks + 1 : 1 })),
      COUNTDOWN_TICK_MS
    )
    return () => clearInterval(timer)
  }, [round])

  if (!anchor) {
    return null
  }
  const ticks = counted.round === anchor.round ? counted.ticks : 0
  return anchor.endMs - anchor.blockMs - ticks * COUNTDOWN_TICK_MS
}

export default useCountdownClock
