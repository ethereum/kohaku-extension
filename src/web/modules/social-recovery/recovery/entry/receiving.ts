/**
 * The wallet's accounts that can receive control of a recovered account, and
 * the key each installs: the first of the account's own keys the keystore
 * holds. A basic account's key is the account itself; a smart account's is
 * its controlling key. An account whose keys the keystore holds none of, a
 * view-only account, cannot receive control.
 */
import { isAddress } from 'viem'

import { isSmartAccount } from '@ambire-common/libs/account/account'
import { sameAddress } from '@web/modules/social-recovery/shared/client'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import type { HeldKeySource, ReceivingAccountSource, ReceivingChoice } from './types'

export const receivingChoiceOf = (
  account: ReceivingAccountSource,
  keys: readonly HeldKeySource[]
): ReceivingChoice | null => {
  if (!isAddress(account.addr, { strict: false })) {
    return null
  }
  const held = account.associatedKeys
    .map((associated) => keys.find((key) => sameAddress(key.addr, associated)))
    .find((key) => key !== undefined)
  if (!held || !isAddress(held.addr, { strict: false })) {
    return null
  }
  return {
    account,
    address: account.addr,
    key: { addr: held.addr, type: held.type },
    smart: isSmartAccount(account)
  }
}

/** The wallet's accounts that can receive control, in the wallet's own order. */
export const receivingChoicesOf = (
  accounts: readonly ReceivingAccountSource[],
  keys: readonly HeldKeySource[]
): ReceivingChoice[] =>
  accounts
    .map((account) => receivingChoiceOf(account, keys))
    .filter((choice): choice is ReceivingChoice => choice !== null)

/** The choice for an account the wallet lists, or undefined where it cannot receive control. */
export const choiceFor = (
  choices: readonly ReceivingChoice[],
  address: Address
): ReceivingChoice | undefined => choices.find((choice) => sameAddress(choice.address, address))
