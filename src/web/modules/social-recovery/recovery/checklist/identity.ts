/**
 * What an identity row reads of its claim's last outcome: the note, the line
 * that names a failure's cause, and whether it offers a retry. A passed claim
 * reads nothing here; its row reads collected once the reply is added.
 */
import { noteKeyOfOutcome } from '@web/modules/social-recovery/shared/ceremony'
import type { DismissedOutcome } from '@web/modules/social-recovery/shared/ceremony'

import type { ClaimOutcome, IdentityClaimSlug, IdentityNotes } from './types'

const CEREMONY = 'socialRecovery.ceremony'

const NO_NOTES: IdentityNotes = { note: null, cause: null, retry: false }

/**
 * A failure's cause line, only where a result reached the method's own check
 * and did not pass it: the local check refused the proof, or the material did
 * not match what enrollment recorded. A failure that produced no result reads
 * did not answer on its chip and carries no cause line.
 */
const causeKeyOf = (cause: string): string | null =>
  cause === 'check-rejected' || cause === 'material-rejected' ? `${CEREMONY}.rejectedCause` : null

/**
 * A dismissal's note: the holder stopped the prover or cancelled the phone
 * request, or the passport app declined; any other refusal reads the refused
 * note.
 */
const dismissalNoteOf = (outcome: DismissedOutcome, slug: IdentityClaimSlug): string | null => {
  if (outcome.note === 'cancelled') {
    return `${CEREMONY}.stoppedNote`
  }
  if (slug === 'zkpassport') {
    return `${CEREMONY}.declinedNote`
  }
  return noteKeyOfOutcome(outcome, 'createClaim')
}

export const identityNotesOf = (
  held: ClaimOutcome | undefined,
  slug: IdentityClaimSlug
): IdentityNotes => {
  if (!held) {
    return NO_NOTES
  }
  const { outcome } = held
  if (outcome.kind === 'dismissed') {
    return {
      note: dismissalNoteOf(outcome, slug),
      cause: null,
      retry: true
    }
  }
  if (outcome.verdict === 'passed') {
    return NO_NOTES
  }
  return {
    note: noteKeyOfOutcome(outcome, 'createClaim'),
    cause: outcome.verdict === 'failed' ? causeKeyOf(outcome.cause) : null,
    retry: outcome.retry === true
  }
}
