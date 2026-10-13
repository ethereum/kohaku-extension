/**
 * The key a recovery would remove, the fit check and the verify of a pasted
 * reply, read from the chain.
 *
 * The keys the wallet knows for an account are its creation privileges, its
 * associated keys and the keys the wallet holds for it. Where the account has
 * code, each is asked about with the action's `isAuthority`; where it has
 * none, the creation privileges are the account's keys. Exactly one key is
 * the removed key; none or several leave it unnamed.
 *
 * An account with no creation record, such as one the wallet does not list,
 * is read at one pinned block. With no code there, it leaves the key unnamed
 * for that reason. With code, the removed key is among the keys that hold
 * authority on the account, found through four sources that rank none above
 * another:
 *
 * - the keys the wallet knows for the account;
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
 * unnamed, as for an account the wallet lists, and none leave it unnamed for
 * want of a key.
 *
 * The manager's logs of the account are read once, for both the setup commit
 * and the handover, and the account's privilege writes once, each in chunks
 * of the configured width up to the pinned block. The manager's logs start
 * at the block the manager was deployed at, since none exists before it. The
 * privilege writes cover the account's whole life, since a key written at
 * any time may still hold: they start at the first block at which the
 * account has code, found by a binary search over the code read at past
 * blocks, which needs a node that answers reads at old blocks. The
 * privileges the creation code writes emit no log; such a key is found
 * through the setup it saved.
 */
import { getAddress, isAddressEqual, size } from 'viem'

import type {
  Address,
  BlockTag,
  Hex,
  Notification
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  distinctKeys,
  holdsPrivilege
} from '@web/modules/social-recovery/shared/client/wallet-reads'

import type { FitCheckReading, RemovedKeyReading } from '../../types'
import { createPrivilegeEvents } from '../events'
import type { SetupCommittedLog } from '../events/types'
import { createAccountReads } from '../reads'
import { decodedHandoverOf } from '../recovery-client/handover'
import { pinnedBlockOf } from '../setup-client'
import type { KitWalletReads, KitWalletReadsInput } from './types'
import { createReplyVerify } from './verify-reply'

const readingOf = (keys: readonly Address[]): RemovedKeyReading => {
  const [key] = keys
  if (key === undefined) {
    return { kind: 'unavailable', cause: 'no-key-entry' }
  }
  if (keys.length > 1) {
    return { kind: 'unavailable', cause: 'several-key-entries' }
  }
  return { kind: 'named', key }
}

export const createKitWalletReads = ({
  account,
  knownKeys = [],
  accountImplementation,
  action,
  moduleReads,
  codeRead,
  provider,
  blockTags,
  logChunkWidth,
  descriptor,
  events,
  transactionRead
}: KitWalletReadsInput): KitWalletReads => {
  // The wallet's account record holds its address as a string; a malformed one throws here.
  const addressOf = (): Address => getAddress(account.addr)
  const hasCode = async (block?: BlockTag): Promise<boolean> =>
    size(await codeRead.code(addressOf(), block)) > 0
  const privilegeEvents = createPrivilegeEvents(provider, logChunkWidth)
  const accountReads = createAccountReads(provider)
  const atAction = (log: Pick<SetupCommittedLog, 'account' | 'action'>): boolean =>
    isAddressEqual(log.account, addressOf()) && isAddressEqual(log.action, descriptor.action)

  const committerOf = async (notifications: readonly Notification[]): Promise<Address[]> => {
    const commit = notifications.reduce<SetupCommittedLog | undefined>(
      (latest, log) => (log.kind === 'setup-committed' && atAction(log) ? log : latest),
      undefined
    )
    if (!commit) {
      return []
    }
    const sender = await transactionRead(commit.at.transactionHash)
    return sender ? [sender] : []
  }

  const handedToOf = (notifications: readonly Notification[]): Address[] => {
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
    const handover =
      payload === undefined ? undefined : decodedHandoverOf(descriptor.action, payload)
    return handover ? [handover.newAuthority] : []
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

  const signersOf = async (keys: readonly Address[], block: number): Promise<Address[]> => {
    const values = await Promise.all(
      keys.map((key) => accountReads.privileges(addressOf(), key, block))
    )
    const held = keys.filter((_, index) => holdsPrivilege(values[index]))
    const holds = await Promise.all(held.map((key) => action.isAuthority(addressOf(), key, block)))
    return held.filter((_, index) => holds[index])
  }

  const removedKeyWithNoCreation = async (): Promise<RemovedKeyReading> => {
    const { number: block } = await pinnedBlockOf(provider, { blockTags })
    if (!(await hasCode(block))) {
      return { kind: 'unavailable', cause: 'no-creation-record' }
    }
    const createdAt = await firstBlockWithCode(0, block)
    const [notifications, writes] = await Promise.all([
      events.fetch(events.accountFilter(), { from: descriptor.deployedAt, to: block }),
      privilegeEvents.privilegeLogsOf(addressOf(), { from: createdAt, to: block })
    ])
    const committer = await committerOf(notifications)
    const handedTo = handedToOf(notifications)
    const candidates = distinctKeys([
      ...account.associatedKeys,
      ...knownKeys,
      ...committer,
      ...handedTo,
      ...writes.map((write) => write.addr)
    ])
    return readingOf(await signersOf(candidates, block))
  }

  return {
    async removedKey(): Promise<RemovedKeyReading> {
      if (!account.creation) {
        return removedKeyWithNoCreation()
      }
      if (!(await hasCode())) {
        return readingOf(
          distinctKeys(
            account.initialPrivileges
              .filter(([, privilege]) => holdsPrivilege(privilege))
              .map(([key]) => key)
          )
        )
      }
      const candidates = distinctKeys([
        ...account.initialPrivileges.map(([key]) => key),
        ...account.associatedKeys,
        ...knownKeys
      ])
      const holds = await Promise.all(candidates.map((key) => action.isAuthority(addressOf(), key)))
      return readingOf(candidates.filter((_, index) => holds[index]))
    },

    async fitCheck(implementation?: Address): Promise<FitCheckReading> {
      if (await hasCode()) {
        return { basis: 'deployed-code', fits: await action.supportsAccount(addressOf()) }
      }
      const toBe = implementation ?? accountImplementation
      if (!toBe) {
        return { basis: 'no-code', fits: false }
      }
      return {
        basis: 'code-to-be',
        implementation: toBe,
        fits: isAddressEqual(toBe, await action.ambireImplementation())
      }
    },

    verifyReply: createReplyVerify(moduleReads)
  }
}
