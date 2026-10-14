/** How often the open page reads the request on chain again. */
export const APPROVAL_READ_MS = 60_000

/** How long one round of reads waits for its answers before it counts as failed. */
export const APPROVAL_READ_LIMIT_MS = 15_000

/** How often the deadline's time left renders again. */
export const DEADLINE_TICK_MS = 60_000

/** The longest delay a timer keeps; a longer one fires at once. */
export const MAX_TIMER_MS = 2_147_483_647
