import type { PresetId, SlotKind } from '@web/modules/social-recovery/setup/presets'

/** The selected account as an external store a test can switch. */
export type SelectedAccountMock = {
  state: { account: { addr: string } | null }
  listeners: Set<() => void>
}

/** Which storage calls fail: the read, the removal, and the writes after how many succeed. */
export type StorageFaults = { get?: boolean; remove?: boolean; set?: number }

/** A preset, and the thresholds and lines it shows. */
export type PresetShapeCase = [PresetId, number[], string[]]

/** The shape each preset card promises: each clause's threshold and the kind every member slot waits for. */
export type PresetShapes = Record<PresetId, { threshold: number; kinds: SlotKind[] }[]>
