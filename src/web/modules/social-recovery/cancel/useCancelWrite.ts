/**
 * Holds the cancel's run for the screen. The run lives outside the screen,
 * one per chain and account, so a remount (an account switch and back, a
 * route rendered again) takes up the run in flight instead of starting a
 * second one; a run with nothing on its way is dropped when the screen leaves.
 * A move with no steps yet does nothing.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

import {
  attachCancelSteps,
  checkCancelAgain,
  createCancelStore,
  detachCancelSteps,
  outlivesScreen,
  recheckCancel,
  startCancel
} from './run'
import type { CancelRun, CancelSteps, CancelStore } from './types'

const RUNS = new Map<string, CancelStore>()

const storeFor = (runKey: string): CancelStore => {
  const held = RUNS.get(runKey)
  if (held) {
    return held
  }
  const created = createCancelStore()
  RUNS.set(runKey, created)
  return created
}

export const useCancelWrite = (steps: CancelSteps | null, runKey: string): CancelRun => {
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
    attachCancelSteps(store, steps).catch(() => undefined)
    return () => detachCancelSteps(store, steps)
  }, [store, steps])

  const start = useCallback(
    (target: bigint) => {
      if (stepsRef.current) {
        startCancel(store, stepsRef.current, target).catch(() => undefined)
      }
    },
    [store]
  )
  const recheck = useCallback(() => {
    if (stepsRef.current) {
      recheckCancel(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])
  const checkAgain = useCallback(() => {
    if (stepsRef.current) {
      checkCancelAgain(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])

  return { state, start, recheck, checkAgain }
}
