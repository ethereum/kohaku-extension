/**
 * What an outcome leaves on a row. The stored test verdict selects the chip
 * and the row's lasting line; the outcome that just arrived adds its note,
 * which a reload drops. A dismissal leaves the stored verdict as it was.
 */
import { noteKeyOfOutcome } from '@web/modules/social-recovery/shared/ceremony'
import type { CeremonyOutcome } from '@web/modules/social-recovery/shared/ceremony'
import type { Enrollment, EnrollmentTestVerdict } from '@web/modules/social-recovery/shared/records'

import type { TestChips } from './types'

const CEREMONY = 'socialRecovery.ceremony'

/** The chip each stored test verdict reads as. */
export const TEST_CHIPS: TestChips = {
  passed: 'tested',
  'not-tested': 'notTested',
  failed: 'testFailed',
  unavailable: 'testUnavailable',
  'not-supported': 'notSupported'
}

/** The stored verdict a test outcome reads as, or null for a dismissal. */
export const testVerdictOf = (outcome: CeremonyOutcome<unknown>): EnrollmentTestVerdict | null => {
  if (outcome.kind === 'dismissed') {
    return null
  }
  switch (outcome.verdict) {
    case 'passed':
      return 'passed'
    case 'failed':
      return 'failed'
    case 'unavailable':
      return 'unavailable'
    case 'notSupported':
    default:
      return 'not-supported'
  }
}

/** The cause a test that did not pass reported, with its detail where it carried one. */
export const causeOf = (outcome: CeremonyOutcome<unknown>): string | undefined => {
  if (outcome.kind === 'dismissed' || outcome.verdict === 'passed') {
    return undefined
  }
  if (outcome.verdict === 'notSupported') {
    return outcome.cause
  }
  return outcome.detail ? `${outcome.cause}: ${outcome.detail}` : outcome.cause
}

/**
 * The line a stored verdict reads under the chip: the passed line the row
 * names, a failed check that did not match, any other failure, the check that
 * could not run, the method that cannot serve, and for a skipped test the
 * line that an untested method may fail on the day.
 */
export const testLineKeyOf = (
  enrollment: Enrollment,
  skipped: boolean,
  passedKey: string
): string | null => {
  switch (enrollment.test) {
    case 'passed':
      return passedKey
    case 'failed':
      return enrollment.cause?.startsWith('check-rejected')
        ? `${CEREMONY}.testFailedNoMatch`
        : `${CEREMONY}.testFailedLine`
    case 'unavailable':
      return `${CEREMONY}.testUnavailableLine`
    case 'not-supported':
      return `${CEREMONY}.notSupportedLine`
    case 'not-tested':
    default:
      return skipped ? `${CEREMONY}.notTestedLine` : null
  }
}

/**
 * The note a test outcome adds beside the stored verdict's line: a dismissal,
 * an unreachable phone, a credential of another origin. A passed or a
 * not-supported test adds none, and a note the line already reads is not
 * repeated.
 */
export const testNoteKeysOf = (
  outcome: CeremonyOutcome<unknown>,
  lineKey: string | null
): string[] => {
  const note = noteKeyOfOutcome(outcome, 'testAccess')
  if (!note || note === lineKey) {
    return []
  }
  if (note === `${CEREMONY}.passedNote` || note === `${CEREMONY}.notSupportedNote`) {
    return []
  }
  return [note]
}
