/**
 * The pure readings of the watcher's record: what the banner shows for one
 * account, and how the attempt the holder meant to cancel stands in a fresh
 * reading, before the send, after a landed cancel and after a reverted one.
 *
 * A failed poll is shown as failed, never as no attempt, and keeps the open
 * attempt the last good reading holds, so the holder can still cancel it; a
 * record that cannot be read shows the failed look with its retry. An
 * attempt that ended by a cancel shows no banner. A recovery that executed
 * shows its notice until the holder dismisses that attempt, and only on a
 * device whose keystore does not hold the key that controls the account since:
 * the device that holds it got control, not lost it.
 */
import type { Address } from '@kohaku-eth/social-recovery'
import { sameAddress } from '@web/modules/social-recovery/shared/client'
import type { AttemptAfterCancel } from '@web/modules/social-recovery/shared/writes'
import { ATTEMPT_STILL_RUNNING } from '@web/modules/social-recovery/shared/writes'
import type { CountdownAnchor } from '@web/modules/social-recovery/recovery/wait/types'
import type { WatchedAttemptState, WatcherReading } from '@web/modules/social-recovery/watcher'

import type { AttemptStanding, BannerReading, OpenAttempt } from './types'

const NONE: BannerReading = { kind: 'none' }

const openOf = (reading: WatcherReading | undefined): OpenAttempt | undefined =>
  reading?.attempt
    ? { attempt: reading.attempt, dormant: reading.dormant, block: reading.block }
    : undefined

/**
 * The banner of one account. `dismissed` is the record's list of dismissed
 * attempts and `heldKeys` every key the keystore holds, each undefined while
 * it is read; an executed notice waits for both, so a notice that does not
 * belong on this device never flashes.
 */
export const bannerReadingOf = (
  state: WatchedAttemptState,
  dismissed: readonly bigint[] | undefined,
  heldKeys: readonly Address[] | undefined
): BannerReading => {
  if (state.status === 'failed') {
    return { kind: 'unreadable', retry: state.retry }
  }
  if (state.status !== 'watched') {
    return NONE
  }
  const { reading, failed } = state
  const open = state.attemptDismissed ? undefined : openOf(reading)
  if (failed) {
    return {
      kind: 'failed',
      failed,
      ...(reading ? { lastBlockAt: reading.block.timestamp * 1000 } : {}),
      ...(open ? { open } : {})
    }
  }
  if (open) {
    return { kind: 'open', open }
  }
  const ended = reading?.ended
  if (
    !reading?.attempt &&
    ended?.road === 'executed' &&
    dismissed !== undefined &&
    !dismissed.includes(ended.attemptId) &&
    heldKeys !== undefined &&
    !heldKeys.some((key) => !!ended.controller && sameAddress(key, ended.controller))
  ) {
    return { kind: 'executed', ending: ended }
  }
  return NONE
}

/** The countdown's anchor: the attempt's end against the reading's block time, one round per reading. */
export const anchorOf = ({ attempt, block }: OpenAttempt): CountdownAnchor => ({
  round: block.number,
  endMs: attempt.consumableAfter * 1000,
  blockMs: block.timestamp * 1000
})

/**
 * How the attempt `target` stands in a reading: open while the reading holds
 * that attempt as waiting; gone otherwise, with its ending where the reading
 * holds the ending of that attempt. Another attempt open is not this one.
 */
export const standingOf = (reading: WatcherReading, target: bigint): AttemptStanding => {
  if (reading.attempt?.attemptId === target) {
    return { kind: 'open', attempt: reading.attempt, dormant: reading.dormant }
  }
  return reading.ended?.attemptId === target
    ? { kind: 'gone', ending: reading.ended }
    : { kind: 'gone' }
}

/**
 * The attempt read after a reverted cancel: still running, or how it had
 * ended and, after an execution, the account's controller. Undefined where the
 * reading cannot tell yet: an ending whose road is not read, or an attempt
 * that is simply gone.
 */
export const attemptAfterOf = (
  reading: WatcherReading,
  target: bigint
): AttemptAfterCancel | undefined => {
  const standing = standingOf(reading, target)
  if (standing.kind === 'open') {
    return { ended: ATTEMPT_STILL_RUNNING }
  }
  const { ending } = standing
  if (ending?.road === 'executed') {
    return { ended: 'executed', ...(ending.controller ? { controller: ending.controller } : {}) }
  }
  return ending?.cancelledBy ? { ended: ending.cancelledBy } : undefined
}
