/**
 * Holds the execution's run for the wait, one per chain, account and attempt,
 * outside the screen, so a remount takes up the run in flight instead of
 * sending a second execution. When the screen leaves a run with nothing in
 * flight, or releases it once the attempt executed, the run is dropped. A
 * move with no steps yet does nothing.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

import {
  attachExecuteSteps,
  checkDropped,
  checkReceiptAgain,
  createExecuteStore,
  detachExecuteSteps,
  outlivesWait,
  startExecution
} from './execute'
import type { ExecuteRun, ExecuteSteps, ExecuteStore } from './types'

const RUNS = new Map<string, ExecuteStore>()

const storeFor = (runKey: string): ExecuteStore => {
  const held = RUNS.get(runKey)
  if (held) {
    return held
  }
  const created = createExecuteStore()
  RUNS.set(runKey, created)
  return created
}

const useExecuteRun = (steps: ExecuteSteps | null, runKey: string): ExecuteRun => {
  const store = useMemo(() => storeFor(runKey), [runKey])
  const state = useSyncExternalStore(store.subscribe, store.state)
  const stepsRef = useRef(steps)
  stepsRef.current = steps

  useEffect(() => {
    if (!RUNS.has(runKey)) {
      RUNS.set(runKey, store)
    }
    return () => {
      if (RUNS.get(runKey) === store && !outlivesWait(store.state())) {
        RUNS.delete(runKey)
      }
    }
  }, [store, runKey])

  useEffect(() => {
    if (!steps) {
      return undefined
    }
    attachExecuteSteps(store, steps)
    return () => detachExecuteSteps(store, steps)
  }, [store, steps])

  const start = useCallback(() => {
    if (stepsRef.current) {
      startExecution(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])
  const dropped = useCallback(() => {
    if (stepsRef.current) {
      checkDropped(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])

  const receiptAgain = useCallback(() => {
    if (stepsRef.current) {
      checkReceiptAgain(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])

  const release = useCallback(() => {
    if (RUNS.get(runKey) === store) {
      RUNS.delete(runKey)
    }
  }, [store, runKey])

  return { state, start, checkDropped: dropped, checkReceiptAgain: receiptAgain, release }
}

export default useExecuteRun
