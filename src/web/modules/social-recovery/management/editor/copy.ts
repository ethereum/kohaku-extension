/**
 * The editor's words over the shared strings: a privacy level's name, the
 * rule a path reads as, and the line of each changed value.
 */
import type { Clause } from '@kohaku-eth/social-recovery'
import type { PrivacyLevel, AddressBook } from '@web/modules/social-recovery/shared/client'
import type { Translate } from '@web/modules/social-recovery/shared/display'
import { renderShapeSentence } from '@web/modules/social-recovery/shared/rule-lines'
import { kindOfMethodIn } from '@web/modules/social-recovery/setup/privacy/exposure'
import { renderWait } from '@web/modules/social-recovery/setup/review'

import { EDITOR } from './constants'
import type { ChangeRow } from './types'

const LEVEL_SLUGS: Readonly<Record<PrivacyLevel, string>> = {
  private: 'private',
  'shape-visible': 'shapeVisible',
  public: 'public'
}

export const renderLevelName = (level: PrivacyLevel, t: Translate): string =>
  t(`socialRecovery.privacy.level.${LEVEL_SLUGS[level]}.label`)

/** The rule a path reads as, in the words of the privacy step's shape sentence. */
export const ruleOfPath =
  (addressBook: AddressBook, t: Translate) =>
  (clauses: readonly Clause[]): string =>
    renderShapeSentence(
      clauses,
      { skipMemberlessClauses: true, kindOfMethod: kindOfMethodIn(addressBook) },
      t
    )

export const renderChange = (row: ChangeRow, t: Translate): string => {
  const changes = `${EDITOR}.changes`
  switch (row.kind) {
    case 'members':
      return t(`${changes}.members`, { added: row.added, removed: row.removed })
    case 'pathChanged':
      return t(`${changes}.pathChanged`)
    case 'rule':
      return t(`${changes}.rule`, { before: row.before, after: row.after })
    case 'waitingPeriod':
      return t(`${changes}.waitingPeriod`, {
        before: renderWait(row.before, t),
        after: renderWait(row.after, t)
      })
    case 'privacy':
      return t(`${changes}.privacy`, {
        before: renderLevelName(row.before, t),
        after: renderLevelName(row.after, t)
      })
    case 'password':
    default:
      return t(`${changes}.password`)
  }
}
