/**
 * Holds the save's run for the screen, and the moves the screen offers
 * over the steps it is given. A move with no steps yet does nothing.
 *
 * The run lives outside the screen, one per chain and account, so a remount
 * (an account switch and back, a route rendered again) takes up the run in
 * flight instead of starting a second one. The screen also keeps a refusal
 * whose operation may still reach the chain, and a landed save whose check did
 * not answer. When the screen leaves any other ended run (saved, a setup
 * found, failed, the deposit step or disagreed), the run is dropped, and the
 * next arrival reads the chain again before anything starts. Once it has
 * steps, a run that never started reads the save in flight stored on this
 * device, and follows one where it is stored. A follow of a stored save with
 * no hash reads the wallet's queue through the steps of the screen attached
 * now, whenever it started: while no screen is attached it pauses, and the
 * next steps attached take it up.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

import {
  attachSteps,
  checkReceiptAgain,
  checkSetupAgain,
  createArmStore,
  detachSteps,
  endWhereSetUp,
  lookForSave,
  outlivesScreen,
  recheckGas,
  rereadConfirmation,
  startSave
} from './run'
import type { ArmRun, ArmStore, SaveSteps } from './types'

const RUNS = new Map<string, ArmStore>()

const storeFor = (runKey: string): ArmStore => {
  const held = RUNS.get(runKey)
  if (held) {
    return held
  }
  const created = createArmStore()
  RUNS.set(runKey, created)
  return created
}

export const useArmRun = (steps: SaveSteps | null, runKey: string): ArmRun => {
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
    attachSteps(store, steps).catch(() => undefined)
    lookForSave(store, steps).catch(() => undefined)
    return () => detachSteps(steps)
  }, [store, steps])

  const lookAgain = useCallback(() => {
    if (stepsRef.current) {
      lookForSave(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])
  const start = useCallback(() => {
    if (stepsRef.current) {
      startSave(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])
  const recheck = useCallback(() => {
    if (stepsRef.current) {
      recheckGas(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])
  const reread = useCallback(() => {
    if (stepsRef.current) {
      rereadConfirmation(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])
  const checkAgain = useCallback(() => {
    if (stepsRef.current) {
      checkReceiptAgain(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])
  const checkSetup = useCallback(() => {
    if (stepsRef.current) {
      checkSetupAgain(store, stepsRef.current).catch(() => undefined)
    }
  }, [store])
  const endKeptRunWhereSetUp = useCallback(
    (hasSetup: boolean) => {
      if (stepsRef.current) {
        endWhereSetUp(store, stepsRef.current, hasSetup).catch(() => undefined)
      }
    },
    [store]
  )

  return {
    state,
    start,
    recheck,
    reread,
    checkAgain,
    checkSetup,
    endWhereSetUp: endKeptRunWhereSetUp,
    lookAgain
  }
}
