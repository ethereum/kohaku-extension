/* eslint-disable no-console */
import {
  getRailgunAddress,
  RAILGUN_CONFIG_BY_CHAIN_ID,
  type RailgunAccount,
  type Indexer
} from '@kohaku-eth/railgun'
import type { UIProxyProvider } from '@web/services/provider/UIProxyProvider'
import type { JsonRpcProvider } from 'ethers'
import { initializeAccountFromCheckpoint, initializeAccountFromCache } from './accountInitializer'
import { getAllLogs } from './getAllLogs'
import { filterIncompleteLogs } from './logProcessor'
import { BackgroundService } from './backgroundService'
import { RailgunBalance, TrackedRailgunAccount } from '../types'
import { logNotesAfterSync, logNotesBeforeSync } from './notes'
import { calculateBalances } from './balances'
import { verifyMerkleRoot, verifyNullifiers } from './verification'

export interface SyncAccountParams {
  item: { kind: 'derived'; index: number }
  chainId: number
  logsProvider: JsonRpcProvider
  verificationProvider: UIProxyProvider | null
  bgService: BackgroundService
}

export interface SyncAccountResult {
  accountMeta: TrackedRailgunAccount
  balances: RailgunBalance[]
  account: RailgunAccount
  indexer: Indexer
  effectiveLastSyncedBlock: number
}

export async function syncSingleAccount(params: SyncAccountParams): Promise<SyncAccountResult> {
  const { item, chainId, logsProvider, verificationProvider, bgService } = params

  const keys = await bgService.getDerivedKeysFromBg(item.index)

  const zkAddress = await getRailgunAddress({
    type: 'key',
    spendingKey: keys.spendingKey,
    viewingKey: keys.viewingKey
  })
  console.log('[RailgunContext - LPA] get account from cache', item)
  const cached = await bgService.getAccountCacheFromBg(zkAddress, chainId)

  const networkConfig =
    RAILGUN_CONFIG_BY_CHAIN_ID[chainId.toString() as keyof typeof RAILGUN_CONFIG_BY_CHAIN_ID]
  const railgunAddress = networkConfig.RAILGUN_ADDRESS
  const weth = networkConfig.WETH

  let currentLastSyncedBlock: number
  let account: RailgunAccount
  let indexer: Indexer

  if (!cached || !cached.lastSyncedBlock) {
    const result = await initializeAccountFromCheckpoint(chainId, keys)
    account = result.account
    indexer = result.indexer
    currentLastSyncedBlock = result.currentLastSyncedBlock

    console.log('[RailgunContext - LPA] set first account cache')
    bgService.fireBg('RAILGUN_CONTROLLER_SET_ACCOUNT_CACHE', {
      zkAddress,
      chainId,
      cache: {
        merkleTrees: indexer.getSerializedState(),
        noteBooks: account.getSerializedState(),
        lastSyncedBlock: account.getEndBlock()
      }
    })
  } else {
    const result = await initializeAccountFromCache(chainId, keys, cached)
    account = result.account
    indexer = result.indexer
    currentLastSyncedBlock = result.currentLastSyncedBlock
  }

  console.log('[RailgunContext - LPA] sync account with new logs')
  if (!logsProvider) {
    throw new Error('Log provider not available')
  }

  // Log notes BEFORE syncing new logs
  const notesCountBefore = logNotesBeforeSync(account, weth)

  // Always sync from lastSyncedBlock + 1 to current block to ensure we don't miss any events
  // This is critical after withdrawals to pick up change UTXOs
  const fromBlock = currentLastSyncedBlock + 1
  let toBlock: number
  if (verificationProvider) {
    try {
      toBlock = await verificationProvider.getBlockNumber()
    } catch (error) {
      throw new Error('Logs could not be verified -- Helios is unavailable or not synced')
    }
  } else {
    toBlock = await logsProvider.getBlockNumber()
  }
  console.log(
    '[RailgunContext - LPA] syncing from block',
    fromBlock,
    'to',
    toBlock,
    '(lastSyncedBlock was',
    currentLastSyncedBlock,
    ')'
  )

  // Track incomplete logs (missing topics/data)
  let firstIncompleteLogsBlock: number | undefined

  // Only fetch logs if we need to (fromBlock <= toBlock)
  if (fromBlock <= toBlock) {
    const logs = await getAllLogs(logsProvider, railgunAddress, fromBlock, toBlock)
    console.log('[RailgunContext - LPA] fetched', logs.length, 'new logs')

    if (logs.length > 0) {
      // Check for incomplete logs and filter them out
      const { completeLogs, firstIncompleteLogsBlock: incompleteBlock } = filterIncompleteLogs(logs)
      firstIncompleteLogsBlock = incompleteBlock

      if (firstIncompleteLogsBlock !== undefined) {
        console.log(
          '[RailgunContext - LPA] found incomplete logs starting at block:',
          firstIncompleteLogsBlock,
          '- will retry on next sync'
        )
      }

      if (completeLogs.length > 0) {
        console.log(
          '[RailgunContext - LPA] processing',
          completeLogs.length,
          'complete logs, blockNumbers:',
          completeLogs.map((l) => l.blockNumber)
        )
        console.log('[RailgunContext - LPA] processing logs with skipMerkleTree: false (default)')

        await indexer.processLogs(completeLogs)

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
  // - If provider reports a block behind our cache, preserve existing sync position
  // - If we found incomplete logs, only mark as synced up to the block before the first incomplete log
  // - Otherwise, mark as synced up to toBlock
  let effectiveLastSyncedBlock: number
  if (fromBlock > toBlock) {
    effectiveLastSyncedBlock = currentLastSyncedBlock
  } else if (firstIncompleteLogsBlock !== undefined) {
    effectiveLastSyncedBlock = firstIncompleteLogsBlock - 1
  } else {
    effectiveLastSyncedBlock = toBlock
  }

  // Only verify when we actually fetched new data — local state must be consistent
  // with the block we're verifying against.  When fromBlock > toBlock the provider
  // is behind our cache and verification would compare mismatched states.
  if (verificationProvider && fromBlock <= toBlock) {
    await verifyMerkleRoot({
      account,
      verificationProvider,
      railgunAddress,
      toBlock: effectiveLastSyncedBlock
    })
    await verifyNullifiers({
      account,
      indexer,
      verificationProvider,
      railgunAddress,
      toBlock: effectiveLastSyncedBlock
    })
  }

  // Always update cache with current state
  // If no incomplete logs this run, clear any previous incompleteLogsBlock
  const cacheUpdate = {
    merkleTrees: indexer.getSerializedState(),
    noteBooks: account.getSerializedState(),
    lastSyncedBlock: effectiveLastSyncedBlock,
    // Explicitly set to undefined to clear previous value if logs are now complete
    incompleteLogsBlock: firstIncompleteLogsBlock ?? undefined
  }
  console.log('[RailgunContext - LPA] updating account cache', {
    lastSyncedBlock: effectiveLastSyncedBlock,
    incompleteLogsBlock: firstIncompleteLogsBlock,
    clearingIncompleteBlock: firstIncompleteLogsBlock === undefined
  })
  bgService.fireBg('RAILGUN_CONTROLLER_SET_ACCOUNT_CACHE', {
    zkAddress,
    chainId,
    cache: cacheUpdate
  })

  // Log notes AFTER syncing
  logNotesAfterSync(account, zkAddress, weth, notesCountBefore)

  const balances = await calculateBalances(account, weth)

  const accountMeta: TrackedRailgunAccount = {
    id: zkAddress,
    kind: 'derived',
    index: item.index,
    zkAddress,
    balances,
    lastSyncedBlock: effectiveLastSyncedBlock
  }

  console.log('[RailgunContext - LPA] completed account run', item, 'balances:', balances)

  return {
    accountMeta,
    balances,
    account,
    indexer,
    effectiveLastSyncedBlock
  }
}
