/** The confirmation is the fifth of the logged-in route's five stages. */
export const SUBMIT_STAGE = 5

/**
 * How old a claim of the submission may grow with no transaction hash before
 * a page that follows it reads the manager's events to learn whether the send
 * went out, in ms, where the send is the account's own batch. A claim younger
 * than this is waited on, and an older one only once the wallet's queue holds
 * no request under the claim's request id.
 */
export const SUBMISSION_CLAIM_AGE_MS = 10 * 60 * 1000

/**
 * The same age where the send is one key's own transaction, in ms. The queue
 * cannot be asked about such a send, since it carries no request id, and the
 * chain reads offer no pending nonce to tell a signed transaction the node
 * still holds from none, so the claim waits three times as long.
 */
export const KEY_SEND_CLAIM_AGE_MS = 30 * 60 * 1000

/** How often a page that follows a claim with no hash reads the session again, in ms. */
export const FOLLOW_REREAD_MS = 5_000

/** How often the deposit step reads the sending key's balance again, in ms. */
export const BALANCE_POLL_MS = 5_000

/** How long one chain read of the run may take before it counts as failed, in ms. */
export const READ_LIMIT_MS = 20_000

/** How many times an update of the session is tried again after another tab moved it. */
export const CONFLICT_RETRIES = 3

/** The kit errors with which the manager refuses a start because an attempt already runs. */
export const ALREADY_RUNNING_CAUSES = ['AttemptAlreadyActive', 'WrongAttemptId'] as const

/** The request errors with which the prepare refuses a start because an attempt already runs. */
export const ALREADY_RUNNING_FINDINGS = ['request.attempt-active', 'request.attempt-id'] as const
