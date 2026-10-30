/**
 * The cheap reads the watcher polls with, outside React: the manager's record
 * of an account, the action's authorization, an account's code, the logs of
 * one attempt and the time of a block, each at a block number the caller
 * pinned. None runs the removed-key scan the recovery state read runs.
 *
 * The SDK's parts are bound to one account, so each read builds the part of
 * the account it reads; the SDK pins a read by the block's number alone. The
 * provider is the extension's own for the network record, built as the
 * recovery client hook builds it, and only a chain whose deployment record
 * names a deployed kit is read.
 */
import {
  AmbireActionCodec,
  AmbireRecoveryAction,
  BUILDER_BLOCK_TAGS,
  EventManager,
  PolicyManager
} from '@kohaku-eth/social-recovery'
import type {
  Address,
  BlockHeader,
  BlockRange,
  DeploymentDescriptor,
  Hex,
  KitNotification,
  PinnedBlock
} from '@kohaku-eth/social-recovery'
import { isAddressEqual, size, zeroHash } from 'viem'

import type { Network } from '@ambire-common/interfaces/network'

import { addressBookOf } from './addresses'
import { deploymentOf } from './deployments'
import { descriptorOf } from './descriptors'
import { LOG_CHUNK_BLOCKS, notificationsInChunks } from './events'
import { extensionProviderFor, providerKeyOf } from './extension-provider'
import { createProviderAdapter } from './provider-adapter'
import { withNamedRevert } from './reverts'
import type {
  AttemptEvents,
  AttemptLog,
  AttemptScan,
  RecoveryChain,
  WatcherConnection,
  WatcherReads,
  WatcherReadsInput
} from './types'

/**
 * The descriptor of the kit a chain runs, or undefined where the chain runs
 * the stand-in: the watcher reads a deployed kit only.
 */
export const watchedDeploymentOf = (chain: RecoveryChain): DeploymentDescriptor | undefined =>
  deploymentOf(chain).kind === 'deployed' ? descriptorOf(chain, addressBookOf(chain)) : undefined

// The SDK's reads pin by the block's number; the hash is reported only by a prepare.
const pinnedAt = (block: number): PinnedBlock => ({ number: block, hash: zeroHash })

export const createWatcherReads = ({
  provider,
  descriptor,
  chunkWidth = LOG_CHUNK_BLOCKS
}: WatcherReadsInput): WatcherReads => {
  if (!Number.isInteger(chunkWidth) || chunkWidth < 1) {
    throw new RangeError(
      `a log chunk width must be a whole number of blocks above zero, not ${chunkWidth}`
    )
  }
  const codec = new AmbireActionCodec([descriptor.action])
  const managerOf = (account: Address) =>
    new PolicyManager(provider, descriptor, account, descriptor.action, BUILDER_BLOCK_TAGS)
  const actionOf = (account: Address) =>
    new AmbireRecoveryAction(
      provider,
      descriptor,
      account,
      descriptor.action,
      codec,
      BUILDER_BLOCK_TAGS
    )
  const hasCode = async (account: Address, block: number): Promise<boolean> =>
    size(await provider.code(account, block)) > 0

  return {
    latestBlock: (): Promise<BlockHeader> => provider.block('latest'),

    hasCode,

    stateOf: (account, block) => withNamedRevert(() => managerOf(account).stateOf(pinnedAt(block))),

    // The action reverts for an address with no code, which authorizes nothing.
    isAuthorized: (account, block) =>
      withNamedRevert(async () =>
        (await hasCode(account, block)) ? actionOf(account).isAuthorized(pinnedAt(block)) : false
      ),

    async attemptEventsOf(
      account: Address,
      attemptId: bigint,
      scan: AttemptScan
    ): Promise<AttemptEvents> {
      const events = new EventManager(provider, descriptor, account, descriptor.action, new Map(), {
        logChunkSize: chunkWidth
      })
      const filter = events.accountFilter()
      const ofAttempt = (notification: KitNotification): notification is AttemptLog =>
        (notification.kind === 'attempt-started' ||
          notification.kind === 'attempt-cancelled' ||
          notification.kind === 'attempt-consumed') &&
        notification.attemptId === attemptId &&
        isAddressEqual(notification.account, account) &&
        isAddressEqual(notification.action, descriptor.action)
      const first = Math.max(scan.from, descriptor.deployedAt)
      const done = (found: AttemptEvents): boolean =>
        scan.until === 'ending'
          ? !!(found.started || found.cancelled || found.consumed)
          : !!found.started
      // Newest chunk first, each of at most `chunkWidth` blocks ending where the
      // newer one began; an opening precedes its ending, so the scan stops at
      // the first chunk that holds the opening, or the ending where that is
      // all the scan asks for, or where the caller stops it. A chunk is told
      // to the caller as read only where it holds no opening.
      const scanBack = async (last: number, found: AttemptEvents): Promise<AttemptEvents> => {
        if (last < first || done(found) || scan.stop?.()) {
          return found
        }
        const range: BlockRange = { from: Math.max(first, last - chunkWidth + 1), to: last }
        const logs = (
          await notificationsInChunks(provider, events, filter, range, chunkWidth)
        ).filter(ofAttempt)
        const next = logs.reduce<AttemptEvents>((held, log) => {
          if (log.kind === 'attempt-started') {
            return { ...held, started: log }
          }
          if (log.kind === 'attempt-cancelled') {
            return { ...held, cancelled: log }
          }
          return { ...held, consumed: log }
        }, found)
        if (!next.started) {
          scan.onChunk?.(range.from)
        }
        return scanBack(range.from - 1, next)
      }
      return scanBack(scan.to, {})
    },

    async blockTime(block: number): Promise<number> {
      return (await provider.block(block)).timestamp
    },

    handoverOf(payload: Hex) {
      try {
        return codec.decode(payload)
      } catch {
        return undefined
      }
    }
  }
}

/**
 * The watcher's reads over the extension's provider for one network record
 * and one deployment. The caller destroys the provider once it is done with
 * it, or once the network record's provider fields change.
 */
export const watcherConnectionFor = (
  network: Network,
  descriptor: DeploymentDescriptor
): WatcherConnection => {
  const provider = extensionProviderFor(network)
  return {
    reads: createWatcherReads({ provider: createProviderAdapter(provider), descriptor }),
    providerKey: providerKeyOf(network),
    destroy: () => provider.destroy()
  }
}
