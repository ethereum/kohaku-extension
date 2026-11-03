import { getAddress, isAddress } from 'viem'

import { WEB_ROUTES } from '@common/modules/router/constants/common'
import type { Address } from '@kohaku-eth/social-recovery'

import { CANCEL_ACCOUNT_KEY } from './constants'

/** The cancel's route for one account, the account in the search. */
export const cancelPathOf = (account: Address): string => {
  const query = new URLSearchParams()
  query.set(CANCEL_ACCOUNT_KEY, account)
  return `/${WEB_ROUTES.socialRecoveryCancel}?${query.toString()}`
}

/** The account a search names, checksummed; null where it names none or a malformed one. */
export const accountOfSearch = (search: string): Address | null => {
  const account = new URLSearchParams(search).get(CANCEL_ACCOUNT_KEY)
  return account && isAddress(account, { strict: false }) ? getAddress(account) : null
}
