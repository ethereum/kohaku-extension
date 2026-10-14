/**
 * Where the recovery stands after one poll, from the attempt the manager
 * reports, the events that tell its story, the attempt the submission landed
 * and the account's four checks. Pure: every decision takes the poll's own
 * reads and nothing read later.
 */
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import type { Address, Configuration } from '@web/modules/social-recovery/sdk-interfaces'
import { CHECKLIST_SEARCH_KEYS } from '@web/modules/social-recovery/recovery/checklist'

import { isAttemptOf } from './read'
import type {
  AttemptMatch,
  AttemptStory,
  CannotExecuteCause,
  CountdownAnchor,
  LandedAttempt,
  WaitFacts,
  WaitPhase,
  WaitRound
} from './types'

/**
 * Why the recovery can no longer execute, read from the account: it no
 * longer authorizes the action, the action no longer fits it, or a key moved
 * a privilege the handover needs. Null where every check passes.
 */
export const cannotExecuteCauseOf = (facts: WaitFacts): CannotExecuteCause | null => {
  if (!facts.authorized) {
    return 'notAuthorized'
  }
  if (!facts.supported) {
    return 'upgradedAway'
  }
  if (!facts.removedHolds || facts.newKeyHolds) {
    return 'privilegeMoved'
  }
  return null
}

/**
 * Whether the attempt the manager reports is the recovery's own: its id, setup
 * number and payload hash are the landed attempt's. A countdown stored without
 * the landed attempt, or events under its id that name a rival's opening,
 * match nothing. Ours waiting needs its opening event (the payload the
 * execution sends), and ours consumed needs its consume event; without them it
 * cannot be matched. Another attempt under the same id is a rival's and cannot
 * be matched either. Any other attempt, or none, is another.
 */
export const matchOf = (
  facts: WaitFacts,
  story: AttemptStory,
  landed: LandedAttempt | null
): AttemptMatch => {
  const { attempt } = facts
  if (!landed || story.rival) {
    return 'unmatched'
  }
  if (isAttemptOf(attempt, landed)) {
    if (attempt.state === 'Waiting' && !story.started) {
      return 'unmatched'
    }
    if (attempt.state === 'Consumed' && !story.consumed) {
      return 'unmatched'
    }
    return 'ours'
  }
  if (attempt.state !== 'None' && attempt.attemptId === landed.attemptId) {
    return 'unmatched'
  }
  return 'other'
}

/**
 * The phase one poll reads:
 * - an attempt that cannot be matched as the recovery's own: cannot execute,
 *   so nothing is sent for it and nothing is ended;
 * - the recovery's own attempt consumed: executed; cancelled: cancelled, by
 *   the canceller its event names (none where no event names one); waiting:
 *   cannot execute where a check fails, else execution due once its
 *   `consumableAfter` is at or before the pinned block's time, else waiting;
 * - no attempt of its own in the read: its consume event with its opening, or
 *   its cancel event, decides; a consume event with no opening cannot be
 *   matched. With neither, the events missed the attempt's end: every way an
 *   attempt ends emits one of the two, a setup write included (it emits the
 *   cancel), so nothing is ended and nothing is sent until a read names it.
 */
export const phaseOf = (
  facts: WaitFacts,
  story: AttemptStory,
  landed: LandedAttempt | null
): WaitPhase => {
  const { attempt, block } = facts
  const match = matchOf(facts, story, landed)
  if (match === 'unmatched') {
    return { kind: 'cannotExecute', attempt, cause: 'unmatched' }
  }
  if (match === 'ours') {
    if (attempt.state === 'Consumed') {
      return { kind: 'consumed' }
    }
    if (attempt.state === 'Cancelled') {
      return { kind: 'cancelled', by: story.cancelled?.cancelledBy ?? null }
    }
    const cause = cannotExecuteCauseOf(facts)
    if (cause) {
      return { kind: 'cannotExecute', attempt, cause }
    }
    return attempt.consumableAfter <= block.timestamp
      ? { kind: 'executionDue', attempt }
      : { kind: 'waiting', attempt }
  }
  if (story.consumed) {
    return story.started
      ? { kind: 'consumed' }
      : { kind: 'cannotExecute', attempt, cause: 'unmatched' }
  }
  if (story.cancelled) {
    return { kind: 'cancelled', by: story.cancelled.cancelledBy }
  }
  return { kind: 'cannotExecute', attempt, cause: 'unmatched' }
}

/**
 * Whether a poll needs the events beside the attempt read: the landed
 * attempt's opening is not known yet, or the attempt read no longer names that
 * attempt waiting.
 */
export const needsStory = (
  facts: WaitFacts,
  known: AttemptStory | null,
  landed: LandedAttempt
): boolean =>
  !known?.started || facts.attempt.state !== 'Waiting' || !isAttemptOf(facts.attempt, landed)

/**
 * The countdown's anchor from a poll that read a running attempt the recovery
 * can still execute; null for any other phase.
 */
export const anchorOf = (round: WaitRound): CountdownAnchor | null => {
  const { phase, facts } = round
  if (phase.kind !== 'waiting' && phase.kind !== 'executionDue') {
    return null
  }
  return {
    endMs: phase.attempt.consumableAfter * 1000,
    blockMs: facts.block.timestamp * 1000,
    round: round.round
  }
}

/**
 * Whether one approval satisfies the rule, so the same credential can cancel
 * again: the path's only clause with members asks for one of them.
 */
export const thresholdOneOf = (configuration: Configuration): boolean => {
  const clauses = configuration.clauses.filter((clause) => clause.credentials.length > 0)
  return clauses.length === 1 && clauses[0]?.threshold === 1
}

/** The done screen of an account whose recovery executed. */
export const donePathOf = (account: Address): string => {
  const query = new URLSearchParams()
  query.set(CHECKLIST_SEARCH_KEYS.account, account)
  return `/${WEB_ROUTES.socialRecoveryRecoveryDone}?${query.toString()}`
}
