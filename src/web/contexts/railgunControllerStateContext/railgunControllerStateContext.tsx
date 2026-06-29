import React, { createContext, useCallback, useEffect, useMemo } from 'react'

import useDeepMemo from '@common/hooks/useDeepMemo'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useControllerState from '@web/hooks/useControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'

import type { RailgunBalance as SdkRailgunBalance } from '@ambire-common/controllers/railgun/railgunV2'

import { EnhancedRailgunControllerState, RailgunBalance } from './types'
import { DEFAULT_CHAIN_ID } from './constants'

const RailgunControllerStateContext = createContext<EnhancedRailgunControllerState>(
  {} as EnhancedRailgunControllerState
)

function mapSdkBalances(balances: SdkRailgunBalance[] | undefined): RailgunBalance[] {
  if (!balances?.length) return []

  return balances.map((b) => {
    const asset = b.asset as { __type: string; contract?: string }
    const tokenAddress = asset.__type === 'native' ? ZERO_ADDRESS : asset.contract ?? ZERO_ADDRESS
    return { tokenAddress, amount: b.amount.toString() }
  })
}

const RailgunControllerStateProvider: React.FC<any> = ({ children }) => {
  const { dispatch } = useBackgroundService()
  const { account: selectedAccount } = useSelectedAccountControllerState()

  const keystoreState = useControllerState('keystore')
  const isUnlocked = !!keystoreState?.isUnlocked

  const railgunV2State = useControllerState('railgunV2')
  const memoizedV2State = useDeepMemo(railgunV2State, 'railgunV2')

  const syncState: string = memoizedV2State.syncState ?? 'unsynced'
  const isInitialized = !!memoizedV2State.isInitialized
  const initializationError: string | undefined = memoizedV2State.initializationError ?? undefined
  const zkAddress: string | null = memoizedV2State.zkAddress ?? null

  useEffect(() => {
    if (!Object.keys(railgunV2State).length) {
      dispatch?.({ type: 'INIT_CONTROLLER_STATE', params: { controller: 'railgunV2' } })
    }
  }, [dispatch, railgunV2State])

  const loadPrivateAccount = useCallback(async () => {
    if (!isUnlocked || !selectedAccount || !dispatch) return

    if (!isInitialized) dispatch({ type: 'RAILGUN_V2_CONTROLLER_INIT' })

    dispatch({ type: 'RAILGUN_V2_CONTROLLER_SYNC' })
  }, [dispatch, isUnlocked, selectedAccount, isInitialized])

  const refreshPrivateAccount = useCallback(async () => {
    if (!dispatch) return

    dispatch({ type: 'RAILGUN_V2_CONTROLLER_SYNC' })
  }, [dispatch])

  useEffect(() => {
    if (!isUnlocked || !selectedAccount || !isInitialized) return
    if (syncState !== 'unsynced') return

    const t = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      loadPrivateAccount()
    }, 100)
    return () => clearTimeout(t)
  }, [isUnlocked, selectedAccount, isInitialized, syncState, loadPrivateAccount])

  const value: EnhancedRailgunControllerState = useMemo(() => {
    const balances = mapSdkBalances(memoizedV2State.balance)

    let status: 'idle' | 'running' | 'ready' | 'error' = 'idle'
    if (initializationError) status = 'error'
    else if (syncState === 'syncing') status = 'running'
    else if (syncState === 'synced') status = 'ready'

    const isLoadingAccount = status === 'running'

    return {
      railgunAccountsState: {
        status,
        error: initializationError,
        balances,
        accounts: zkAddress
          ? [
              {
                id: 'derived:0',
                kind: 'derived' as const,
                index: 0,
                zkAddress,
                balances,
                lastSyncedBlock: 0
              }
            ]
          : [],
        chainId: DEFAULT_CHAIN_ID,
        lastSyncedBlock: 0
      },

      isAccountLoaded: status === 'ready',
      isLoadingAccount,
      isRefreshing: isLoadingAccount,
      isReadyToLoad: isInitialized,

      loadPrivateAccount,
      refreshPrivateAccount,

      zkAddress
    }
  }, [
    memoizedV2State,
    syncState,
    isInitialized,
    initializationError,
    zkAddress,
    loadPrivateAccount,
    refreshPrivateAccount
  ])

  return (
    <RailgunControllerStateContext.Provider value={value}>
      {children}
    </RailgunControllerStateContext.Provider>
  )
}

export { RailgunControllerStateProvider, RailgunControllerStateContext }
