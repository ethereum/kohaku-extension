import type { Clause, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'
import { defaultSetupDraft, emptySlot } from '@web/modules/social-recovery/shared/records'

import type { Preset, PresetChoice, PresetId, ShapeClause } from './types'

const CARDS = 'socialRecovery.presets.cards'

/** The four presets, in the order the grid shows them. */
export const PRESETS: readonly Preset[] = [
  {
    id: 'deviceAndGuardians',
    nameKey: `${CARDS}.deviceAndGuardians.name`,
    taglineKey: `${CARDS}.deviceAndGuardians.tagline`,
    shape: [
      { threshold: 1, slots: ['passkey'] },
      { threshold: 2, slots: ['ecdsa', 'ecdsa', 'ecdsa'] }
    ]
  },
  {
    id: 'deviceAndId',
    nameKey: `${CARDS}.deviceAndId.name`,
    taglineKey: `${CARDS}.deviceAndId.tagline`,
    shape: [
      { threshold: 1, slots: ['passkey'] },
      { threshold: 1, slots: ['zkpassport'] }
    ]
  },
  {
    id: 'eitherOne',
    nameKey: `${CARDS}.eitherOne.name`,
    shape: [{ threshold: 1, slots: ['passkey', 'zkpassport'] }]
  },
  {
    id: 'guardiansOnly',
    nameKey: `${CARDS}.guardiansOnly.name`,
    taglineKey: `${CARDS}.guardiansOnly.tagline`,
    shape: [{ threshold: 2, slots: ['ecdsa', 'ecdsa', 'ecdsa'] }]
  }
]

/** The clauses of a shape, every member slot empty. */
export const clausesOfShape = (shape: readonly ShapeClause[]): Clause[] =>
  shape.map(({ threshold, slots }) => ({ threshold, credentials: slots.map(emptySlot) }))

export const presetOf = (id: PresetId): Preset => {
  const preset = PRESETS.find((candidate) => candidate.id === id)
  if (!preset) {
    throw new Error(`Unknown preset: ${id}`)
  }
  return preset
}

/** The draft a choice starts: a preset's whole shape with every slot empty, or no clause at all. */
export const draftOf = (choice: PresetChoice): SetupDraft => ({
  ...defaultSetupDraft(),
  clauses: choice === 'fromScratch' ? [] : clausesOfShape(presetOf(choice).shape)
})
