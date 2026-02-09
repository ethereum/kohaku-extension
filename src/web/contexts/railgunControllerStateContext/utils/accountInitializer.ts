/* eslint-disable no-console */
import {
  createRailgunAccount,
  createRailgunIndexer,
  RAILGUN_CONFIG_BY_CHAIN_ID,
  type RailgunAccount,
  type Indexer
} from '@kohaku-eth/railgun'
import type {
  RailgunAccountKeys,
  RailgunAccountCache
} from '@ambire-common/controllers/railgun/railgun'
import { loadSepoliaCheckpoint } from './checkPointLoaders'
import { DERIVED_KEYS_GLOBAL_START_BLOCKS } from '../constants'
import { type RailgunLog } from '../types'

export async function initializeAccountFromCheckpoint(
  chainId: number,
  keys: RailgunAccountKeys
): Promise<{ account: RailgunAccount; indexer: Indexer; currentLastSyncedBlock: number }> {
  console.log('[RailgunContext - LPA] no cache found — applying checkpoint')
  const sepoliaCheckpoint = await loadSepoliaCheckpoint()
  const indexer = await createRailgunIndexer({
    network:
      RAILGUN_CONFIG_BY_CHAIN_ID[chainId.toString() as keyof typeof RAILGUN_CONFIG_BY_CHAIN_ID],
    loadState: sepoliaCheckpoint
  })
  const account = await createRailgunAccount({
    credential: {
      type: 'key',
      spendingKey: keys.spendingKey,
      viewingKey: keys.viewingKey,
      ethKey: keys.shieldKeySigner
    },
    indexer
  })
  const startBlock =
    DERIVED_KEYS_GLOBAL_START_BLOCKS[
      chainId.toString() as keyof typeof DERIVED_KEYS_GLOBAL_START_BLOCKS
    ]
  const filteredLogs = sepoliaCheckpoint.logs.filter((log) => Number(log.blockNumber) > startBlock)
  console.log(
    '[RailgunContext - LPA] filtered logs length',
    filteredLogs.length,
    'from checkpoint (startBlock:',
    startBlock,
    ')'
  )
  const filteredRailgunLogs: RailgunLog[] = filteredLogs.map((log) => ({
    blockNumber: Number(log.blockNumber),
    topics: [...log.topics],
    data: log.data,
    address: log.address
  }))
  console.log('[RailgunContext - LPA] processing checkpoint logs with skipMerkleTree: true')
  await indexer.processLogs(filteredRailgunLogs, { skipMerkleTree: true })
  const currentLastSyncedBlock = sepoliaCheckpoint.endBlock

  return { account, indexer, currentLastSyncedBlock }
}

export async function initializeAccountFromCache(
  chainId: number,
  keys: RailgunAccountKeys,
  cached: RailgunAccountCache
): Promise<{ account: RailgunAccount; indexer: Indexer; currentLastSyncedBlock: number }> {
  console.log('[RailgunContext - LPA] loading from cache', {
    lastSyncedBlock: cached.lastSyncedBlock,
    incompleteLogsBlock: cached.incompleteLogsBlock
  })

  const indexer = await createRailgunIndexer({
    network:
      RAILGUN_CONFIG_BY_CHAIN_ID[chainId.toString() as keyof typeof RAILGUN_CONFIG_BY_CHAIN_ID],
    loadState: cached.merkleTrees
  })
  const account = await createRailgunAccount({
    credential: {
      type: 'key',
      spendingKey: keys.spendingKey,
      viewingKey: keys.viewingKey,
      ethKey: keys.shieldKeySigner
    },
    indexer,
    loadState: cached.noteBooks
  })

  // If there were incomplete logs AND they're ahead of lastSyncedBlock, retry from that block
  // Otherwise, start from lastSyncedBlock (the incomplete logs were processed in a later run)
  let currentLastSyncedBlock: number
  if (cached.incompleteLogsBlock && cached.incompleteLogsBlock > cached.lastSyncedBlock) {
    currentLastSyncedBlock = cached.incompleteLogsBlock - 1
    console.log(
      '[RailgunContext - LPA] retrying from incomplete logs block:',
      cached.incompleteLogsBlock,
      '(ahead of lastSyncedBlock:',
      cached.lastSyncedBlock,
      ')'
    )
  } else {
    currentLastSyncedBlock = cached.lastSyncedBlock
    if (cached.incompleteLogsBlock) {
      console.log(
        '[RailgunContext - LPA] ignoring stale incompleteLogsBlock:',
        cached.incompleteLogsBlock,
        '(already past lastSyncedBlock:',
        cached.lastSyncedBlock,
        ')'
      )
    }
  }

  return { account, indexer, currentLastSyncedBlock }
}
