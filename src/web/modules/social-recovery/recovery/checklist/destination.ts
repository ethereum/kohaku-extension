/**
 * The key a recovery installs on the account being recovered: the receiving
 * account's controlling key. A smart account's is the key the keystore holds
 * for it; a basic account is its own key, and only where the keystore holds it.
 */
import { isAddress, isAddressEqual } from 'viem'

import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type { ListedAccountFacts } from '@web/modules/social-recovery/shared/client'

/** The destination key of a listed receiving account, or null where the keystore holds none. */
export const destinationKeyOf = (facts: ListedAccountFacts): Address | null => {
  if (facts.creation) {
    return facts.key?.addr ?? null
  }
  const own = facts.account.addr
  if (!facts.key || !isAddress(own, { strict: false })) {
    return null
  }
  return isAddressEqual(facts.key.addr, own) ? own : null
}
