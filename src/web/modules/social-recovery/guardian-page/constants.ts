/** How often the open page reads the request on chain again. */
export const APPROVAL_READ_MS = 60_000

/** How long one round of reads waits for its answers before it counts as failed. */
export const APPROVAL_READ_LIMIT_MS = 15_000

/** How often the deadline's time left renders again. */
export const DEADLINE_TICK_MS = 60_000

/** The longest delay a timer keeps; a longer one fires at once. */
export const MAX_TIMER_MS = 2_147_483_647

/** The slug the wallet method carries in the client's method registry. */
export const ECDSA_SLUG = 'ecdsa'

/** The name of the file the offline block saves the payload in. */
export const PAYLOAD_FILE_NAME = 'kohaku-approval-request.json'

/** How long the page waits for the wallet to report the key's account as selected before it signs. */
export const SELECT_ACCOUNT_LIMIT_MS = 5_000

/** The approval's steps: read it and call the owner, sign, send the approval back. */
export const GUARDIAN_STAGES = 3

/** The string key of the approval's step counter line. */
export const GUARDIAN_STAGE_COUNTER_KEY = 'socialRecovery.guardianPage.stageCounter'
