/* eslint-disable no-console */
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import useDeepMemo from '@common/hooks/useDeepMemo'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useControllerState from '@web/hooks/useControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

import { type RailgunAccount, type Indexer } from '@kohaku-eth/railgun'

import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'

import type { RailgunAccountCache } from '@ambire-common/controllers/railgun/railgun'
// import { getRpcProviderForUI, UIProxyProvider } from '@web/services/provider'

import { JsonRpcProvider } from 'ethers'
import {
  EnhancedRailgunControllerState,
  RailgunBalance,
  RailgunReactState,
  TrackedRailgunAccount
} from './types'
import { DEFAULT_CHAIN_ID, DEFAULT_TRACKED_ACCOUNTS } from './constants'
import { getProvider } from './utils/provider'
import { BackgroundService } from './utils/backgroundService'
import { syncSingleAccount } from './utils/accountSyn'
import { aggregateBalances } from './utils/balances'

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

const RailgunControllerStateContext = createContext<EnhancedRailgunControllerState>(
  {} as EnhancedRailgunControllerState
)

const RailgunControllerStateProvider: React.FC<any> = ({ children }) => {
  const controller = 'railgun'

  // 1) snapshot of background state (what controller.toJSON() returns)
  const bgState = useControllerState(controller)
  const memoizedBgState = useDeepMemo(bgState, controller)

  const keystoreState = useControllerState('keystore')
  const isUnlocked = !!keystoreState?.isUnlocked

  // 2) background dispatcher
  const { dispatch } = useBackgroundService()

  // 3) currently selected account (avoid syncing when none is selected)
  const { account: selectedAccount } = useSelectedAccountControllerState()

  // 4) local react-only railgun sync state (simple)
  const [railgunAccountsState, setRailgunAccountsState] = useState<RailgunReactState>({
    status: 'idle',
    error: undefined,
    balances: [{ tokenAddress: ZERO_ADDRESS, amount: '0' }],
    accounts: [],
    chainId: DEFAULT_CHAIN_ID,
    lastSyncedBlock: 0
  })

  // 5) Store synced account instance for direct access (created during loadPrivateAccount)
  const [syncedDefaultRailgunAccount, setSyncedDefaultRailgunAccount] =
    useState<RailgunAccount | null>(null)
  const [syncedDefaultRailgunIndexer, setSyncedDefaultRailgunIndexer] = useState<Indexer | null>(
    null
  )

  // 6) refs to avoid re-entrancy & track initial load
  const latestBgStateRef = useRef<any>(memoizedBgState)
  const isRunningRef = useRef<boolean>(false) // strict single-flight guard
  const hasLoadedOnceRef = useRef<boolean>(false) // track if we've loaded once on startup
  const hasAttemptedAutoLoadRef = useRef<boolean>(false) // prevent repeated auto-load attempts on failures
  const pendingResetRef = useRef<boolean>(false) // defer reset if account/chain changes mid-run

  const chainId = memoizedBgState.chainId || DEFAULT_CHAIN_ID

  const providerRef = useRef<JsonRpcProvider | null>(null)
  useEffect(() => {
    providerRef.current = getProvider(chainId)
    return () => {
      providerRef.current = null
    }
  }, [chainId])

  useEffect(() => {
    latestBgStateRef.current = memoizedBgState
  }, [memoizedBgState])

  const bgServiceRef = useRef<BackgroundService | null>(null)
  if (!bgServiceRef.current && dispatch) {
    bgServiceRef.current = new BackgroundService(latestBgStateRef, dispatch)
  }

  // Reset hasLoadedOnceRef when account or chainId changes (allows loading for new account/chain)
  useEffect(() => {
    if (isRunningRef.current) {
      pendingResetRef.current = true
      console.log('[RailgunContext][Guards] DEFERRED reset (sync in progress)', {
        isRunningRef: isRunningRef.current,
        account: selectedAccount?.addr,
        chainId
      })
      return
    }

    hasLoadedOnceRef.current = false
    hasAttemptedAutoLoadRef.current = false
    console.log('[RailgunContext][Guards] RESET for account/chain change', {
      account: selectedAccount?.addr,
      chainId,
      hasLoadedOnce: hasLoadedOnceRef.current,
      hasAttemptedAutoLoad: hasAttemptedAutoLoadRef.current
    })
  }, [selectedAccount?.addr, chainId])

  useEffect(() => {
    if (isUnlocked) {
      hasAttemptedAutoLoadRef.current = false
      console.log('[RailgunContext][Guards] RESET hasAttemptedAutoLoad on unlock')
    }
  }, [isUnlocked])

  const getAccountCacheFromBg = useCallback(
    async (zkAddress: string, _chainId: number): Promise<RailgunAccountCache | null> => {
      if (!bgServiceRef.current) throw new Error('BackgroundServiceHelper not initialized')
      return bgServiceRef.current.getAccountCacheFromBg(zkAddress, _chainId)
    },
    []
  )

  // ───────────────────────────────────────────────────────────────────────────
  // Core load (single-flight, minimal transitions)
  // ───────────────────────────────────────────────────────────────────────────
  const loadPrivateAccount = useCallback(
    async (force = false) => {
      console.log('[RailgunContext][LPA] invoked', {
        force,
        isUnlocked,
        isRunningRef: isRunningRef.current,
        status: railgunAccountsState.status,
        hasLoadedOnce: hasLoadedOnceRef.current,
        hasSelectedAccount: !!selectedAccount,
        selectedAccountAddr: selectedAccount?.addr
      })

      if (!isUnlocked) {
        console.log('[RailgunContext][LPA] SKIPPED: keystore is locked (isUnlocked=false)')
        return
      }

      // Strict single-flight guard - check and set atomically
      if (isRunningRef.current) {
        console.log('[RailgunContext][LPA] SKIPPED: sync already in progress (isRunningRef=true)')
        return
      }
      if (railgunAccountsState.status === 'running') {
        console.log('[RailgunContext][LPA] SKIPPED: sync already in progress (status="running")')
        return
      }

      // If already loaded once and not forced, skip (only allow manual refresh)
      if (!force && hasLoadedOnceRef.current) {
        console.log(
          '[RailgunContext][LPA] SKIPPED: already loaded once and force=false (hasLoadedOnce=true). Use refreshPrivateAccount() to reload.'
        )
        return
      }

      if (!selectedAccount) {
        console.log('[RailgunContext][LPA] SKIPPED: no selected account (selectedAccount=null)')
        return
      }

      if (!bgServiceRef.current) {
        console.log('[RailgunContext][LPA] SKIPPED: background service not initialized')
        return
      }

      console.log('[RailgunContext][LPA] STARTING sync for account:', selectedAccount.addr)

      // Set running flag immediately to prevent race conditions
      isRunningRef.current = true
      setRailgunAccountsState((prev) => ({
        ...prev,
        status: 'running',
        error: undefined,
        chainId
      }))

      try {
        const tracked = DEFAULT_TRACKED_ACCOUNTS
        const newAccountsMeta: TrackedRailgunAccount[] = []
        const balancesForAggregation: RailgunBalance[][] = []

        let earliestLastSyncedBlock: number = 0

        console.log('[RailgunContext - LPA] sync account with new logs')
        const provider = providerRef.current!
        if (!provider) {
          throw new Error('Provider not available')
        }

        // ——— per-account init ———
        // eslint-disable-next-line no-restricted-syntax
        for (const item of tracked) {
          // eslint-disable-next-line no-await-in-loop
          const syncSingleAccountResult = await syncSingleAccount({
            item,
            chainId,
            provider,
            bgService: bgServiceRef.current
          })

          newAccountsMeta.push(syncSingleAccountResult.accountMeta)
          balancesForAggregation.push(syncSingleAccountResult.balances)

          // Store the account instance for direct access (only for default account, index 0)
          if (item.index === 0) {
            setSyncedDefaultRailgunAccount(syncSingleAccountResult.account)
            setSyncedDefaultRailgunIndexer(syncSingleAccountResult.indexer)
          }

          if (
            earliestLastSyncedBlock === 0 ||
            syncSingleAccountResult.effectiveLastSyncedBlock < earliestLastSyncedBlock
          ) {
            earliestLastSyncedBlock = syncSingleAccountResult.effectiveLastSyncedBlock
          }
        }

        const aggregatedBalances = aggregateBalances(balancesForAggregation)

        isRunningRef.current = false
        hasLoadedOnceRef.current = true // Mark as loaded
        setRailgunAccountsState((prev) => ({
          ...prev,
          status: 'ready',
          balances: aggregatedBalances,
          accounts: newAccountsMeta,
          lastSyncedBlock: earliestLastSyncedBlock
        }))
        console.log('[RailgunContext - LPA] FINISHED LPA !!! balances:', aggregatedBalances)
      } catch (err: any) {
        console.error('[RailgunContext] load failed', err)
        isRunningRef.current = false
        // Don't mark as loaded on error, so it can retry
        setRailgunAccountsState((prev) => ({
          ...prev,
          status: 'error',
          error: err?.message || String(err)
        }))
      } finally {
        if (pendingResetRef.current) {
          pendingResetRef.current = false
          hasLoadedOnceRef.current = false
          hasAttemptedAutoLoadRef.current = false
          console.log(
            '[RailgunContext][Guards] APPLIED deferred reset (account/chain changed during sync)'
          )
        }
      }
    },
    [
      selectedAccount,
      chainId,
      isUnlocked,
      railgunAccountsState.status
      // getDerivedKeysFromBg,
      // getAccountCacheFromBg,
      // fireBg
    ]
  )

  // ───────────────────────────────────────────────────────────────────────────
  // Public refresh: bypasses "already loaded" check and runs immediately
  // ───────────────────────────────────────────────────────────────────────────
  const refreshPrivateAccount = useCallback(async () => {
    console.log('[RailgunContext][Refresh] invoked', {
      isRunningRef: isRunningRef.current,
      status: railgunAccountsState.status
    })

    if (isRunningRef.current || railgunAccountsState.status === 'running') {
      console.log('[RailgunContext][Refresh] SKIPPED: sync already in progress', {
        isRunningRef: isRunningRef.current,
        status: railgunAccountsState.status
      })
      return
    }

    console.log('[RailgunContext][Refresh] STARTING forced reload')
    // Force reload by passing true - this will resync from cache to latest block
    await loadPrivateAccount(true)
    console.log('[RailgunContext][Refresh] COMPLETED')
  }, [loadPrivateAccount, railgunAccountsState.status])

  // ───────────────────────────────────────────────────────────────────────────
  // init background controller state if missing
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!Object.keys(bgState).length) {
      dispatch?.({ type: 'INIT_CONTROLLER_STATE', params: { controller } })
    }
  }, [dispatch, bgState])

  // ───────────────────────────────────────────────────────────────────────────
  // Auto-load exactly once on startup (when selectedAccount becomes available)
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const guards = {
      isUnlocked,
      hasSelectedAccount: !!selectedAccount,
      selectedAccountAddr: selectedAccount?.addr,
      hasLoadedOnce: hasLoadedOnceRef.current,
      hasAttemptedAutoLoad: hasAttemptedAutoLoadRef.current
    }
    console.log('[RailgunContext][AutoLoad] effect triggered', guards)

    if (!isUnlocked) {
      console.log('[RailgunContext][AutoLoad] SKIPPED: keystore locked (isUnlocked=false)')
      return
    }
    if (!selectedAccount) {
      console.log('[RailgunContext][AutoLoad] SKIPPED: no selected account')
      return
    }
    if (hasLoadedOnceRef.current) {
      console.log('[RailgunContext][AutoLoad] SKIPPED: already loaded once (hasLoadedOnce=true)')
      return
    }
    if (hasAttemptedAutoLoadRef.current) {
      console.log(
        '[RailgunContext][AutoLoad] SKIPPED: already attempted (hasAttemptedAutoLoad=true)'
      )
      return
    }

    console.log(
      '[RailgunContext][AutoLoad] SCHEDULING load in 100ms for account:',
      selectedAccount.addr
    )
    const t = setTimeout(() => {
      console.log('[RailgunContext][AutoLoad] EXECUTING scheduled load')
      hasAttemptedAutoLoadRef.current = true
      // eslint-disable-next-line no-void
      void loadPrivateAccount(false)
    }, 100)
    return () => clearTimeout(t)
  }, [isUnlocked, selectedAccount, loadPrivateAccount])

  // ───────────────────────────────────────────────────────────────────────────
  // derive “view model” for UI
  // ───────────────────────────────────────────────────────────────────────────
  const value: EnhancedRailgunControllerState = useMemo(() => {
    const status = railgunAccountsState.status
    const isAccountLoaded = status === 'ready'
    const isLoadingAccount = status === 'running'
    const isRefreshing = status === 'running'
    const isReadyToLoad = status === 'ready'

    return {
      // bg snapshot first
      ...memoizedBgState,

      // stabilize a few bg fields
      selectedToken: memoizedBgState.selectedToken ?? null,
      maxAmount: memoizedBgState.maxAmount ?? '',
      privacyProvider: memoizedBgState.privacyProvider ?? 'railgun',
      validationFormMsgs: memoizedBgState.validationFormMsgs,

      // simplified state
      railgunAccountsState,

      // flags
      isAccountLoaded,
      isLoadingAccount,
      isRefreshing,
      isReadyToLoad,

      // actions
      loadPrivateAccount,
      refreshPrivateAccount,
      getAccountCache: getAccountCacheFromBg,

      // expose default keys if bg already has them cached
      defaultRailgunKeys: memoizedBgState.defaultRailgunKeys ?? null,

      // expose synced account instance for direct use
      syncedDefaultRailgunAccount,
      syncedDefaultRailgunIndexer
    }
  }, [
    memoizedBgState,
    railgunAccountsState,
    loadPrivateAccount,
    refreshPrivateAccount,
    syncedDefaultRailgunAccount,
    syncedDefaultRailgunIndexer
  ])

  return (
    <RailgunControllerStateContext.Provider value={value}>
      {children}
    </RailgunControllerStateContext.Provider>
  )
}

export { RailgunControllerStateProvider, RailgunControllerStateContext }
