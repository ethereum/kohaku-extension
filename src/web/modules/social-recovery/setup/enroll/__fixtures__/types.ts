import type { IdentityKind } from '@web/modules/social-recovery/shared/records/types'
import type {
  CheckTone,
  GuardianChecks,
  HeldKey
} from '@web/modules/social-recovery/setup/enroll/types'
import type { KeyHandle, TypedDataToSign } from '@web/modules/social-recovery/shared/client'

/** What the identity row suites know of one kind: its slug, its test ids and the keys it reads. */
export interface IdentityRowCase {
  /** The slot kind, which is also the ceremony route's method slug. */
  slug: IdentityKind
  /** The prefix of the row's test ids. */
  row: 'passport' | 'aadhaar'
  title: string
  lead: string
  deviceLine: string
  noneYet: string
  action: string
  actionLine: string
  enrolledLine: string
  testLead: string
  testPassed: string
  /** The note a refused ceremony reads on the row. */
  refusedNote: string
  /** The lines of the disclosure card, in order. */
  disclosures: string[]
}

/** The selected account as an external store a test can switch. */
export type SelectedAccountMock = {
  state: { account: { addr: string } | null }
  listeners: Set<() => void>
}

/** How many times the view mounted. */
export type MountCount = { count: number }

/** The wallet's listed accounts and stored keys, as a test gives them. */
export type WalletMock = {
  accounts: { addr: string; associatedKeys: string[] }[]
  keys: { addr: string; type: string; meta?: { fromSeedId?: string } }[]
}

/** A check's case: its name, the checks, the line and its tone. */
export type CheckToneCase = [string, GuardianChecks, string, CheckTone]

/** A case's name, the keys the wallet holds, and the seed check it reads. */
export type SeedCase = [string, HeldKey[], NonNullable<GuardianChecks['seed']>]

/** One field of a typed-data type: its name and its type. */
export type TypedField = { name: string; type: string }

/** A transaction, read by its target. */
export type CallTarget = { to: string }

/** The arguments of a typed-data signature: the key and the data. */
export type SignTypedDataArgs = [KeyHandle, TypedDataToSign]

/** Where the authenticator sits: on this device or on another. */
export type Attachment = 'platform' | 'cross-platform'

/** The ceremony call a passkey row makes. */
export type PasskeyCall = 'enroll' | 'testAccess'
