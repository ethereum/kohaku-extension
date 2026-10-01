/**
 * The slot the screen fills. The slot must wait for the kind the search names,
 * or hold the credential this screen already placed there, which a reload
 * after the enrollment finds.
 */
import type { Clause, Credential, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import { sameAddress } from '@web/modules/social-recovery/shared/client'
import { isEmptySlot, slotKindOf } from '@web/modules/social-recovery/shared/records'
import type { Enrollment, SlotKind } from '@web/modules/social-recovery/shared/records'

import type { SlotPosition, SlotState } from './types'

/** Two enrolled credentials are one where their method and config match. An empty slot matches nothing. */
export const sameCredential = (a: Credential, b: Credential): boolean =>
  !isEmptySlot(a) &&
  !isEmptySlot(b) &&
  sameAddress(a.method, b.method) &&
  a.config.toLowerCase() === b.config.toLowerCase()

export const enrollmentOf = (
  enrollments: readonly Enrollment[],
  credential: Credential
): Enrollment | undefined => enrollments.find((e) => sameCredential(e.credential, credential))

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
  const enrollment = enrollmentOf(enrollments, held)
  return enrollment ? { status: 'enrolled', enrollment } : { status: 'nothing' }
}

/** Whether the path holds the credential anywhere but at `at`. */
export const heldElsewhere = (
  clauses: readonly Clause[],
  credential: Credential,
  at: SlotPosition
): boolean =>
  clauses.some((clause, c) =>
    clause.credentials.some(
      (held, m) => !(c === at.clause && m === at.member) && sameCredential(held, credential)
    )
  )

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
