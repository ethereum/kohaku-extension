/**
 * The record types. The setup draft is the SDK's own `SetupDraft` and the path
 * is the `clauses` it holds; the other records are this module's own types.
 * No record is a bare boolean or zero, since the storage read returns the
 * default for either: every stored record is a `StoredRecord`, an object
 * carrying its value and `savedAt`.
 */
import type { Storage } from '@ambire-common/interfaces/storage'
import type {
  Address,
  ApproverRequest,
  Configuration,
  Credential,
  Gathering,
  Hex,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'

/**
 * The storage the records sit on: the extension's own helper
 * (`src/web/extension-services/background/webapi/storage.ts`) or, in a test, an
 * in-memory double. `get` may return the default for a falsy stored value.
 * `getAll` returns every stored entry by key, what the helper's `get()` with no
 * key returns; the list functions need it and refuse a storage without it.
 */
export interface RecordStorage extends Storage {
  getAll?(): Promise<Record<string, unknown>>
}

/** The chain a record belongs to, as the network's chain id. */
export type ChainId = bigint | number

/** What the storage holds for every record: its value and when it was written (ms since epoch). */
export interface StoredRecord<T> {
  value: T
  savedAt: number
}

/** The explicit reading of a record that is not stored, never `false` or `0`. */
export interface AbsentRecord {
  status: 'absent'
}

/** A record read from storage. */
export type RecordRead<T> = AbsentRecord | ({ status: 'present' } & StoredRecord<T>)

/** The one absent reading every read returns for a record that is not stored. */
export const ABSENT: AbsentRecord = Object.freeze({ status: 'absent' as const })

// ---------------------------------------------------------------------------
// The six setup records
// ---------------------------------------------------------------------------

/** 1. The setup draft: the SDK's own record. */
export type SetupDraftRecord = SetupDraft

/**
 * 2. The inventory, the answer to "What do you have": another device,
 * guardians with wallets, a passport, an Aadhaar identity, and keys the holder
 * keeps on paper or hardware. The guided setup wizard fills it at its "What do
 * you have" step, a step that comes with the wizard in a later release.
 */
export const INVENTORY_ITEMS = [
  'another-device',
  'guardian-wallets',
  'passport',
  'aadhaar',
  'own-keys'
] as const
export type InventoryItem = typeof INVENTORY_ITEMS[number]
export type InventoryRecord = InventoryItem[]

/** 3. The path: the clauses the setup draft holds, the record the rule lines read. */
export type PathRecord = SetupDraft['clauses']

/** The access test verdicts an enrollment carries: passed, or one of the four verdict states. */
export const ENROLLMENT_TEST_VERDICTS = [
  'passed',
  'not-tested',
  'failed',
  'unavailable',
  'not-supported'
] as const
export type EnrollmentTestVerdict = typeof ENROLLMENT_TEST_VERDICTS[number]

/**
 * The kind line of a passkey row: a synced passkey follows the provider
 * account that syncs it; a device-bound passkey lives only on this device. Read
 * from the authenticator's own flags at enrollment.
 */
export const PASSKEY_BACKUP_KINDS = ['synced', 'device-bound'] as const
export type PasskeyBackupKind = typeof PASSKEY_BACKUP_KINDS[number]

/**
 * One enrollment not yet saved on chain: the credential it produced, its
 * access test verdict with the cause a failed test reported, and for a passkey
 * its backup kind.
 */
export interface Enrollment {
  credential: Credential
  test: EnrollmentTestVerdict
  cause?: string
  backup?: PasskeyBackupKind
}

/** 4. The enrollments. */
export type EnrollmentsRecord = Enrollment[]

/** 5. The waiting period, in seconds, the type the setup draft's `wait` carries. */
export type WaitingPeriodRecord = SetupDraft['wait']

/**
 * 6. The password-set flag. Never a boolean: the record's presence says the
 * holder set the recovery password, and its value is this one marker.
 */
export const PASSWORD_SET = 'password-set' as const
export type PasswordSetRecord = typeof PASSWORD_SET

/** The six setup records by name, the keys save and start over wipe. */
export const SETUP_RECORD_NAMES = [
  'setupDraft',
  'inventory',
  'path',
  'enrollments',
  'waitingPeriod',
  'passwordSet'
] as const
export type SetupRecordName = typeof SETUP_RECORD_NAMES[number]

export interface SetupRecordValues {
  setupDraft: SetupDraftRecord
  inventory: InventoryRecord
  path: PathRecord
  enrollments: EnrollmentsRecord
  waitingPeriod: WaitingPeriodRecord
  passwordSet: PasswordSetRecord
}

// ---------------------------------------------------------------------------
// The recovery session, the five wipe events and the countdown
// ---------------------------------------------------------------------------

/**
 * The five events that wipe the recovery session: the submission lands, the
 * request's deadline passes, another attempt opens, the setup changes, or the
 * recoverer abandons. A closed vocabulary: a security stop or a pause is not
 * one of them and wipes nothing.
 */
export const RECOVERY_WIPE_EVENTS = [
  'submission-landed',
  'deadline-passed',
  'another-attempt-opened',
  'setup-changed',
  'recoverer-abandoned'
] as const
export type RecoveryWipeEvent = typeof RECOVERY_WIPE_EVENTS[number]

/** The one line of reason a wipe keeps: the event that wiped the session. */
export type WipeReason = RecoveryWipeEvent

/**
 * The four events `wipeRecoverySession` takes directly. The submission landing
 * runs through `landSubmission`, which turns the session into its landed state.
 */
export type DirectWipeEvent = Exclude<RecoveryWipeEvent, 'submission-landed'>

/**
 * The live recovery session: the SDK's gathering record, stored so the
 * gathering survives a closed tab. Its request carries everything a resume
 * needs: the account, the predicted attempt id (the attempt id the wallet built
 * the request against), the setup nonce the request was built under and the
 * deadline (`validUntil`). Its replies are the approvals. The gathering's
 * purpose is `approval`.
 */
export interface LiveRecoverySession {
  state: 'live'
  gathering: Gathering
}

/**
 * What a wipe leaves: the reason code, the account it names, and for
 * `deadline-passed` the deadline that passed (the request's `validUntil`, a
 * decimal string), from which the expired, void and setup changed states render
 * after a resume. The gathering, its replies and its attempt id are gone.
 */
export interface WipedRecoverySession {
  state: 'wiped'
  /** One of the four direct events; the submission landing leaves the landed state instead. */
  reason: DirectWipeEvent
  account: Address
  deadline?: string
}

/**
 * The session after the submission lands: it survives as the countdown's
 * record, holding the account address alone. The countdown reads the attempt id
 * from the chain. The gathering, its replies and its attempt id are gone.
 */
export interface LandedRecoverySession {
  state: 'landed'
  account: Address
}

export type RecoverySessionRecord =
  | LiveRecoverySession
  | WipedRecoverySession
  | LandedRecoverySession

/**
 * The token a stored recovery session carries. Every update stores a new one,
 * so an update can refuse when the session changed after its caller read it.
 */
export type SessionRevision = string

/**
 * The revision an update of the recovery session expects to find: the one its
 * caller read, or `null` when the caller read no session.
 */
export type ExpectedRevision = SessionRevision | null

/** A stored recovery session: its value, when it was written and its revision. */
export interface StoredSession extends StoredRecord<RecoverySessionRecord> {
  revision: SessionRevision
}

/** A read of the recovery session. */
export type SessionRead = AbsentRecord | ({ status: 'present' } & StoredSession)

/**
 * The countdown's record as `countdown(chainId, account)` reads it from the
 * landed session: the account address alone.
 */
export interface CountdownRecord {
  account: Address
}

/** A read of the countdown, with the revision of the landed session it reads from. */
export type CountdownRead =
  | AbsentRecord
  | ({ status: 'present'; revision: SessionRevision } & StoredRecord<CountdownRecord>)

/**
 * The decrypted setup cache: the setup the recovery password unlocked on this
 * device, kept after the recovery executes, with the setup nonce it was read
 * under and, where known, the setup commitment. The chain stays the source: a
 * reader compares the nonce or the commitment with the chain before trusting
 * the cache.
 */
export interface DecryptedSetupCacheRecord {
  configuration: Configuration
  setupNonce: bigint
  setupCommitment?: Hex
}

/** One account's record in a listing of a chain's sessions or countdowns, with its revision. */
export interface ListedRecord<T> {
  account: Address
  record: StoredRecord<T> & { revision: SessionRevision }
}

// ---------------------------------------------------------------------------
// The ceremony request
// ---------------------------------------------------------------------------

/** What every ceremony request names: the account and chain its client is built for, and the method. */
export interface CeremonyRequestTarget {
  account: Address
  chainId: ChainId
  /** The method's slug, the one the ceremony tab's route carries. */
  method: string
}

/**
 * The ceremony a caller asks the ceremony tab to run, stored under the request
 * id before the caller opens the tab, with what its call needs: an enrollment
 * its method address and params, an access test or a claim the request and
 * the method's params, a health check nothing more. It holds no approval
 * material: the outcome travels back in the tab's report alone.
 */
export type CeremonyRequestRecord =
  | (CeremonyRequestTarget & { call: 'enroll'; methodAddress: Address; params: unknown })
  | (CeremonyRequestTarget & {
      call: 'testAccess' | 'createClaim'
      request: ApproverRequest
      params?: unknown
    })
  | (CeremonyRequestTarget & { call: 'healthCheck' })

// ---------------------------------------------------------------------------
// What `createWalletRecords` returns
// ---------------------------------------------------------------------------

/** One record's typed read, write, wipe and age. */
export interface RecordAccessor<T> {
  read(): Promise<RecordRead<T>>
  write(value: T): Promise<StoredRecord<T>>
  wipe(): Promise<void>
  /** Milliseconds since the record was written, or `null` when it is absent. */
  age(at?: number): Promise<number | null>
}

export type SetupRecords = {
  [N in SetupRecordName]: RecordAccessor<SetupRecordValues[N]>
}

export interface RecoverySessionAccessor {
  read(): Promise<SessionRead>
  /**
   * Writes the live session from the SDK's gathering. `expectedRevision` is the
   * revision of the caller's read, or `null` when it read no session; when the
   * stored revision differs, the write throws `SessionRevisionConflict` and
   * writes nothing. Refuses a cancellation gathering, a gathering whose request
   * names another account or chain, a landed session, and over a live session a
   * gathering whose request differs in any field or that leaves a filled place
   * without a reply. Over a wiped session it starts the new gathering.
   */
  write(gathering: Gathering, expectedRevision: ExpectedRevision): Promise<StoredSession>
  age(at?: number): Promise<number | null>
}

/** The countdown's record, read from the session in its landed state. */
export interface CountdownAccessor {
  read(): Promise<CountdownRead>
  age(at?: number): Promise<number | null>
}

export interface WalletRecordsOptions {
  /** The extension's storage helper, or an in-memory double in a test. */
  storage: RecordStorage
  /** The clock `savedAt` and the default `age` read from, in ms since epoch. */
  now?: () => number
}

/** The records on one storage, by chain and account. */
export interface WalletRecords {
  setup(chainId: ChainId, account: Address): SetupRecords
  setupSavedAt(chainId: ChainId, account: Address): Promise<number | null>
  saveSetup(chainId: ChainId, account: Address): Promise<void>
  startOverSetup(chainId: ChainId, account: Address): Promise<void>
  recoverySession(chainId: ChainId, account: Address): RecoverySessionAccessor
  listRecoverySessions(chainId: ChainId): Promise<ListedRecord<RecoverySessionRecord>[]>
  wipeRecoverySession(
    chainId: ChainId,
    account: Address,
    event: DirectWipeEvent,
    expectedRevision: ExpectedRevision
  ): Promise<boolean>
  landSubmission(
    chainId: ChainId,
    account: Address,
    expectedRevision: ExpectedRevision
  ): Promise<StoredRecord<CountdownRecord> & { revision: SessionRevision }>
  clearWipedSession(
    chainId: ChainId,
    account: Address,
    expectedRevision: ExpectedRevision
  ): Promise<boolean>
  endCountdown(
    chainId: ChainId,
    account: Address,
    expectedRevision: ExpectedRevision
  ): Promise<boolean>
  countdown(chainId: ChainId, account: Address): CountdownAccessor
  listCountdowns(chainId: ChainId): Promise<ListedRecord<CountdownRecord>[]>
  decryptedSetupCache(chainId: ChainId, account: Address): RecordAccessor<DecryptedSetupCacheRecord>
  /**
   * The ceremony request stored under one request id, one from
   * `newCeremonyRequestId`. The caller writes it before it opens the ceremony
   * tab and wipes it once it has taken the tab's report; the tab only reads
   * it, so its Try again finds it again.
   */
  ceremonyRequest(id: string): RecordAccessor<CeremonyRequestRecord>
}

/**
 * The strings a death state renders from its reason code, keys under
 * `socialRecovery.records` in en.json. The submission landing renders the
 * countdown and the recoverer's own abandon renders no death state.
 */
export const WIPE_REASON_STRING_KEYS: Record<WipeReason, { title: string; body: string } | null> = {
  'submission-landed': null,
  'deadline-passed': {
    title: 'socialRecovery.records.expiredTitle',
    body: 'socialRecovery.records.expiredBody'
  },
  'another-attempt-opened': {
    title: 'socialRecovery.records.voidTitle',
    body: 'socialRecovery.records.voidBody'
  },
  'setup-changed': {
    title: 'socialRecovery.records.setupChangedTitle',
    body: 'socialRecovery.records.setupChangedBody'
  },
  'recoverer-abandoned': null
}
