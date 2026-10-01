/**
 * The preset table and the empty-slot helpers. The screen is imported by path,
 * `./PresetsScreen`, so this module loads in a Node test without the UI.
 */
export { PRESETS, presetOf, draftOf, clausesOfShape } from './presets'
export { emptySlot, slotKindOf } from '@web/modules/social-recovery/shared/records'
export { startDraft } from './draft'
export { cardRuleLines, shapeRowsOf } from './lines'
export { resumeRowsOf, notYetActiveOf, notStartedRowsOf, draftAgeLine } from './resume'
export type {
  Preset,
  PresetChoice,
  PresetId,
  PresetsViewProps,
  ResumeNote,
  ResumeRow,
  ShapeClause,
  ShapeRow,
  SlotKind
} from './types'
