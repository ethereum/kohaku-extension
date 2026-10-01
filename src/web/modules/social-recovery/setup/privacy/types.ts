import type { ComponentType } from 'react'

import type { Address, PrivacyLevel } from '@web/modules/social-recovery/sdk-interfaces'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import type { ChainId, WalletRecords } from '@web/modules/social-recovery/shared/records'

/** The fixed chips of the picker. */
export type WaitChipId = 'hours24' | 'hours48' | 'hours72' | 'days7'

/** A chip of the picker with its length in hours. */
export interface WaitChip {
  id: WaitChipId
  hours: number
}

/** What the picker holds: one of the chips, or the custom entry as typed. */
export type WaitChoice = { kind: 'chip'; id: WaitChipId } | { kind: 'custom'; text: string }

/** The custom entry read: empty, refused with its reason, or a length in hours. */
export type CustomWait =
  | { status: 'empty' }
  | { status: 'notWholeHours' }
  | { status: 'belowMinimum' }
  | { status: 'pastCeiling' }
  | { status: 'accepted'; hours: number }

/** The levels this step offers. */
export type OfferedLevel = Extract<PrivacyLevel, 'private' | 'shape-visible' | 'public'>

/**
 * What the privacy step stores: Private or Shape visible with the recovery
 * password, or Public with none.
 */
export type PrivacyChoice =
  | { level: 'private'; password: string }
  | { level: 'shape-visible'; password: string }
  | { level: 'public' }

/** The method kind a row of the path holds: one of the address book's method slugs. */
export type MethodKind = keyof AddressBook['methods']

/**
 * The exposure line of a path: the guessability half, which exists only for a
 * path with an address row, and the publication half every path carries.
 */
export interface ExposureLines {
  guardians?: string
  unguessable?: string
  publication: string
}

export interface StepViewProps {
  records: WalletRecords
  chainId: ChainId
  account: Address
  navigate: (to: string) => void
}

export interface WaitingPeriodViewProps extends StepViewProps {
  /** The longest wait the picker accepts, in hours, where the client names one. */
  ceilingHours?: number
}

export type PrivacyViewProps = StepViewProps

export interface SettingsChromeProps {
  /** The step the chrome holds, given the selected account's records. */
  step: ComponentType<StepViewProps>
}
