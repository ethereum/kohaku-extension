/**
 * The editor's operations over a path's clauses. Each one is pure: it returns
 * new clauses and never mutates its input, and a credential it moves keeps
 * its object.
 *
 * A required row is a clause of threshold one over one credential; every other
 * clause is a group, an empty group included. A group's threshold follows the
 * suggestion for its members as they join until the holder sets it; one flag
 * per clause, aligned with the clauses the way the roles are, says which
 * thresholds the holder set. An empty slot is a credential
 * whose method is the zero address, whose config is empty and whose label is
 * its kind; it stands for a method the holder has yet to enroll.
 */
import { decodeAbiParameters, isAddressEqual, zeroAddress } from 'viem'

import type {
  Address,
  Clause,
  Credential,
  Finding,
  ValidationResult
} from '@kohaku-eth/social-recovery'
import { credentialKindIn, methodKindIn } from '@web/modules/social-recovery/shared/client'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import type { SetupDraftRecord, SlotKind } from '@web/modules/social-recovery/shared/records'
import { isEmptySlot, pathHolds } from '@web/modules/social-recovery/shared/records'

import type { AddTarget, ClauseRole, EditorFill, EditResult, SlotPosition } from './types'

/** The kinds in the order an add menu lists them. */
export const ADD_KINDS: readonly SlotKind[] = ['passkey', 'ecdsa', 'zkpassport', 'aadhaar']

/**
 * The kinds a second method can be: a passkey from another device, or a key the
 * holder keeps, a hardware key among them, entered as a guardian address.
 */
export const SECOND_METHOD_KINDS: readonly SlotKind[] = ['passkey', 'ecdsa']

/**
 * The threshold a group of `count` members is suggested: any one of one or
 * two members, two from three members on.
 */
export const suggestedThresholdOf = (count: number): number => (count >= 3 ? 2 : 1)

const DUPLICATE: EditResult = { status: 'refused', reason: 'duplicate' }

export { emptySlot as emptySlotOf, isEmptySlot } from '@web/modules/social-recovery/shared/records'

/**
 * The kind of method a method module address serves; a module the address
 * book does not hold has none, and the zero address a deployment leaves for a
 * method it omits is no module.
 */
export const methodKindOf = (method: Address, addressBook: AddressBook): SlotKind | undefined =>
  methodKindIn(addressBook.methods, method)

/** Whether the network's deployment ships the kind's method: one it omits is the zero address. */
export const isKindOnNetwork = (kind: SlotKind, addressBook: AddressBook): boolean =>
  !isAddressEqual(addressBook.methods[kind], zeroAddress)

/**
 * The kind of a credential: the kind an empty slot waits for, or the address
 * book's method an enrolled credential's method is. A method the address book
 * does not hold has no kind.
 */
export const kindOf = (credential: Credential, addressBook: AddressBook): SlotKind | undefined =>
  credentialKindIn(credential, addressBook.methods)

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
 * The role a stored clause reads as: a threshold of one over one credential is
 * a required row, anything else a group. The shape alone cannot tell a required
 * row from a one-of-one group with an unfilled slot, so a caller that holds the
 * roles passes them, and this guess serves only a stored draft read without
 * its roles.
 */
export const roleOf = (clause: Clause): ClauseRole =>
  clause.threshold === 1 && clause.credentials.length === 1 ? 'required' : 'group'

export const rolesOf = (clauses: readonly Clause[]): ClauseRole[] => clauses.map(roleOf)

/** The roles once one clause is removed. */
export const withoutRole = (roles: readonly ClauseRole[], index: number): ClauseRole[] =>
  roles.filter((_, i) => i !== index)

/** Which thresholds of a draft the holder set; a draft with no flags for its clauses has none set. */
export const thresholdsSetOf = (draft: SetupDraftRecord): boolean[] =>
  draft.thresholdsSet?.length === draft.clauses.length
    ? [...draft.thresholdsSet]
    : draft.clauses.map(() => false)

/** The threshold flags once one clause is removed. */
export const withoutThresholdSet = (flags: readonly boolean[], index: number): boolean[] =>
  flags.filter((_, i) => i !== index)

/** The threshold flags once the holder set one clause's threshold. */
export const withThresholdSet = (flags: readonly boolean[], index: number): boolean[] =>
  flags.map((flag, i) => i === index || flag)

/** The threshold flags once a clause was added at the end, its threshold a suggestion. */
export const withNewClause = (flags: readonly boolean[]): boolean[] => [...flags, false]

/** How many methods the path holds, empty slots counted. */
export const methodCountOf = (clauses: readonly Clause[]): number =>
  clauses.reduce((sum, clause) => sum + clause.credentials.length, 0)

/** How far the path's slots are filled: no method, a slot still empty, or every slot enrolled. */
export const fillOf = (clauses: readonly Clause[]): EditorFill => {
  if (methodCountOf(clauses) === 0) {
    return 'empty'
  }
  return clauses.some((clause) => clause.credentials.some((credential) => isEmptySlot(credential)))
    ? 'open'
    : 'filled'
}

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

/** Adds a group with no member and the threshold suggested for none. */
export const addGroup = (clauses: readonly Clause[]): Clause[] => [
  ...clauses,
  { threshold: suggestedThresholdOf(0), credentials: [] }
]

/**
 * Adds a member to a group: an empty slot or an enrolled credential. A
 * threshold the holder did not set follows the suggestion for the members
 * after; a threshold the holder set is kept.
 */
export const addMember = (
  clauses: readonly Clause[],
  group: number,
  credential: Credential,
  thresholdSet = false
): EditResult => {
  if (pathHolds(clauses, credential)) {
    return DUPLICATE
  }
  const { threshold, credentials } = clauses[group]
  const next = thresholdSet ? threshold : suggestedThresholdOf(credentials.length + 1)
  return {
    status: 'applied',
    clauses: replaceAt(clauses, group, {
      threshold: next,
      credentials: [...credentials, credential]
    }),
    at: { clause: group, member: credentials.length }
  }
}

/**
 * Removes one member, the threshold kept; a group that loses its last member
 * stays until it is removed.
 */
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

/**
 * The holder's Remove: removes one member, and a threshold the removal leaves
 * above the members comes down to their count, never below one. A threshold
 * within the members is kept.
 */
export const removeMemberToFit = (
  clauses: readonly Clause[],
  group: number,
  member: number
): Clause[] => {
  const removed = removeMember(clauses, group, member)
  const { threshold, credentials } = removed[group]
  if (threshold <= credentials.length) {
    return removed
  }
  return replaceAt(removed, group, { threshold: Math.max(1, credentials.length), credentials })
}

/** Sets a clause's threshold to any integer; the editor's refusals judge its bounds. */
export const setThreshold = (
  clauses: readonly Clause[],
  group: number,
  threshold: number
): Clause[] => replaceAt(clauses, group, { threshold, credentials: clauses[group].credentials })

/** Puts a credential into one position, an empty slot the enroll screen fills or one of another kind. */
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

/**
 * A required row's credential joins a group, and the row goes. The group's
 * threshold follows the suggestion for its members after, as an added member's
 * does, unless the holder set it.
 */
export const moveToGroup = (
  clauses: readonly Clause[],
  row: number,
  group: number,
  thresholdSet = false
): EditResult => {
  const [credential] = clauses[row].credentials
  if (pathHolds(clauses, credential, { clause: row, member: 0 })) {
    return DUPLICATE
  }
  const { threshold, credentials } = clauses[group]
  const joined = replaceAt(clauses, group, {
    threshold: thresholdSet ? threshold : suggestedThresholdOf(credentials.length + 1),
    credentials: [...credentials, credential]
  })
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
 * The required rows become one group any one of whose members recovers. The
 * group takes the first row's place. The roles say which clauses are rows;
 * without them a clause reads as its stored shape.
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

/**
 * Whether the path reads as two required rows and no group by its stored
 * shape, the size at which one group of any one of the two is offered instead.
 * A clause with no member asks nothing yet, so it is left out.
 */
export const offersMakeItAGroup = (clauses: readonly Clause[]): boolean => {
  const filled = clauses.filter((clause) => clause.credentials.length > 0)
  return filled.length === 2 && filled.every((clause) => clause.credentials.length === 1)
}

/** The threshold flags once the required rows became one group in the first row's place, its threshold a suggestion. */
export const makeItAGroupThresholdsSet = (
  flags: readonly boolean[],
  roles: readonly ClauseRole[]
): boolean[] => {
  const first = roles.indexOf('required')
  return flags.flatMap((flag, i) => {
    if (i === first) {
      return [false]
    }
    return roles[i] === 'required' ? [] : [flag]
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

/** Places a credential where the add menu was opened for. */
export const placeAt = (
  clauses: readonly Clause[],
  target: AddTarget,
  credential: Credential,
  thresholdsSet: readonly boolean[] = []
): EditResult => {
  if (target.place === 'required') {
    return addRequired(clauses, credential)
  }
  if (target.place === 'second') {
    return addSecondMethod(clauses, credential)
  }
  if (target.place === 'member') {
    return addMember(clauses, target.clause, credential, thresholdsSet[target.clause] ?? false)
  }
  return fillSlot(clauses, { clause: target.clause, member: target.member }, credential)
}

/** Whether two add menus are one: the same place, and the same group or slot where the place names one. */
export const sameAddTarget = (a: AddTarget, b: AddTarget): boolean => {
  if (a.place === 'member' && b.place === 'member') {
    return a.clause === b.clause
  }
  if (a.place === 'slot' && b.place === 'slot') {
    return a.clause === b.clause && a.member === b.member
  }
  return a.place === b.place && a.place !== 'member' && a.place !== 'slot'
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
 * The roles once a credential was placed at a position: a new clause an
 * add menu made is a required row, the second method's clause a group, and a
 * clause that took a member keeps its role.
 */
export const placedRoles = (
  roles: readonly ClauseRole[],
  target: AddTarget,
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

/**
 * The threshold flags once a credential was placed at a position: a new
 * clause and the second method's clause take a suggested threshold, and a
 * clause that took a member keeps its flag.
 */
export const placedThresholdsSet = (
  flags: readonly boolean[],
  target: AddTarget,
  at: SlotPosition
): boolean[] => {
  if (at.clause >= flags.length) {
    return withNewClause(flags)
  }
  if (target.place === 'second') {
    return flags.map((flag, i) => (i === at.clause ? false : flag))
  }
  return [...flags]
}

/** The draft with new clauses and their threshold flags, every other field kept. */
export const withClauses = (
  draft: SetupDraftRecord,
  clauses: Clause[],
  thresholdsSet: readonly boolean[]
): SetupDraftRecord => ({
  ...draft,
  clauses,
  thresholdsSet
})

/** The search string the enroll screen reads: the kind and the slot it fills. */
export const enrollSearchOf = (kind: SlotKind, at: SlotPosition): string =>
  `?${new URLSearchParams({
    kind,
    clause: String(at.clause),
    member: String(at.member)
  }).toString()}`

/**
 * The errors of a path check the editor answers for. A wait finding belongs to
 * the waiting period step, which refuses the wait in its own words, so the
 * editor leaves it there.
 */
export const editorErrorsOf = (result: ValidationResult): Finding[] =>
  result.errors.filter((finding) => !finding.code.startsWith('wait.'))

/** Whether a path check found anything that blocks the next step. Warnings never block. */
export const blocksContinue = (result: ValidationResult): boolean =>
  editorErrorsOf(result).length > 0
