/**
 * The check after a landed save, read once the batch's receipt came back. The
 * save reads as saved only where the check answers that the setup landed and
 * that the recovery module recognizes the account's authorization. A setup the
 * module does not recognize, a commitment the wallet rebuilds differently, or
 * a setup the check still cannot find after a few more reads, each made once
 * the chain moved a block, each read as disagreed. A check that throws for any
 * other reason, or does not answer in time, reads as unanswered. No answer but
 * the first reads as saved.
 */
import type { SetupConfirmation } from '@web/modules/social-recovery/sdk-interfaces'

import {
  COMMITMENT_MISMATCH_CODE,
  CONFIRM_READ_TIMEOUT_MS,
  CONFIRM_REREAD_BLOCKS,
  NEW_BLOCK_WAIT_MS
} from './constants'
import type { ConfirmOutcome, ConfirmOutcomeOptions, NewBlockWait, ThrownFields } from './types'

const AGREED: ConfirmOutcome = { kind: 'agreed' }
const MISMATCH: ConfirmOutcome = { kind: 'disagreed', check: 'mismatch' }
const UNAUTHORIZED: ConfirmOutcome = { kind: 'disagreed', check: 'authorization' }
const UNREAD: ConfirmOutcome = { kind: 'unread' }

/**
 * The outcome of one answer of the check, or null where it did not find the
 * setup on chain, which the save reads once more.
 */
export const outcomeOfConfirmation = (confirmation: SetupConfirmation): ConfirmOutcome | null => {
  if (!confirmation.landed) {
    return null
  }
  return confirmation.isAuthorized ? AGREED : UNAUTHORIZED
}

/** The outcome of a check that threw: the commitment's mismatch disagrees, anything else is unanswered. */
export const outcomeOfConfirmFailure = (thrown: unknown): ConfirmOutcome => {
  const code =
    typeof thrown === 'object' && thrown !== null ? (thrown as ThrownFields).code : undefined
  return code === COMMITMENT_MISMATCH_CODE ? MISMATCH : UNREAD
}

/** One read of the check, which rejects where it does not answer in time. */
const readInTime = (
  confirm: () => Promise<SetupConfirmation>,
  timeoutMs: number
): Promise<SetupConfirmation> =>
  new Promise<SetupConfirmation>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`The check after the save did not answer in ${timeoutMs} ms.`)),
      timeoutMs
    )
    Promise.resolve()
      .then(confirm)
      .then(
        (confirmation) => {
          clearTimeout(timer)
          resolve(confirmation)
        },
        (error: unknown) => {
          clearTimeout(timer)
          reject(error)
        }
      )
  })

/**
 * Reads the check, and where it did not find the setup on chain reads it again
 * after each new block, up to `rereads` more times; the first read that finds
 * it decides. A setup no read finds reads as the commitment's mismatch.
 */
const readUntilFound = async (
  confirm: () => Promise<SetupConfirmation>,
  timeoutMs: number,
  newBlock: NewBlockWait | undefined,
  rereads: number
): Promise<ConfirmOutcome> => {
  const outcome = outcomeOfConfirmation(await readInTime(confirm, timeoutMs))
  if (outcome) {
    return outcome
  }
  if (rereads <= 0) {
    return MISMATCH
  }
  if (newBlock) {
    await newBlock(Math.min(NEW_BLOCK_WAIT_MS, timeoutMs)).catch(() => undefined)
  }
  return readUntilFound(confirm, timeoutMs, newBlock, rereads - 1)
}

/**
 * Reads the check, and where it did not find the setup on chain reads it up to
 * `CONFIRM_REREAD_BLOCKS` more times, each after `newBlock` waited for the
 * chain to move a block (at most the shorter of `NEW_BLOCK_WAIT_MS` and one
 * read's limit). Each read keeps its own limit, so the longest the check runs
 * is every read at its limit plus every wait at its limit. A read that throws
 * or does not answer in time ends the check as its failure reads.
 */
export const confirmOutcomeOf = async (
  confirm: () => Promise<SetupConfirmation>,
  { timeoutMs = CONFIRM_READ_TIMEOUT_MS, newBlock }: ConfirmOutcomeOptions = {}
): Promise<ConfirmOutcome> => {
  try {
    return await readUntilFound(confirm, timeoutMs, newBlock, CONFIRM_REREAD_BLOCKS)
  } catch (thrown: unknown) {
    return outcomeOfConfirmFailure(thrown)
  }
}
