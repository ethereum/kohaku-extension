/* eslint-disable no-console */
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

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

const INFURA_URL_TEMPLATES = {
  '11155111': 'https://sepolia.infura.io/v3/<apiKey>'
}

const DERIVED_KEYS_GLOBAL_START_BLOCKS = {
  '11155111': 9342029,
}

const getInfuraProvider = (chainId: number, infuraApiKey: string) => {
  const name = RAILGUN_CONFIG_BY_CHAIN_ID[chainId.toString() as keyof typeof RAILGUN_CONFIG_BY_CHAIN_ID].NAME
  const tmpl = INFURA_URL_TEMPLATES[chainId.toString() as keyof typeof INFURA_URL_TEMPLATES]
  if (!name || !tmpl) {
    throw new Error(`Unsupported chainId for Infura provider: ${chainId}`)
  }
  const url = tmpl.replace('<apiKey>', infuraApiKey)
  return new JsonRpcProvider(url, Network.from({ name, chainId }), {staticNetwork: true, batchMaxCount: 1, batchMaxSize: 0, batchStallTime: 0})
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
  const BASE_DELAY_MS = 700

  // Exponential backoff window when we hit 429. Resets on any success.
  let backoffMs = 0
  const BACKOFF_BASE_MS = 1200
  const BACKOFF_MAX_MS = 12000

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

  defaultRailgunKeys: RailgunAccountKeys | null
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

  // 5) refs to avoid re-entrancy & track initial load
  const latestBgStateRef = useRef<any>(memoizedBgState)
  const isRunningRef = useRef<boolean>(false) // strict single-flight guard
  const hasLoadedOnceRef = useRef<boolean>(false) // track if we've loaded once on startup

  const infuraApiKey = memoizedBgState.infuraApiKey;
  const chainId = memoizedBgState.chainId || DEFAULT_CHAIN_ID;
  
  const providerRef = useRef<JsonRpcProvider | null>(null);
  useEffect(() => {
    providerRef.current = getInfuraProvider(chainId, infuraApiKey);
    return () => { providerRef.current = null; };
  }, [chainId, infuraApiKey]);

  useEffect(() => {
    latestBgStateRef.current = memoizedBgState
  }, [memoizedBgState])

  // Reset hasLoadedOnceRef when account or chainId changes (allows loading for new account/chain)
  useEffect(() => {
    hasLoadedOnceRef.current = false
  }, [selectedAccount?.addr, chainId])

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
      if (last && last.zkAddress === zkAddress && last.chainId === chainId) {
        return last.cache as RailgunAccountCache | null
      }

      fireBg('RAILGUN_CONTROLLER_GET_ACCOUNT_CACHE', { zkAddress, chainId })
      return waitForBgValue<RailgunAccountCache | null>((state) => {
        const lf = state.lastFetchedRailgunAccountCache
        if (!lf) return undefined
        return lf.zkAddress === zkAddress && lf.chainId === chainId ? lf.cache : undefined
      })
    },
    [fireBg, waitForBgValue]
  )

  // ───────────────────────────────────────────────────────────────────────────
  // Core load (single-flight, minimal transitions)
  // ───────────────────────────────────────────────────────────────────────────
  const loadPrivateAccount = useCallback(async (force = false) => {
    if (!isUnlocked) {
      console.log('[RailgunContext] load skipped — keystore locked');
      return;
    }
    if (isRunningRef.current || railgunAccountsState.status === 'running') {
      console.log('[RailgunContext] load skipped — already running');
      return;
    }

    // If already loaded once and not forced, skip (only allow manual refresh)
    if (!force && hasLoadedOnceRef.current) {
      console.log('[RailgunContext] load skipped — already loaded once (use refreshPrivateAccount to reload)');
      return;
    }

    if (!selectedAccount) {
      console.log('[RailgunContext] load skipped — no selected account')
      return
    }

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
          console.log('[RailgunContext - LPA] filtered logs length', filteredLogs.length)
          const filteredRailgunLogs: RailgunLog[] = filteredLogs.map((log) => ({
            blockNumber: Number(log.blockNumber),
            topics: [...log.topics],
            data: log.data,
            address: log.address,
          }));
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
        } else {
          indexer = await createRailgunIndexer({
            network: RAILGUN_CONFIG_BY_CHAIN_ID[chainId.toString() as keyof typeof RAILGUN_CONFIG_BY_CHAIN_ID],
            loadState: cached.merkleTrees,
          });
          account = await createRailgunAccount({
            credential: { type: 'key', spendingKey: keys.spendingKey, viewingKey: keys.viewingKey, ethKey: keys.shieldKeySigner },
            indexer,
            loadState: cached.noteBooks,
          });
          currentLastSyncedBlock = cached.lastSyncedBlock
        }

        console.log('[RailgunContext - LPA] sync account with new logs')
        const provider = providerRef.current!;
        const fromBlock = currentLastSyncedBlock
        const toBlock = await provider.getBlockNumber()
        console.log('[RailgunContext - LPA] get logs', fromBlock, toBlock)
        const logs = await getAllLogs(provider, railgunAddress, fromBlock, toBlock)
        const railgunLogs: RailgunLog[] = logs.map((log) => ({
          blockNumber: Number(log.blockNumber),
          topics: [...log.topics],
          data: log.data,
          address: log.address,
        }));
        console.log('[RailgunContext - LPA] sync with logs')
        await indexer.processLogs(railgunLogs);
        console.log('[RailgunContext - LPA] account synced with logs')

        console.log('[RailgunContext - LPA] set account cache after sync')
        fireBg('RAILGUN_CONTROLLER_SET_ACCOUNT_CACHE', {
          zkAddress,
          chainId,
          cache: {
            merkleTrees: indexer.getSerializedState(),
            noteBooks: account.getSerializedState(),
            lastSyncedBlock: toBlock,
          },
        })

        if (earliestLastSyncedBlock === 0 || toBlock < earliestLastSyncedBlock) {
          earliestLastSyncedBlock = toBlock
        }

        // NOTE: only works for one native token balancefor now
        const notes = account.getSerializedState().notebooks;
        const tokens = Array.from(
          new Set(
            notes
              .flat()
              .map((note) => note ? note.tokenData.tokenAddress : undefined)
              .filter((token) => token !== undefined)
          )
        );
        const balances = [];
        for (const token of tokens) {
          const balance = await account.getBalance(token as `0x${string}`);
          balances.push({ tokenAddress: token === weth ? ZERO_ADDRESS : token, amount: balance.toString() });
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
        console.log('[RailgunContext - LPA] completed account run', item);
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
      console.log('[RailgunContext - LPA] FINISHED LPA !!!');
    } catch (err: any) {
      console.error('[RailgunContext] load failed', err)
      isRunningRef.current = false
      // Don't mark as loaded on error, so it can retry
      setRailgunAccountsState((prev) => ({
        ...prev,
        status: 'error',
        error: err?.message || String(err),
      }))
    }
  }, [selectedAccount, chainId, isUnlocked, railgunAccountsState.status, getDerivedKeysFromBg, getAccountCacheFromBg, fireBg])


  // ───────────────────────────────────────────────────────────────────────────
  // Public refresh: bypasses "already loaded" check and runs immediately
  // ───────────────────────────────────────────────────────────────────────────
  const refreshPrivateAccount = useCallback(async () => {
    if (isRunningRef.current || railgunAccountsState.status === 'running') {
      console.log('[RailgunContext] refresh skipped — run already in progress')
      return
    }

    // Force reload by passing true
    await loadPrivateAccount(true)
  }, [loadPrivateAccount])

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
    if (!selectedAccount || hasLoadedOnceRef.current) return

    const t = setTimeout(() => { void loadPrivateAccount(false) }, 100)
    return () => clearTimeout(t)
  }, [selectedAccount, loadPrivateAccount])

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

      // expose default keys if bg already has them cached
      defaultRailgunKeys: memoizedBgState.defaultRailgunKeys ?? null,
    }
  }, [memoizedBgState, railgunAccountsState, loadPrivateAccount, refreshPrivateAccount])

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
