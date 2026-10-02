import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type { ChainId, SlotKind, WalletRecords } from '@web/modules/social-recovery/shared/records'

export type { SlotKind } from '@web/modules/social-recovery/shared/records'

/** One clause of a preset's shape: its threshold and the kind of each member slot. */
export interface ShapeClause {
  threshold: number
  slots: readonly SlotKind[]
}

export type PresetId = 'deviceAndGuardians' | 'deviceAndId' | 'eitherOne' | 'guardiansOnly'

/** A preset: a whole path the holder adopts and may edit, with the card's own strings. */
export interface Preset {
  id: PresetId
  nameKey: string
  taglineKey?: string
  shape: readonly ShapeClause[]
}

/** What a holder may pick on the grid: a preset, or the empty start. */
export type PresetChoice = PresetId | 'fromScratch'

/** One row of a card's shape: a required method, or a group's count and its members. */
export type ShapeRow =
  | { kind: 'required'; text: string }
  | { kind: 'group'; count: string; members: string[] }

/**
 * One row of the resume block: an enrolled method or guardian, its chip, a
 * guardian's address and the cause a failed test reported.
 */
export interface ResumeRow {
  id: string
  name: string
  chip: string
  detail?: string
  note?: string
}

/** The not-yet-active note beneath the guardian rows: its chip and its line. */
export interface ResumeNote {
  chip: string
  note: string
}

/** What the presets view reads from storage: the draft's date, or none, and the resume block. */
export interface PresetsLoad {
  savedAt: number | null
  rows: ResumeRow[]
  notYetActive: ResumeNote | null
  notStarted: ResumeRow[]
}

/**
 * The line above the screen's body after a write: a refused write, or a start
 * over refused because a save of this setup is still on its way.
 */
export type WriteLine = 'writeFailed' | 'startOverWhileSaving'

export interface PresetsViewProps {
  records: WalletRecords
  chainId: ChainId
  account: Address
  /** Opens the editor, once the draft is written. */
  onOpenEditor: () => void
  /** Opens the recovery of another account. */
  onRecover: () => void
}
