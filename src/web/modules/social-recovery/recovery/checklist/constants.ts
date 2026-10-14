import { zeroAddress } from 'viem'

import type { PaymentOrder } from '@web/modules/social-recovery/sdk-interfaces'

/** The first release's order: no payment, to nobody. */
export const NO_PAYMENT_ORDER: PaymentOrder = {
  token: zeroAddress,
  amount: BigInt(0),
  payee: zeroAddress
}

/** The checklist is the fourth of the logged-in route's five stages. */
export const CHECKLIST_STAGE = 4

/** The slug the ceremony tab's route and the ceremony request carry for a passkey. */
export const PASSKEY_SLUG = 'passkey'

/**
 * The search keys the checklist reads: the account being recovered, and a
 * ceremony that returned.
 */
export const CHECKLIST_SEARCH_KEYS = {
  account: 'account',
  ceremony: 'ceremony'
} as const

/** The search key of the approval page's link that carries the request. */
export const APPROVAL_REQUEST_KEY = 'request'

/** The extension's page that opens in a full tab. */
export const TAB_PAGE = 'tab.html'

/** How often the open checklist reads the account's recovery state. */
export const CHECKLIST_POLL_MS = 30_000

/** How long one poll waits for its reads before it counts as failed. */
export const POLL_LIMIT_MS = 15_000

/** How often the deadline's time left renders again. */
export const DEADLINE_TICK_MS = 60_000

/** The longest delay a timer keeps; a longer one fires at once. */
export const MAX_TIMER_MS = 2_147_483_647
