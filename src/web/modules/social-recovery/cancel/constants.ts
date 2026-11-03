/** The search key that names the account on the cancel's route. */
export const CANCEL_ACCOUNT_KEY = 'account'

/** How long the read after the claim, right before the send, may take, in ms. */
export const CLAIMED_READ_MS = 15_000

/** How long the read of the block the send starts from may take, in ms. */
export const SEND_BLOCK_READ_MS = 10_000

/** How many reads after a landed or reverted cancel look for the ending before the screen offers to check again. */
export const AFTER_READ_TRIES = 5

/** The pause between two of those reads, in ms. */
export const AFTER_READ_PAUSE_MS = 3_000

/** How often the wallet's hold of a followed request is read again, in ms. */
export const FOLLOW_POLL_MS = 2_000

/** Every how many of those rounds the follow also reads the attempt. */
export const FOLLOW_ATTEMPT_ROUNDS = 5

/** How often the run reads the attempt while its own request waits in the wallet, in ms. */
export const OWN_SEND_READ_MS = 10_000

/**
 * How old a claim may be, in ms, while the wallet reports its request as an
 * operation it cannot follow to a hash and an attempt still reads open: past
 * it, the claim is released and the reading shown, with its cancel offered.
 */
export const UNTRACKED_FOLLOW_MS = 600_000

/** How long the read of a landed cancel's receipt, for its logs, may take, in ms. */
export const RECEIPT_LOGS_READ_MS = 10_000

/** How long the page waits for the wallet to select the account before the transfer screen, in ms. */
export const SELECT_ACCOUNT_LIMIT_MS = 10_000

/**
 * How old a claim may be, in ms, when the wallet asks right before it adds the
 * request, for its page to add it. Above the read after the claim and the
 * gate's own read: a page that finds a younger claim held nowhere waits for it
 * rather than releasing it.
 */
export const CLAIM_SEND_LIMIT_MS = 30_000

/** How many attempts, newest first down to the one the run meant, the read after a landing looks at. */
export const LANDING_ATTEMPTS = 3
