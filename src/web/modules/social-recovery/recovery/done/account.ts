/**
 * The recovered account as the wallet adds it: its address, the key the
 * recovery granted as its associated key, and the creation the wallet
 * computes for a smart account from the removed key, at the value of its
 * latest earlier grant where a privilege event names one, else at the value
 * the wallet's picker gives a smart account's key. An Ambire proxy writes its
 * creation privilege in its deploy bytecode and emits no event for it, so an
 * earlier event always names a later grant, never the creation. The computed
 * creation therefore reproduces an account the create door made on its first
 * recovery only; any other stands in for the account's creation record, which
 * the recovery reads do not carry yet. The preferences are the ones the
 * picker gives a new account.
 */
import type { Account } from '@ambire-common/interfaces/account'
import { getDefaultAccountPreferences, getSmartAccount } from '@ambire-common/libs/account/account'
import { isAddressEqual } from 'viem'

import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import { CREATION_STAND_IN } from './constants'
import type { RecoveredAccount, RecoveredAccountInput } from './types'

export const recoveredAccountOf = async ({
  account,
  granted,
  removed,
  removedPrivilege,
  existing
}: RecoveredAccountInput): Promise<RecoveredAccount> => {
  const computed = await getSmartAccount(
    [{ addr: removed, hash: removedPrivilege ?? CREATION_STAND_IN }],
    existing
  )
  return {
    account: {
      addr: account,
      associatedKeys: [granted],
      initialPrivileges: computed.initialPrivileges,
      creation: computed.creation,
      preferences: getDefaultAccountPreferences(account, existing),
      domainName: null
    },
    creation: isAddressEqual(computed.addr as Address, account) ? 'reproduced' : 'stand-in'
  }
}

/** Whether the wallet lists the account with the key among its associated keys. */
export const listsWithKey = (
  accounts: readonly Account[] | undefined,
  account: Address,
  key: Address
): boolean =>
  !!accounts?.some(
    (candidate) =>
      isAddressEqual(candidate.addr as Address, account) &&
      candidate.associatedKeys.some((associated) => isAddressEqual(associated as Address, key))
  )
