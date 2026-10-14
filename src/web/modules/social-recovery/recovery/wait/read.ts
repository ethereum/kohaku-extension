/**
 * The wait's reads: one poll of the attempt the manager holds, pinned to one
 * block, with the account's four checks beside it, and the manager's events
 * that tell the landed attempt's story (its opening and how it ended). A read that
 * throws, or that does not answer within its limit, answers nothing, never
 * the last good reading.
 */
import { isAddress, isAddressEqual, keccak256 } from 'viem'

import { destinationKeyOf } from '@web/modules/social-recovery/recovery/checklist'
import type { Address, Attempt } from '@web/modules/social-recovery/sdk-interfaces'
import { within } from '@web/modules/social-recovery/shared/client'
import type { ListedAccountFacts } from '@web/modules/social-recovery/shared/client'
import type { CountdownRecord } from '@web/modules/social-recovery/shared/records'
import { sameHash } from '@web/modules/social-recovery/shared/writes'

import type {
  AttemptStory,
  CancelledNotice,
  HandoverKeys,
  LandedAttempt,
  StartedNotice,
  WaitFacts,
  WaitKitClient
} from './types'

/**
 * One poll: the attempt read with its pinned block, whether the account still
 * authorizes the action, whether the action still fits the account, whether
 * the key being removed still holds a key value, and whether the new key
 * already holds a privilege. A key being removed the wallet no longer names
 * holds nothing.
 */
export const readWaitFacts = (
  kit: Pick<WaitKitClient, 'recovery' | 'action'>,
  keys: HandoverKeys,
  limitMs: number
): Promise<WaitFacts | undefined> =>
  within(async () => {
    const { removedKey } = keys
    const [state, authorized, supported, removedHolds, newKeyHolds] = await Promise.all([
      kit.recovery.recoveryState(),
      kit.action.isAuthorized(),
      kit.action.supportsAccount(),
      removedKey ? kit.action.isAuthority(removedKey) : Promise.resolve(false),
      kit.action.holdsAnyPrivilege(keys.newKey)
    ])
    return {
      attempt: state.attempt,
      block: state.block,
      authorized,
      supported,
      removedHolds,
      newKeyHolds
    }
  }, limitMs)

/**
 * The key the waiting recovery installs on the account: a smart account's
 * controlling key as the keystore holds it, and a basic account's own address
 * whether or not the keystore holds its key, since that key decides only who
 * can send the execution, not which attempt the wait reads.
 */
export const waitNewKeyOf = (facts: ListedAccountFacts): Address | null => {
  if (facts.creation) {
    return destinationKeyOf(facts)
  }
  const own = facts.account.addr
  return isAddress(own, { strict: false }) ? own : null
}

/**
 * The attempt the countdown's record names, from the decimal strings the
 * records keep; null where the record holds any of the three not at all.
 */
export const landedAttemptOf = (record: CountdownRecord): LandedAttempt | null => {
  const { attemptId, setupNonce, payloadHash } = record
  if (attemptId === undefined || setupNonce === undefined || payloadHash === undefined) {
    return null
  }
  return { attemptId: BigInt(attemptId), setupNonce: BigInt(setupNonce), payloadHash }
}

/**
 * Whether an attempt the manager reports is the one the submission landed:
 * the same id, the same setup number and the same payload hash, in any state
 * but none. A rival under the same id carries another payload.
 */
export const isAttemptOf = (attempt: Attempt, landed: LandedAttempt): boolean =>
  attempt.state !== 'None' &&
  attempt.attemptId === landed.attemptId &&
  attempt.setupNonce === landed.setupNonce &&
  sameHash(attempt.payloadHash, landed.payloadHash)

/**
 * Whether a countdown's record names the attempt a run was started for: the
 * record holds all three values, and its id, setup number and payload hash
 * are the run's. A record of another attempt, or one with none of them, is
 * not the run's countdown.
 */
export const isCountdownOf = (record: CountdownRecord, landed: LandedAttempt): boolean => {
  const named = landedAttemptOf(record)
  return (
    !!named &&
    named.attemptId === landed.attemptId &&
    named.setupNonce === landed.setupNonce &&
    sameHash(named.payloadHash, landed.payloadHash)
  )
}

/** Whether an opening event started the attempt the submission landed: its id, its setup number and its payload's hash. */
export const isOpeningOf = (started: StartedNotice, landed: LandedAttempt): boolean =>
  started.attemptId === landed.attemptId &&
  started.setupNonce === landed.setupNonce &&
  sameHash(keccak256(started.payload), landed.payloadHash)

/**
 * The story of the landed attempt from the manager's events for the account,
 * from the manager's deployment block to the pinned block: its opening, its
 * cancel and its consume, all under the landed attempt's id. An opening under
 * that id that is not the landed one makes the story a rival's, and nothing
 * else is taken from it. Undefined where the read fails or does not answer
 * within `limitMs`.
 */
export const readAttemptStory = (
  kit: Pick<WaitKitClient, 'recovery' | 'descriptor' | 'account'>,
  landed: LandedAttempt,
  to: number,
  limitMs: number
): Promise<AttemptStory | undefined> =>
  within(async () => {
    const { events } = kit.recovery
    const from = Math.min(kit.descriptor.deployedAt, to)
    const notifications = (await events.fetch(events.accountFilter(), { from, to })).filter(
      (notification) =>
        !notification.at.removed &&
        'account' in notification &&
        isAddressEqual(notification.account, kit.account)
    )
    const opened = notifications.filter(
      (notification): notification is StartedNotice =>
        notification.kind === 'attempt-started' && notification.attemptId === landed.attemptId
    )
    if (opened.some((notification) => !isOpeningOf(notification, landed))) {
      return { consumed: false, rival: true }
    }
    const started = opened[opened.length - 1]
    const cancelled = notifications.find(
      (notification): notification is CancelledNotice =>
        notification.kind === 'attempt-cancelled' && notification.attemptId === landed.attemptId
    )
    const consumed = notifications.some(
      (notification) =>
        notification.kind === 'attempt-consumed' && notification.attemptId === landed.attemptId
    )
    return {
      ...(started ? { started } : {}),
      ...(cancelled ? { cancelled } : {}),
      consumed,
      rival: false
    }
  }, limitMs)
