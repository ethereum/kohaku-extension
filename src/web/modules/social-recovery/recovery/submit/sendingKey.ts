/**
 * The key that sends the submission and pays its gas, by route. On the fresh
 * install it is the receiving basic account's own key, the key the recovery
 * installs, so the key that receives control is the key that pays; on the
 * logged-in route it is the chosen account's own key, a smart account sending
 * the call as its own batch with its controlling key as the payer.
 */
import type { Address } from '@kohaku-eth/social-recovery'
import type { ListedAccountFacts } from '@web/modules/social-recovery/shared/client'

import type { SendingPlan } from './types'

/**
 * How the logged-in route sends: a smart account runs the call as its own
 * batch, paid by the controlling key the keystore holds for it; a basic
 * account sends it from its own key. A basic account has no account apart
 * from its key to transfer from, so its deposit step offers the deposit from
 * outside alone. `account` is the chosen account's address as the recovery
 * entry holds it. Null where the keystore holds no key of the account.
 */
export const loggedInPlanOf = (facts: ListedAccountFacts, account: Address): SendingPlan | null => {
  const { key } = facts
  if (!key) {
    return null
  }
  if (facts.creation) {
    return { kind: 'account-batch', key, facts, account }
  }
  return { kind: 'key', key }
}

/**
 * The address the payment line names as the sender: a key's own send names
 * the key, and a smart account's own batch names the account.
 */
export const sendingAddressOf = (plan: SendingPlan): Address =>
  plan.kind === 'key' ? plan.key.addr : plan.account
