/**
 * The account step's search, `?route=<route>&to=<receiving account>`, its
 * path, and the acknowledgment a navigation state carries. A search is a URL
 * the holder can edit, so it is read here once and nowhere else. The paths
 * that take the account being recovered are the checklist's.
 */
import { isAddress } from 'viem'

import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { RECOVERY_ROUTES } from '@web/modules/social-recovery/shared/records'
import type { RecoveryRoute } from '@web/modules/social-recovery/shared/records'

import { ACKNOWLEDGED_STATE_KEY, ENTRY_SEARCH_KEYS } from './constants'
import type { AccountStepSearch } from './types'

const isRecoveryRoute = (value: string | null): value is RecoveryRoute =>
  RECOVERY_ROUTES.some((route) => route === value)

/** The route a search names, or null where it names none of the two. */
export const routeOfSearch = (search: string): RecoveryRoute | null => {
  const route = new URLSearchParams(search).get(ENTRY_SEARCH_KEYS.route)
  return isRecoveryRoute(route) ? route : null
}

/** The route and the receiving account a search names, or null where either is missing or malformed. */
export const parseAccountStepSearch = (search: string): AccountStepSearch | null => {
  const query = new URLSearchParams(search)
  const route = query.get(ENTRY_SEARCH_KEYS.route)
  const receivingAccount = query.get(ENTRY_SEARCH_KEYS.receivingAccount)
  if (
    !isRecoveryRoute(route) ||
    receivingAccount === null ||
    !isAddress(receivingAccount, { strict: false })
  ) {
    return null
  }
  return { route, receivingAccount }
}

/** The account step's path for a route and a receiving account. */
export const accountStepPathOf = ({ route, receivingAccount }: AccountStepSearch): string => {
  const query = new URLSearchParams()
  query.set(ENTRY_SEARCH_KEYS.route, route)
  query.set(ENTRY_SEARCH_KEYS.receivingAccount, receivingAccount)
  return `/${WEB_ROUTES.socialRecoveryRecoveryAccount}?${query.toString()}`
}

/**
 * Whether the router's navigation state says the holder acknowledged the
 * warning on the screen before. The state reaches the page from the history
 * entry, so it is read as unknown.
 */
export const acknowledgedInState = (state: unknown): boolean =>
  typeof state === 'object' &&
  state !== null &&
  (state as Record<string, unknown>)[ACKNOWLEDGED_STATE_KEY] === true
