import type { ReactNode } from 'react'

import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

/**
 * What the card carries besides its fixed lines: at the hidden level the
 * recovery password, at the public level the address alone.
 */
export type CardLevel = 'hidden' | 'public'

/** The card's values: the account, its level, and the password where the level carries one. */
export interface RecoveryCard {
  account: Address
  level: CardLevel
  password?: string
}

/** The level a stored draft names, with the account it was read for. */
export interface DraftLevel {
  address: Address
  level: CardLevel
}

/** One row of the card as the file writes it: a label with its value, or a line alone. */
export type CardRow =
  | { kind: 'value'; label: string; value: string }
  | { kind: 'line'; text: string }

/** A file the download carrier hands to the browser. */
export interface CardFile {
  name: string
  type: string
  text: string
}

/** How the card leaves the screen: saved as a file, or printed from the print view. */
export interface CardCarriers {
  download: (file: CardFile) => void
  /** Prints the page while the print view is mounted. */
  print: () => void
}

export type CarrierAction = 'download' | 'print' | 'sendToDevice'

/** The two ends of the extension password ask. */
export interface PasswordAskAnswer {
  onConfirmed: () => void
  onCancel: () => void
}

export interface RecoveryCardViewProps {
  account: Address
  level: CardLevel
  /** The password the holder typed at the privacy step, absent after a reload. */
  password: string | undefined
  /** A carrier already ran for this account in this tab, so the next one asks the extension password. */
  carriedBefore: boolean
  onCarried: () => void
  carriers: CardCarriers
  renderPasswordAsk: (answer: PasswordAskAnswer) => ReactNode
  /** Leads to the privacy step, where the holder sets the recovery password again. */
  onSetPasswordAgain: () => void
  onBack: () => void
  onContinue: () => void
}

export interface CardFaceProps {
  account: Address
  /** The password row, or null at the public level. */
  passwordRow: ReactNode
  /** Lays each label beside its value and quiets the last line; the printed card keeps its own layout. */
  onScreen?: boolean
  testID?: string
}

export interface PrintCardViewProps {
  card: RecoveryCard
}
