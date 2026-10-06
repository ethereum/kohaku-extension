import type { Address, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'
import { shapeNoteOf } from '@web/modules/social-recovery/shared/client'
import {
  defaultSetupDraft,
  PASSWORD_SET,
  setRecoveryPassword,
  wipeRecoveryPassword
} from '@web/modules/social-recovery/shared/records'
import type { ChainId, SetupRecords } from '@web/modules/social-recovery/shared/records'

import type { OfferedLevel, PrivacyChoice } from './types'

/**
 * Stores the waiting period in the draft's wait, with the draft's path, then
 * in the record. With no draft the record alone is written, and a draft
 * started later carries its own wait. Where the record refuses after the draft
 * took the new wait, the draft gets its earlier wait back so the two agree,
 * and the refusal is thrown.
 */
export const writeWaitingPeriod = async (
  setup: SetupRecords,
  wait: SetupDraft['wait']
): Promise<void> => {
  const draft = await setup.setupDraft.read()
  if (draft.status !== 'present') {
    await setup.waitingPeriod.write(wait)
    return
  }
  await setup.writeDraftAndPath({ ...draft.value, wait })
  try {
    await setup.waitingPeriod.write(wait)
  } catch (error: unknown) {
    await setup.writeDraftAndPath(draft.value).catch(() => undefined)
    throw error
  }
}

/**
 * The two privacy fields a level stores in the draft: at Private a sealed
 * backup and no public note; at Shape visible a sealed backup beside a public
 * note of the draft's shape and wait; at Public a clear backup and no note.
 */
export const privacyOfLevel = (draft: SetupDraft, level: OfferedLevel): SetupDraft['privacy'] => {
  if (level === 'public') {
    return { backup: 'clear', publicMetadata: '0x' }
  }
  if (level === 'private') {
    return { backup: 'encrypted', publicMetadata: '0x' }
  }
  const { clauses, wait, ignoresPause } = draft
  return { backup: 'encrypted', publicMetadata: shapeNoteOf({ clauses, wait, ignoresPause }) }
}

/**
 * The draft the privacy step starts where none is stored: the default draft,
 * with the stored waiting period as its wait where one is stored.
 */
const startedDraft = async (setup: SetupRecords): Promise<SetupDraft> => {
  const stored = await setup.waitingPeriod.read()
  const draft = defaultSetupDraft()
  return stored.status === 'present' ? { ...draft, wait: stored.value } : draft
}

/**
 * Stores the privacy level: the draft's two privacy fields, then the
 * password-set flag. With no draft, a draft is started to carry the level. At
 * Private and Shape visible the recovery password goes to the in-memory holder
 * alone and only once storage took the rest; at Public the flag and the holder
 * are both wiped. Where the flag's write or wipe refuses after the draft took
 * the new fields, the draft gets its earlier fields back, or the started draft
 * is removed, so the two agree, and the refusal is thrown.
 */
export const writePrivacy = async (
  setup: SetupRecords,
  chainId: ChainId,
  account: Address,
  choice: PrivacyChoice
): Promise<void> => {
  const draft = await setup.setupDraft.read()
  const earlier = draft.status === 'present' ? draft.value : await startedDraft(setup)
  await setup.writeDraftAndPath({
    ...earlier,
    privacy: privacyOfLevel(earlier, choice.level)
  })
  try {
    if (choice.level !== 'public') {
      await setup.passwordSet.write(PASSWORD_SET)
    } else {
      await setup.passwordSet.wipe()
    }
  } catch (error: unknown) {
    const rollback =
      draft.status === 'present'
        ? setup.writeDraftAndPath(draft.value)
        : Promise.all([setup.setupDraft.wipe(), setup.path.wipe()])
    await rollback.catch(() => undefined)
    throw error
  }
  if (choice.level !== 'public') {
    setRecoveryPassword(chainId, account, choice.password)
  } else {
    wipeRecoveryPassword(chainId, account)
  }
}
