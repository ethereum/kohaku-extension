import type { SetupRecords } from '@web/modules/social-recovery/shared/records'

import { draftOf } from './presets'
import type { PresetChoice } from './types'

/**
 * Writes the draft a choice starts and the path equal to its clauses in one
 * storage call, so every later step reads one path and a draft never lands
 * without it. Nothing is checked here: the editor applies its rules when the
 * holder saves.
 */
export const startDraft = async (setup: SetupRecords, choice: PresetChoice): Promise<void> => {
  await setup.writeDraftAndPath(draftOf(choice))
}
