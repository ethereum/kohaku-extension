import { isAddress } from 'viem'

import type { Account } from '@ambire-common/interfaces/account'
import { isSmartAccount } from '@ambire-common/libs/account/account'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import {
  checklistPathOf as routedChecklistPathOf,
  readoutPathOf as routedReadoutPathOf
} from '@web/modules/social-recovery/recovery/checklist/search'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import { FRESH_INSTALL_ROUTE } from './constants'

/**
 * The account step on the fresh install's route, with the account that
 * receives control where it is known.
 */
export const accountStepPathOf = (receivingAccount?: Address): string => {
  const search = new URLSearchParams({ route: FRESH_INSTALL_ROUTE })
  if (receivingAccount) {
    search.set('to', receivingAccount)
  }
  return `${WEB_ROUTES.socialRecoveryRecoveryAccount}?${search.toString()}`
}

// The fast track navigates by paths with no leading slash, as its other paths are.

/** The checklist of the account being recovered. */
export const checklistPathOf = (account: Address): string => routedChecklistPathOf(account).slice(1)

/** The readout of the account being recovered. */
export const readoutPathOf = (account: Address): string => routedReadoutPathOf(account).slice(1)

/** The account being recovered, from the URL's `account` parameter; undefined where it is no address. */
export const accountParamOf = (search: URLSearchParams): Address | undefined => {
  const value = search.get('account')
  return value && isAddress(value) ? value : undefined
}

/**
 * The selected account where it is a basic account: on the fast track the
 * wallet selects the slot's basic account once it lists it, the account that
 * receives control.
 */
export const selectedBasicAccountOf = (selected: Account | null | undefined): Address | undefined =>
  selected && !isSmartAccount(selected) && isAddress(selected.addr) ? selected.addr : undefined
