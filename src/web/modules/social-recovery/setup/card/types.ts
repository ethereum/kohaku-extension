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

/** The card's PDF bytes, its number of pages, and whether a character was written as its `U+XXXX` code. */
export interface CardPdf {
  bytes: Uint8Array<ArrayBuffer>
  /** A character the PDF's fonts cannot draw was written as its `U+XXXX` code instead. */
  replacedCharacters: boolean
  /** The A4 pages the card needed; a long value continues on further pages. */
  pages: number
}

/** A file the download carrier hands to the browser. */
export interface CardFile extends CardPdf {
  name: string
  type: string
}

/** Text in the PDF's single-byte encoding, one entry per character the text held. */
export interface PdfText {
  /** Each entry is one byte, or the `U+XXXX` code of a character the encoding lacks. */
  units: string[]
  replacedCharacters: boolean
}

/** The page's three standard fonts: lines, title and labels, and the values. */
export type PdfFont = 'regular' | 'bold' | 'mono'

/** One run of text the page draws: its font, its size, its grey and its wrapped lines. */
export interface PdfBlock {
  font: PdfFont
  size: number
  grey: number
  lines: string[][]
  /** The space below the block before the next one starts. */
  gapAfter: number
  /** A label that moves to the next page with the value it names rather than stay alone at a page's foot. */
  keepWithNext: boolean
  /** A value whose wrapped lines, all but the last, end with the continuation mark. */
  marksContinuation: boolean
}

/** One page as it is laid out: its drawing operators and the lowest point its text reaches. */
export interface PdfPage {
  operators: string[]
  /** Where the next block starts, from the page's foot. */
  cursor: number
  /** The bottom of the lowest line drawn so far. */
  inkBottom: number
}

/** How the card leaves the screen: saved as a file, or printed from the print view. */
export interface CardCarriers {
  download: (file: CardFile) => void
  /** Prints the page while the print view is mounted. */
  print: () => void
}

export type CarrierAction = 'download' | 'print'

/** The two ends of the extension password ask. */
export interface PasswordAskAnswer {
  onConfirmed: () => void
  onCancel: () => void
}

/**
 * What a check of a typed recovery password found: it opened the saved backup
 * and the holder keeps it, it did not open the backup, the account has no saved
 * backup and the row leads back to the privacy step, the check itself failed,
 * or the answer came after the screen left or the account changed and changed
 * nothing.
 */
export type RecoveryPasswordCheck = 'opened' | 'wrong' | 'no-backup' | 'unchecked' | 'stale'

/** The line the recovery password ask shows under its field after a check. */
export type RecoveryPasswordAskLine = 'wrong' | 'unchecked'

/**
 * The password row at the hidden level with no password in memory: blank while
 * the account's setup is read, the ask when a saved setup can check a typed
 * password, the way back to the privacy step when there is none.
 */
export type MissingPasswordRow =
  | { kind: 'reading' }
  | { kind: 'gone' }
  | { kind: 'ask'; check: (typed: string) => Promise<RecoveryPasswordCheck> }

export interface RecoveryPasswordAskProps {
  check: (typed: string) => Promise<RecoveryPasswordCheck>
}

/**
 * What made the row: the account's setup read or a check, or a client that
 * could not be built, whose row is read again once a client is ready.
 */
export type SetupReadingSource = 'setup' | 'failed-client'

/** What the setup read made of the row, with the account it was read for. */
export interface SetupReading {
  address: Address
  row: 'ask' | 'gone'
  source: SetupReadingSource
}

/** A password a check opened, with the account it opened for. */
export interface OpenedPassword {
  address: Address
  password: string
}

/** The card's password and the row that stands in for it while it is missing. */
export interface CardPassword {
  password: string | undefined
  missingPassword: MissingPasswordRow
}

export interface RecoveryCardViewProps {
  account: Address
  level: CardLevel
  /** The password the holder typed at the privacy step, absent after a reload. */
  password: string | undefined
  /** What the password row shows at the hidden level while no password is in memory. */
  missingPassword: MissingPasswordRow
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
