/**
 * The manager's three attempt events: `AttemptStarted(account indexed, action
 * indexed, attemptId, setupNonce, setupBody, usedPlaces, usedMethods, payload,
 * order, consumableAfter)`, `AttemptCancelled(account indexed, action indexed,
 * attemptId, canceller, stoppedMethod, setupNonce, usedPlaces)` and
 * `AttemptConsumed(account indexed, action indexed, attemptId)`, their topics
 * and their decoding.
 */
import { decodeEventLog, encodeEventTopics, isAddressEqual, zeroAddress } from 'viem'

import type { Address, CancelledBy, RawLog } from '@web/modules/social-recovery/sdk-interfaces'

import { POLICY_MANAGER_ABI } from '../abi'
import { positionOf } from './log-scan'
import type { AttemptLog } from './types'

export const [ATTEMPT_STARTED_TOPIC] = encodeEventTopics({
  abi: POLICY_MANAGER_ABI,
  eventName: 'AttemptStarted'
})

export const [ATTEMPT_CANCELLED_TOPIC] = encodeEventTopics({
  abi: POLICY_MANAGER_ABI,
  eventName: 'AttemptCancelled'
})

export const [ATTEMPT_CONSUMED_TOPIC] = encodeEventTopics({
  abi: POLICY_MANAGER_ABI,
  eventName: 'AttemptConsumed'
})

// The three events carry the event's topic, the account and the action.
const ATTEMPT_LOG_TOPICS = 3

/**
 * The manager function a cancel came from, as far as its log tells: a
 * stopped method names a veto; else used places name a cancel with proofs;
 * else the account as the canceller names the owner's cancel; else, with no
 * canceller, a setup write ended the attempt.
 */
const cancelledByOf = (
  account: Address,
  canceller: Address,
  stoppedMethod: Address,
  usedPlaces: readonly bigint[]
): CancelledBy => {
  if (!isAddressEqual(stoppedMethod, zeroAddress)) {
    return 'cancelByVeto'
  }
  if (usedPlaces.length > 0) {
    return 'cancelByProofs'
  }
  if (isAddressEqual(canceller, account)) {
    return 'cancelByOwner'
  }
  return 'setupWrite'
}

/**
 * One raw log as an attempt's start, cancel or consume, or undefined for a
 * log of another event, with another number of topics, or with data that
 * does not decode. Never throws.
 */
export const decodeAttemptLog = (log: RawLog): AttemptLog | undefined => {
  const [topic, ...indexed] = log.topics
  if (topic === undefined || log.topics.length !== ATTEMPT_LOG_TOPICS) {
    return undefined
  }
  try {
    const decoded = decodeEventLog({
      abi: POLICY_MANAGER_ABI,
      topics: [topic, ...indexed],
      data: log.data,
      strict: true
    })
    if (decoded.eventName === 'AttemptStarted') {
      const { args } = decoded
      return {
        kind: 'attempt-started',
        account: args._account,
        action: args._action,
        attemptId: args._attemptId,
        setupNonce: args._setupNonce,
        setupBody: args._setupBody,
        usedPlaces: [...args._usedPlaces],
        usedMethods: [...args._usedMethods],
        payload: args._payload,
        order: { token: args._order.token, amount: args._order.amount, payee: args._order.payee },
        consumableAfter: args._consumableAfter,
        at: positionOf(log)
      }
    }
    if (decoded.eventName === 'AttemptCancelled') {
      const { args } = decoded
      return {
        kind: 'attempt-cancelled',
        account: args._account,
        action: args._action,
        attemptId: args._attemptId,
        canceller: args._canceller,
        vetoingMethod: args._stoppedMethod,
        cancelledBy: cancelledByOf(
          args._account,
          args._canceller,
          args._stoppedMethod,
          args._usedPlaces
        ),
        setupNonce: args._setupNonce,
        usedPlaces: [...args._usedPlaces],
        at: positionOf(log)
      }
    }
    if (decoded.eventName === 'AttemptConsumed') {
      return {
        kind: 'attempt-consumed',
        account: decoded.args._account,
        action: decoded.args._action,
        attemptId: decoded.args._attemptId,
        at: positionOf(log)
      }
    }
    return undefined
  } catch {
    return undefined
  }
}
