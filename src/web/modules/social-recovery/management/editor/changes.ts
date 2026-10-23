/**
 * What the edit changes against the configuration it started from: the
 * members added and removed, members kept in other groups than before, the
 * rule, the waiting period, the privacy level and the recovery password, each
 * a row only where it differs. A changed password or privacy level makes a
 * printed Recovery Card stale.
 *
 * A member the rule still needs is a member of a group of more than one whose
 * threshold equals its members: removing it leaves the group below its
 * threshold.
 */
import type { Clause, Credential, SetupDraft } from '@kohaku-eth/social-recovery'
import { privacyLevelOf } from '@web/modules/social-recovery/shared/client'
import { isEmptySlot, sameCredential } from '@web/modules/social-recovery/shared/records'

import type { MemberKey } from '@web/modules/social-recovery/setup/editor/types'

import type { ChangeRow, ChangesInput, EditSession, PasswordMark } from './types'

const membersOf = (clauses: readonly Clause[]): Credential[] =>
  clauses.flatMap(({ credentials }) => credentials).filter((credential) => !isEmptySlot(credential))

const missingFrom = (from: readonly Credential[], other: readonly Credential[]): Credential[] =>
  from.filter((credential) => !other.some((held) => sameCredential(held, credential)))

/** The members of `credential`'s group in `clauses` that `kept` holds, itself left out. */
const groupMatesOf = (
  clauses: readonly Clause[],
  credential: Credential,
  kept: readonly Credential[]
): Credential[] => {
  const group = clauses.find(({ credentials }) =>
    credentials.some((held) => sameCredential(held, credential))
  )
  return membersOf(group ? [group] : []).filter(
    (mate) => !sameCredential(mate, credential) && kept.some((held) => sameCredential(held, mate))
  )
}

const sameMembers = (one: readonly Credential[], other: readonly Credential[]): boolean =>
  one.length === other.length && missingFrom(one, other).length === 0

/** Whether a member both paths hold shares its group with other members than before. */
const movedBetweenGroups = (committed: readonly Clause[], draft: readonly Clause[]): boolean => {
  const kept = membersOf(committed).filter((credential) =>
    membersOf(draft).some((held) => sameCredential(held, credential))
  )
  return kept.some(
    (credential) =>
      !sameMembers(groupMatesOf(committed, credential, kept), groupMatesOf(draft, credential, kept))
  )
}

/** The members the draft holds that the committed path does not. */
export const addedCredentialsOf = (
  committed: readonly Clause[],
  draft: readonly Clause[]
): Credential[] => missingFrom(membersOf(draft), membersOf(committed))

/**
 * Whether the save seals the backup under a new recovery password: the draft
 * hides the setup, and either the holder typed a new password or the committed
 * setup had none.
 */
export const passwordChangedOf = (
  baseline: EditSession,
  draft: SetupDraft,
  mark: PasswordMark
): boolean =>
  privacyLevelOf(draft.privacy) !== 'public' && (mark === 'changed' || baseline.level === 'public')

export const changesOf = ({
  baseline,
  draft,
  passwordChanged,
  ruleOf
}: ChangesInput): ChangeRow[] => {
  const rows: ChangeRow[] = []
  const committed = baseline.configuration
  const added = addedCredentialsOf(committed.clauses, draft.clauses).length
  const removed = missingFrom(membersOf(committed.clauses), membersOf(draft.clauses)).length
  if (added > 0 || removed > 0) {
    rows.push({ kind: 'members', added, removed })
  }
  if (movedBetweenGroups(committed.clauses, draft.clauses)) {
    rows.push({ kind: 'pathChanged' })
  }
  const before = ruleOf(committed.clauses)
  const after = ruleOf(draft.clauses)
  if (before !== after) {
    rows.push({ kind: 'rule', before, after })
  }
  if (committed.wait !== draft.wait) {
    rows.push({ kind: 'waitingPeriod', before: committed.wait, after: draft.wait })
  }
  const level = privacyLevelOf(draft.privacy)
  if (level !== baseline.level) {
    rows.push({ kind: 'privacy', before: baseline.level, after: level })
  }
  if (passwordChanged) {
    rows.push({ kind: 'password' })
  }
  return rows
}

/** Whether the changes make a printed Recovery Card stale: a changed password or privacy level. */
export const makesCardStale = (rows: readonly ChangeRow[]): boolean =>
  rows.some(({ kind }) => kind === 'password' || kind === 'privacy')

/** The members of the path the rule cannot lose, by their place in it. */
export const stillNeededOf = (clauses: readonly Clause[]): Set<MemberKey> =>
  new Set(
    clauses.flatMap((clause, index) => {
      const count = membersOf([clause]).length
      if (count < 2 || clause.threshold !== count) {
        return []
      }
      return clause.credentials.flatMap((credential, member): MemberKey[] =>
        isEmptySlot(credential) ? [] : [`${index}:${member}`]
      )
    })
  )
