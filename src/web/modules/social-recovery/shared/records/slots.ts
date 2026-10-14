/**
 * The empty slots of a path. A preset loads its shape with every member slot
 * empty: a credential with the zero address as its method, no config, and the
 * kind of method it waits for as its label. Enrolling a method fills the slot
 * with the real credential.
 */
import { isAddressEqual, zeroAddress } from 'viem'

import type { Clause, Credential } from '@web/modules/social-recovery/sdk-interfaces'

import { isStoredAddress } from './guards'
import { SLOT_KINDS } from './types'
import type { Enrollment, SlotKind, SlotPosition } from './types'

/** An empty slot waiting for a method of `kind`. */
export const emptySlot = (kind: SlotKind): Credential => ({
  method: zeroAddress,
  config: '0x',
  label: kind
})

/**
 * A credential with the zero address as its method and no config is a slot,
 * not an enrolled method. A zero-address credential with any config is an
 * ordinary credential.
 */
export const isEmptySlot = (credential: Credential): boolean =>
  credential.method.toLowerCase() === zeroAddress && credential.config === '0x'

/** The kind an empty slot waits for; `undefined` for an enrolled method or a slot of no known kind. */
export const slotKindOf = (credential: Credential): SlotKind | undefined =>
  isEmptySlot(credential) ? SLOT_KINDS.find((kind) => kind === credential.label) : undefined

/**
 * Two credentials are one enrolled method when their method addresses and
 * their config bytes match. An empty slot is never the same as anything, and
 * a method that is no address, as storage can hand back, matches nothing.
 */
export const sameCredential = (a: Credential, b: Credential): boolean =>
  !isEmptySlot(a) &&
  !isEmptySlot(b) &&
  isStoredAddress(a.method) &&
  isStoredAddress(b.method) &&
  isAddressEqual(a.method, b.method) &&
  a.config.toLowerCase() === b.config.toLowerCase()

/** The enrollment an enrolled credential came from, when the records hold it. */
export const enrollmentOf = (
  credential: Credential,
  enrollments: readonly Enrollment[]
): Enrollment | undefined =>
  enrollments.find((enrollment) => sameCredential(enrollment.credential, credential))

/** Whether the path holds this enrolled credential anywhere, leaving out one position. */
export const pathHolds = (
  clauses: readonly Clause[],
  credential: Credential,
  except?: SlotPosition
): boolean =>
  clauses.some((clause, c) =>
    clause.credentials.some(
      (held, m) =>
        !(except && except.clause === c && except.member === m) && sameCredential(held, credential)
    )
  )
