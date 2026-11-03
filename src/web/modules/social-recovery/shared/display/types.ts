import type { COUNTDOWN_STATES, NAME_USES } from './renderers'
import type {
  APPROVAL_VALUES,
  ATTEMPT_CHIPS,
  CHIP_SETS,
  COLLECTION_CHIPS,
  CONCEPT_NOUNS,
  EDITOR_CHIPS,
  KIT_NOUNS,
  METHOD_CHIPS,
  PARTY_NOUNS,
  PASSWORD_NAMES,
  RECOVERY_ASIDE_CHIPS,
  RECOVERY_STATES,
  RECOVERY_STATUS_CHIPS,
  REQUEST_CHIPS,
  SESSION_CHIPS,
  VALUE_LABELS,
  WALLET_WORDS
} from './vocabulary'

/** Reads one key of en.json, with i18next interpolation options. */
export type Translate = (key: string, options?: Record<string, unknown>) => string

// ---------------------------------------------------------------------------
// Status chips
// ---------------------------------------------------------------------------

export type MethodChip = typeof METHOD_CHIPS[number]
export type CollectionChip = typeof COLLECTION_CHIPS[number]
export type AttemptChip = typeof ATTEMPT_CHIPS[number]
export type RecoveryState = typeof RECOVERY_STATES[number]
export type RecoveryAsideChip = typeof RECOVERY_ASIDE_CHIPS[number]
export type RecoveryStatusChip = typeof RECOVERY_STATUS_CHIPS[number]
export type SessionChip = typeof SESSION_CHIPS[number]
export type RequestChip = typeof REQUEST_CHIPS[number]
export type EditorChip = typeof EDITOR_CHIPS[number]
export type ChipSetName = keyof typeof CHIP_SETS
export type Chip<S extends ChipSetName> = typeof CHIP_SETS[S][number]

// ---------------------------------------------------------------------------
// Nouns
// ---------------------------------------------------------------------------

export type KitNoun = typeof KIT_NOUNS[number]
export type ConceptNoun = typeof CONCEPT_NOUNS[number]
export type PartyNoun = typeof PARTY_NOUNS[number]
export type Noun = KitNoun | ConceptNoun | PartyNoun
export type PasswordName = typeof PASSWORD_NAMES[number]

// ---------------------------------------------------------------------------
// Value names
// ---------------------------------------------------------------------------

export type ApprovalValue = typeof APPROVAL_VALUES[number]
export type ValueLabel = typeof VALUE_LABELS[number]
export type WalletWord = typeof WALLET_WORDS[number]

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

export type NameUse = typeof NAME_USES[number]

export interface RenderedName {
  /** The name, ellipsized past 24 characters. */
  name: string
  /** The caveat, or null where the screen asks the reader to check nothing. */
  caveat: string | null
}

// ---------------------------------------------------------------------------
// Hidden value
// ---------------------------------------------------------------------------

export interface RenderedHiddenValue {
  /** Sixteen dots. */
  dots: string
  /** The hidden chip that renders beside them. */
  chip: string
}

// ---------------------------------------------------------------------------
// Member list
// ---------------------------------------------------------------------------

export interface RenderedMemberList<T> {
  /** The members the list shows, in the order given. */
  shown: readonly T[]
  /** How many members the list does not show. */
  restCount: number
  /** The count line, `2 more members`, or null where nothing is left out. */
  more: string | null
}

// ---------------------------------------------------------------------------
// Payment order
// ---------------------------------------------------------------------------

/** What the wallet knows of the token a payment order names. */
export interface PaymentToken {
  symbol: string
  decimals: number
}

// ---------------------------------------------------------------------------
// Deadline and countdown
// ---------------------------------------------------------------------------

export interface RenderedDeadline {
  /** The date and time in the reader's zone with the zone named, `13 Aug, 18:04 CEST`. */
  date: string
  /** The zone's name as the date shows it, `CEST`. */
  zone: string
  /** The time left, `23 hours`, or null once the deadline has passed. */
  remaining: string | null
  /** True once `now` reaches the deadline. */
  passed: boolean
  /** The deadline line, `Valid until 13 Aug, 18:04 CEST · 23 hours left`, or null once passed. */
  line: string | null
}

export type CountdownState = typeof COUNTDOWN_STATES[number]
