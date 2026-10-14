/**
 * The done screen's one read: the manager's consume event of the attempt
 * this device landed, or of the account's current attempt where the countdown
 * has ended, from the manager's deployment block to the block the
 * attempt read pins, and the account's privilege events of that same
 * transaction, which name the key granted and the key removed. The screen
 * names the keys as these events report them and never as the account's
 * signer state reads. Against the attempt this device landed, the consume is
 * ours where it carries that attempt's id and every opening under that id
 * before it carries the attempt's setup number and payload hash: the manager
 * hands the next id to whoever opens next, so the id alone can be a rival's.
 * A read that throws, or does not answer within its limit,
 * answers nothing.
 */
import { hexToBigInt, isAddressEqual } from 'viem'

import type { LogPosition } from '@web/modules/social-recovery/sdk-interfaces'
import type { CountdownRead } from '@web/modules/social-recovery/shared/records'
import {
  isAttemptOf,
  isOpeningOf,
  landedAttemptOf
} from '@web/modules/social-recovery/recovery/wait'
import { within } from '@web/modules/social-recovery/shared/client'
import type { LandedAttempt, StartedNotice } from '@web/modules/social-recovery/recovery/wait'

import type {
  BlockTimeRead,
  ConsumedNotice,
  ConsumeMatch,
  ConsumeReading,
  DoneKitClient,
  PrivilegeNotice
} from './types'

/**
 * What the countdown's read lets the consume be matched against: the attempt
 * its record landed, or the ended countdown where the record is gone. Null
 * where the record does not name the attempt it landed, as one stored before
 * the record kept it: nothing tells this device's attempt from a rival's.
 */
export const consumeMatchOf = (countdown: CountdownRead): ConsumeMatch | null => {
  if (countdown.status === 'absent') {
    return { kind: 'ended' }
  }
  const landed = landedAttemptOf(countdown.value)
  return landed ? { kind: 'landed', landed } : null
}

/** Whether two landed attempts are one: the same id, setup number and payload hash. */
export const sameLanded = (a: LandedAttempt, b: LandedAttempt): boolean =>
  a.attemptId === b.attemptId &&
  a.setupNonce === b.setupNonce &&
  a.payloadHash.toLowerCase() === b.payloadHash.toLowerCase()

/** Whether a log sits before another one on the chain. */
const before = (a: LogPosition, b: LogPosition): boolean =>
  a.blockNumber < b.blockNumber || (a.blockNumber === b.blockNumber && a.logIndex < b.logIndex)

const sameTransaction = (a: LogPosition, b: LogPosition): boolean =>
  a.transactionHash.toLowerCase() === b.transactionHash.toLowerCase()

const granting = (notice: PrivilegeNotice): boolean => hexToBigInt(notice.priv) !== 0n

/**
 * The consume of the account, with its opening, the two keys its transaction
 * moved, the removed key's latest earlier grant where an event names one, and
 * the consume's block time. Where the countdown ended, the consume is the one
 * of the manager's current attempt, which must read consumed. Against a
 * landed attempt, the consume is the one under the landed attempt's id, and
 * every opening under that id before it must be the landed one. Where the
 * manager's attempt is the landed one, it must read consumed and the used
 * methods are its record's. Where it is not (a later attempt, or none at
 * all), the consume needs at least one opening before it, the used methods
 * are that opening's, and a manager's attempt under the landed id that is not
 * the landed one answers none. Anything else answers none: the attempt may
 * still run. A consume whose transaction names no granted or no removed key
 * is a read that has not caught up yet, and fails.
 */
export const readConsume = (
  kit: DoneKitClient,
  match: ConsumeMatch,
  blockTime: BlockTimeRead,
  limitMs: number
): Promise<ConsumeReading | undefined> =>
  within(async (): Promise<ConsumeReading> => {
    const { events } = kit.recovery
    const state = await kit.recovery.recoveryState()
    const to = state.block.number
    const range = { from: Math.min(kit.descriptor.deployedAt, to), to }
    const ofAccount = (notice: Pick<ConsumedNotice, 'at' | 'account'>): boolean =>
      !notice.at.removed && isAddressEqual(notice.account, kit.account)

    const { attempt } = state
    const landed = match.kind === 'landed' ? match.landed : null
    const later = landed !== null && !isAttemptOf(attempt, landed)
    if (later) {
      if (attempt.state !== 'None' && attempt.attemptId === landed.attemptId) {
        return { kind: 'none' }
      }
    } else if (attempt.state !== 'Consumed') {
      return { kind: 'none' }
    }
    const attemptId = landed ? landed.attemptId : attempt.attemptId

    const notifications = await events.fetch(events.accountFilter(), range)
    const consumed = notifications
      .filter((notice): notice is ConsumedNotice => notice.kind === 'attempt-consumed')
      .filter(ofAccount)
      .filter((notice) => notice.attemptId === attemptId)
      .pop()
    if (!consumed) {
      return { kind: 'none' }
    }
    const opened = notifications
      .filter((notice): notice is StartedNotice => notice.kind === 'attempt-started')
      .filter(ofAccount)
      .filter((notice) => notice.attemptId === consumed.attemptId && before(notice.at, consumed.at))
    if (landed && opened.some((notice) => !isOpeningOf(notice, landed))) {
      return { kind: 'none' }
    }
    const started = opened.pop()
    const usedMethods = later ? started?.usedMethods : attempt.usedMethods
    if (!usedMethods) {
      return { kind: 'none' }
    }

    const privileges = (await events.fetch(events.privilegeFilter(), range))
      .filter((notice): notice is PrivilegeNotice => notice.kind === 'privilege-changed')
      .filter(ofAccount)
    const moved = privileges.filter((notice) => sameTransaction(notice.at, consumed.at))
    const granted = moved.find(granting)?.addr
    const removed = moved.find((notice) => !granting(notice))?.addr
    if (!granted || !removed) {
      throw new Error('The consume transaction names no granted or no removed key yet.')
    }
    const removedPrivilege = privileges
      .filter(
        (notice) =>
          isAddressEqual(notice.addr, removed) && granting(notice) && before(notice.at, consumed.at)
      )
      .pop()?.priv

    const time =
      consumed.at.blockNumber === state.block.number
        ? state.block.timestamp
        : await blockTime(consumed.at.blockNumber)

    return {
      kind: 'found',
      event: {
        consumed,
        ...(started ? { started } : {}),
        granted,
        removed,
        ...(removedPrivilege ? { removedPrivilege } : {}),
        usedMethods,
        time
      }
    }
  }, limitMs)
