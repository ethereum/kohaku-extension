/**
 * The account's other doors, the informational read of the review: the keys
 * the wallet reads as holding a privilege on the account beside the one a
 * recovery removes, and the account's code entries. A privilege read that
 * could not be made renders that the wallet could not read the doors; it
 * never touches Save.
 */
import type { Address, SetupDescription } from '@web/modules/social-recovery/sdk-interfaces'
import { sameAddress } from '@web/modules/social-recovery/shared/client'
import type {
  PrivilegeHoldersReading,
  RemovedKeyReading
} from '@web/modules/social-recovery/shared/client'

import type { AccountRead, CodeEntriesReading, Doors } from './types'

/**
 * The account's code entries. No read lists them yet, so they always read as
 * unavailable and the doors name the keys alone.
 */
export const codeEntriesOf = (): CodeEntriesReading => ({ status: 'unavailable' })

/** The candidate keys that hold authority over the account. */
export const authoritiesOf = (description: SetupDescription): Address[] =>
  description.candidateKeys.filter(({ isAuthority }) => isAuthority).map(({ address }) => address)

/** The keys holding a privilege beside the one a recovery removes, where one is named. */
export const keysBesideOf = (holders: readonly Address[], removed: Address | undefined): number =>
  holders.filter((address) => !removed || !sameAddress(address, removed)).length

/**
 * The doors from the wallet's read of the keys holding a privilege on the
 * account, less the key the account block names as the one a recovery
 * removes. Where that read names no key, every holder counts.
 */
export const doorsOf = (
  privilegeHolders: AccountRead<PrivilegeHoldersReading>,
  codeEntries: CodeEntriesReading,
  removedKey: AccountRead<RemovedKeyReading>
): Doors => {
  if (privilegeHolders.status === 'pending') {
    return { kind: 'pending' }
  }
  if (privilegeHolders.status === 'failed' || privilegeHolders.value.kind === 'unreadable') {
    return { kind: 'unreadable' }
  }
  if (removedKey.status === 'pending') {
    return { kind: 'pending' }
  }
  const removed =
    removedKey.status === 'answered' && removedKey.value.kind === 'named'
      ? removedKey.value.key
      : undefined
  const keys = keysBesideOf(privilegeHolders.value.keys, removed)
  if (codeEntries.status === 'unavailable') {
    return keys === 0 ? { kind: 'none' } : { kind: 'keys', keys }
  }
  if (keys === 0 && codeEntries.count === 0) {
    return { kind: 'none' }
  }
  return { kind: 'pair', codeEntries: codeEntries.count, keys }
}
