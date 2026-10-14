/**
 * The checklist's dated lines: the request's deadline and the day a row or a
 * session was answered or started, in the reader's own zone.
 */
import type { Gathering } from '@web/modules/social-recovery/sdk-interfaces'
import { renderDateTimeInZone, renderDeadline } from '@web/modules/social-recovery/shared/display'
import type { Translate } from '@web/modules/social-recovery/shared/display'

/** A moment in ms as the date and time a line names, `13 Aug, 18:04 CEST`. */
export const dateOf = (at: number, timeZone: string): string =>
  renderDateTimeInZone(at, timeZone).date

/**
 * The deadline line from the request's own `validUntil`: the date and the
 * time left, then that every approval dies together unless one approval is
 * the whole request; null once the deadline has passed.
 */
export const deadlineLineOf = (
  gathering: Gathering,
  now: number,
  timeZone: string,
  t: Translate,
  oneApproval = false
): string | null => {
  const deadline = Number(gathering.request.validUntil) * 1000
  if (!Number.isFinite(deadline)) {
    return null
  }
  const rendered = renderDeadline({ deadline, now, timeZone }, t)
  if (rendered.passed || rendered.remaining === null) {
    return null
  }
  const line = t('socialRecovery.checklist.deadline.line', {
    date: rendered.date,
    remaining: rendered.remaining
  })
  return oneApproval ? line : `${line} ${t('socialRecovery.checklist.deadline.diesTogether')}`
}

/** When the request was made, ms since epoch: the block it was pinned to. */
export const startedAtOf = (gathering: Gathering): number =>
  Number(gathering.request.block.timestamp) * 1000
