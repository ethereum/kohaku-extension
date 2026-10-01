/**
 * The shapes this wallet refuses to save, judged on the draft as it stands
 * before the SDK's path check runs. An empty slot stands for a method the
 * holder has yet to enroll, and the editor is where members are picked, so a
 * slot with no member never leaves it: a group with an unfilled slot is
 * refused as a member still to enroll, a required row with one as a method
 * still to enroll, and a clause with no enrolled member at all as empty.
 */
import type { Clause, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'
import { isEmptySlot } from '@web/modules/social-recovery/shared/records'

import { methodCountOf, roleOf, rolesOf } from './operations'
import type { ClauseRole, Refusal } from './types'

/** The most a clause's threshold field counts. */
export const THRESHOLD_FIELD_MAX = 255

/** The most members this wallet lets one clause list. */
export const MEMBER_CEILING = 255

/** The waiting period's field is 48 bits wide, so a wait of 2^48 seconds no longer fits. */
// A shift, since the build compiles `**` to `Math.pow`, which throws on a bigint.
// eslint-disable-next-line no-bitwise
export const WAIT_FIELD_LIMIT = 1n << 48n

/**
 * The longest waiting period the setup's picker offers, in hours: thirty days,
 * the SDK's shipped maximum wait, so the picker never offers a wait the SDK's
 * save refuses.
 */
export const PICKER_CEILING_HOURS = 30 * 24

export const PICKER_CEILING_SECONDS = BigInt(PICKER_CEILING_HOURS * 60 * 60)

/**
 * A threshold below one: the chain refuses only a rule whose every clause is
 * zero, so while another clause requires at least one the refusal is this
 * wallet's alone, and otherwise the chain refuses it too.
 */
const clauseRefusals = (
  clause: Clause,
  index: number,
  role: ClauseRole,
  anotherRequiresOne: boolean
): Refusal[] => {
  const refusals: Refusal[] = []
  const members = clause.credentials.filter((credential) => !isEmptySlot(credential)).length
  if (members === 0) {
    refusals.push({ key: role === 'required' ? 'emptyRequired' : 'emptyGroup', clause: index })
  } else {
    if (members < clause.credentials.length) {
      refusals.push({
        key: role === 'required' ? 'emptyRequired' : 'emptyGroupSlot',
        clause: index
      })
    }
    if (clause.threshold > clause.credentials.length) {
      refusals.push({ key: 'thresholdAboveMembers', clause: index })
    }
  }
  if (clause.threshold < 1) {
    refusals.push({
      key: anotherRequiresOne ? 'thresholdBelowOneOwnRule' : 'thresholdBelowOne',
      clause: index
    })
  }
  if (clause.threshold > THRESHOLD_FIELD_MAX) {
    refusals.push({ key: 'thresholdAboveField', clause: index })
  }
  if (clause.credentials.length > MEMBER_CEILING) {
    refusals.push({ key: 'memberCeiling', clause: index })
  }
  return refusals
}

/**
 * A wait past the field's width refuses with the width's sentence alone; the
 * picker's ceiling refuses every longer wait that still fits the field.
 */
const waitRefusals = (wait: bigint): Refusal[] => {
  if (wait < 0n || wait >= WAIT_FIELD_LIMIT) {
    return [{ key: 'waitFieldWidth' }]
  }
  if (wait > PICKER_CEILING_SECONDS) {
    return [{ key: 'waitCeiling' }]
  }
  return []
}

/**
 * The refusals of the path's shape alone: the path's own first, then each
 * clause in order, each clause judged in the role the editor shows it in
 * (read from its stored shape where no role is given). The editor's continue
 * applies these; the waiting period is judged on its own screen. How wide a
 * rule a block can check is the SDK's to judge, so no refusal here stands for
 * it.
 */
export const shapeRefusalsOf = (
  draft: SetupDraft,
  roles: readonly ClauseRole[] = rolesOf(draft.clauses)
): Refusal[] => {
  const pathRefusals: Refusal[] = methodCountOf(draft.clauses) === 0 ? [{ key: 'noMethod' }] : []
  return [
    ...pathRefusals,
    ...draft.clauses.flatMap((clause, index) =>
      clauseRefusals(
        clause,
        index,
        roles[index] ?? roleOf(clause),
        draft.clauses.some((other, i) => i !== index && other.threshold > 0)
      )
    )
  ]
}

/**
 * Every refusal of the draft: the shape's, then the waiting period's. A path
 * this wallet can save answers an empty list.
 */
export const refusalsOf = (
  draft: SetupDraft,
  roles: readonly ClauseRole[] = rolesOf(draft.clauses)
): Refusal[] => [...shapeRefusalsOf(draft, roles), ...waitRefusals(draft.wait)]
