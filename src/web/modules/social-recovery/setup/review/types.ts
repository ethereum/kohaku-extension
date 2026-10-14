import type {
  Address,
  BackupForm,
  Clause,
  Credential,
  ISetupClient,
  ModuleInfo,
  ReadResult,
  SetupDescription,
  SetupDraft,
  SetupState,
  TrustedParties
} from '@web/modules/social-recovery/sdk-interfaces'
import type {
  AddressBook,
  FitCheckReading,
  RecoveryKitClient,
  RemovedKeyReading,
  WalletReads
} from '@web/modules/social-recovery/shared/client'
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

/** A read the trust list makes for every method of the path. */
export type TrustReadName = 'trustedParties' | 'moduleInfo' | 'paused'

/** The reads of one method; a member not yet present is a read still running. */
export interface MethodReads {
  trustedParties?: ReadResult<TrustedParties>
  moduleInfo?: ReadResult<ModuleInfo>
  paused?: ReadResult<boolean>
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

/** What a method's own declaration says about its admin. */
export interface AdminDeclaration {
  /** The method's admin, absent where the declaration names no outside party. */
  admin?: Address
  /** The address one acceptance away from the admin role, where there is one. */
  pendingAdmin?: Address
  /** The method alone satisfies the whole rule, so its admin could recover alone. */
  recoverAlone: boolean
  /** Its admin could recover alone, and every clause it satisfies is at threshold one. */
  aloneAtThresholdOne: boolean
}

/** What the trust list says about one method contract. */
export type TrustContract =
  | { status: 'pending' }
  | { status: 'unavailable'; unanswered: TrustReadName[] }
  | {
      status: 'third-party'
      /** The module's own declaration, where it answers to the method interface. */
      declaration?: AdminDeclaration
    }
  | ({
      status: 'declared'
      /** The passport method, whose credential a renewed document ends. */
      passportRenewal: boolean
    } & AdminDeclaration)

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
// The account's reads: the key a recovery removes, the fit check, the setup
// read and the setup description
// ---------------------------------------------------------------------------

/** One read of the account: still running, answered, or thrown. */
export type AccountRead<T> =
  | { status: 'pending' }
  | { status: 'answered'; value: T }
  | { status: 'failed' }

/** What each of the account's reads that gate Save answers. */
export interface AccountReadValues {
  removedKey: RemovedKeyReading
  fitCheck: FitCheckReading
  setupState: SetupState
  /** The setup description of the draft: the candidate keys and the key a recovery removes. */
  description: SetupDescription
}

/** One of the account's reads that gate Save. */
export type AccountReadName = keyof AccountReadValues

export type AccountReads = { [K in AccountReadName]: AccountRead<AccountReadValues[K]> }

/** Each of the account's reads that gate Save, as a call that answers it. */
export type AccountReaders = { [K in AccountReadName]: () => Promise<AccountReadValues[K]> }

export interface AccountReadsState extends AccountReads {
  /** Runs again the named reads that are not still running. */
  retry: (names: readonly AccountReadName[]) => void
}

// ---------------------------------------------------------------------------
// The save gate
// ---------------------------------------------------------------------------

/** Why Save cannot run, the first that applies in this order. */
export type SaveBlock =
  | { kind: 'empty-slot' }
  | { kind: 'password-missing' }
  | { kind: 'unavailable' }
  | { kind: 'removed-key-unreadable' }
  | { kind: 'cannot-recover'; reason: 'not-supported' }
  /** The count is absent where no description of the account counted its keys. */
  | { kind: 'cannot-recover'; reason: 'key-count'; count?: number }
  | { kind: 'already-set-up' }

/** A credential of the path that was never tested, at its place in the path. */
export interface UntestedCredential {
  credential: Credential
  clause: number
  member: number
}

export interface SaveGateInput extends AccountReads {
  recordsLoaded: boolean
  clientReady: boolean
  trustRows: readonly TrustRow[]
  /** The methods of the path never tested, or false where this step shows no warning. */
  untested: readonly UntestedCredential[] | false
  /** The path of the draft, whose every slot must hold a method. */
  clauses: readonly Clause[]
  /** The backup form of the draft; an encrypted one needs the recovery password set. */
  backup: BackupForm
  /** Whether the records hold a recovery password record. */
  passwordSet: boolean
}

export interface SaveGate {
  canSave: boolean
  blocked: SaveBlock | null
  /** The untested methods the warning beside Save names, or false where none warns; it never disables Save. */
  notTested: readonly UntestedCredential[] | false
}

// ---------------------------------------------------------------------------
// The screen and the view
// ---------------------------------------------------------------------------

/** The part of the recovery client the review reads. */
export type ReviewKitClient = Pick<RecoveryKitClient, 'chain' | 'descriptor' | 'moduleReads'> & {
  setup: Pick<ISetupClient, 'describeSetup' | 'setupState'>
  walletReads: Pick<WalletReads, 'removedKey' | 'fitCheck'>
}

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
  onRetry: (method: Address) => void
}

export interface SaveBlockerProps {
  blocked: SaveBlock
  onRetry: () => void
  onOpen: () => void
  onEditor: () => void
  onPrivacy: () => void
}

/** The callback of the blocker that clears a block. */
export type SaveBlockerHandler = Exclude<keyof SaveBlockerProps, 'blocked'>

/** The block of an account this release cannot recover. */
export type CannotRecoverBlock = Extract<SaveBlock, { kind: 'cannot-recover' }>

/** The string keys a block renders beside Save, and the action that clears it where one does. */
export interface SaveBlockCopy {
  chip?: string
  title?: string
  body?: string
  action?: { label: string; handler: SaveBlockerHandler; testID: string }
}

export interface TrustReadsState {
  reads: TrustReads
  /** Runs again the reads of one method that did not answer. */
  retry: (method: Address) => void
}
