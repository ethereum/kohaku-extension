/**
 * The open wait's poll, on the checklist's period: one round at once, then on
 * every period and whenever the tab returns to view. Rounds never overlap. A
 * round reads the attempt and the account's four checks, and the manager's
 * events where the wait does not yet know the attempt's opening or the
 * attempt ended. A round that fails or runs past its limit reads failed,
 * never the last good reading.
 *
 * The events are read for the attempt the countdown's record names alone, so
 * a later attempt somebody else opens is never read as this one; once they
 * name its opening, the wait keeps it for the mount. A countdown stored
 * without its attempt reads no events: nothing can match it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { isVisible } from '@web/modules/social-recovery/shared/ceremony'
import {
  CHECKLIST_POLL_MS,
  POLL_LIMIT_MS
} from '@web/modules/social-recovery/recovery/checklist/constants'

import { needsStory, phaseOf } from './phase'
import { readAttemptStory, readWaitFacts } from './read'
import type { AttemptStory, WaitPoll, WaitPollHook, WaitPollInput } from './types'

const PENDING: WaitPoll = { status: 'pending' }
const NO_STORY: AttemptStory = { consumed: false, rival: false }

const useWaitPoll = ({ kit, keys, landed, visibility }: WaitPollInput): WaitPollHook => {
  const [poll, setPoll] = useState<WaitPoll>(PENDING)

  const kitRef = useRef(kit)
  kitRef.current = kit
  const keysRef = useRef(keys)
  keysRef.current = keys
  const landedRef = useRef(landed)
  landedRef.current = landed

  const known = useRef<AttemptStory | null>(null)
  const rounds = useRef(0)
  const generation = useRef(0)
  const inFlight = useRef<number | null>(null)

  const run = useCallback(async () => {
    const current = kitRef.current
    const handover = keysRef.current
    const id = generation.current
    if (!current || !handover || inFlight.current === id) {
      return
    }
    inFlight.current = id
    const settle = (next: WaitPoll) => {
      if (inFlight.current === id) {
        inFlight.current = null
      }
      if (id === generation.current) {
        setPoll(next)
      }
    }
    const facts = await readWaitFacts(current, handover, POLL_LIMIT_MS)
    if (!facts) {
      settle({ status: 'failed' })
      return
    }
    const mark = landedRef.current
    let story = known.current ?? NO_STORY
    if (mark && needsStory(facts, known.current, mark)) {
      const read = await readAttemptStory(current, mark, facts.block.number, POLL_LIMIT_MS)
      if (!read) {
        settle({ status: 'failed' })
        return
      }
      story = read
      if (id === generation.current && read.started) {
        known.current = read
      }
    }
    rounds.current += 1
    settle({
      status: 'answered',
      facts,
      story,
      phase: phaseOf(facts, story, mark),
      round: rounds.current
    })
  }, [])

  const ready = !!kit && !!keys
  useEffect(() => {
    generation.current += 1
    inFlight.current = null
    setPoll(PENDING)
    if (!ready) {
      return undefined
    }
    run().catch(() => undefined)
    const timer = setInterval(() => {
      run().catch(() => undefined)
    }, CHECKLIST_POLL_MS)
    const onChange = () => {
      if (visibility && isVisible(visibility)) {
        run().catch(() => undefined)
      }
    }
    visibility?.addEventListener('visibilitychange', onChange)
    return () => {
      generation.current += 1
      clearInterval(timer)
      visibility?.removeEventListener('visibilitychange', onChange)
    }
  }, [kit, ready, visibility, run])

  const retry = useCallback(() => {
    run().catch(() => undefined)
  }, [run])

  return { poll, retry }
}

export default useWaitPoll
