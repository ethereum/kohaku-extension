/**
 * Holds the submission's run for the screen, and the moves the screen offers
 * over the steps it is given. A move with no steps yet does nothing.
 *
 * The run lives outside the screen, one per chain and account, so a remount
 * takes up the run in flight instead of starting a second one. When the
 * screen leaves an ended run, the run is dropped and the next arrival reads
 * the session again. Once it has steps, a run that never started reads the
 * session for a claim, and follows one where it is stored.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

import {
  attachSteps,
  checkAgain,
  createSubmitStore,
  detachSteps,
  leaveDeposit,
  lookForClaim,
  outlivesScreen,
  rereadLanding,
  startSubmission
} from './run'
import type { SubmitRun, SubmitSteps, SubmitStore } from './types'

const RUNS = new Map<string, SubmitStore>()

const storeFor = (runKey: string): SubmitStore => {
  const held = RUNS.get(runKey)
  if (held) {
    return held
  }
  const created = createSubmitStore()
  RUNS.set(runKey, created)
  return created
}

const useSubmitRun = (steps: SubmitSteps | null, runKey: string): SubmitRun => {
  const store = useMemo(() => storeFor(runKey), [runKey])
  const state = useSyncExternalStore(store.subscribe, store.state)
  const stepsRef = useRef(steps)
  stepsRef.current = steps

  useEffect(() => {
    if (!RUNS.has(runKey)) {
      RUNS.set(runKey, store)
    }
    return () => {
      if (RUNS.get(runKey) === store && !outlivesScreen(store.state())) {
        RUNS.delete(runKey)
      }
    }
  }, [store, runKey])

  useEffect(() => {
    if (!steps) {
      return undefined
    }
    attachSteps(store, steps)
    lookForClaim(store, steps).catch(() => undefined)
    return () => detachSteps(store, steps)
  }, [store, steps])

  const start = useCallback(() => {
    if (stepsRef.current) {
      startSubmission(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])
  const again = useCallback(() => {
    if (stepsRef.current) {
      checkAgain(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])
  const reread = useCallback(() => {
    if (stepsRef.current) {
      rereadLanding(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])

  const leave = useCallback(() => leaveDeposit(store), [store])

  return { state, start, checkAgain: again, reread, leaveDeposit: leave }
}

export default useSubmitRun
