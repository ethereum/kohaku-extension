import React, { createContext, useCallback, useEffect, useMemo } from 'react'

import type { PPv1Address, PPv1AssetAmount, PPv1AssetBalance } from '@kohaku-eth/privacy-pools'

import useDeepMemo from '@common/hooks/useDeepMemo'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useControllerState from '@web/hooks/useControllerState'
import { INote, OpStatus, PendingUnshieldOperation, State, SyncState } from '@ambire-common/controllers/privacyPools/privacyPoolsV1'
import { SignAccountOpController } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { AccountOp } from '@ambire-common/libs/accountOp/accountOp'

type PrivacyPoolsV1ControllerStateContextType = {
  balance: PPv1AssetBalance[]
  notes: INote[]
  syncState: SyncState
  isInitialized: boolean
  initializationError: string | null
  init: (chainId: number) => void
  sync: () => void
  shield: (asset: PPv1AssetAmount) => void
  prepareUnshield: (asset: PPv1AssetAmount, to: PPv1Address) => void
  unshield: () => void
  pendingUnshieldOperation: PendingUnshieldOperation | null
  state: State
  lastOp: OpStatus | null
  signAccountOpController: SignAccountOpController | null
  latestBroadcastedAccountOp: AccountOp | null
  hasProceeded: boolean
}

const PrivacyPoolsV1ControllerStateContext =
  createContext<PrivacyPoolsV1ControllerStateContextType>({
    balance: [],
    notes: [],
    syncState: 'unsynced',
    isInitialized: false,
    initializationError: null,
    init: () => {},
    sync: () => {},
    shield: () => {},
    prepareUnshield: () => {},
    unshield: () => {},
    pendingUnshieldOperation: null,
    state: 'idle',
    lastOp: null,
    signAccountOpController: null,
    latestBroadcastedAccountOp: null,
    hasProceeded: false
  })

const PrivacyPoolsV1ControllerStateProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const controller = 'privacyPoolsV1'
  const state = useControllerState(controller)
  const { dispatch } = useBackgroundService()

  useEffect(() => {
    if (!Object.keys(state).length)
      dispatch({ type: 'INIT_CONTROLLER_STATE', params: { controller } })
  }, [dispatch, state])

  const memoizedState = useDeepMemo(state, controller)

  const init = useCallback(
    (chainId: number) => {
      dispatch({ type: 'PRIVACY_POOLS_V1_CONTROLLER_INIT', params: { chainId } })
    },
    [dispatch]
  )

  const sync = useCallback(() => {
    dispatch({ type: 'PRIVACY_POOLS_V1_CONTROLLER_SYNC' })
  }, [dispatch])

  const shield = useCallback(
    (asset: PPv1AssetAmount) => {
      dispatch({ type: 'PRIVACY_POOLS_V1_CONTROLLER_SHIELD', params: { asset } })
    },
    [dispatch]
  )

  const prepareUnshield = useCallback(
    (asset: PPv1AssetAmount, to: PPv1Address) => {
      dispatch({ type: 'PRIVACY_POOLS_V1_CONTROLLER_PREPARE_UNSHIELD', params: { asset, to } })
    },
    [dispatch]
  )

  const unshield = useCallback(() => {
    dispatch({ type: 'PRIVACY_POOLS_V1_CONTROLLER_UNSHIELD' })
  }, [dispatch])

  const value = useMemo<PrivacyPoolsV1ControllerStateContextType>(
    () => ({
      balance: memoizedState.balance,
      syncState: memoizedState.syncState,
      isInitialized: memoizedState.isInitialized,
      initializationError: memoizedState.initializationError,
      state: memoizedState.state,
      lastOp: memoizedState.lastOperation,
      init,
      sync,
      shield,
      prepareUnshield,
      unshield,
      notes: memoizedState.notes,
      signAccountOpController: memoizedState.signAccountOpController ?? null,
      latestBroadcastedAccountOp: memoizedState.latestBroadcastedAccountOp ?? null,
      hasProceeded: memoizedState.hasProceeded ?? false,
      pendingUnshieldOperation: memoizedState.pendingUnshieldOperation ?? null
    }),
    [memoizedState, init, sync, shield, prepareUnshield, unshield]
  )

  return (
    <PrivacyPoolsV1ControllerStateContext.Provider value={value}>
      {children}
    </PrivacyPoolsV1ControllerStateContext.Provider>
  )
}

export { PrivacyPoolsV1ControllerStateContext, PrivacyPoolsV1ControllerStateProvider }
export type { PrivacyPoolsV1ControllerStateContextType }
