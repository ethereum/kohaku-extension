import type { ReactElement } from 'react'

/**
 * The warning's forms: the recover door's, the one in front of the password
 * reset and the seed import, and the condensed one an entry inside settings
 * draws above its own content.
 */
export type WarningForm = 'recover' | 'reset' | 'condensed'

export interface WarningPointer {
  line: string
  action: string
}

/** The string keys one form draws, in reading order. */
export interface WarningCopy {
  /** Whether the form opens with the fast track's step counter. */
  counter: boolean
  header: string | null
  lead: string
  lines: readonly string[]
  pointer: WarningPointer | null
  acknowledge: string
  /**
   * Whether the form draws its own continue and leave; a form without them
   * leaves both to the screen that hosts it.
   */
  actions: boolean
}

interface WarningGateBase {
  testID?: string
}

interface GatedWarningBase extends WarningGateBase {
  /** Runs once the holder gave the acknowledgment and pressed continue. */
  onContinue: () => void
  onLeave: () => void
}

export interface RecoverWarningProps extends GatedWarningBase {
  form: 'recover'
  onImportInstead: () => void
}

export interface ResetWarningProps extends GatedWarningBase {
  form: 'reset'
}

export interface CondensedWarningProps extends WarningGateBase {
  form: 'condensed'
  /**
   * Reports every change of the acknowledgment; the host keeps its own
   * continue and its inputs disabled until it reads true.
   */
  onAcknowledgedChange: (acknowledged: boolean) => void
}

export type WarningGateProps = RecoverWarningProps | ResetWarningProps | CondensedWarningProps

/** Each part of the warning takes the gate's own test id and appends its suffix. */
export interface WarningHeaderProps {
  header: string
  testID: string
}

export interface WarningImportPointerProps {
  pointer: WarningPointer
  onImportInstead: () => void
  testID: string
}

export interface WarningActionsProps {
  acknowledged: boolean
  onContinue: () => void
  /** Drawn only when the form offers a way back. */
  onLeave: (() => void) | null
  testID: string
}

export interface ResetEntryGateProps {
  /** The entry's own screen, mounted only after the acknowledgment and continue. */
  children: ReactElement
  onLeave: () => void
}
