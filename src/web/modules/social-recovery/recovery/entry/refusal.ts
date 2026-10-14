/**
 * Where the account step stands once the holder confirmed the account. The
 * reads run in order and each gates the next: the account must still
 * authorize the recovery module, then this release must be able to recover
 * the account, then the key a recovery installs must hold nothing on it yet.
 * A read that failed stops the step on its own failed state, never on a
 * refusal.
 */
import { isAddressEqual } from 'viem'

import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import type {
  ConfirmedReads,
  ConfirmedStep,
  DestinationAnswers,
  DestinationRefusal,
  FitAnswers,
  RecoverRefusal
} from './types'

/** Why this release cannot recover the account, or null where it can. */
export const recoverRefusalOf = (answers: FitAnswers): RecoverRefusal | null => {
  if (!answers.supportsAccount || !answers.fitCheck.fits) {
    return 'not-supported'
  }
  const { removedKey } = answers
  if (removedKey.kind === 'unavailable') {
    return removedKey.cause === 'several-key-entries' ? 'several-keys' : 'removed-unknown'
  }
  if (answers.removedKeyIsAuthority === false) {
    return 'removed-not-authority'
  }
  return null
}

/**
 * Why the key a recovery installs cannot be installed: it is already one of
 * the account's keys, or the key a recovery would remove, or it already holds
 * a privilege on the account. Null where it holds nothing.
 */
export const destinationRefusalOf = (
  answers: DestinationAnswers,
  destination: Address,
  fit: FitAnswers
): DestinationRefusal | null => {
  const removed = fit.removedKey.kind === 'named' ? fit.removedKey.key : undefined
  if (answers.isAuthority || (removed !== undefined && isAddressEqual(removed, destination))) {
    return 'already-a-key'
  }
  if (answers.holdsAnyPrivilege) {
    return 'holds-privilege'
  }
  return null
}

export const confirmedStepOf = (reads: ConfirmedReads, destination: Address): ConfirmedStep => {
  const { authorization, fit, destination: held } = reads
  if (!authorization || authorization.status === 'pending') {
    return { kind: 'reading', stage: 'authorization' }
  }
  if (authorization.status === 'failed') {
    return { kind: 'failed', stage: 'authorization' }
  }
  if (!authorization.value) {
    return { kind: 'dormant' }
  }
  if (!fit || fit.status === 'pending') {
    return { kind: 'reading', stage: 'fit' }
  }
  if (fit.status === 'failed') {
    return { kind: 'failed', stage: 'fit' }
  }
  const refusal = recoverRefusalOf(fit.value)
  if (refusal) {
    return { kind: 'cannot-recover', refusal }
  }
  if (!held || held.status === 'pending') {
    return { kind: 'reading', stage: 'destination' }
  }
  if (held.status === 'failed') {
    return { kind: 'failed', stage: 'destination' }
  }
  const destinationRefusal = destinationRefusalOf(held.value, destination, fit.value)
  return destinationRefusal
    ? { kind: 'destination', refusal: destinationRefusal }
    : { kind: 'ready' }
}
