/**
 * The open checklist's poll: one round at once when a session opens, then on
 * every period and whenever the tab returns to view. Rounds never overlap: a
 * round asked for while one reads runs once that one returns, so a deadline
 * that passes during a slow read wipes on its return. A round that has not
 * returned leaves the poll as it stood, marked as reading, and a session that changes starts
 * again from nothing returned, so no reading of an earlier session ever
 * stands for the new one. A client rebuilt for the same session drops the
 * round its predecessor had in flight and reads again at once; until that
 * round returns, the poll stands as it was, as for any round in flight. An
 * answer older than the live request, from the manager it names, is a failed
 * round. The read that judges a pass at a moment runs from the clock of the
 * round in flight or, before the session's first round returns, from that
 * moment, since the round about to start reads no earlier.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { isVisible } from '@web/modules/social-recovery/shared/ceremony'

import { CHECKLIST_POLL_MS, POLL_LIMIT_MS } from './constants'
import { behindRequest, readPollFacts } from './poll'
import type { PollHook, PollInput, PollState } from './types'

const PENDING: PollState = { status: 'pending' }

const usePoll = ({ kit, target, deps, after }: PollInput): PollHook => {
  const [poll, setPoll] = useState<PollState>(PENDING)
  const [polling, setPolling] = useState(false)

  const kitRef = useRef(kit)
  kitRef.current = kit
  const targetRef = useRef(target)
  targetRef.current = target
  const depsRef = useRef(deps)
  depsRef.current = deps
  const afterRef = useRef(after)
  afterRef.current = after

  // Each session's rounds carry its number; a round of an earlier one is dropped.
  const generation = useRef(0)
  const inFlight = useRef<number | null>(null)
  const again = useRef(false)
  const roundClock = useRef<number | null>(null)
  const returned = useRef(false)

  const run = useCallback(async () => {
    const current = kitRef.current
    const id = generation.current
    if (!current || !targetRef.current) {
      return
    }
    if (inFlight.current === id) {
      again.current = true
      return
    }
    const clock = depsRef.current.now()
    const asked = targetRef.current
    inFlight.current = id
    roundClock.current = clock
    setPolling(true)
    const answer = await readPollFacts(current, POLL_LIMIT_MS)
    const facts =
      answer && asked.kind === 'live' && behindRequest(asked.gathering, answer, current.descriptor)
        ? undefined
        : answer
    if (inFlight.current === id) {
      inFlight.current = null
      roundClock.current = null
    }
    if (id !== generation.current) {
      return
    }
    returned.current = true
    setPolling(false)
    // A death the round reads holds the rows before the answer renders them.
    afterRef.current(facts, clock)
    setPoll(facts ? { status: 'answered', facts, clock } : { status: 'failed' })
    if (again.current) {
      again.current = false
      await run()
    }
  }, [])

  const key = target?.key ?? null
  const source = deps.visibility
  const session = kit ? key : null
  useEffect(() => {
    returned.current = false
    setPoll(PENDING)
  }, [session])
  useEffect(() => {
    generation.current += 1
    inFlight.current = null
    roundClock.current = null
    again.current = false
    setPolling(false)
    if (!kit || key === null) {
      return undefined
    }
    run().catch(() => undefined)
    const timer = setInterval(() => {
      run().catch(() => undefined)
    }, CHECKLIST_POLL_MS)
    const onChange = () => {
      if (source && isVisible(source)) {
        run().catch(() => undefined)
      }
    }
    source?.addEventListener('visibilitychange', onChange)
    return () => {
      generation.current += 1
      clearInterval(timer)
      source?.removeEventListener('visibilitychange', onChange)
    }
  }, [kit, key, source, run])

  const retry = useCallback(() => {
    run().catch(() => undefined)
  }, [run])

  const readsFrom = useCallback(
    (at: number) => roundClock.current ?? (returned.current ? null : at),
    []
  )

  return { poll, polling, retry, readsFrom }
}

export default usePoll
