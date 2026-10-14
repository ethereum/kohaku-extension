/**
 * The reads the account step makes on the looked-up account's client. The fit
 * reads run together; the removed key, once named, is asked whether it holds
 * control of the account.
 *
 * An account with no code and no creation record names no removed key; that
 * answer is the account's refusal, like every other key the wallet cannot name.
 */
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import type { DestinationAnswers, EntryKitClient, FitAnswers } from './types'

export const readFit = async (client: EntryKitClient): Promise<FitAnswers> => {
  const [supportsAccount, fitCheck, removedKey] = await Promise.all([
    client.action.supportsAccount(),
    // The wallet reads carry the account implementation of the client
    // configuration, so the check judges the code the account will carry.
    client.walletReads.fitCheck(),
    client.walletReads.removedKey()
  ])
  if (removedKey.kind !== 'named') {
    return { supportsAccount, fitCheck, removedKey }
  }
  const removedKeyIsAuthority = await client.action.isAuthority(removedKey.key)
  return { supportsAccount, fitCheck, removedKey, removedKeyIsAuthority }
}

export const readDestination = async (
  client: EntryKitClient,
  destination: Address
): Promise<DestinationAnswers> => {
  const [isAuthority, holdsAnyPrivilege] = await Promise.all([
    client.action.isAuthority(destination),
    client.action.holdsAnyPrivilege(destination)
  ])
  return { isAuthority, holdsAnyPrivilege }
}
