/**
 * The slot the screen fills. The slot must wait for the kind the search names,
 * or hold the credential this screen already placed there, which a reload
 * after the enrollment finds.
 */
import type { Clause, Credential, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import { sameAddress } from '@web/modules/social-recovery/shared/client'
import { enrollmentOf, isEmptySlot, slotKindOf } from '@web/modules/social-recovery/shared/records'
import type { Enrollment, SlotKind } from '@web/modules/social-recovery/shared/records'

import type { SlotPosition, SlotState } from './types'

const credentialAt = (clauses: readonly Clause[], at: SlotPosition): Credential | undefined =>
  clauses[at.clause]?.credentials[at.member]

export const slotStateOf = (
  clauses: readonly Clause[],
  at: SlotPosition,
  kind: SlotKind,
  book: AddressBook,
  enrollments: readonly Enrollment[]
): SlotState => {
  const held = credentialAt(clauses, at)
  if (!held) {
    return { status: 'nothing' }
  }
  if (isEmptySlot(held)) {
    return slotKindOf(held) === kind ? { status: 'empty' } : { status: 'nothing' }
  }
  if (!sameAddress(held.method, book.methods[kind])) {
    return { status: 'nothing' }
  }
  const enrollment = enrollmentOf(held, enrollments)
  return enrollment ? { status: 'enrolled', enrollment } : { status: 'nothing' }
}

/** The draft with the credential at `at`, every other field kept. */
export const withSlotFilled = (
  draft: SetupDraft,
  at: SlotPosition,
  credential: Credential
): SetupDraft => ({
  ...draft,
  clauses: draft.clauses.map((clause, c) =>
    c === at.clause
      ? {
          threshold: clause.threshold,
          credentials: clause.credentials.map((held, m) => (m === at.member ? credential : held))
        }
      : clause
  )
})
