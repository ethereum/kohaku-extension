/**
 * The watcher's record of one account, in the extension's local storage under
 * `socialRecovery:watcher:<chainId>:<account>`, stored as `{ value, savedAt }`
 * like every record of the wallet, with every bigint as a decimal string.
 *
 * Both the background's poll and a page's dismissal write it, so each write
 * reads the record and writes it back while it holds the queue of its key.
 */
import { isHex } from 'viem'

import type { Address, CancelledBy, Hex } from '@kohaku-eth/social-recovery'
import { CANCELLED_BY } from '@web/modules/social-recovery/shared/client'
import { extensionRecordStorage } from '@web/modules/social-recovery/shared/records/extensionStorage'
import { recordDeploymentFrom } from '@web/modules/social-recovery/shared/records/deployment'
import {
  isDecimalString,
  isStoredAddress
} from '@web/modules/social-recovery/shared/records/guards'
import { inQueue, recordKeys } from '@web/modules/social-recovery/shared/records/records'
import type { ChainId } from '@web/modules/social-recovery/shared/records/types'

import { ENDING_GAPS, OPENING_GAPS, TICK_LIMIT_MS } from './constants'
import type {
  AttemptEnding,
  EndingGap,
  PollFailure,
  StoredAttemptEnding,
  StoredWatchedAttempt,
  StoredWatcherRecord,
  WatchedAttempt,
  WatcherReading,
  WatcherRecord,
  WatcherStorage,
  WatcherWrite
} from './types'

export const watcherKeyOf = (chainId: ChainId, account: Address): string =>
  recordKeys.watcher(chainId, account)

// ---------------------------------------------------------------------------
// The stored form
// ---------------------------------------------------------------------------

const storedAttemptOf = (attempt: WatchedAttempt): StoredWatchedAttempt => ({
  ...attempt,
  attemptId: attempt.attemptId.toString(),
  setupNonce: attempt.setupNonce.toString()
})

const storedEndingOf = (ended: AttemptEnding): StoredAttemptEnding => ({
  ...ended,
  attemptId: ended.attemptId.toString()
})

const storedReadingOf = (reading: WatcherReading): StoredWatcherRecord['reading'] => {
  const { attempt, ended, ...rest } = reading
  return {
    ...rest,
    ...(attempt ? { attempt: storedAttemptOf(attempt) } : {}),
    ...(ended ? { ended: storedEndingOf(ended) } : {})
  }
}

export const storedWatcherRecordOf = (record: WatcherRecord): StoredWatcherRecord => ({
  ...(record.reading ? { reading: storedReadingOf(record.reading) } : {}),
  ...(record.failed ? { failed: { ...record.failed } } : {}),
  dismissed: record.dismissed.map((id) => id.toString()),
  ...(record.polledAt !== undefined ? { polledAt: record.polledAt } : {})
})

// ---------------------------------------------------------------------------
// The read back
// ---------------------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isBlockNumber = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0

const optional = (value: unknown, check: (present: unknown) => boolean): boolean =>
  value === undefined || check(value)

const isFailure = (value: unknown): value is PollFailure =>
  isObject(value) && isTime(value.at) && typeof value.message === 'string'

const attemptFrom = (value: unknown): WatchedAttempt | undefined => {
  if (
    !isObject(value) ||
    !isDecimalString(value.attemptId) ||
    !isDecimalString(value.setupNonce) ||
    !isHex(value.payloadHash) ||
    !isTime(value.consumableAfter) ||
    typeof value.executionDue !== 'boolean' ||
    !optional(value.openedAt, isTime) ||
    !optional(value.newKey, isStoredAddress) ||
    !optional(value.removedKey, isStoredAddress) ||
    !optional(value.openingGap, (gap) => OPENING_GAPS.some((known) => known === gap)) ||
    !optional(value.scannedTo, isBlockNumber) ||
    !optional(value.scannedFrom, isBlockNumber) ||
    !optional(value.openingBlock, isBlockNumber)
  ) {
    return undefined
  }
  const attempt = value as unknown as StoredWatchedAttempt
  return {
    ...attempt,
    attemptId: BigInt(attempt.attemptId),
    setupNonce: BigInt(attempt.setupNonce)
  }
}

const endingFrom = (value: unknown): AttemptEnding | undefined => {
  if (
    !isObject(value) ||
    !isDecimalString(value.attemptId) ||
    !optional(value.at, isTime) ||
    !optional(value.endingGap, (gap) => ENDING_GAPS.some((known) => known === gap)) ||
    !optional(value.notFoundAt, isBlockNumber)
  ) {
    return undefined
  }
  const attemptId = BigInt(value.attemptId)
  const at = value.at as number | undefined
  const endingGap = value.endingGap as EndingGap | undefined
  const notFoundAt = value.notFoundAt as number | undefined
  const gap = {
    ...(endingGap ? { endingGap } : {}),
    ...(notFoundAt !== undefined ? { notFoundAt } : {})
  }
  if (
    value.road === 'executed' &&
    optional(value.controller, isStoredAddress) &&
    optional(value.transactionHash, isHex)
  ) {
    const transactionHash = value.transactionHash as Hex | undefined
    return {
      attemptId,
      road: 'executed',
      controller: value.controller as Address | undefined,
      at,
      ...(transactionHash ? { transactionHash } : {}),
      ...gap
    }
  }
  if (
    value.road === 'cancelled' &&
    optional(value.cancelledBy, (road) => CANCELLED_BY.some((known) => known === road))
  ) {
    return {
      attemptId,
      road: 'cancelled',
      cancelledBy: value.cancelledBy as CancelledBy | undefined,
      at,
      ...gap
    }
  }
  return undefined
}

const readingFrom = (value: unknown): WatcherReading | undefined => {
  if (
    !isObject(value) ||
    !isStoredAddress(value.account) ||
    !isObject(value.block) ||
    !isBlockNumber(value.block.number) ||
    !isTime(value.block.timestamp) ||
    typeof value.hasSetup !== 'boolean' ||
    typeof value.dormant !== 'boolean'
  ) {
    return undefined
  }
  const attempt = value.attempt === undefined ? undefined : attemptFrom(value.attempt)
  const ended = value.ended === undefined ? undefined : endingFrom(value.ended)
  const deployment =
    value.deployment === undefined ? undefined : recordDeploymentFrom(value.deployment)
  if (
    (value.attempt !== undefined && !attempt) ||
    (value.ended !== undefined && !ended) ||
    (value.deployment !== undefined && !deployment)
  ) {
    return undefined
  }
  return {
    account: value.account,
    block: { number: value.block.number, timestamp: value.block.timestamp },
    hasSetup: value.hasSetup,
    dormant: value.dormant,
    ...(attempt ? { attempt } : {}),
    ...(ended ? { ended } : {}),
    ...(deployment ? { deployment } : {})
  }
}

/**
 * The record a stored value holds, or undefined where the value is not a
 * watcher record: a storage read is a boundary, so every field is checked.
 */
export const watcherRecordFrom = (stored: unknown): WatcherRecord | undefined => {
  if (!isObject(stored) || !isTime(stored.savedAt) || !isObject(stored.value)) {
    return undefined
  }
  const { value } = stored
  if (
    !Array.isArray(value.dismissed) ||
    !value.dismissed.every(isDecimalString) ||
    !optional(value.failed, isFailure) ||
    !optional(value.polledAt, isTime)
  ) {
    return undefined
  }
  const reading = value.reading === undefined ? undefined : readingFrom(value.reading)
  if (value.reading !== undefined && !reading) {
    return undefined
  }
  return {
    ...(reading ? { reading } : {}),
    ...(value.failed ? { failed: value.failed as PollFailure } : {}),
    dismissed: (value.dismissed as string[]).map((id) => BigInt(id)),
    ...(value.polledAt !== undefined ? { polledAt: value.polledAt as number } : {})
  }
}

// ---------------------------------------------------------------------------
// Reads and writes
// ---------------------------------------------------------------------------

export const readWatcherRecord = async (
  storage: WatcherStorage,
  chainId: ChainId,
  account: Address
): Promise<WatcherRecord | undefined> =>
  watcherRecordFrom(await storage.get(watcherKeyOf(chainId, account)))

/**
 * Writes the record `change` makes of the one stored, read and written while
 * the record's lock is held, and answers what it wrote. A poll's write names
 * when its poll started and stamps the record with it; one from a poll that
 * started before the poll of the stored record is dropped and answers the
 * stored record, so a poll that outlived its tick never covers a newer one.
 * Such a poll started less than one tick before the stored one: a write that
 * names a start more than two ticks earlier comes from a wall clock that moved
 * back, and is written. A write that names no poll keeps the stored stamp.
 */
export const updateWatcherRecord = (
  storage: WatcherStorage,
  chainId: ChainId,
  account: Address,
  change: (current: WatcherRecord | undefined) => WatcherRecord,
  { now = Date.now, polledAt }: WatcherWrite = {}
): Promise<WatcherRecord> => {
  const key = watcherKeyOf(chainId, account)
  return inQueue(key, async () => {
    const current = watcherRecordFrom(await storage.get(key))
    const stamped = current?.polledAt
    if (
      current &&
      polledAt !== undefined &&
      stamped !== undefined &&
      polledAt < stamped &&
      stamped - polledAt <= 2 * TICK_LIMIT_MS
    ) {
      return current
    }
    const changed = change(current)
    const stamp = polledAt ?? stamped
    const next: WatcherRecord = {
      ...changed,
      ...(stamp !== undefined ? { polledAt: stamp } : {})
    }
    await storage.set(key, { value: storedWatcherRecordOf(next), savedAt: now() })
    return next
  })
}

/**
 * Dismisses one attempt of the account: the badge stops counting it and the
 * banner hides it, while the reading still holds it as open. The next attempt
 * is not dismissed.
 */
export const dismissAttempt = (
  chainId: ChainId,
  account: Address,
  attemptId: bigint,
  storage: WatcherStorage = extensionRecordStorage
): Promise<WatcherRecord> =>
  updateWatcherRecord(storage, chainId, account, (current) => {
    const dismissed = current?.dismissed ?? []
    return {
      ...current,
      dismissed: dismissed.includes(attemptId) ? dismissed : [...dismissed, attemptId]
    }
  })

/** Whether the record's open attempt is one the holder dismissed. */
export const attemptDismissed = (record: WatcherRecord): boolean => {
  const open = record.reading?.attempt
  return open !== undefined && record.dismissed.includes(open.attemptId)
}
