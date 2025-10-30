/* eslint-disable no-console */
import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react'

import { AddressState } from '@ambire-common/interfaces/domains'
import useDeepMemo from '@common/hooks/useDeepMemo'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useControllerState from '@web/hooks/useControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import type {
  RailgunController,
  RailgunAccountKeys,
  RailgunBalance
} from '@ambire-common/controllers/railgun/railgun'
import { RailgunAccount } from '@kohaku-eth/railgun'

type RailgunControllerReactState = {
  status: 'idle' | 'loading-cache' | 'syncing' | 'ready' | 'error'
  balances: RailgunBalance[]
  lastSyncedBlock?: number
  account?: RailgunAccount
  error?: string
}

type EnhancedRailgunControllerState = {
  // Core form state
  depositAmount: string
  privacyProvider: string
  chainId: number
  // Required RailgunController properties for form compatibility
  validationFormMsgs: {
    amount: { success: boolean; message: string }
    recipientAddress: { success: boolean; message: string }
  }
  addressState: AddressState
  isRecipientAddressUnknown: boolean
  signAccountOpController: any
  latestBroadcastedAccountOp: any
  latestBroadcastedToken: any
  hasProceeded: boolean
  selectedToken: any
  amountFieldMode: 'token' | 'fiat'
  withdrawalAmount: string
  amountInFiat: string
  programmaticUpdateCounter: number
  isRecipientAddressUnknownAgreed: boolean
  maxAmount: string
  isAccountLoaded: boolean
  isLoadingAccount: boolean
  isRefreshing: boolean
  isReadyToLoad: boolean
  currentRailgunKeys: RailgunAccountKeys | null
  loadPrivateAccount: () => Promise<void>
  refreshPrivateAccount: () => Promise<void>
  // New Railgun account sync state
  railgunState: RailgunControllerReactState
} & Omit<
  Partial<RailgunController>,
  | 'validationFormMsgs'
  | 'addressState'
  | 'isRecipientAddressUnknown'
  | 'signAccountOpController'
  | 'latestBroadcastedAccountOp'
  | 'latestBroadcastedToken'
  | 'hasProceeded'
  | 'selectedToken'
  | 'amountFieldMode'
  | 'withdrawalAmount'
  | 'amountInFiat'
  | 'programmaticUpdateCounter'
  | 'isRecipientAddressUnknownAgreed'
  | 'maxAmount'
  | 'depositAmount'
  | 'privacyProvider'
  | 'chainId'
  | 'currentRailgunKeys'
>

const RailgunControllerStateContext = createContext<EnhancedRailgunControllerState>(
  {} as EnhancedRailgunControllerState
)

const RailgunControllerStateProvider: React.FC<any> = ({ children }) => {
  const controller = 'railgun'
  const state = useControllerState(controller)
  const { dispatch } = useBackgroundService()
  const { account: selectedAccount } = useSelectedAccountControllerState()

  const memoizedState = useDeepMemo(state, controller)

  console.log('DEBUG:', { state })

  // Derive identity from the selected account (using account index 0 for now)
  const deriveRailgunIdentity = useCallback((account: any): string => {
    // For now, use account index 0. In the future, this could be derived
    // from the account address or stored in account metadata
    return '0'
  }, [])

  // Load private account (trigger sync)
  const loadPrivateAccount = useCallback(async () => {
    if (!selectedAccount || !memoizedState.chainId) {
      console.log('DEBUG: Railgun loadPrivateAccount - no selected account or chainId')
      return
    }

    const identity = deriveRailgunIdentity(selectedAccount)
    const chainId = memoizedState.chainId

    console.log('DEBUG: Triggering Railgun account load/sync', { identity, chainId })

    dispatch({
      type: 'RAILGUN_CONTROLLER_LOAD_AND_SYNC_ACCOUNT',
      params: { identity, chainId }
    })
  }, [selectedAccount, memoizedState.chainId, deriveRailgunIdentity, dispatch])

  // Refresh account (same as load - it will sync)
  const refreshPrivateAccount = useCallback(async () => {
    return loadPrivateAccount()
  }, [loadPrivateAccount])

  // Auto-load account when component mounts or when active account/chainId changes
  useEffect(() => {
    if (!selectedAccount || !memoizedState.chainId) {
      return
    }

    const identity = deriveRailgunIdentity(selectedAccount)
    const chainId = memoizedState.chainId

    console.log('DEBUG: Auto-loading Railgun account', { identity, chainId })

    dispatch({
      type: 'RAILGUN_CONTROLLER_LOAD_AND_SYNC_ACCOUNT',
      params: { identity, chainId }
    })
  }, [selectedAccount, memoizedState.chainId, deriveRailgunIdentity, dispatch])

  useEffect(() => {
    if (!Object.keys(state).length) {
      dispatch({ type: 'INIT_CONTROLLER_STATE', params: { controller } })
    }
  }, [dispatch, state])

  const value = useMemo(
    () => ({
      ...memoizedState,
      selectedToken: memoizedState.selectedToken ?? null,
      isAccountLoaded: memoizedState.accountSyncState?.status === 'ready',
      isLoadingAccount: memoizedState.accountSyncState?.status === 'loading-cache' || memoizedState.accountSyncState?.status === 'syncing',
      isRefreshing: memoizedState.accountSyncState?.status === 'syncing',
      isReadyToLoad: memoizedState.accountSyncState?.status !== 'idle',
      loadPrivateAccount,
      refreshPrivateAccount,
      currentRailgunKeys: memoizedState.currentRailgunKeys ?? null,
      railgunState: memoizedState.accountSyncState || { status: 'idle', balances: [] }
    }),
    [memoizedState, loadPrivateAccount, refreshPrivateAccount]
  )

  return (
    <RailgunControllerStateContext.Provider value={value}>
      {children}
    </RailgunControllerStateContext.Provider>
  )
}

export { RailgunControllerStateProvider, RailgunControllerStateContext }
