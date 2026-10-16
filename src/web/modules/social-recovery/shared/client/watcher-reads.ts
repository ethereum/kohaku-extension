/**
 * The cheap reads the watcher polls with, outside React: the manager's record
 * of an account, the action's authorization, an account's code, the logs of
 * one attempt and the time of a block, each at a block number the caller
 * pinned. None runs the removed-key scan the recovery state read runs.
 *
 * The provider is the extension's own for the network record, built as the
 * recovery client hook builds it, and only a chain whose deployment record
 * names a deployed kit is read.
 */
import { isAddressEqual, size } from 'viem'

import type { Network } from '@ambire-common/interfaces/network'
import type {
  Address,
  BlockHeader,
  BlockRange,
  DeploymentDescriptor,
  Hex,
  Notification
} from '@web/modules/social-recovery/sdk-interfaces'

import { addressBookOf } from './addresses'
import { deploymentOf } from './deployments'
import { descriptorOf } from './descriptors'
import { extensionProviderFor, providerKeyOf } from './extension-provider'
import { createKitEventManager, LOG_CHUNK_BLOCKS } from './kit/events'
import type { AttemptLog } from './kit/events/types'
import { createActionReads, createManagerReads } from './kit/reads'
import { decodedHandoverOf } from './kit/recovery-client/handover'
import { withNamedRevert } from './kit/setup-client'
import { createCodeRead, createProviderAdapter } from './provider-adapter'
import type {
  AttemptEvents,
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

export const createWatcherReads = ({
  provider,
  codeRead,
  descriptor,
  chunkWidth = LOG_CHUNK_BLOCKS
}: WatcherReadsInput): WatcherReads => {
  if (!Number.isInteger(chunkWidth) || chunkWidth < 1) {
    throw new RangeError(
      `a log chunk width must be a whole number of blocks above zero, not ${chunkWidth}`
    )
  }
  const manager = createManagerReads(provider, descriptor.manager)
  const action = createActionReads({ provider, codeRead }, descriptor.action)

  return {
    latestBlock: (): Promise<BlockHeader> => provider.block('latest'),

    async hasCode(account: Address, block: number): Promise<boolean> {
      return size(await codeRead.code(account, block)) > 0
    },

    stateOf: (account, block) =>
      withNamedRevert(() => manager.stateOf(account, descriptor.action, block)),

    isAuthorized: (account, block) => withNamedRevert(() => action.isAuthorized(account, block)),

    async attemptEventsOf(
      account: Address,
      attemptId: bigint,
      scan: AttemptScan
    ): Promise<AttemptEvents> {
      const events = createKitEventManager({ provider, descriptor, account, chunkWidth })
      const filter = events.accountFilter()
      const ofAttempt = (notification: Notification): notification is AttemptLog =>
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
        const logs = (await events.fetch(filter, range)).filter(ofAttempt)
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

    handoverOf: (payload: Hex) => decodedHandoverOf(descriptor.action, payload)
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
    reads: createWatcherReads({
      provider: createProviderAdapter(provider),
      codeRead: createCodeRead(provider),
      descriptor
    }),
    providerKey: providerKeyOf(network),
    destroy: () => provider.destroy()
  }
}
