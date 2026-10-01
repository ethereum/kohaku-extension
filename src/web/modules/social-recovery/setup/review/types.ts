import type { RpcProviderKind } from '@ambire-common/interfaces/network'
import type {
  Address,
  Clause,
  Credential,
  ModuleInfo,
  ReadResult,
  SetupDraft,
  TrustedParties
} from '@web/modules/social-recovery/sdk-interfaces'
import type { AddressBook, RecoveryKitClient } from '@web/modules/social-recovery/shared/client'
import type {
  ChainId,
  Enrollment,
  SlotKind,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'

/** The kind of method a row of the path holds: one of the address book's method slugs. */
export type MethodKind = SlotKind

/** The chip word of one of the picker's fixed lengths. */
export type ReviewWaitChipId = 'hours24' | 'hours48' | 'hours72' | 'days7'

/** One of the picker's fixed lengths with its chip word. */
export interface ReviewWaitChip {
  id: ReviewWaitChipId
  hours: number
}

/** How the node the wallet reads through is named on the trust list. */
export type NodeKind = 'light-client' | 'plain'

/** The provider kind of the network the wallet reads the recovery chain through. */
export type ProviderKind = RpcProviderKind

/** The things a recovery publishes that are not addresses, as item slugs of the disclosures. */
export type PublicationItem = 'passkey' | 'passkeys' | 'passportIdentifier' | 'aadhaar'

/** One row of the lead's path block, rendered. */
export interface PathRow {
  /** The row's name: a guardian's full address, a passkey's label, or the kind's name. */
  name: string
  /** The guardian noun beside a guardian's address, or a passkey's kind word. */
  aside: string | null
  /** The status chip, or null where the records hold no verdict for an enrolled credential. */
  chip: string | null
  /** The lines under the row, in order. */
  lines: string[]
}

// ---------------------------------------------------------------------------
// The trust list
// ---------------------------------------------------------------------------

/** A declaration the trust list reads for every method of the path. */
export type TrustReadName = 'trustedParties' | 'moduleInfo'

/** The reads of one method; a member not yet present is a read still running. */
export interface MethodReads {
  trustedParties?: ReadResult<TrustedParties>
  moduleInfo?: ReadResult<ModuleInfo>
}

/** The reads of every method of the path, keyed by the method's lowercased address. */
export type TrustReads = Record<string, MethodReads>

/** One credential of the path that uses a method, as the trust list heads it. */
export interface TrustHeading {
  credential: Credential
  kind: MethodKind | undefined
  /** A guardian's address, decoded from its config. */
  guardian?: Address
  /** A passkey's backup kind, where the records hold one. */
  backup?: Enrollment['backup']
  /** Whether its access test passed. */
  tested: boolean
}

/** What the trust list says about one method contract. */
export type TrustContract =
  | { status: 'pending' }
  | { status: 'unavailable'; unanswered: TrustReadName[] }
  | { status: 'third-party' }
  | {
      status: 'declared'
      /** The method's admin, absent where the declaration names no outside party. */
      admin?: Address
      /** The address one acceptance away from the admin role, where there is one. */
      pendingAdmin?: Address
      /** The method alone satisfies the whole rule, so its admin could recover alone. */
      recoverAlone: boolean
      /** The passport method, whose credential a renewed document ends. */
      passportRenewal: boolean
    }

/** One contract row of the trust list: one per method, however many path rows use it. */
export interface TrustRow {
  method: Address
  kind: MethodKind | undefined
  headings: TrustHeading[]
  /** The count line above several guardian headings. */
  guardians?: { count: number; tested: number }
  contract: TrustContract
}

export interface TrustRowsInput {
  clauses: readonly Clause[]
  enrollments: readonly Enrollment[]
  reads: TrustReads
  /** The method modules the deployment ships; any other is a third-party module. */
  shippedMethods: readonly Address[]
  addressBook: AddressBook
}

// ---------------------------------------------------------------------------
// The screen and the view
// ---------------------------------------------------------------------------

/** The part of the recovery client the review reads. */
export type ReviewKitClient = Pick<RecoveryKitClient, 'chain' | 'descriptor' | 'moduleReads'>

/** The recovery client as the view takes it. */
export type ReviewClient =
  | { status: 'loading' }
  | { status: 'ready'; client: ReviewKitClient }
  | { status: 'update-the-wallet'; retry: () => void }
  | { status: 'failed'; retry: () => void }

/** The setup records the review reads. */
export interface ReviewLoad {
  draft: SetupDraft
  enrollments: Enrollment[]
  passwordSet: boolean
}

export interface ReviewViewProps {
  records: Pick<WalletRecords, 'setup'>
  chainId: ChainId
  account: Address
  client: ReviewClient
  /** The provider kind of the recovery chain's network; absent reads as a plain node. */
  providerKind?: ProviderKind
  /** The label the wallet holds for the account, where it holds one. */
  accountLabel?: string
  navigate: (to: string) => void
}

/** The kinds whose test the enrollment step runs again. */
export type RetryKind = Extract<MethodKind, 'passkey' | 'ecdsa'>

/** The path row whose test could not run: its kind and its place in the path. */
export interface RetryTarget {
  kind: RetryKind
  clause: number
  member: number
}

export interface PathBlockProps {
  clauses: readonly Clause[]
  enrollments: readonly Enrollment[]
  addressBook: AddressBook
  /** Leads the holder to the enrollment step for one row, where its test runs again. */
  onRetryTest: (target: RetryTarget) => void
}

export interface TrustListProps {
  rows: readonly TrustRow[]
  client: ReviewKitClient
  providerKind?: ProviderKind
  onRetry: (method: Address) => void
}

export interface TrustReadsState {
  reads: TrustReads
  /** Runs again the reads of one method that did not answer. */
  retry: (method: Address) => void
}
