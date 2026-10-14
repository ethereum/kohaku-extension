/**
 * The checklist's rows from the gathering's places and the path's clauses:
 * which clause each place stands in, the headline that counts a group as one
 * unit, each row's chip and the unlock line by the path's shape. Pure.
 */
import { decodeAbiParameters } from 'viem'

import type {
  Assessment,
  Configuration,
  Gathering,
  Hex
} from '@web/modules/social-recovery/sdk-interfaces'
import type { CeremonyOutcome } from '@web/modules/social-recovery/shared/ceremony'
import { sameAddress } from '@web/modules/social-recovery/shared/client'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import type { RowNotes } from '@web/modules/social-recovery/shared/records'
import { kindOf } from '@web/modules/social-recovery/setup/review'

import type {
  ChecklistHeadline,
  ChecklistKitClient,
  ChecklistLayout,
  ChecklistRow,
  RowState,
  RowStateExtras,
  UnlockLineKey,
  UnsatisfiedReading
} from './types'

/** The passkey config's layout: the point's x and y, then the relying-party hash. */
const PASSKEY_CONFIG = [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }] as const

/** A clause asks something when its threshold is one or more and it has a member. */
const asksSomething = (threshold: number, members: number): boolean => threshold >= 1 && members > 0

/**
 * The rows of a gathering under the path's clauses. Places are numbered in
 * body order across every clause, so the n-th credential of the path is place
 * n. A clause with one member is a required row; a clause of more is a group,
 * every member shown. A clause that asks nothing (no member, or a threshold of
 * zero) draws no row. Null where the places do not match the clauses: the
 * configuration is not the one the gathering was made under.
 */
export const layoutOf = (
  configuration: Configuration,
  gathering: Pick<Gathering, 'places'>,
  book: AddressBook
): ChecklistLayout | null => {
  const flat = configuration.clauses.flatMap((clause, index) =>
    clause.credentials.map((credential) => ({ clause: index, credential }))
  )
  if (flat.length !== gathering.places.length) {
    return null
  }
  const rows: ChecklistRow[] = []
  // eslint-disable-next-line no-restricted-syntax
  for (const place of gathering.places) {
    const at = flat[place.place]
    if (!at || !sameAddress(at.credential.method, place.method)) {
      return null
    }
    rows.push({
      place: place.place,
      clause: at.clause,
      kind: kindOf(place, book),
      gatheringPlace: place
    })
  }
  const layout: ChecklistLayout = { required: [], groups: [] }
  configuration.clauses.forEach((clause, index) => {
    if (!asksSomething(clause.threshold, clause.credentials.length)) {
      return
    }
    const members = rows.filter((row) => row.clause === index).sort((a, b) => a.place - b.place)
    if (clause.credentials.length === 1) {
      layout.required.push(...members)
    } else {
      layout.groups.push({
        clause: index,
        number: layout.groups.length + 1,
        threshold: clause.threshold,
        rows: members
      })
    }
  })
  return layout
}

/** The clauses the layout draws, each one unit of the headline. */
const unitsOf = (layout: ChecklistLayout): number[] => [
  ...layout.required.map((row) => row.clause),
  ...layout.groups.map((group) => group.clause)
]

/** How many members of a clause the assessment counts filled. */
export const filledIn = (assessment: Assessment, clause: number): number =>
  assessment.clauses.find((entry) => entry.clause === clause)?.filled ?? 0

/** Whether the assessment counts a clause complete. */
export const clauseComplete = (assessment: Assessment, clause: number): boolean => {
  const entry = assessment.clauses.find((candidate) => candidate.clause === clause)
  return !!entry && entry.filled >= entry.threshold
}

/** The headline: the required rows and the groups complete, against how many the path holds. */
export const headlineOf = (layout: ChecklistLayout, assessment: Assessment): ChecklistHeadline => {
  const units = unitsOf(layout)
  return {
    done: units.filter((clause) => clauseComplete(assessment, clause)).length,
    total: units.length
  }
}

/**
 * The headline straight from an assessment, for a surface that holds no
 * configuration: every clause that asks something is one unit, as on the
 * checklist. A clause whose threshold the assessment reports at one or more
 * has a member, since a memberless clause at such a threshold never commits.
 */
export const headlineOfAssessment = (assessment: Assessment): ChecklistHeadline => {
  const units = assessment.clauses.filter((entry) => asksSomething(entry.threshold, 1))
  return {
    done: units.filter((entry) => entry.filled >= entry.threshold).length,
    total: units.length
  }
}

/**
 * This release asks a passkey and a guardian; an identity row, or a method it
 * does not know, it asks nothing.
 */
export const isAsked = (row: ChecklistRow): boolean =>
  row.kind === 'passkey' || row.kind === 'ecdsa'

/**
 * One row's state. A reply completes it, unless the rule is satisfied and the
 * submission the client builds leaves it out: then it is not needed, as every
 * row outside the smallest set is, whether or not it holds a reply. Once its
 * clause is complete, or the rule is satisfied, a row still open is not
 * needed. An open row whose method did not answer this time reads so; else it
 * reads its note where it has one, waits while this tab has asked it, and
 * otherwise reads not asked, as every row this release does not ask does.
 */
export const rowStateOf = (
  row: ChecklistRow,
  assessment: Assessment,
  notes: RowNotes | undefined,
  asked: ReadonlySet<number>,
  extras: RowStateExtras = {}
): RowState => {
  const replied = assessment.filled.includes(row.place)
  if (replied) {
    const dropped = assessment.ruleSatisfied && !!extras.chosen && !extras.chosen.has(row.place)
    return { chip: dropped ? 'notNeeded' : 'complete', replied }
  }
  if (assessment.ruleSatisfied || clauseComplete(assessment, row.clause)) {
    return { chip: 'notNeeded', replied }
  }
  if (!isAsked(row)) {
    return { chip: 'notAsked', replied }
  }
  if (extras.didNotAnswer?.has(row.place)) {
    return { chip: 'didNotAnswer', replied }
  }
  const note = notes?.[row.place]
  if (note) {
    return { chip: note, replied, note }
  }
  return { chip: asked.has(row.place) ? 'waiting' : 'notAsked', replied }
}

/** Every row of the layout, the required rows first. */
const rowsOf = (layout: ChecklistLayout): ChecklistRow[] => [
  ...layout.required,
  ...layout.groups.flatMap((group) => group.rows)
]

/** Every row's state by place. */
export const rowStatesOf = (
  layout: ChecklistLayout,
  assessment: Assessment,
  notes: RowNotes | undefined,
  asked: ReadonlySet<number>,
  extras: RowStateExtras = {}
): Map<number, RowState> =>
  new Map(
    rowsOf(layout).map((row) => [row.place, rowStateOf(row, assessment, notes, asked, extras)])
  )

/**
 * The places the submission carries once the rule is satisfied, as the
 * client's own builder picks them, or undefined where the rule is not
 * satisfied or the client builds no submission here. The pick reads no chain.
 */
export const chosenPlacesOf = (
  kit: Pick<ChecklistKitClient, 'recovery'>,
  gathering: Gathering,
  assessment: Assessment,
  nowSeconds: number
): ReadonlySet<number> | undefined => {
  if (!assessment.ruleSatisfied) {
    return undefined
  }
  try {
    const built = kit.recovery.complete(gathering, undefined, nowSeconds)
    return new Set(built.proofs.map((proof) => Number(proof.place)))
  } catch {
    return undefined
  }
}

/**
 * Whether a claim's outcome says its method did not answer this time: the
 * device or the hand-off could not be reached, or the ceremony failed. A reply
 * the client refused is an answer, not a silence.
 */
export const methodDidNotAnswer = (outcome: CeremonyOutcome<unknown>): boolean => {
  if (outcome.kind !== 'verdict') {
    return false
  }
  if (outcome.verdict === 'unavailable') {
    return true
  }
  return outcome.verdict === 'failed' && outcome.cause !== 'check-rejected'
}

/**
 * Why the path is not satisfied, named from its own rows: a required row
 * whose method did not answer this time, a group whose rows still open cannot
 * reach its threshold, a guardian row still open, or else rows outstanding.
 * Null once the rule is satisfied.
 */
export const unsatisfiedOf = (
  layout: ChecklistLayout,
  assessment: Assessment,
  states: ReadonlyMap<number, RowState>
): UnsatisfiedReading | null => {
  if (assessment.ruleSatisfied) {
    return null
  }
  const silent = layout.required
    .filter((row) => states.get(row.place)?.chip === 'didNotAnswer')
    .map((row) => row.place)
  if (silent.length > 0) {
    return { kind: 'didNotAnswer', places: silent }
  }
  const short = layout.groups
    .filter((group) => {
      if (clauseComplete(assessment, group.clause)) {
        return false
      }
      const reachable = group.rows.filter((row) => {
        const state = states.get(row.place)
        return !!state && (state.replied || (!state.note && isAsked(row)))
      }).length
      return reachable < group.threshold
    })
    .map((group) => group.clause)
  if (short.length > 0) {
    return { kind: 'groupCannotReach', clauses: short }
  }
  const guardianOpen = rowsOf(layout).some((row) => {
    const state = states.get(row.place)
    return row.kind === 'ecdsa' && !!state && !state.replied && state.chip !== 'notNeeded'
  })
  return guardianOpen ? { kind: 'guardianOpen' } : { kind: 'needsMore' }
}

/**
 * The unlock line by the path's shape: required rows and groups, required
 * rows only, or groups only.
 */
export const unlockLineKeyOf = (layout: ChecklistLayout): UnlockLineKey => {
  if (layout.groups.length === 0) {
    return 'socialRecovery.checklist.continueUnlockRequiredOnly'
  }
  if (layout.required.length === 0) {
    return 'socialRecovery.checklist.continueUnlockGroupsOnly'
  }
  return 'socialRecovery.checklist.continueUnlock'
}

/**
 * Whether a claim found no passkey to answer with on this device: the device
 * did not answer, the authenticator could not meet the request, or the
 * browser closed the prompt with `NotAllowedError`, the way it reports a
 * device that holds no passkey for this site. An abort, a refusal by the
 * page's focus or policy, and every failure of the check are not.
 */
export const deviceHoldsNoPasskey = (outcome: CeremonyOutcome<unknown>): boolean => {
  if (outcome.kind === 'dismissed') {
    if (outcome.note === 'cancelled') {
      return outcome.detail === 'NotAllowedError'
    }
    return outcome.detail === 'InvalidStateError' || outcome.detail === 'NotSupportedError'
  }
  return outcome.verdict === 'unavailable' && outcome.cause === 'device-unavailable'
}

/**
 * Whether a passkey place answers from this page: its config commits the
 * relying-party hash of this page's origin. A config that does not decode
 * commits no hash this page has.
 */
export const passkeyAnswersHere = (config: Hex, rpIdHash: Hex): boolean => {
  try {
    const [, , committed] = decodeAbiParameters(PASSKEY_CONFIG, config)
    return committed.toLowerCase() === rpIdHash.toLowerCase()
  } catch {
    return false
  }
}
