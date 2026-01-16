/* eslint-disable no-console */
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { testnetNetworks } from '@ambire-common/consts/testnetNetworks'
import { AddressState } from '@ambire-common/interfaces/domains'
import useDeepMemo from '@common/hooks/useDeepMemo'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useControllerState from '@web/hooks/useControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

import {
  createRailgunAccount,
  createRailgunIndexer,
  getRailgunAddress,
  RAILGUN_CONFIG_BY_CHAIN_ID,
  type RailgunAccount,
  type Indexer,
  type RailgunLog
} from '@kohaku-eth/railgun'

import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'

import type {
  RailgunController,
  RailgunAccountKeys,
  RailgunAccountCache,
} from '@ambire-common/controllers/railgun/railgun'
// import { getRpcProviderForUI, UIProxyProvider } from '@web/services/provider'

import { JsonRpcProvider, Log, Network } from 'ethers'

type Checkpoint = {
  merkleTrees: { tree: string[][]; nullifiers: string[] }[]
  logs: Log[]
  endBlock: number
}

let _checkpointPromise: Promise<{ default: any }> | null = null;
async function loadSepoliaCheckpoint() {
  if (!_checkpointPromise) {
    // This splits the 4MB file into a separate chunk and defers parsing.
    _checkpointPromise = import('./sepolia-checkpoint.json');
  }
  const m = await _checkpointPromise;
  return m.default as Checkpoint;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS / HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CHAIN_ID = 11155111

// track ONE account: derived 0
const DEFAULT_TRACKED_ACCOUNTS: Array<{ kind: 'derived'; index: number; }> = [
  { kind: 'derived', index: 0 },
]

const DERIVED_KEYS_GLOBAL_START_BLOCKS = {
  '11155111': 9342029,
}

const getProvider = (chainId: number) => {
  const name = RAILGUN_CONFIG_BY_CHAIN_ID[chainId.toString() as keyof typeof RAILGUN_CONFIG_BY_CHAIN_ID].NAME
  const networkConfig = testnetNetworks.find((n) => n.chainId === BigInt(chainId))
  if (!name || !networkConfig) {
    throw new Error(`Unsupported chainId for Railgun: ${chainId}`)
  }
  return new JsonRpcProvider(networkConfig.selectedRpcUrl, Network.from({ name, chainId }), {staticNetwork: true, batchMaxCount: 1, batchMaxSize: 0, batchStallTime: 0})
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate-limit helpers JUST for getAllLogs (local, no other changes)
// ─────────────────────────────────────────────────────────────────────────────

// Detect Infura-style "Too Many Requests" even when wrapped
const isTooManyRequests = (e: any) => {
  const code = e?.code
  const msg = String(e?.message || e?.error?.message || '')
  const dataMsg = String(e?.error?.data || '')
  return code === 429 || /too many requests/i.test(msg) || /too many requests/i.test(dataMsg)
}

// Ethers/Infura sometimes returns range-ish errors with -32001 or phrases
// (you already had this; keeping it as a separate helper)
const isRangeErr = (e: any) => {
  return (
    e?.error?.code === -32001 ||
    /failed to resolve block range/i.test(String(e?.error?.message || e?.message || ""))
  );
};

// A tiny leaky-bucket limiter so setTimeout pacing is guaranteed even if something re-entrantly calls getAllLogs
class LocalRateLimiter {
  private lastCallAt = 0
  private minSpacingMs: number
  constructor(rps: number) {
    // rps=1.4 → ~714ms spacing
    this.minSpacingMs = Math.max(0, Math.floor(1000 / Math.max(0.1, rps)))
  }
  async wait() {
    const now = Date.now()
    const elapsed = now - this.lastCallAt
    const waitFor = this.minSpacingMs - elapsed
    if (waitFor > 0) {
      await new Promise(r => setTimeout(r, waitFor))
    }
    this.lastCallAt = Date.now()
  }
  slowDown(factor = 0.75) {
    // increase spacing a bit (reduce rps)
    this.minSpacingMs = Math.floor(this.minSpacingMs / Math.max(0.25, factor))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROBUST local getAllLogs with pacing, backoff, adaptive chunk
// ─────────────────────────────────────────────────────────────────────────────

export const getAllLogs = async (
  provider: JsonRpcProvider,
  railgunAddress: string,
  startBlock: number,
  endBlock: number
) => {
  if (endBlock < startBlock) return []

  // Start conservative; grow on success, shrink on error.
  const MAX_BATCH = 4000
  const MIN_BATCH = 250
  let batch = Math.min(2000, Math.max(MIN_BATCH, endBlock - startBlock + 1))

  // Base spacing between requests (in addition to limiter). Keep your original intent but slightly slower.
  const BASE_DELAY_MS = 1200

  // Exponential backoff window when we hit 429. Resets on any success.
  let backoffMs = 0
  const BACKOFF_BASE_MS = 2000
  const BACKOFF_MAX_MS = 20000

  // Additional tiny jitter so multiple tabs/processes don’t align perfectly.
  const jitter = () => Math.floor(Math.random() * 120)

  // Leaky bucket limiter: ~1.4 rps steady-state (independent of BASE_DELAY_MS)
  const limiter = new LocalRateLimiter(1.4)

  let from = startBlock
  const allLogs: Log[] = []

  console.log('[RailgunContext - getAllLogs] getting logs from', from, 'to', endBlock)
  let i = 0

  while (from <= endBlock) {
    const to = Math.min(from + batch - 1, endBlock)

    if (i % 10 === 0) {
      console.log('[RailgunContext - getAllLogs] getting logs batch', i, `range=[${from},${to}] chunk=${batch}`)
    }
    i++

    try {
      // 1) limiter spacing
      await limiter.wait()
      // 2) base delay + jitter
      await new Promise(r => setTimeout(r, BASE_DELAY_MS + jitter()))
      // 3) any active backoff from a previous 429
      if (backoffMs > 0) {
        console.warn('[RailgunContext - getAllLogs] backing off before call:', backoffMs, 'ms (chunk=', batch, ')')
        await new Promise(r => setTimeout(r, backoffMs + jitter()))
      }

      const logs = await provider.getLogs({
        address: railgunAddress,
        fromBlock: from,
        toBlock: to,
      })

      // success: append, advance, gently grow chunk, clear backoff
      allLogs.push(...logs)
      from = to + 1
      backoffMs = 0
      // grow chunk a bit, but keep under MAX_BATCH
      batch = Math.min(MAX_BATCH, Math.floor(batch * 1.25))

    } catch (e: any) {
      // Handle rate-limit first
      if (isTooManyRequests(e)) {
        // slow the limiter and increase backoff
        limiter.slowDown(0.75)
        backoffMs = backoffMs
          ? Math.min(BACKOFF_MAX_MS, Math.floor(backoffMs * 2))
          : BACKOFF_BASE_MS

        // shrink chunk to lighten each request
        batch = Math.max(MIN_BATCH, Math.floor(batch / 2))

        console.warn(
          '[RailgunContext - getAllLogs] 429 Too Many Requests:',
          `nextBackoff=${backoffMs}ms`,
          `newChunk=${batch}`
        )
        // loop continues, retry same "from" after backoff
        continue
      }

      // Range-y errors: shrink chunk and retry
      if (isRangeErr(e)) {
        if (batch > MIN_BATCH) {
          batch = Math.max(MIN_BATCH, Math.floor(batch / 2))
          console.warn(
            '[RailgunContext - getAllLogs] range error; shrinking chunk to',
            batch
          )
          // small pause so we don’t thrash
          await new Promise(r => setTimeout(r, 600 + jitter()))
          continue
        }
        // single-block still fails → skip the block (same behavior you had)
        console.warn(
          '[RailgunContext - getAllLogs] single-block still failing; skipping block',
          from
        )
        from = to + 1
        continue
      }

      // Anything else: bubble up
      console.error('[RailgunContext - getAllLogs] unexpected error', e)
      throw e
    }
  }

  return allLogs
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (simplified state machine)
// ─────────────────────────────────────────────────────────────────────────────

type RailgunSyncStatus = 'idle' | 'running' | 'ready' | 'error'

type RailgunBalance = {
  tokenAddress: string
  amount: string
}

type TrackedRailgunAccount = {
  id: string           // e.g. "derived:0"
  kind: 'derived' | 'imported'
  index?: number
  zkAddress?: string
  balances: RailgunBalance[]
  lastSyncedBlock: number
}

type RailgunReactState = {
  status: RailgunSyncStatus
  error?: string
  balances: RailgunBalance[]
  accounts: TrackedRailgunAccount[]
  chainId: number
  lastSyncedBlock: number
}

type EnhancedRailgunControllerState = {
  // existing bg fields
  depositAmount: string
  privacyProvider: string
  chainId: number
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

  // NEW: extremely simple client-side sync view
  railgunAccountsState: RailgunReactState

  // convenience flags
  isAccountLoaded: boolean
  isLoadingAccount: boolean
  isRefreshing: boolean
  isReadyToLoad: boolean

  // actions
  loadPrivateAccount: () => Promise<void>
  refreshPrivateAccount: () => Promise<void>
  getAccountCache: (zkAddress: string, chainId: number) => Promise<RailgunAccountCache | null>

  defaultRailgunKeys: RailgunAccountKeys | null
  
  // synced account instance (created during loadPrivateAccount, available for direct use)
  syncedDefaultRailgunAccount: RailgunAccount | null
  syncedDefaultRailgunIndexer: Indexer | null
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
  | 'defaultRailgunKeys'
>

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

  const keystoreState = useControllerState('keystore');
  const isUnlocked = !!keystoreState?.isUnlocked;

  // 2) background dispatcher
  const { dispatch } = useBackgroundService()

  // 3) currently selected account (avoid syncing when none is selected)
  const { account: selectedAccount } = useSelectedAccountControllerState()

  // 4) local react-only railgun sync state (simple)
  const [railgunAccountsState, setRailgunAccountsState] = useState<RailgunReactState>({
    status: 'idle',
    error: undefined,
    balances: [ { tokenAddress: ZERO_ADDRESS, amount: '0' } ],
    accounts: [],
    chainId: DEFAULT_CHAIN_ID,
    lastSyncedBlock: 0,
  })

  // 5) Store synced account instance for direct access (created during loadPrivateAccount)
  const [syncedDefaultRailgunAccount, setSyncedDefaultRailgunAccount] = useState<RailgunAccount | null>(null)
  const [syncedDefaultRailgunIndexer, setSyncedDefaultRailgunIndexer] = useState<Indexer | null>(null)

  // 6) refs to avoid re-entrancy & track initial load
  const latestBgStateRef = useRef<any>(memoizedBgState)
  const isRunningRef = useRef<boolean>(false) // strict single-flight guard
  const hasLoadedOnceRef = useRef<boolean>(false) // track if we've loaded once on startup
  const hasAttemptedAutoLoadRef = useRef<boolean>(false) // prevent repeated auto-load attempts on failures
  const pendingResetRef = useRef<boolean>(false) // defer reset if account/chain changes mid-run

  const chainId = memoizedBgState.chainId || DEFAULT_CHAIN_ID;
  
  const providerRef = useRef<JsonRpcProvider | null>(null);
  useEffect(() => {
    providerRef.current = getProvider(chainId);
    return () => { providerRef.current = null; };
  }, [chainId]);

  useEffect(() => {
    latestBgStateRef.current = memoizedBgState
  }, [memoizedBgState])

  // Reset hasLoadedOnceRef when account or chainId changes (allows loading for new account/chain)
  useEffect(() => {
    if (isRunningRef.current) {
      pendingResetRef.current = true
      console.log('[RailgunContext][Guards] DEFERRED reset (sync in progress)', {
        isRunningRef: isRunningRef.current,
        account: selectedAccount?.addr,
        chainId,
      })
      return
    }

    hasLoadedOnceRef.current = false
    hasAttemptedAutoLoadRef.current = false
    console.log('[RailgunContext][Guards] RESET for account/chain change', {
      account: selectedAccount?.addr,
      chainId,
      hasLoadedOnce: hasLoadedOnceRef.current,
      hasAttemptedAutoLoad: hasAttemptedAutoLoadRef.current,
    })
  }, [selectedAccount?.addr, chainId])

  useEffect(() => {
    if (isUnlocked) {
      hasAttemptedAutoLoadRef.current = false
      console.log('[RailgunContext][Guards] RESET hasAttemptedAutoLoad on unlock')
    }
  }, [isUnlocked])

  // ───────────────────────────────────────────────────────────────────────────
  // helpers: BG call, wait & getters
  // ───────────────────────────────────────────────────────────────────────────

  const fireBg = useCallback(
    (type: string, params?: any) => {
      if (!dispatch) throw new Error('Background dispatch not available')
      void dispatch({ type: type as keyof typeof dispatch, params })
    },
    [dispatch]
  )

  const waitForBgValue = useCallback(
    async <T,>(
      selector: (s: any) => T | undefined | null,
      { timeoutMs = 6000, intervalMs = 150 }: { timeoutMs?: number; intervalMs?: number } = {}
    ): Promise<T> => {
      const start = Date.now()
      const immediate = selector(latestBgStateRef.current)
      if (immediate !== undefined && immediate !== null) return immediate

      return new Promise<T>((resolve, reject) => {
        const timer = setInterval(() => {
          if (Date.now() - start > timeoutMs) {
            clearInterval(timer)
            reject(new Error('Timed out waiting for background value'))
            return
          }
          const v = selector(latestBgStateRef.current)
          if (v !== undefined && v !== null) {
            clearInterval(timer)
            resolve(v)
          }
        }, intervalMs)
      })
    },
    []
  )

  const getDerivedKeysFromBg = useCallback(
    async (index: number): Promise<RailgunAccountKeys> => {
      const s = latestBgStateRef.current
      if (index === 0 && s.defaultRailgunKeys) return s.defaultRailgunKeys as RailgunAccountKeys
      if (s.derivedRailgunKeysByIndex?.[index]) {
        return s.derivedRailgunKeysByIndex[index] as RailgunAccountKeys
      }

      fireBg('RAILGUN_CONTROLLER_DERIVE_RAILGUN_KEYS', { index })
      return waitForBgValue<RailgunAccountKeys>((state) => {
        if (index === 0 && state.defaultRailgunKeys) return state.defaultRailgunKeys
        return state.derivedRailgunKeysByIndex ? state.derivedRailgunKeysByIndex[index] : undefined
      })
    },
    [fireBg, waitForBgValue]
  )

  const getAccountCacheFromBg = useCallback(
    async (zkAddress: string, chainId: number): Promise<RailgunAccountCache | null> => {
      const s = latestBgStateRef.current
      const last = s.lastFetchedRailgunAccountCache
      // Check if we have a cached value that matches (cache can be null if account doesn't exist yet)
      if (last && last.zkAddress === zkAddress && last.chainId === chainId) {
        // If cache is explicitly set (even if null), return it
        // This handles both cases: cache exists or cache is null (account not initialized)
        return last.cache as RailgunAccountCache | null
      }

      // No cached value found, fetch from storage
      fireBg('RAILGUN_CONTROLLER_GET_ACCOUNT_CACHE', { zkAddress, chainId })
      try {
        return await waitForBgValue<RailgunAccountCache | null>(
          (state) => {
            const lf = state.lastFetchedRailgunAccountCache
            if (!lf) return undefined
            if (lf.zkAddress === zkAddress && lf.chainId === chainId) {
              // Return the cache value (can be null if account doesn't exist)
              return lf.cache !== undefined ? lf.cache : undefined
            }
            return undefined
          },
          { timeoutMs: 10000, intervalMs: 150 } // Increased timeout for storage operations
        )
      } catch (err) {
        console.error('[RailgunContext] getAccountCacheFromBg timeout, returning null', err)
        // On timeout, return null to allow fresh initialization
        return null
      }
    },
    [fireBg, waitForBgValue]
  )

  // ───────────────────────────────────────────────────────────────────────────
  // Core load (single-flight, minimal transitions)
  // ───────────────────────────────────────────────────────────────────────────
  const loadPrivateAccount = useCallback(async (force = false) => {
    console.log('[RailgunContext][LPA] invoked', { 
      force,
      isUnlocked,
      isRunningRef: isRunningRef.current,
      status: railgunAccountsState.status,
      hasLoadedOnce: hasLoadedOnceRef.current,
      hasSelectedAccount: !!selectedAccount,
      selectedAccountAddr: selectedAccount?.addr,
    })
    
    if (!isUnlocked) {
      console.log('[RailgunContext][LPA] SKIPPED: keystore is locked (isUnlocked=false)');
      return;
    }
    
    // Strict single-flight guard - check and set atomically
    if (isRunningRef.current) {
      console.log('[RailgunContext][LPA] SKIPPED: sync already in progress (isRunningRef=true)');
      return;
    }
    if (railgunAccountsState.status === 'running') {
      console.log('[RailgunContext][LPA] SKIPPED: sync already in progress (status="running")');
      return;
    }

    // If already loaded once and not forced, skip (only allow manual refresh)
    if (!force && hasLoadedOnceRef.current) {
      console.log('[RailgunContext][LPA] SKIPPED: already loaded once and force=false (hasLoadedOnce=true). Use refreshPrivateAccount() to reload.');
      return;
    }

    if (!selectedAccount) {
      console.log('[RailgunContext][LPA] SKIPPED: no selected account (selectedAccount=null)')
      return
    }
    
    console.log('[RailgunContext][LPA] STARTING sync for account:', selectedAccount.addr)

    // Set running flag immediately to prevent race conditions
    isRunningRef.current = true
    setRailgunAccountsState((prev) => ({
      ...prev,
      status: 'running',
      error: undefined,
      chainId,
    }))

    try {
      const tracked = DEFAULT_TRACKED_ACCOUNTS
      const newAccountsMeta: TrackedRailgunAccount[] = []
      const balancesForAggregation: RailgunBalance[][] = []

      let earliestLastSyncedBlock: number = 0;

      const networkConfig = RAILGUN_CONFIG_BY_CHAIN_ID[chainId.toString() as keyof typeof RAILGUN_CONFIG_BY_CHAIN_ID];
      const railgunAddress = networkConfig.RAILGUN_ADDRESS;
      const weth = networkConfig.WETH;

      // ——— per-account init ———
      for (const item of tracked) {
        
        const keys = await getDerivedKeysFromBg(item.index)

        const zkAddress = await getRailgunAddress({ type: 'key', spendingKey: keys.spendingKey, viewingKey: keys.viewingKey })
        console.log('[RailgunContext - LPA] get account from cache', item)
        const cached = await getAccountCacheFromBg(zkAddress, chainId)

        let currentLastSyncedBlock: number
        let account: RailgunAccount;
        let indexer: Indexer;
        if (!cached || !cached.lastSyncedBlock) {
          console.log('[RailgunContext - LPA] no cache found — applying checkpoint')
          const sepoliaCheckpoint = await loadSepoliaCheckpoint()
          indexer = await createRailgunIndexer({
            network: RAILGUN_CONFIG_BY_CHAIN_ID[chainId.toString() as keyof typeof RAILGUN_CONFIG_BY_CHAIN_ID],
            loadState: sepoliaCheckpoint,
          });
          account = await createRailgunAccount({
            credential: { type: 'key', spendingKey: keys.spendingKey, viewingKey: keys.viewingKey, ethKey: keys.shieldKeySigner },
            indexer,
          });
          const startBlock = DERIVED_KEYS_GLOBAL_START_BLOCKS[chainId.toString() as keyof typeof DERIVED_KEYS_GLOBAL_START_BLOCKS]
          const filteredLogs = sepoliaCheckpoint.logs.filter(
            (log) => Number(log.blockNumber) > startBlock
          );
          console.log('[RailgunContext - LPA] filtered logs length', filteredLogs.length, 'from checkpoint (startBlock:', startBlock, ')')
          const filteredRailgunLogs: RailgunLog[] = filteredLogs.map((log) => ({
            blockNumber: Number(log.blockNumber),
            topics: [...log.topics],
            data: log.data,
            address: log.address,
          }));
          console.log('[RailgunContext - LPA] processing checkpoint logs with skipMerkleTree: true')
          await indexer.processLogs(filteredRailgunLogs, { skipMerkleTree: true})
          currentLastSyncedBlock = sepoliaCheckpoint.endBlock

          console.log('[RailgunContext - LPA] set first account cache')
          fireBg('RAILGUN_CONTROLLER_SET_ACCOUNT_CACHE', {
            zkAddress,
            chainId,
            cache: {
              merkleTrees: indexer.getSerializedState(),
              noteBooks: account.getSerializedState(),
              lastSyncedBlock: account.getEndBlock(),
            },
          })

          // Store the account instance for direct access (only for default account, index 0)
          if (item.index === 0) {
            setSyncedDefaultRailgunAccount(account)
            setSyncedDefaultRailgunIndexer(indexer)
          }
        } else {
          console.log('[RailgunContext - LPA] loading from cache, lastSyncedBlock:', cached.lastSyncedBlock, 'incompleteLogsBlock:', cached.incompleteLogsBlock, 'incompleteLogsDetectedAt:', cached.incompleteLogsDetectedAt)

          indexer = await createRailgunIndexer({
            network: RAILGUN_CONFIG_BY_CHAIN_ID[chainId.toString() as keyof typeof RAILGUN_CONFIG_BY_CHAIN_ID],
            loadState: cached.merkleTrees,
          });
          account = await createRailgunAccount({
            credential: { type: 'key', spendingKey: keys.spendingKey, viewingKey: keys.viewingKey, ethKey: keys.shieldKeySigner },
            indexer,
            loadState: cached.noteBooks,
          });
          
          // Handle incomplete logs retry logic
          const INCOMPLETE_LOGS_RETRY_WINDOW_MS = 60_000 // 1 minute
          if (cached.incompleteLogsBlock && cached.incompleteLogsDetectedAt) {
            const elapsed = Date.now() - cached.incompleteLogsDetectedAt
            if (elapsed < INCOMPLETE_LOGS_RETRY_WINDOW_MS) {
              // Retry from the incomplete block
              currentLastSyncedBlock = cached.incompleteLogsBlock - 1
              console.log('[RailgunContext - LPA] retrying from incomplete logs block:', cached.incompleteLogsBlock, '(elapsed:', elapsed, 'ms)')
            } else {
              // Too much time passed, skip the incomplete block and move on
              currentLastSyncedBlock = cached.lastSyncedBlock
              console.log('[RailgunContext - LPA] skipping incomplete logs block (elapsed:', elapsed, 'ms > 1 minute), starting from:', cached.lastSyncedBlock + 1)
            }
          } else {
            currentLastSyncedBlock = cached.lastSyncedBlock
          }
        }

        console.log('[RailgunContext - LPA] sync account with new logs')
        const provider = providerRef.current!;
        if (!provider) {
          throw new Error('Provider not available')
        }
        
        // Log notes BEFORE syncing new logs
        const notesBeforeSync = account.getSerializedState().notebooks;
        const notesCountBefore = notesBeforeSync.flat().filter(n => n !== null && n !== undefined).length;
        const notesBeforeByToken = notesBeforeSync.flat()
          .filter(n => n !== null && n !== undefined)
          .reduce((acc: any, note: any) => {
            const tokenAddr = note?.tokenData?.tokenAddress?.toLowerCase() || 'unknown';
            if (!acc[tokenAddr]) acc[tokenAddr] = [];
            acc[tokenAddr].push({
              value: note?.value?.toString(),
              blockNumber: note?.blockNumber,
              noteHash: note?.noteHash,
            });
            return acc;
          }, {});
        console.log('[RailgunContext - LPA] ========== NOTES BEFORE SYNC ==========');
        console.log('[RailgunContext - LPA] Total notebooks:', notesBeforeSync.length);
        console.log('[RailgunContext - LPA] Total notes count:', notesCountBefore);
        console.log('[RailgunContext - LPA] Notes by token:', Object.keys(notesBeforeByToken).map(tokenAddr => ({
          tokenAddress: tokenAddr,
          isWETH: tokenAddr === weth?.toLowerCase(),
          count: notesBeforeByToken[tokenAddr].length,
          totalValue: notesBeforeByToken[tokenAddr].reduce((sum: bigint, n: any) => sum + BigInt(n.value || '0'), 0n).toString(),
        })));
        console.log('[RailgunContext - LPA] ===========================================');
        
        // Always sync from lastSyncedBlock + 1 to current block to ensure we don't miss any events
        // This is critical after withdrawals to pick up change UTXOs
        const fromBlock = currentLastSyncedBlock + 1
        const toBlock = await provider.getBlockNumber()
        console.log('[RailgunContext - LPA] syncing from block', fromBlock, 'to', toBlock, '(lastSyncedBlock was', currentLastSyncedBlock, ')')
        
        // Track incomplete logs (missing topics/data)
        let firstIncompleteLogsBlock: number | undefined = undefined
        
        // Only fetch logs if we need to (fromBlock <= toBlock)
        if (fromBlock <= toBlock) {
          const logs = await getAllLogs(provider, railgunAddress, fromBlock, toBlock)
          console.log('[RailgunContext - LPA] fetched', logs.length, 'new logs')
          
          if (logs.length > 0) {
            // Check for incomplete logs and filter them out
            const completeLogs: RailgunLog[] = []
            for (const log of logs) {
              const hasTopics = log.topics && log.topics.length > 0
              const hasData = log.data && log.data !== '0x' && log.data !== ''
              
              if (!hasTopics || !hasData) {
                const blockNum = Number(log.blockNumber)
                console.log('[RailgunContext - LPA] incomplete log detected at block:', blockNum, '{ hasTopics:', hasTopics, ', hasData:', hasData, '}')
                if (firstIncompleteLogsBlock === undefined || blockNum < firstIncompleteLogsBlock) {
                  firstIncompleteLogsBlock = blockNum
                }
                // Skip this log - don't process incomplete logs
                continue
              }
              
              completeLogs.push({
                blockNumber: Number(log.blockNumber),
                topics: [...log.topics],
                data: log.data,
                address: log.address,
              })
            }
            
            if (firstIncompleteLogsBlock !== undefined) {
              console.log('[RailgunContext - LPA] found incomplete logs starting at block:', firstIncompleteLogsBlock, '- will retry on next sync')
            }
            
            if (completeLogs.length > 0) {
              console.log('[RailgunContext - LPA] processing', completeLogs.length, 'complete logs, blockNumbers:', completeLogs.map(l => l.blockNumber))
              console.log('[RailgunContext - LPA] processing logs with skipMerkleTree: false (default)')
              
              await indexer.processLogs(completeLogs);
              
              console.log('[RailgunContext - LPA] account synced with logs')
            } else {
              console.log('[RailgunContext - LPA] no complete logs to process (all were incomplete)')
            }
          } else {
            console.log('[RailgunContext - LPA] no new logs to process')
          }
        } else {
          console.log('[RailgunContext - LPA] already synced to latest block, skipping log fetch')
        }

        // Determine the effective lastSyncedBlock:
        // If we found incomplete logs, only mark as synced up to the block before the first incomplete log
        // This ensures we'll retry those blocks on next sync
        const effectiveLastSyncedBlock = firstIncompleteLogsBlock !== undefined 
          ? firstIncompleteLogsBlock - 1 
          : toBlock
        
        // Always update cache with current state
        console.log('[RailgunContext - LPA] updating account cache, lastSyncedBlock:', effectiveLastSyncedBlock, 'incompleteLogsBlock:', firstIncompleteLogsBlock)
        fireBg('RAILGUN_CONTROLLER_SET_ACCOUNT_CACHE', {
          zkAddress,
          chainId,
          cache: {
            merkleTrees: indexer.getSerializedState(),
            noteBooks: account.getSerializedState(),
            lastSyncedBlock: effectiveLastSyncedBlock,
            incompleteLogsBlock: firstIncompleteLogsBlock,
            incompleteLogsDetectedAt: firstIncompleteLogsBlock !== undefined ? Date.now() : undefined,
          },
        })

        // Update stored account instance after sync (only for default account, index 0)
        if (item.index === 0) {
          setSyncedDefaultRailgunAccount(account)
          setSyncedDefaultRailgunIndexer(indexer)
        }

        if (earliestLastSyncedBlock === 0 || effectiveLastSyncedBlock < earliestLastSyncedBlock) {
          earliestLastSyncedBlock = effectiveLastSyncedBlock
        }

        // NOTE: only works for one native token balancefor now
        const notes = account.getSerializedState().notebooks;
        
        // Log ALL notes after syncing - this is critical for debugging missing change notes
        const allNotes = notes.flat().filter(n => n !== null && n !== undefined);
        const notesCountAfter = allNotes.length;
        const notesAfterByToken = allNotes.reduce((acc: any, note: any) => {
          const tokenAddr = note?.tokenData?.tokenAddress?.toLowerCase() || 'unknown';
          if (!acc[tokenAddr]) acc[tokenAddr] = [];
          acc[tokenAddr].push({
            value: note?.value?.toString(),
            blockNumber: note?.blockNumber,
            noteHash: note?.noteHash,
            nullifier: note?.nullifier,
            commitment: note?.commitment,
          });
          return acc;
        }, {});
        
        console.log('[RailgunContext - LPA] ========== ALL NOTES AFTER SYNC ==========');
        console.log('[RailgunContext - LPA] Account zkAddress:', zkAddress);
        console.log('[RailgunContext - LPA] Total notebooks:', notes.length);
        console.log('[RailgunContext - LPA] Total notes count:', notesCountAfter);
        console.log('[RailgunContext - LPA] Notes count BEFORE sync:', notesCountBefore);
        console.log('[RailgunContext - LPA] Notes count AFTER sync:', notesCountAfter);
        console.log('[RailgunContext - LPA] Notes added/removed:', notesCountAfter - notesCountBefore);
        console.log('[RailgunContext - LPA] Notes by token:', Object.keys(notesAfterByToken).map(tokenAddr => ({
          tokenAddress: tokenAddr,
          isWETH: tokenAddr === weth?.toLowerCase(),
          count: notesAfterByToken[tokenAddr].length,
          totalValue: notesAfterByToken[tokenAddr].reduce((sum: bigint, n: any) => sum + BigInt(n.value || '0'), 0n).toString(),
          notes: notesAfterByToken[tokenAddr],
        })));
        
        console.log('[RailgunContext - LPA] ===========================================');
        const tokens = Array.from(
          new Set(
            notes
              .flat()
              .map((note) => note ? note.tokenData.tokenAddress.toLowerCase() : undefined)
              .filter((token) => token !== undefined)
          )
        );
        const balances = [];
        for (const token of tokens) {
          const balance = await account.getBalance(token as `0x${string}`);
          balances.push({ tokenAddress: token.toLowerCase() === weth.toLowerCase() ? ZERO_ADDRESS : token, amount: balance.toString() });
        }

        newAccountsMeta.push({
          id: zkAddress,
          kind: 'derived',
          index: item.index,
          zkAddress,
          balances: balances,
          lastSyncedBlock: toBlock,
        } as TrackedRailgunAccount)

        balancesForAggregation.push(balances)
        console.log('[RailgunContext - LPA] completed account run', item, 'balances:', balances);
      }

      console.log('[RailgunContext - LPA] completed all accounts runs');

      // Efficiently aggregate balances by tokenAddress across all accounts
      const aggregateMap: { [tokenAddress: string]: bigint } = {};

      for (const accountBalances of balancesForAggregation) {
        for (const bal of accountBalances) {
          const addr = bal.tokenAddress;
          // parse as bigint for accurate sum
          const amountBig = BigInt(bal.amount);
          if (!aggregateMap[addr]) {
            aggregateMap[addr] = amountBig;
          } else {
            aggregateMap[addr] += amountBig;
          }
        }
      }

      const aggregatedBalances: RailgunBalance[] = Object.entries(aggregateMap).map(
        ([tokenAddress, amountBig]) => ({
          tokenAddress,
          amount: amountBig.toString(),
        })
      );

      isRunningRef.current = false
      hasLoadedOnceRef.current = true // Mark as loaded
      setRailgunAccountsState((prev) => ({
        ...prev,
        status: 'ready',
        balances: aggregatedBalances,
        accounts: newAccountsMeta,
        lastSyncedBlock: earliestLastSyncedBlock,
      }))
      console.log('[RailgunContext - LPA] FINISHED LPA !!! balances:', aggregatedBalances);
    } catch (err: any) {
      console.error('[RailgunContext] load failed', err)
      isRunningRef.current = false
      // Don't mark as loaded on error, so it can retry
      setRailgunAccountsState((prev) => ({
        ...prev,
        status: 'error',
        error: err?.message || String(err),
      }))
    } finally {
      if (pendingResetRef.current) {
        pendingResetRef.current = false
        hasLoadedOnceRef.current = false
        hasAttemptedAutoLoadRef.current = false
        console.log('[RailgunContext][Guards] APPLIED deferred reset (account/chain changed during sync)')
      }
    }
  }, [selectedAccount, chainId, isUnlocked, railgunAccountsState.status, getDerivedKeysFromBg, getAccountCacheFromBg, fireBg])


  // ───────────────────────────────────────────────────────────────────────────
  // Public refresh: bypasses "already loaded" check and runs immediately
  // ───────────────────────────────────────────────────────────────────────────
  const refreshPrivateAccount = useCallback(async () => {
    console.log('[RailgunContext][Refresh] invoked', {
      isRunningRef: isRunningRef.current,
      status: railgunAccountsState.status,
    })
    
    if (isRunningRef.current || railgunAccountsState.status === 'running') {
      console.log('[RailgunContext][Refresh] SKIPPED: sync already in progress', {
        isRunningRef: isRunningRef.current,
        status: railgunAccountsState.status,
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
      hasAttemptedAutoLoad: hasAttemptedAutoLoadRef.current,
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
      console.log('[RailgunContext][AutoLoad] SKIPPED: already attempted (hasAttemptedAutoLoad=true)')
      return
    }

    console.log('[RailgunContext][AutoLoad] SCHEDULING load in 100ms for account:', selectedAccount.addr)
    const t = setTimeout(() => {
      console.log('[RailgunContext][AutoLoad] EXECUTING scheduled load')
      hasAttemptedAutoLoadRef.current = true
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
      syncedDefaultRailgunIndexer,
    }
  }, [memoizedBgState, railgunAccountsState, loadPrivateAccount, refreshPrivateAccount, syncedDefaultRailgunAccount, syncedDefaultRailgunIndexer])

  return (
    <RailgunControllerStateContext.Provider value={value}>
      {children}
    </RailgunControllerStateContext.Provider>
  )
}

export {
  RailgunControllerStateProvider,
  RailgunControllerStateContext,
}
