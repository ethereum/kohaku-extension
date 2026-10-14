/**
 * The checklist's search, `?account=<address>`, with `&ceremony=<request id>`
 * once a ceremony tab returns to it, and the paths the recover flow's screens
 * take the account by. A search is a URL the holder can edit, so it is read
 * here once and nowhere else.
 */
import { isAddress } from 'viem'

import { WEB_ROUTES } from '@common/modules/router/constants/common'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type { RecoveryRoute } from '@web/modules/social-recovery/shared/records'

import { CHECKLIST_SEARCH_KEYS } from './constants'
import type { ChecklistSearch } from './types'

const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/

/** The account and the returned ceremony a search names, or null where it names no account. */
export const parseChecklistSearch = (search: string): ChecklistSearch | null => {
  const query = new URLSearchParams(search)
  const account = query.get(CHECKLIST_SEARCH_KEYS.account)
  if (!account || !isAddress(account, { strict: false })) {
    return null
  }
  const ceremony = query.get(CHECKLIST_SEARCH_KEYS.ceremony)
  return {
    account,
    ...(ceremony !== null && REQUEST_ID.test(ceremony) ? { ceremony } : {})
  }
}

const withAccount = (route: string, account: Address, ceremony?: string): string => {
  const query = new URLSearchParams()
  query.set(CHECKLIST_SEARCH_KEYS.account, account)
  if (ceremony) {
    query.set(CHECKLIST_SEARCH_KEYS.ceremony, ceremony)
  }
  return `/${route}?${query.toString()}`
}

/** The checklist of an account, with the ceremony whose report the return waits for. */
export const checklistPathOf = (account: Address, ceremony?: string): string =>
  withAccount(WEB_ROUTES.socialRecoveryRecoveryChecklist, account, ceremony)

/** The readout of an account, where the recovery password unlocks the setup. */
export const readoutPathOf = (account: Address): string =>
  withAccount(WEB_ROUTES.socialRecoveryRecoveryReadout, account)

/** The confirmation of an account's submission. */
export const submitPathOf = (account: Address): string =>
  withAccount(WEB_ROUTES.socialRecoveryRecoverySubmit, account)

/** The wait of an account whose submission landed. */
export const waitPathOf = (account: Address): string =>
  withAccount(WEB_ROUTES.socialRecoveryRecoveryWait, account)

/** The account step, where a recovery with no entry record starts again. */
export const accountStepPath = (): string => `/${WEB_ROUTES.socialRecoveryRecoveryAccount}`

/**
 * Where a route's recovery starts: the recover door on a fresh install, the
 * settings entry otherwise.
 */
export const routeEntryPathOf = (route: RecoveryRoute): string =>
  route === 'fresh-install'
    ? `/${WEB_ROUTES.socialRecoveryRecover}`
    : `/${WEB_ROUTES.socialRecoveryRecovery}`

/** The recovery in progress, where the home band points. */
export const inProgressPath = (): string => `/${WEB_ROUTES.socialRecoveryRecoveryInProgress}`
