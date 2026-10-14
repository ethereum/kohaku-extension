/** The wait is the fifth of the logged-in route's five stages, as the submission is. */
export const WAIT_STAGE = 5

/** How often the countdown renders again, in ms. */
export const COUNTDOWN_TICK_MS = 1_000

/** How often the deposit step at execution due reads the sending key's balance again, in ms. */
export const EXECUTE_BALANCE_POLL_MS = 5_000

/** How many times an update of the countdown is tried again after another page moved it. */
export const COUNTDOWN_CONFLICT_RETRIES = 3

/**
 * The causes for which a recovery can no longer execute, read from the
 * account rather than from the attempt: the account no longer authorizes the
 * action, the account no longer fits the action, or a key on the account
 * moved a privilege the handover needs (the key being removed holds nothing,
 * or the new key already holds something); or the attempt under the
 * recovery's id cannot be matched as the one this recovery started.
 */
export const CANNOT_EXECUTE_CAUSES = [
  'notAuthorized',
  'upgradedAway',
  'privilegeMoved',
  'unmatched'
] as const
