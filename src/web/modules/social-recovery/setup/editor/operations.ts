/**
 * The editor's operations over a path's clauses. Each one is pure: it returns
 * new clauses and never mutates its input, and a credential it moves keeps
 * its object.
 *
 * A required row is a clause of threshold one over one credential; every other
 * clause is a group, an empty group included. An empty slot is a credential
 * whose method is the zero address, whose config is empty and whose label is
 * its kind; it stands for a method the holder has yet to enroll.
 */
import { decodeAbiParameters, isAddressEqual } from 'viem'

import type {
  Address,
  Clause,
  Credential,
  SetupDraft,
  ValidationResult
} from '@web/modules/social-recovery/sdk-interfaces'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import type { Enrollment, SlotKind } from '@web/modules/social-recovery/shared/records'
import { isEmptySlot, SLOT_KINDS, slotKindOf } from '@web/modules/social-recovery/shared/records'

import type { ClauseRole, EditResult, PickerEntry, PickerTarget, SlotPosition } from './types'

/** The kinds in the order the picker lists them. */
export const PICKER_KINDS: readonly SlotKind[] = ['passkey', 'ecdsa', 'zkpassport', 'aadhaar']

/**
 * The kinds a second method can be: a passkey from another device, or a key the
 * holder keeps, a hardware key among them, entered as a guardian address.
 */
export const SECOND_METHOD_KINDS: readonly SlotKind[] = ['passkey', 'ecdsa']

/** The threshold a new group starts with, two of its members. */
export const NEW_GROUP_THRESHOLD = 2

const DUPLICATE: EditResult = { status: 'refused', reason: 'duplicate' }

export { emptySlot as emptySlotOf, isEmptySlot } from '@web/modules/social-recovery/shared/records'

/** The kind of method a method module address serves; a module the address book does not hold has none. */
export const methodKindOf = (method: Address, addressBook: AddressBook): SlotKind | undefined =>
  SLOT_KINDS.find((kind) => isAddressEqual(addressBook.methods[kind], method))

/**
 * The kind of a credential: the kind an empty slot waits for, or the address
 * book's method an enrolled credential's method is. A method the address book
 * does not hold has no kind.
 */
export const kindOf = (credential: Credential, addressBook: AddressBook): SlotKind | undefined =>
  isEmptySlot(credential) ? slotKindOf(credential) : methodKindOf(credential.method, addressBook)

/** The address a guardian's config holds, ABI-encoded in one word. */
export const guardianAddressOf = (credential: Credential): Address | undefined => {
  // A stored config is read from storage, so one the codec did not write holds no address.
  try {
    return decodeAbiParameters([{ type: 'address' }], credential.config)[0]
  } catch {
    return undefined
  }
}

/**
 * Two credentials are one enrolled method when their method addresses and
 * their config bytes match. An empty slot is never the same as anything.
 */
export const sameCredential = (a: Credential, b: Credential): boolean =>
  !isEmptySlot(a) &&
  !isEmptySlot(b) &&
  isAddressEqual(a.method, b.method) &&
  a.config.toLowerCase() === b.config.toLowerCase()

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

/**
 * The role a stored clause reads as: a threshold of one over one credential is
 * a required row, anything else a group.
 */
export const roleOf = (clause: Clause): ClauseRole =>
  clause.threshold === 1 && clause.credentials.length === 1 ? 'required' : 'group'

export const rolesOf = (clauses: readonly Clause[]): ClauseRole[] => clauses.map(roleOf)

/** The roles once one clause is removed. */
export const withoutRole = (roles: readonly ClauseRole[], index: number): ClauseRole[] =>
  roles.filter((_, i) => i !== index)

/** How many methods the path holds, empty slots counted. */
export const methodCountOf = (clauses: readonly Clause[]): number =>
  clauses.reduce((sum, clause) => sum + clause.credentials.length, 0)

const replaceAt = (clauses: readonly Clause[], index: number, clause: Clause): Clause[] =>
  clauses.map((held, i) => (i === index ? clause : held))

/** Adds a required row over the credential: an empty slot or an enrolled credential. */
export const addRequired = (clauses: readonly Clause[], credential: Credential): EditResult => {
  if (pathHolds(clauses, credential)) {
    return DUPLICATE
  }
  return {
    status: 'applied',
    clauses: [...clauses, { threshold: 1, credentials: [credential] }],
    at: { clause: clauses.length, member: 0 }
  }
}

/** Removes one clause, a required row or a group with its members. */
export const removeClause = (clauses: readonly Clause[], index: number): Clause[] =>
  clauses.filter((_, i) => i !== index)

/** Adds a group with no member and the starting threshold. */
export const addGroup = (clauses: readonly Clause[]): Clause[] => [
  ...clauses,
  { threshold: NEW_GROUP_THRESHOLD, credentials: [] }
]

/** Adds a member to a group: an empty slot or an enrolled credential. */
export const addMember = (
  clauses: readonly Clause[],
  group: number,
  credential: Credential
): EditResult => {
  if (pathHolds(clauses, credential)) {
    return DUPLICATE
  }
  const { threshold, credentials } = clauses[group]
  return {
    status: 'applied',
    clauses: replaceAt(clauses, group, { threshold, credentials: [...credentials, credential] }),
    at: { clause: group, member: credentials.length }
  }
}

/** Removes one member; a group that loses its last member stays until it is removed. */
export const removeMember = (
  clauses: readonly Clause[],
  group: number,
  member: number
): Clause[] => {
  const { threshold, credentials } = clauses[group]
  return replaceAt(clauses, group, {
    threshold,
    credentials: credentials.filter((_, i) => i !== member)
  })
}

/** Sets a clause's threshold to any integer; the editor's refusals judge its bounds. */
export const setThreshold = (
  clauses: readonly Clause[],
  group: number,
  threshold: number
): Clause[] => replaceAt(clauses, group, { threshold, credentials: clauses[group].credentials })

/** Puts a credential into one position, an empty slot the enroll screen or the picker fills. */
export const fillSlot = (
  clauses: readonly Clause[],
  at: SlotPosition,
  credential: Credential
): EditResult => {
  if (pathHolds(clauses, credential, at)) {
    return DUPLICATE
  }
  const { threshold, credentials } = clauses[at.clause]
  return {
    status: 'applied',
    clauses: replaceAt(clauses, at.clause, {
      threshold,
      credentials: credentials.map((held, i) => (i === at.member ? credential : held))
    }),
    at
  }
}

/** A required row's credential joins a group, and the row goes. */
export const moveToGroup = (clauses: readonly Clause[], row: number, group: number): EditResult => {
  const [credential] = clauses[row].credentials
  if (pathHolds(clauses, credential, { clause: row, member: 0 })) {
    return DUPLICATE
  }
  const { threshold, credentials } = clauses[group]
  const joined = replaceAt(clauses, group, { threshold, credentials: [...credentials, credential] })
  return {
    status: 'applied',
    clauses: removeClause(joined, row),
    at: { clause: group > row ? group - 1 : group, member: credentials.length }
  }
}

/** A member leaves its group and becomes a required row. */
export const makeRequired = (
  clauses: readonly Clause[],
  group: number,
  member: number
): EditResult => {
  const credential = clauses[group].credentials[member]
  if (pathHolds(clauses, credential, { clause: group, member })) {
    return DUPLICATE
  }
  return {
    status: 'applied',
    clauses: [...removeMember(clauses, group, member), { threshold: 1, credentials: [credential] }],
    at: { clause: clauses.length, member: 0 }
  }
}

/**
 * The required rows become one group any one of whose members recovers, the
 * shape this wallet prefers at two methods. The group takes the first row's
 * place. The roles say which clauses are rows; without them a clause reads as
 * its stored shape.
 */
export const makeItAGroup = (
  clauses: readonly Clause[],
  roles: readonly ClauseRole[] = rolesOf(clauses)
): Clause[] => {
  const first = roles.indexOf('required')
  if (first < 0) {
    return [...clauses]
  }
  const group: Clause = {
    threshold: 1,
    credentials: clauses.flatMap((clause, i) => (roles[i] === 'required' ? clause.credentials : []))
  }
  return clauses.flatMap((clause, i) => {
    if (i === first) {
      return [group]
    }
    return roles[i] === 'required' ? [] : [clause]
  })
}

/** The roles once the required rows became one group in the first row's place. */
export const makeItAGroupRoles = (roles: readonly ClauseRole[]): ClauseRole[] => {
  const first = roles.indexOf('required')
  return roles.flatMap<ClauseRole>((role, i) => {
    if (i === first) {
      return ['group']
    }
    return role === 'required' ? [] : [role]
  })
}

/**
 * A second method joins the path's one method as a group any one of whose two
 * members recovers, in one edit. The group takes the one method's place; a
 * path with no method yet takes the credential as a required row.
 */
export const addSecondMethod = (clauses: readonly Clause[], credential: Credential): EditResult => {
  if (pathHolds(clauses, credential)) {
    return DUPLICATE
  }
  const index = clauses.findIndex((clause) => clause.credentials.length > 0)
  if (index < 0) {
    return addRequired(clauses, credential)
  }
  const { credentials } = clauses[index]
  return {
    status: 'applied',
    clauses: replaceAt(clauses, index, { threshold: 1, credentials: [...credentials, credential] }),
    at: { clause: index, member: credentials.length }
  }
}

/** Places a picked credential where the picker was opened for. */
export const placeAt = (
  clauses: readonly Clause[],
  target: PickerTarget,
  credential: Credential
): EditResult => {
  if (target.place === 'required') {
    return addRequired(clauses, credential)
  }
  if (target.place === 'second') {
    return addSecondMethod(clauses, credential)
  }
  if (target.place === 'member') {
    return addMember(clauses, target.clause, credential)
  }
  return fillSlot(clauses, { clause: target.clause, member: target.member }, credential)
}

/**
 * The threshold a field's text reads as: a whole number written in digits.
 * Empty text, a fraction, a sign or any other character reads as none.
 */
export const readThreshold = (text: string): number | undefined => {
  if (!/^[0-9]+$/.test(text)) {
    return undefined
  }
  const value = Number(text)
  return Number.isSafeInteger(value) ? value : undefined
}

/**
 * The roles once a credential was placed at a position: a new clause the
 * picker added is a required row, the second method's clause a group, and a
 * clause that took a member keeps its role.
 */
export const placedRoles = (
  roles: readonly ClauseRole[],
  target: PickerTarget,
  at: SlotPosition
): ClauseRole[] => {
  if (at.clause >= roles.length) {
    return [...roles, 'required']
  }
  if (target.place === 'second') {
    return roles.map((role, i) => (i === at.clause ? 'group' : role))
  }
  return [...roles]
}

/** The draft with new clauses, every other field kept. */
export const withClauses = (draft: SetupDraft, clauses: Clause[]): SetupDraft => ({
  ...draft,
  clauses
})

/** The enrolled credentials the picker lists, by kind, each marked where the path holds it. */
export const pickerEntriesOf = (
  enrollments: readonly Enrollment[],
  clauses: readonly Clause[],
  addressBook: AddressBook
): Record<SlotKind, PickerEntry[]> => {
  const entries: Record<SlotKind, PickerEntry[]> = {
    passkey: [],
    ecdsa: [],
    zkpassport: [],
    aadhaar: []
  }
  enrollments.forEach((enrollment) => {
    const kind = kindOf(enrollment.credential, addressBook)
    if (kind) {
      entries[kind].push({ enrollment, inPath: pathHolds(clauses, enrollment.credential) })
    }
  })
  return entries
}

/** The enrollment an enrolled credential came from, when the records hold it. */
export const enrollmentOf = (
  credential: Credential,
  enrollments: readonly Enrollment[]
): Enrollment | undefined =>
  enrollments.find((enrollment) => sameCredential(enrollment.credential, credential))

/** The search string the enroll screen reads: the kind and the slot it fills. */
export const enrollSearchOf = (kind: SlotKind, at: SlotPosition): string =>
  `?${new URLSearchParams({
    kind,
    clause: String(at.clause),
    member: String(at.member)
  }).toString()}`

/** Whether a path check found anything that blocks the next step. Warnings never block. */
export const blocksContinue = (result: ValidationResult): boolean => result.errors.length > 0
