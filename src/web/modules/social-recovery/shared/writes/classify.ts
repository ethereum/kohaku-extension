/**
 * The classification of a write's end: landed, or one of the two readings of
 * the failed state every social recovery write shares.
 *
 * - A call the wallet never sent, an error before any transaction hash, reads
 *   that nothing reached the chain and the account stands as it did.
 * - A call that reached the chain and reverted, a receipt with status zero,
 *   reads as a revert, names the cause the receipt carries and says the gas it
 *   spent is gone.
 *
 * The two are distinct states, never one state with a flag: a holder who reads
 * that the wallet sent nothing retries a call that cannot land. The owner's
 * cancel adds its own reading of the revert: the attempt is already gone,
 * with the account's controller as it now stands. That reading rests on the
 * attempt read after the revert, or on a decoded cause that says nothing was
 * left to cancel, never on a revert the wallet could not decode.
 *
 * A transaction hash with no receipt is neither reading. The call may still
 * land, so it stays in the submitting state and keeps waiting for its receipt.
 */
import { isHex } from 'viem'

import type { Hex, KitError, KitErrorName } from '@web/modules/social-recovery/sdk-interfaces'
import { CANCELLED_BY, KIT_ERROR_NAMES } from '@web/modules/social-recovery/sdk-interfaces'

import type {
  AttemptAfterCancel,
  FailedNotSentState,
  FailedRevertedState,
  FailedState,
  FailureContext,
  LandedState,
  ProviderReceipt,
  ReplacedReason,
  RevertCause,
  SubmittingState,
  WriteFailure,
  WriteKind,
  WriteReceipt
} from './types'

// ---------------------------------------------------------------------------
// Receipts and failures
// ---------------------------------------------------------------------------

/**
 * How a sent transaction was replaced before it was mined, where it was not
 * merely repriced (ethers' `TRANSACTION_REPLACED`): `cancelled`, replaced by a
 * transaction that sends nothing, or `replaced`, by another transaction. The
 * write's own call never ran.
 */
export const REPLACED_REASONS = ['cancelled', 'replaced'] as const

/** A transaction hash: `0x` and exactly 64 hex digits. */
const isTransactionHash = (value: unknown): value is Hex => isHex(value) && value.length === 66

/**
 * Reads a write's receipt from ethers' `TransactionReceipt`. Answers undefined
 * for a receipt whose hash is not a transaction hash or whose status is
 * neither one nor zero, so a pre-Byzantium receipt with no status is never
 * read as either reading.
 */
export const receiptOf = (receipt: ProviderReceipt): WriteReceipt | undefined => {
  const { hash, status, blockNumber, gasUsed, gasPrice } = receipt
  if (!isTransactionHash(hash) || (status !== 0 && status !== 1)) {
    return undefined
  }
  return {
    transactionHash: hash,
    status,
    ...(blockNumber !== undefined ? { blockNumber } : {}),
    ...(gasUsed !== undefined ? { gasUsed } : {}),
    ...(gasPrice !== undefined ? { effectiveGasPrice: gasPrice } : {})
  }
}

/**
 * The receipt a thrown value carries: ethers' `CALL_EXCEPTION` and
 * `TRANSACTION_REPLACED` carry its `TransactionReceipt`. A member is read
 * where it has the type ethers gives it; a block number or a gas factor of
 * another type is left out.
 */
const carriedReceiptOf = (value: unknown): WriteReceipt | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const { hash, status, blockNumber, gasUsed, gasPrice } = value as Record<string, unknown>
  if (typeof hash !== 'string' || typeof status !== 'number') {
    return undefined
  }
  return receiptOf({
    hash,
    status,
    ...(typeof blockNumber === 'number' ? { blockNumber } : {}),
    ...(typeof gasUsed === 'bigint' ? { gasUsed } : {}),
    ...(typeof gasPrice === 'bigint' ? { gasPrice } : {})
  })
}

const isReplacedReason = (value: unknown): value is ReplacedReason =>
  typeof value === 'string' && (REPLACED_REASONS as readonly string[]).includes(value)

/**
 * Reads what a thrown value tells about the call:
 *
 * - ethers' `TRANSACTION_REPLACED`: a `repriced` replacement is the same call
 *   at another fee, so it settles by the replacement's receipt; a `cancelled`
 *   or `replaced` one means the call never ran, whatever the replacement's
 *   receipt says, so it carries that reason and no receipt;
 * - a receipt it carries (ethers' `CALL_EXCEPTION` from `wait()` carries the
 *   reverted receipt);
 * - the hash of a transaction it names (`transactionHash`, `hash`,
 *   `transaction.hash`), or the hash a receipt it carries names where that
 *   receipt is not in ethers' shape (a node's JSON receipt names it
 *   `transactionHash`): the call reached the chain, so the write waits for
 *   its receipt under that hash rather than reading that nothing was sent.
 *
 * A value that carries none of these is an error before any hash.
 */
export const writeFailureOf = (thrown: unknown): WriteFailure => {
  const seen = new Set<unknown>()
  let receipt: WriteReceipt | undefined
  let transactionHash: Hex | undefined
  let replaced: ReplacedReason | undefined

  const visit = (value: unknown, depth: number): void => {
    if (depth > 4 || !value || typeof value !== 'object' || seen.has(value)) {
      return
    }
    seen.add(value)
    const record = value as Record<string, unknown>
    if (record.code === 'TRANSACTION_REPLACED' && !replaced && !receipt) {
      if (isReplacedReason(record.reason)) {
        replaced = record.reason
        return
      }
      if (record.reason === 'repriced') {
        receipt = carriedReceiptOf(record.receipt)
      }
    }
    if (!receipt) {
      receipt = carriedReceiptOf(record.receipt)
    }
    if (!transactionHash) {
      if (isTransactionHash(record.transactionHash)) {
        transactionHash = record.transactionHash
      } else if (isTransactionHash(record.hash)) {
        transactionHash = record.hash
      }
    }
    ;['transaction', 'info', 'error', 'cause', 'receipt'].forEach((key) =>
      visit(record[key], depth + 1)
    )
  }

  visit(thrown, 0)
  if (replaced) {
    return { error: thrown, replaced }
  }
  return {
    error: thrown,
    ...(receipt ? { receipt, transactionHash: receipt.transactionHash } : {}),
    ...(!receipt && transactionHash ? { transactionHash } : {})
  }
}

// ---------------------------------------------------------------------------
// The causes of a revert
// ---------------------------------------------------------------------------

/**
 * How the attempt a reverted cancel meant to end had already ended, as the
 * attempt read after the revert names it: executed, or cancelled by one of the
 * roads the manager's cancel event names (events.ts `CANCELLED_BY`).
 */
export const ATTEMPT_ENDS = ['executed', ...CANCELLED_BY] as const

/** The attempt read's answer where the attempt a cancel meant to end still runs. */
export const ATTEMPT_STILL_RUNNING = 'stillRunning' as const

export const REVERT_CAUSE_KINDS = ['named', 'unnamed', 'attemptGone'] as const

const isKitErrorName = (name: string): name is KitErrorName =>
  (KIT_ERROR_NAMES as readonly string[]).includes(name)

/** The kit error of the decoded cause, where the wallet decoded one it knows. */
export const kitErrorNameOf = (cause?: KitError): KitErrorName | undefined =>
  cause?.kind === 'known' && isKitErrorName(cause.name) ? cause.name : undefined

const plainCause = (cause?: KitError): RevertCause => {
  const known = kitErrorNameOf(cause)
  if (known !== undefined && cause) {
    return { kind: 'named', name: known, error: cause }
  }
  return cause?.kind === 'unknown' ? { kind: 'unnamed', data: cause.data } : { kind: 'unnamed' }
}

/**
 * The cause of a revert for a write.
 *
 * A reverted cancel reads that the attempt was already gone only on one of
 * three grounds:
 *
 * - the attempt read after the revert says the attempt ended, which also names
 *   the road and, after an execution, the controller;
 * - no read yet, and the decoded cause is `NoActiveAttempt`: nothing was left
 *   to cancel, road unknown until the read returns;
 * - no read yet, and the decoded cause is `NoSetup`: a setup write cleared the
 *   setup, which ended the attempt, so the road is the setup write.
 *
 * An attempt read that says the attempt still runs, and any cancel revert the
 * wallet could not decode or that names another kit error, reads the plain
 * reverted reading, with the retry and the move-funds action: an owner whose
 * cancel ran out of gas while the attack runs must not read that nothing is
 * left to cancel. Under an attempt read that says the attempt still runs, a
 * decoded `NoActiveAttempt` or `NoSetup` names no cause, since the read
 * contradicts it (a new attempt may have opened since the revert). Every other
 * write names the kit error it decoded, or reads as a revert with no cause it
 * can name.
 */
export const revertCauseOf = (
  write: WriteKind,
  cause?: KitError,
  attemptAfter?: AttemptAfterCancel
): RevertCause => {
  if (write !== 'cancel') {
    return plainCause(cause)
  }
  if (attemptAfter) {
    if (attemptAfter.ended === ATTEMPT_STILL_RUNNING) {
      // The read contradicts a decoded "nothing to cancel": a new attempt may
      // have opened since the revert, so that cause is not named.
      const known = kitErrorNameOf(cause)
      return known === 'NoActiveAttempt' || known === 'NoSetup'
        ? { kind: 'unnamed' }
        : plainCause(cause)
    }
    return {
      kind: 'attemptGone',
      ended: attemptAfter.ended,
      ...(attemptAfter.controller ? { controller: attemptAfter.controller } : {})
    }
  }
  const known = kitErrorNameOf(cause)
  if (known === 'NoActiveAttempt') {
    return { kind: 'attemptGone' }
  }
  if (known === 'NoSetup') {
    return { kind: 'attemptGone', ended: 'setupWrite' }
  }
  return plainCause(cause)
}

/** The gas a reverted receipt spent, where the receipt carries both factors. */
export const gasSpentOf = (receipt: WriteReceipt): bigint | undefined =>
  receipt.gasUsed !== undefined && receipt.effectiveGasPrice !== undefined
    ? receipt.gasUsed * receipt.effectiveGasPrice
    : undefined

// ---------------------------------------------------------------------------
// What a retry can fix
// ---------------------------------------------------------------------------

/**
 * The execution's causes that leave the attempt ready: the wait has not ended
 * yet, or a security stop holds a method the recovery used. The execution's
 * "still ready" reading renders for these and for a revert with no cause the
 * wallet can name; every other cause ends the attempt and offers no retry.
 */
export const EXECUTION_STILL_READY_CAUSES: readonly KitErrorName[] = [
  'WaitNotOver',
  'MethodVetoedSpend'
]

/**
 * The submission's acceptance errors: the manager refused the request itself,
 * and sending the same request again cannot land.
 */
const SUBMISSION_ACCEPTANCE_ERRORS: readonly KitErrorName[] = [
  'NoSetup',
  'AttemptAlreadyActive',
  'WrongAttemptId',
  'WrongSetupNonce',
  'SetupCommitmentMismatch',
  'StaleAttempt',
  'PlaceOutOfRange',
  'CredentialMismatch',
  'PlacesNotStrictlyIncreasing',
  'RequestExpired',
  'ProofRejected',
  'MethodStopped',
  'RuleUnsatisfied',
  'MalformedHandover',
  'ReservedAuthority'
]

/**
 * The kit errors no retry of the same write fixes, by write. A failed state
 * whose decoded cause is one of these offers no retry.
 *
 * - The save and the edit: a commitment the recovery registry refuses.
 * - Another setup write: the removal of a setup that is not there.
 * - The cancel: none here; a cancel with nothing left to cancel reads the gone
 *   attempt, which offers no retry either.
 * - The submission: the manager's acceptance errors.
 * - The execution: every cause but the two that leave the attempt ready.
 */
export const NO_RETRY_CAUSES: { readonly [W in WriteKind]: readonly KitErrorName[] } = {
  save: ['InvalidCommitment'],
  edit: ['InvalidCommitment'],
  ownerWrite: ['NoSetup'],
  cancel: [],
  submission: SUBMISSION_ACCEPTANCE_ERRORS,
  execution: KIT_ERROR_NAMES.filter((name) => !EXECUTION_STILL_READY_CAUSES.includes(name))
}

/** Whether a revert of a write leaves something a retry can fix. */
export const retryCanFix = (write: WriteKind, cause: RevertCause): boolean => {
  if (cause.kind === 'attemptGone') {
    return false
  }
  if (cause.kind === 'named') {
    return !NO_RETRY_CAUSES[write].includes(cause.name)
  }
  return true
}

/**
 * Whether a reverted execution leaves the attempt ready: a cause of
 * `EXECUTION_STILL_READY_CAUSES`, or one the wallet cannot name.
 */
export const leavesAttemptReady = (cause: RevertCause): boolean =>
  cause.kind === 'unnamed' ||
  (cause.kind === 'named' && EXECUTION_STILL_READY_CAUSES.includes(cause.name))

// ---------------------------------------------------------------------------
// The classification
// ---------------------------------------------------------------------------

const revertedState = (
  receipt: WriteReceipt,
  context: FailureContext,
  cause?: KitError
): FailedRevertedState => {
  const gasSpent = gasSpentOf(receipt)
  return {
    status: 'failedReverted',
    write: context.write,
    transactionHash: receipt.transactionHash,
    receipt,
    cause: revertCauseOf(context.write, cause, context.attemptAfter),
    ...(cause ? { decoded: cause } : {}),
    ...(gasSpent !== undefined ? { gasSpent } : {})
  }
}

/**
 * Classifies a write that did not land, by whether a transaction hash
 * exists and whether a receipt with status zero came back:
 *
 * - a transaction another one replaced before it was mined, other than a mere
 *   repricing, reads `failedNotSent` with that reason: the write's own call
 *   never ran, whatever the replacement did;
 * - a receipt with status zero reads `failedReverted`, with the cause the
 *   receipt carries and its gas gone; a cancel's may read that the attempt was
 *   already gone (`revertCauseOf`);
 * - no receipt and no transaction hash reads `failedNotSent`: nothing reached
 *   the chain and the account stands as it did;
 * - a transaction hash with no receipt is neither: the call may still land, so
 *   the answer is the submitting state with that hash, which keeps waiting for
 *   its receipt and never reads that nothing was sent.
 *
 * A receipt with status one is no failure (`settleReceipt` reads it as
 * landed), so this throws a TypeError for one.
 */
export const classifyFailure = (
  failure: WriteFailure,
  context: FailureContext
): FailedState | SubmittingState => {
  const { receipt } = failure
  if (failure.replaced) {
    return {
      status: 'failedNotSent',
      write: context.write,
      error: failure.error,
      replaced: failure.replaced
    }
  }
  if (receipt) {
    if (receipt.status === 1) {
      throw new TypeError('A receipt with status one is no failure: settle it as landed.')
    }
    return revertedState(receipt, context, failure.cause)
  }
  if (failure.transactionHash) {
    return { status: 'submitting', write: context.write, transactionHash: failure.transactionHash }
  }
  const notSent: FailedNotSentState = {
    status: 'failedNotSent',
    write: context.write,
    error: failure.error
  }
  return notSent
}

/**
 * Settles a write from its receipt: status one reads `landed`, status zero the
 * reverted reading of `classifyFailure`, with the cause the wallet decoded.
 */
export const settleReceipt = (
  receipt: WriteReceipt,
  context: FailureContext,
  cause?: KitError
): LandedState | FailedRevertedState =>
  receipt.status === 1
    ? { status: 'landed', write: context.write, transactionHash: receipt.transactionHash, receipt }
    : revertedState(receipt, context, cause)
