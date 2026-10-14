/**
 * The checklist's poll of the account's recovery state and the deaths it
 * reads: the attempt the manager holds, its counters, the setup nonce and
 * whether the account still authorizes the action. A read that throws, or
 * that does not answer within its limit, is a failed poll, never the last
 * good reading. Every decision takes the clock read before the poll's read.
 */
import { keccak256 } from 'viem'

import type { Attempt, Gathering } from '@web/modules/social-recovery/sdk-interfaces'
import { within } from '@web/modules/social-recovery/shared/client'

import type { ChecklistKitClient, ChecklistLoad, PollFacts, PollOutcome, PollTarget } from './types'

/**
 * One poll: the recovery state and the authorization read together. Resolves
 * to undefined where either read throws or where both have not answered
 * within `limitMs`.
 */
export const readPollFacts = (
  kit: Pick<ChecklistKitClient, 'recovery' | 'action'>,
  limitMs: number
): Promise<PollFacts | undefined> =>
  within(async () => {
    const [state, authorized] = await Promise.all([
      kit.recovery.recoveryState(),
      kit.action.isAuthorized()
    ])
    return {
      attempt: state.attempt,
      nextAttemptId: state.nextAttemptId,
      setupNonce: state.setupNonce,
      authorized
    }
  }, limitMs)

/** Whether an attempt holds the account's one slot: it waits out its period. */
export const attemptLive = (attempt: Attempt): boolean => attempt.state === 'Waiting'

/** Whether the clock, in ms, is past the request's deadline. */
export const deadlinePassed = (gathering: Gathering, clock: number): boolean =>
  Math.floor(clock / 1000) > Number(gathering.request.validUntil)

/**
 * Whether the account's attempt is this request's own submission: it carries
 * the request's predicted id, the setup nonce the request was built under and
 * the hash of the request's payload. The id alone names whoever opened next,
 * so another holder's attempt can carry it, and an attempt opened under a
 * changed setup is not this request's.
 */
const isOwnAttempt = (gathering: Gathering, attempt: Attempt): boolean => {
  const { attemptId, setupNonce, payload } = gathering.request
  return (
    attempt.state !== 'None' &&
    attempt.attemptId === BigInt(attemptId) &&
    attempt.setupNonce === BigInt(setupNonce) &&
    payload !== undefined &&
    keccak256(payload) === attempt.payloadHash
  )
}

/**
 * What a poll reads for a live gathering, or null where the request still
 * lives:
 * - landed: the account's attempt is this request's own submission, waiting
 *   or already ended;
 * - another attempt opened: another attempt waits, or the attempt counter
 *   moved past the predicted id;
 * - the setup changed: the setup nonce is not the one the request was built
 *   under.
 * A waiting attempt is named before the setup, since it holds the slot a new
 * gathering would need.
 */
export const outcomeOf = (gathering: Gathering, facts: PollFacts): PollOutcome | null => {
  if (isOwnAttempt(gathering, facts.attempt)) {
    return 'landed'
  }
  if (attemptLive(facts.attempt)) {
    return 'another-attempt-opened'
  }
  if (facts.setupNonce !== BigInt(gathering.request.setupNonce)) {
    return 'setup-changed'
  }
  if (facts.nextAttemptId > BigInt(gathering.request.attemptId)) {
    return 'another-attempt-opened'
  }
  return null
}

/**
 * What the poll reads for: the request of a live session, and a session
 * another attempt voided, which polls until the slot is free. Every other
 * state reads nothing.
 */
export const pollTargetOf = (load: ChecklistLoad): PollTarget | null => {
  if (load.phase === 'live') {
    const { request } = load.session.gathering
    return {
      kind: 'live',
      key: `live:${request.attemptId}:${request.setupNonce}:${request.validUntil}`,
      gathering: load.session.gathering
    }
  }
  if (load.phase === 'wiped' && load.session.reason === 'another-attempt-opened') {
    return { kind: 'void', key: `void:${load.revision}` }
  }
  return null
}
