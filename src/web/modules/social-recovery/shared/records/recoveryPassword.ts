/**
 * The recovery password the privacy step collects, kept in memory by chain and
 * account and never written to storage: the storage keeps the password-set
 * flag alone. Starting the setup over wipes it; saving the setup keeps it, so
 * the Recovery Card can show it.
 *
 * The password lives in this tab's JavaScript context, so a reload or a new tab
 * starts empty. A setup screen that finds no password while the level hides the
 * setup sends the user back to the privacy step to type it again. After a
 * save, a Recovery Card that finds no password shows the hidden value with no
 * reveal.
 */
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import type { ChainId } from './types'

const passwords = new Map<string, string>()

const holderKey = (chainId: ChainId, account: Address): string =>
  `${String(chainId)}:${account.toLowerCase()}`

export const setRecoveryPassword = (chainId: ChainId, account: Address, password: string): void => {
  passwords.set(holderKey(chainId, account), password)
}

export const readRecoveryPassword = (chainId: ChainId, account: Address): string | undefined =>
  passwords.get(holderKey(chainId, account))

export const wipeRecoveryPassword = (chainId: ChainId, account: Address): void => {
  passwords.delete(holderKey(chainId, account))
}
