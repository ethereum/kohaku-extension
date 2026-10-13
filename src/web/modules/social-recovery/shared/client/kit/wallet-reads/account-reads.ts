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
 * is read at one pinned block: with no code it leaves the key unnamed for
 * that reason; with code, the candidates are the addresses its
 * `LogPrivilegeChanged` writes name, beside the keys the wallet knows, and a
 * candidate counts where the account's `privileges` view still holds a value
 * for it at that block and the action's `isAuthority` agrees. The writes are
 * read in chunks of `LOG_CHUNK_BLOCKS` from the account's creation block,
 * which the wallet does not know, so from `CREATION_BLOCK_STAND_IN`, to the
 * pinned block. The privileges the creation code writes emit no log, so a key
 * only the creation wrote is found only where the wallet knows it.
 */
import { getAddress, isAddressEqual, size } from 'viem'

import type { Address, BlockTag } from '@web/modules/social-recovery/sdk-interfaces'
import {
  distinctKeys,
  holdsPrivilege
} from '@web/modules/social-recovery/shared/client/wallet-reads'

import { CREATION_BLOCK_STAND_IN } from '../../account-facts'
import type { FitCheckReading, RemovedKeyReading } from '../../types'
import { createPrivilegeEvents } from '../events'
import { createAccountReads } from '../reads'
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
  blockTags
}: KitWalletReadsInput): KitWalletReads => {
  // The wallet's account record holds its address as a string; a malformed one throws here.
  const addressOf = (): Address => getAddress(account.addr)
  const hasCode = async (block?: BlockTag): Promise<boolean> =>
    size(await codeRead.code(addressOf(), block)) > 0
  const privilegeEvents = createPrivilegeEvents(provider)
  const accountReads = createAccountReads(provider)

  const removedKeyWithNoCreation = async (): Promise<RemovedKeyReading> => {
    const { number: block } = await pinnedBlockOf(provider, { blockTags })
    if (!(await hasCode(block))) {
      return { kind: 'unavailable', cause: 'no-creation-record' }
    }
    const writes = await privilegeEvents.privilegeLogsOf(addressOf(), {
      from: CREATION_BLOCK_STAND_IN,
      to: block
    })
    const candidates = distinctKeys([
      ...writes.map((write) => write.addr),
      ...account.associatedKeys,
      ...knownKeys
    ])
    const values = await Promise.all(
      candidates.map((key) => accountReads.privileges(addressOf(), key, block))
    )
    const held = candidates.filter((_, index) => holdsPrivilege(values[index]))
    const holds = await Promise.all(held.map((key) => action.isAuthority(addressOf(), key, block)))
    return readingOf(held.filter((_, index) => holds[index]))
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
