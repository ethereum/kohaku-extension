/**
 * How long one read of the check after a landed save may take before it reads
 * as unanswered, in ms.
 */
export const CONFIRM_READ_TIMEOUT_MS = 60_000

/**
 * The longest wait for a new block before each further read of the check, in
 * ms: a few blocks of the recovery chain. A read's own limit caps it too.
 */
export const NEW_BLOCK_WAIT_MS = 30_000

/**
 * How many more times the check reads, each after a new block, where it did
 * not find the setup on chain, before the save reads the commitment's mismatch.
 */
export const CONFIRM_REREAD_BLOCKS = 3

/**
 * The longest a wait for the receipt of a sent batch runs before the save
 * reads stalled and offers to check again, in ms: the first wait, counted from
 * the hash's arrival, and each wait after it.
 */
export const RECEIPT_WAIT_MS = 120_000

/**
 * How long a followed request that neither the wallet's queue nor its activity
 * holds is read again, while the account shows no setup, before the stored
 * save in flight is void, in ms, counted from the follow's first such reading.
 * A request between leaving the queue and reaching the activity reads so for
 * a moment.
 */
export const GONE_GRACE_MS = 60_000

/**
 * How long the setup read between a claim and its send may take, in ms,
 * before the claim is released with nothing sent. Well under
 * `GONE_GRACE_MS`, so a page that follows the claim does not read it void
 * while its owner still waits on this read.
 */
export const CLAIMED_SETUP_READ_MS = 20_000

/**
 * How long the read of the block a claimed send starts from may take, where
 * the claim holds no block, in ms, before the claim is released with nothing
 * sent. Read after the setup read and before the stored save is read again,
 * so no network read sits between that read and the send.
 */
export const SEND_BLOCK_READ_MS = 10_000

/**
 * How long after its broadcast a save whose transaction the node does not
 * know, and whose setup the account does not hold, reads as dropped, in ms.
 * A stored save that holds a hash and no time of its broadcast counts from
 * its claim; one that holds no hash never reads as dropped.
 */
export const DROPPED_AFTER_MS = 60 * 60 * 1000

/**
 * How long after a first reading that the node knows none of a save's
 * transactions a second such reading, at the same block number, reads the save
 * as dropped, in ms. A second reading at another block number needs no wait.
 */
export const DROPPED_RECHECK_MS = 60_000

/**
 * How long each read of the check for a dropped save may take, the node's
 * read of a transaction, the block read and the setup read, in ms. A read
 * past it counts as one that failed.
 */
export const DROPPED_READ_MS = 20_000

/**
 * How old a claim may be, in ms, when the stored save's last read before the
 * send answers, for its page to send. Above the two limited reads before that
 * read (`CLAIMED_SETUP_READ_MS + SEND_BLOCK_READ_MS`) and well under
 * `GONE_GRACE_MS`, so a page that follows the claim cannot have voided it yet.
 */
export const CLAIM_SEND_LIMIT_MS = 40_000

/**
 * How long a followed request's state rests before it is read again, in ms:
 * after a read that did not answer, while it reads neither in the queue nor in
 * the activity, and at most while the queue holds it and does not change.
 */
export const FOLLOW_REREAD_MS = 5_000

/** How often the wait for a new block reads the chain's block number, in ms. */
export const BLOCK_POLL_MS = 2_000

/** The code the SDK's check throws when the setup it rebuilds differs from the one committed. */
export const COMMITMENT_MISMATCH_CODE = 'confirm.commitment-mismatch'
