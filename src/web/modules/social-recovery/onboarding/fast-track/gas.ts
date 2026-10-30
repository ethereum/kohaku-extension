import type { GasCheck } from '@web/modules/social-recovery/shared/writes'
import {
  depositStepOf,
  gasEstimateOf,
  holdsEnough
} from '@web/modules/social-recovery/shared/writes'

import { SUBMISSION_GAS_STAND_IN } from './constants'
import type { SubmissionCheckInput } from './types'

/**
 * The fast track's gas check for the submission, before the client has a
 * prepared submission to estimate. It reads the fee the wallet's send pays and
 * the sending key's balance, prices the assumed gas with the usual headroom, and
 * answers `enough` where the balance covers it, otherwise the fast track's
 * deposit step: the deposit from outside into the sending key, with no
 * transfer from an account, since the account cannot pay before it is
 * recovered. A read that could not run rejects with its own failure.
 */
export const submissionCheckOf = async ({
  reads,
  key,
  network,
  gas = SUBMISSION_GAS_STAND_IN
}: SubmissionCheckInput): Promise<GasCheck> => {
  const [gasPrice, balance] = await Promise.all([reads.gasPrice(), reads.nativeBalance(key)])
  const estimate = gasEstimateOf(gas, gasPrice)
  if (holdsEnough(estimate, balance)) {
    return { kind: 'enough', write: 'submission', key, estimate, balance }
  }
  return {
    kind: 'deposit',
    step: depositStepOf({
      write: 'submission',
      key,
      network,
      estimate,
      balance,
      fastTrack: true
    })
  }
}
