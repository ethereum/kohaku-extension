/**
 * The page's clock, in ms since epoch: it ticks every minute so the
 * deadline's time left renders again, and once more at the deadline, so
 * the page reads the request as expired without waiting for the next minute.
 */
import { useEffect, useState } from 'react'

import { DEADLINE_TICK_MS, MAX_TIMER_MS } from './constants'

const useDeadlineClock = (validUntil: number | null): number => {
  const [clock, setClock] = useState<number>(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), DEADLINE_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (validUntil === null) {
      return undefined
    }
    const untilPassed = validUntil * 1000 - Date.now()
    if (!Number.isFinite(untilPassed) || untilPassed <= 0 || untilPassed > MAX_TIMER_MS) {
      return undefined
    }
    const timer = setTimeout(() => setClock(Date.now()), untilPassed)
    return () => clearTimeout(timer)
  }, [validUntil])

  return clock
}

export default useDeadlineClock
