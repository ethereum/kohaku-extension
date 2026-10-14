import type { Account } from '@ambire-common/interfaces/account'
import type { Key } from '@ambire-common/interfaces/keystore'
import type {
  Address,
  Configuration,
  Hex,
  IEventManager,
  IRecoveryActionInteractor,
  ISetupClient,
  PrivacyLevel,
  RestoreCause,
  SetupState
} from '@web/modules/social-recovery/sdk-interfaces'
import type {
  AddressBook,
  FitCheckReading,
  KeyHandle,
  RecoveryKitClient,
  RemovedKeyReading,
  WalletReads
} from '@web/modules/social-recovery/shared/client'
import type {
  ChainId,
  RecoveryEntryRecord,
  RecoveryRoute,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'

// ---------------------------------------------------------------------------
// The search the account step reads
// ---------------------------------------------------------------------------

/** The account step's search: the route the holder came by and the account that receives control. */
export interface AccountStepSearch {
  route: RecoveryRoute
  receivingAccount: Address
}

// ---------------------------------------------------------------------------
// The receiving account
// ---------------------------------------------------------------------------

/** The account record the owner stage reads, as the wallet lists it. */
export type ReceivingAccountSource = Account

/** The keystore fields the owner stage reads. */
export type HeldKeySource = Pick<Key, 'addr' | 'type'>

/** One of the wallet's accounts that can receive control, with the key a recovery installs. */
export interface ReceivingChoice {
  account: ReceivingAccountSource
  address: Address
  /** The key the wallet holds for the account. */
  key: KeyHandle
  smart: boolean
}

// ---------------------------------------------------------------------------
// The lookup
// ---------------------------------------------------------------------------

/** What the holder typed in the account field. */
export type LookupInput =
  | { kind: 'empty' }
  | { kind: 'address'; address: Address }
  | { kind: 'name'; name: string }
  | { kind: 'malformed' }

/** The account the step looks up, with the name it resolved from where one did. */
export interface LookupTarget {
  address: Address
  name?: string
}

/** Why the field refuses what the holder typed, or why its name lookup failed. */
export type FieldError = 'malformed' | 'name' | 'read-failed'

/** The part of the recovery client the account step reads. */
export type EntryKitClient = Pick<RecoveryKitClient, 'descriptor'> & {
  setup: Pick<ISetupClient, 'setupState'>
  action: Pick<
    IRecoveryActionInteractor,
    'isAuthorized' | 'supportsAccount' | 'isAuthority' | 'holdsAnyPrivilege'
  >
  walletReads: Pick<WalletReads, 'removedKey' | 'fitCheck'>
}

/** The recovery client for the looked-up account, as the view takes it. */
export type EntryClient =
  | { status: 'loading' }
  | { status: 'ready'; client: EntryKitClient }
  /** This wallet version cannot read the setup; only an update of the wallet helps. */
  | { status: 'update-the-wallet' }
  | { status: 'failed'; retry: () => void }

// ---------------------------------------------------------------------------
// The reads after the confirmation
// ---------------------------------------------------------------------------

/** One read: still running, answered, or thrown. */
export type EntryRead<T> =
  | { status: 'pending' }
  | { status: 'answered'; value: T }
  | { status: 'failed' }

/** What the fit reads answer: the action's own verdict, the wallet's fit check and the removed key. */
export interface FitAnswers {
  supportsAccount: boolean
  fitCheck: FitCheckReading
  removedKey: RemovedKeyReading
  /** Whether the named removed key holds control of the account; absent where no key is named. */
  removedKeyIsAuthority?: boolean
}

/** What the destination reads answer about the key a recovery installs. */
export interface DestinationAnswers {
  isAuthority: boolean
  holdsAnyPrivilege: boolean
}

/** The reads after the confirmation, in the order they run. */
export type ConfirmedStage = 'authorization' | 'fit' | 'destination'

/** Each read after the confirmation; a read that has not started yet is absent. */
export interface ConfirmedReads {
  authorization?: EntryRead<boolean>
  fit?: EntryRead<FitAnswers>
  destination?: EntryRead<DestinationAnswers>
}

export interface ConfirmedReadsState extends ConfirmedReads {
  /** Runs again the first read that failed, and the ones after it. */
  retry: () => void
}

/** Why this release cannot recover the account, by the code the wallet writes its reason from. */
export type RecoverRefusal =
  | 'not-supported'
  | 'several-keys'
  | 'removed-unknown'
  | 'removed-not-authority'

/** Why the key a recovery installs cannot be installed on the account. */
export type DestinationRefusal = 'already-a-key' | 'holds-privilege'

/** Where the account step stands after the confirmation, the first that applies. */
export type ConfirmedStep =
  | { kind: 'reading'; stage: ConfirmedStage }
  | { kind: 'failed'; stage: ConfirmedStage }
  | { kind: 'dormant' }
  | { kind: 'cannot-recover'; refusal: RecoverRefusal }
  | { kind: 'destination'; refusal: DestinationRefusal }
  | { kind: 'ready' }

// ---------------------------------------------------------------------------
// The views
// ---------------------------------------------------------------------------

export interface OwnerStageViewProps {
  choices: readonly ReceivingChoice[]
  /** False while the wallet has not pushed its accounts and keys yet. */
  loaded: boolean
  onContinue: (receivingAccount: Address) => void
  /** Leaves the recovery. */
  onCancel: () => void
}

export interface ReceivingRowProps {
  choice: ReceivingChoice
  selected: boolean
  disabled: boolean
  onSelect: (address: Address) => void
}

export interface AccountStepViewProps {
  records: Pick<WalletRecords, 'recoveryEntry' | 'recoverySession'>
  chainId: ChainId
  search: AccountStepSearch
  /** The key a recovery installs: the receiving account's own key. */
  destination: Address
  networkName: string
  /** The account being looked up, or null while the field shows. */
  target: LookupTarget | null
  onTarget: (target: LookupTarget | null) => void
  /** The recovery client for the target. */
  client: EntryClient
  /** Resolves a name to an address; an empty answer is a name that does not resolve. */
  resolveName: (name: string) => Promise<string>
  navigate: (to: string) => void
}

export interface LookupFieldProps {
  networkName: string
  onTarget: (target: LookupTarget) => void
  resolveName: (name: string) => Promise<string>
  /** Goes back to the step before; absent where the route has no step before to return to. */
  onBack?: () => void
  /** Leaves the recovery. */
  onCancel: () => void
}

export interface LookupStateProps {
  target: LookupTarget
  networkName: string
  client: EntryClient
  setupState: EntryRead<SetupState>
  onRetrySetup: () => void
  onAnotherAddress: () => void
  /** Leaves the recovery; absent where the route has nowhere to leave to. */
  onClose?: () => void
}

export interface ConfirmAccountProps {
  target: LookupTarget
  networkName: string
  /** True while the entry record is being written. */
  writing: boolean
  writeFailed: boolean
  onConfirm: () => void
  onNotMine: () => void
}

export interface ConfirmedReadsViewProps {
  step: ConfirmedStep
  route: RecoveryRoute
  networkName: string
  /** Whether the setup read reported an attempt running against the account. */
  attemptActive: boolean
  onRetry: () => void
  /** Leaves a blocked state for the account field. */
  onBack: () => void
  /** Leaves a refusal about the installed key for the choice of another account. */
  onChooseAnother: () => void
  onContinue: () => void
}

export interface CondensedGateProps {
  /** Runs once the holder ticked the acknowledgment and pressed continue. */
  onPass: () => void
}

// ---------------------------------------------------------------------------
// The readout
// ---------------------------------------------------------------------------

/** The part of the recovery client the readout reads. */
export interface ReadoutKitClient {
  setup: Pick<ISetupClient, 'setupState' | 'getSetup'> & {
    events: Pick<IEventManager, 'accountFilter' | 'fetch'>
  }
}

/** The recovery client for the account being recovered, as the readout takes it. */
export type ReadoutClient =
  | { status: 'loading' }
  | { status: 'ready'; client: ReadoutKitClient }
  /** This wallet version cannot read the setup; only an update of the wallet helps. */
  | { status: 'update-the-wallet' }
  | { status: 'failed'; retry: () => void }

/** The restore cause a thrown restore refusal carries, with the backup's refusal reason where it names one. */
export interface RestoreRefusalReading {
  cause: RestoreCause
  reason?: unknown
}

/** The path's shape a shape-visible setup publishes: each clause's threshold and its methods, no value. */
export interface ShapeNote {
  clauses: { threshold: number; methods: Address[] }[]
}

/**
 * What the setup read answers before the recovery password: sealed, the shape
 * readable with the values withheld, or the whole configuration readable; or
 * a setup this device cannot open at all: a backup this build cannot read, no
 * backup, or a backup that does not match the commitment.
 */
export type SetupReading =
  | { kind: 'sealed' }
  | { kind: 'shape-readable'; shape: ShapeNote }
  | { kind: 'readable'; configuration: Configuration }
  | { kind: 'unreadable' }
  | { kind: 'no-details' }
  | { kind: 'mismatch' }

/** Why the recovery password did not open the setup. */
export type UnlockFailure = 'wrong' | 'event-failed' | 'unreadable' | 'no-details' | 'mismatch'

/** The password ask at a hidden level. */
export type UnlockState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'wrong' }
  | { status: 'event-failed' }

/** The two levels that hide the values until the recovery password. */
export type HiddenLevel = Exclude<PrivacyLevel, 'public'>

/** Where the readout stands. */
export type ReadoutStep =
  | { kind: 'reading' }
  | { kind: 'read-failed' }
  | { kind: 'update-the-wallet' }
  | { kind: 'no-details' }
  | { kind: 'mismatch' }
  | { kind: 'locked'; level: HiddenLevel; shape?: ShapeNote; unlock: UnlockState }
  | { kind: 'readable'; level: PrivacyLevel; configuration: Configuration }
  /** The readout sends the holder on to another screen. */
  | { kind: 'leaving' }

export interface ReadoutState {
  step: ReadoutStep
  /** Runs again the read that failed. */
  retry: () => void
  unlock: (password: string) => void
  /** Leaves the wrong password's blocker for the password field. */
  askAgain: () => void
  onContinue: () => void
  continuing: boolean
  /** The opened setup at Public could not be kept on this device, so the readout does not move on. */
  writeFailed: boolean
  /** Keeps the opened setup again, then moves on where the failed write stopped. */
  retryWrite: () => void
}

export interface ReadoutOptions {
  client: ReadoutClient
  records: Pick<WalletRecords, 'recoverySession' | 'decryptedSetupCache'>
  chainId: ChainId
  /** The account being recovered. */
  account: Address
  entry: RecoveryEntryRecord
  navigate: (to: string) => void
}

/** A read of the recovery entry record. */
export type EntryRecordRead =
  | { status: 'pending' }
  | { status: 'present'; entry: RecoveryEntryRecord }
  | { status: 'absent' }
  | { status: 'failed' }

export interface ReadoutEntryState {
  read: EntryRecordRead
  retry: () => void
}

/** One row of the readout's path. */
export interface ReadoutRow {
  /** The row's value: a guardian's address, a passkey's name, the kind's name, or the hidden value. */
  name: string
  /** The kind word beside the value, where the value is not the kind's name itself. */
  aside: string | null
  /** The hidden chip beside a masked value. */
  chip: string | null
  /** The lines under the row, in order. */
  lines: string[]
  /** Whether this device can answer the row: false for a passkey of another origin or a method this build does not know. */
  answerable: boolean
}

/** One clause of the readout: a required row, or a group with its threshold. */
export interface ReadoutClause {
  threshold: number
  required: boolean
  rows: ReadoutRow[]
}

/** The path as the readout draws it: the clauses, the rule lines and the waiting period. */
export interface ReadoutPath {
  clauses: ReadoutClause[]
  ruleLines: string[]
  /** The waiting period, or the hidden value. */
  wait: string
  /** The hidden chip beside a masked waiting period. */
  waitChip: string | null
  /** Whether a group lets the holder pick which members answer. */
  choice: boolean
  /** Why this device cannot complete the path, or null where it can or cannot tell yet. */
  blocked: ReadoutBlock | null
}

/** Why the methods this device can answer do not complete the path: a passkey of another origin, or a method this build does not know. */
export type ReadoutBlock = 'origin' | 'unsupported'

/** The values the readout's rows read beside the configuration. */
export interface ReadoutRowContext {
  addressBook: AddressBook
  /** The relying-party hash of this build's origin. */
  ownRpIdHash: Hex
}

export interface ReadoutStageProps {
  records: ReadoutOptions['records']
  chainId: ChainId
  account: Address
  entry: RecoveryEntryRecord
  networkName: string
  context: ReadoutRowContext
  navigate: (to: string) => void
}

export interface ReadoutViewProps {
  state: ReadoutState
  account: Address
  networkName: string
  context: ReadoutRowContext
  onBack: () => void
}

export interface ReadoutPasswordAskProps {
  level: HiddenLevel
  unlock: UnlockState
  networkName: string
  onUnlock: (password: string) => void
  onAskAgain: () => void
  onRetry: () => void
  onBack: () => void
}

export interface ReadoutPathBlockProps {
  path: ReadoutPath
}
