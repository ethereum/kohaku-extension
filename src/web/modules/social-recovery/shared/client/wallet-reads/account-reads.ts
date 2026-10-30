/**
 * The key a recovery would remove, the manager's attempt state, the fit check
 * and the verify of a pasted reply, read from the chain beside the SDK's own
 * inference, which names a key from fewer sources.
 *
 * The removed key is read at one pinned block. An account with no code there
 * has no key on chain to judge: for an account the wallet lists, the keys its
 * creation grants a privilege are its keys; for one with no creation record,
 * such as one the wallet does not list, the key is unnamed for that reason.
 *
 * An account with code, listed or not, has its removed key among the keys
 * that hold authority on it, found through four sources that rank none above
 * another:
 *
 * - the keys the wallet knows for the account: its creation privileges, its
 *   associated keys and the keys the wallet holds for it;
 * - the sender of the transaction that carried the account's latest setup
 *   commit at the action, since a setup is saved by the key that controls
 *   the account (a save a relayer sent names the relayer, which the checks
 *   below drop);
 * - the new key of the account's latest handover the manager consumed, its
 *   attempt's payload decoded through the action's codec;
 * - the addresses the account's `LogPrivilegeChanged` writes name.
 *
 * The candidates of all four are gathered and judged once: a key holds
 * authority where the account's `privileges` view holds a value for it at
 * the pinned block and the action's `isAuthority` agrees, each distinct key
 * read once. Exactly one such key is the removed key; several leave it
 * unnamed, and none leave it unnamed for want of a key.
 *
 * The manager's logs of the account start at the block the manager was
 * deployed at. The privilege writes cover the account's whole life: they
 * start at the first block at which the account has code, found by a binary
 * search over the code read at past blocks, which needs a node that answers
 * reads at old blocks. A node that prunes its history refuses those reads;
 * the privilege writes are then read from the manager's deployment block, and
 * the reading names that block. The privileges the creation code writes emit
 * no log; such a key is found through the creation record or through the
 * setup it saved.
 */
import { configurationCommitment, pinBlockHeader } from '@kohaku-eth/social-recovery'
import type { Address, Hex, KitNotification, PinnedBlock } from '@kohaku-eth/social-recovery'
import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  isAddressEqual,
  size,
  zeroAddress
} from 'viem'

import { ACCOUNT_PRIVILEGES_ABI } from '../abi'
import { notificationsInChunks } from '../events'
import type { FitCheckReading, RecoveryAttemptState, RemovedKeyReading } from '../types'
import { readAttemptState } from './attempt-state'
import { historyRefused } from './history-refusal'
import { distinctKeys, holdsPrivilege } from './privilege-reads'
import type {
  BoundedRemovedKeyReading,
  BoundedWalletReads,
  PrivilegeScanStart,
  SetupCommittedLog,
  WalletReadsInput
} from './types'
import { createReplyVerify } from './verify-reply'

// No candidate at all is no source; candidates that hold nothing are no key.
const readingOf = (candidates: readonly Address[], keys: readonly Address[]): RemovedKeyReading => {
  const [key] = keys
  if (key === undefined) {
    return { kind: 'unavailable', cause: candidates.length === 0 ? 'no-source' : 'not-a-key' }
  }
  if (keys.length > 1) {
    return { kind: 'unavailable', cause: 'several-key-entries' }
  }
  return { kind: 'named', key }
}

export const createWalletReads = ({
  account,
  knownKeys = [],
  accountImplementation,
  provider,
  descriptor,
  blockTags,
  logChunkSize,
  policyManager,
  action,
  actionViews,
  events,
  codec
}: WalletReadsInput): BoundedWalletReads => {
  // The wallet's account record holds its address as a string; a malformed one throws here.
  const addressOf = (): Address => getAddress(account.addr)
  const hasCode = async (block: number | 'latest'): Promise<boolean> =>
    size(await provider.code(addressOf(), block)) > 0
  const atAction = (log: { account: Address; action: Address }): boolean =>
    isAddressEqual(log.account, addressOf()) && isAddressEqual(log.action, descriptor.action)

  const committerOf = async (notifications: readonly KitNotification[]): Promise<Address[]> => {
    const commit = notifications.reduce<SetupCommittedLog | undefined>(
      (latest, log) => (log.kind === 'setup-committed' && atAction(log) ? log : latest),
      undefined
    )
    if (!commit) {
      return []
    }
    const transaction = await provider.transaction(commit.at.transactionHash)
    return transaction ? [getAddress(transaction.from)] : []
  }

  const handedToOf = (notifications: readonly KitNotification[]): Address[] => {
    const consumed = notifications.reduce<bigint | undefined>(
      (latest, log) => (log.kind === 'attempt-consumed' && atAction(log) ? log.attemptId : latest),
      undefined
    )
    if (consumed === undefined) {
      return []
    }
    const payload = notifications.reduce<Hex | undefined>(
      (found, log) =>
        log.kind === 'attempt-started' && atAction(log) && log.attemptId === consumed
          ? log.payload
          : found,
      undefined
    )
    if (payload === undefined) {
      return []
    }
    try {
      return [codec.decode(payload).newAuthority]
    } catch {
      return []
    }
  }

  const firstBlockWithCode = async (low: number, high: number): Promise<number> => {
    if (low >= high) {
      return high
    }
    const middle = low + Math.floor((high - low) / 2)
    return (await hasCode(middle))
      ? firstBlockWithCode(low, middle)
      : firstBlockWithCode(middle + 1, high)
  }

  const privilegesOf = async (key: Address, block: number): Promise<Hex> => {
    const answer = await provider.call(
      addressOf(),
      encodeFunctionData({ abi: ACCOUNT_PRIVILEGES_ABI, functionName: 'privileges', args: [key] }),
      zeroAddress,
      block
    )
    return decodeFunctionResult({
      abi: ACCOUNT_PRIVILEGES_ABI,
      functionName: 'privileges',
      data: answer
    })
  }

  const signersOf = async (keys: readonly Address[], block: PinnedBlock): Promise<Address[]> => {
    const values = await Promise.all(keys.map((key) => privilegesOf(key, block.number)))
    const held = keys.filter((_, index) => holdsPrivilege(values[index]))
    const holds = await Promise.all(held.map((key) => action.isAuthority(key, block)))
    return held.filter((_, index) => holds[index])
  }

  const privilegeScanStart = async (block: number): Promise<PrivilegeScanStart> => {
    try {
      return { from: await firstBlockWithCode(0, block), bounded: false }
    } catch (thrown) {
      if (!historyRefused(thrown)) {
        throw thrown
      }
      return { from: descriptor.deployedAt, bounded: true, refusal: thrown }
    }
  }

  const removedKeyOfDeployed = async (block: PinnedBlock): Promise<BoundedRemovedKeyReading> => {
    const scan = await privilegeScanStart(block.number)
    const [notifications, writes] = await Promise.all([
      notificationsInChunks(
        provider,
        events,
        events.accountFilter(),
        { from: descriptor.deployedAt, to: block.number },
        logChunkSize
      ),
      notificationsInChunks(
        provider,
        events,
        events.privilegeFilter(),
        { from: scan.from, to: block.number },
        logChunkSize
      )
    ])
    const committer = await committerOf(notifications)
    const handedTo = handedToOf(notifications)
    const written = writes.flatMap((write) =>
      write.kind === 'privilege-changed' && isAddressEqual(write.account, addressOf())
        ? [write.addr]
        : []
    )
    const candidates = distinctKeys([
      ...account.initialPrivileges.map(([key]) => key),
      ...account.associatedKeys,
      ...knownKeys,
      ...committer,
      ...handedTo,
      ...written
    ])
    const reading = readingOf(candidates, await signersOf(candidates, block))
    if (!scan.bounded) {
      return reading
    }
    // The history the node refused may hold the key no candidate here holds.
    if (reading.kind === 'unavailable' && reading.cause !== 'several-key-entries') {
      throw scan.refusal
    }
    return { ...reading, privilegeScanBoundedAt: scan.from }
  }

  return {
    async removedKey(): Promise<BoundedRemovedKeyReading> {
      const { block } = await pinBlockHeader(provider, blockTags.read)
      if (await hasCode(block.number)) {
        return removedKeyOfDeployed(block)
      }
      if (!account.creation) {
        return { kind: 'unavailable', cause: 'no-source' }
      }
      return readingOf(
        distinctKeys(account.initialPrivileges.map(([key]) => key)),
        distinctKeys(
          account.initialPrivileges
            .filter(([, privilege]) => holdsPrivilege(privilege))
            .map(([key]) => key)
        )
      )
    },

    attemptState(): Promise<RecoveryAttemptState> {
      return readAttemptState({ provider, blockTags, policyManager })
    },

    async fitCheck(implementation?: Address): Promise<FitCheckReading> {
      if (await hasCode('latest')) {
        return { basis: 'deployed-code', fits: await action.supportsAccount() }
      }
      const toBe = implementation ?? accountImplementation
      if (!toBe) {
        return { basis: 'no-code', fits: false }
      }
      return {
        basis: 'code-to-be',
        implementation: toBe,
        fits: isAddressEqual(toBe, await actionViews.ambireImplementation())
      }
    },

    async blockTime(blockNumber: number): Promise<number> {
      return (await provider.block(blockNumber)).timestamp
    },

    verifyReply: createReplyVerify(provider),

    commitmentOf: (nonce, configuration) =>
      configurationCommitment(configuration, addressOf(), descriptor.action, nonce)
  }
}
