/**
 * The states every social recovery write shares: the gas check and its
 * deposit step, the one submitting state, and the one failed state with its
 * two readings, each a state of its own.
 *
 * Every write renders these and no write defines its own: the setup save, the
 * edit, any other setup write, the owner's cancel, the submission and the
 * execution.
 */
import { retryCanFix } from './classify'
import type { FailedState, WriteState } from './types'

/** Every status of a write, in the order a write passes them. */
export const WRITE_STATUSES = [
  'idle',
  'checkingGas',
  'gasReadError',
  'needsDeposit',
  'submitting',
  'landed',
  'failedNotSent',
  'failedReverted'
] as const

/** The two readings of the one failed state, each its own status. */
export const FAILED_STATUSES = ['failedNotSent', 'failedReverted'] as const

export const isFailedState = (state: WriteState): state is FailedState =>
  (FAILED_STATUSES as readonly string[]).includes(state.status)

/**
 * Whether the wallet submitted the write as an operation another party sends,
 * which this wallet cannot follow and which may still reach the chain.
 */
export const mayStillLand = (state: WriteState): boolean =>
  state.status === 'failedNotSent' && !!state.mayStillLand

/** Whether the write was not sent because another request for the account waited in the wallet. */
export const otherRequestPending = (state: WriteState): boolean =>
  state.status === 'failedNotSent' && !!state.otherRequest

/**
 * Whether the state offers the retry. A gas check that could not read runs
 * again, and a call never sent is sent again, except one that may still reach
 * the chain. A reverted call is retried only where a retry can fix its cause
 * (`retryCanFix`): never for a cancel whose attempt was already gone, nor for a
 * kit error of the write's `NO_RETRY_CAUSES`.
 */
export const canRetry = (state: WriteState): boolean =>
  state.status === 'gasReadError' ||
  (state.status === 'failedNotSent' && !state.mayStillLand) ||
  (state.status === 'failedReverted' && retryCanFix(state.write, state.cause))

/**
 * Whether the failed state offers the cancel's move-funds action. A cancel the
 * wallet never sent offers it beside the retry, since the waiting period keeps
 * running, and so does a cancel that reverted while the attempt still runs, or
 * before the attempt read says otherwise. A cancel that reverted because the attempt
 * executed offers it beside the controller the state names. A cancel another
 * road beat keeps control unchanged and offers none, and neither does a gone
 * attempt whose read has not returned. No other write offers it.
 */
export const offersMoveFunds = (state: WriteState): boolean => {
  if (state.write !== 'cancel') return false
  if (state.status === 'failedNotSent') return true
  if (state.status !== 'failedReverted') return false
  return state.cause.kind !== 'attemptGone' || state.cause.ended === 'executed'
}
