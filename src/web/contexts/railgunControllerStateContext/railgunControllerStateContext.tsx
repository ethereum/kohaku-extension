/* eslint-disable no-console */
import React, { createContext, useEffect, useMemo } from 'react'

import { AddressState } from '@ambire-common/interfaces/domains'
import useDeepMemo from '@common/hooks/useDeepMemo'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useControllerState from '@web/hooks/useControllerState'
import type { RailgunController } from '@ambire-common/controllers/railgun/railgun'

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
  isReadyToLoad: boolean
  loadPrivateAccount: () => Promise<void>
  refreshPrivateAccount: () => Promise<void>
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
>

const RailgunControllerStateContext = createContext<EnhancedRailgunControllerState>(
  {} as EnhancedRailgunControllerState
)

const RailgunControllerStateProvider: React.FC<any> = ({ children }) => {
  const controller = 'railgun'
  const state = useControllerState(controller)
  const { dispatch } = useBackgroundService()

  const memoizedState = useDeepMemo(state, controller)

  console.log('DEBUG:', { state })

  // Mock functions for interface compatibility with Privacy Pools
  // These will be implemented with real Railgun functionality later
  const loadPrivateAccount = React.useCallback(async () => {
    console.log('DEBUG: Railgun loadPrivateAccount called (mock)')
    // TODO: Implement Railgun account loading
  }, [])

  const refreshPrivateAccount = React.useCallback(async () => {
    console.log('DEBUG: Railgun refreshPrivateAccount called (mock)')
    // TODO: Implement Railgun account refresh
  }, [])

  useEffect(() => {
    if (!Object.keys(state).length) {
      dispatch({ type: 'INIT_CONTROLLER_STATE', params: { controller } })
    }
  }, [dispatch, state])

  const value = useMemo(
    () => ({
      ...memoizedState,
      selectedToken: memoizedState.selectedToken ?? null, // Ensure selectedToken is always present
      isAccountLoaded: true, // Mock: always loaded for now
      isReadyToLoad: true, // Mock: always ready for now
      loadPrivateAccount,
      refreshPrivateAccount
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
