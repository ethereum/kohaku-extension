import type {
  Address,
  Hex,
  ISetupClient,
  PreparedBatch,
  PreparedCall,
  SetupConfirmation,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'
import type {
  AccountFactsReading,
  AuditedAction,
  ChainReads,
  EstimationListener,
  FeeReading,
  KeyHandle,
  ListedAccountFacts,
  ReceiptWait,
  RecoveryChain,
  RecoveryKitClient,
  SendPort,
  SendRequestPort,
  SendRequestState,
  UnknownAction
} from '@web/modules/social-recovery/shared/client'
import type {
  ChainId,
  Enrollment,
  RecordRead,
  SaveInFlightClaimResult,
  SaveInFlightRecord,
  SetupRecords,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'
import type {
  GasCheck,
  WriteEvent,
  WriteMachineState
} from '@web/modules/social-recovery/shared/writes'
import type { CardLevel } from '@web/modules/social-recovery/setup/card'
import type { AccountReads, SaveBlock, SaveGate } from '@web/modules/social-recovery/setup/review'

// ---------------------------------------------------------------------------
// The check after the batch lands
// ---------------------------------------------------------------------------

/** The check that disagreed after a landed save: the commitment, or the module's authorization. */
export type DisagreedCheck = 'mismatch' | 'authorization'

/**
 * What the check after a landed save reads: the setup agrees and the module
 * recognizes the account's authorization; one of the two disagrees; or the
 * check itself did not answer.
 */
export type ConfirmOutcome =
  | { kind: 'agreed' }
  | { kind: 'disagreed'; check: DisagreedCheck }
  | { kind: 'unread' }

export interface ConfirmReadOptions {
  /**
   * How long one read may take before it reads as unanswered, in ms. Each wait
   * for a new block before a further read takes no longer than this either.
   */
  timeoutMs?: number
}

/** Waits for the chain to move past the block it reads now, for at most `limitMs`; never rejects. */
export type NewBlockWait = (limitMs: number) => Promise<void>

/** How the check is read: the read's limit, and the wait for a new block before each further read. */
export interface ConfirmOutcomeOptions extends ConfirmReadOptions {
  newBlock?: NewBlockWait
}

/** The member a thrown value may carry that the check reads: a coded error's code. */
export interface ThrownFields {
  code?: unknown
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** The save as prepared: the draft it commits, the prepared write and the batch's calls in order. */
export interface PreparedSave {
  draft: SetupDraft
  prepared: PreparedCall | PreparedBatch
  calls: readonly PreparedCall[]
}

/**
 * Where the save stands after its batch landed: not there yet, the check
 * running, the records being wiped after the check agreed, saved, the check
 * disagreed, or the check did not answer.
 */
export type AfterLanding =
  | { stage: 'none' }
  | { stage: 'confirming' }
  | { stage: 'saving' }
  | { stage: 'saved' }
  | { stage: 'disagreed'; check: DisagreedCheck }
  | { stage: 'unread' }

/** Why a run ended before it prepared anything: the account already holds a setup. */
export type ArmStop = 'already-set-up'

/**
 * The read of a save in flight stored on this device, before the save is
 * offered: still reading, none stored, or a read that failed.
 */
export type InFlightLookup = 'reading' | 'none' | 'failed'

/**
 * Where a followed save in flight stands while it holds no hash: still in the
 * wallet's queue, a read of the wallet's activity that did not answer, or a
 * request neither the queue nor the activity holds, read again for a while.
 */
export type FollowReading = 'queued' | 'unread' | 'gone'

/**
 * The save's state: the shared write's state, the prepared save of its run,
 * what follows the landing, and the marks of the run: a setup the account
 * already held, the sign screen's last estimation, a receipt wait that failed
 * while the batch may still land, the request the run holds in flight, and a
 * landing seen only in the account's setup.
 */
export interface ArmState {
  write: WriteMachineState
  /** The save the run prepared, or the stored one it follows; absent until either is known. */
  prepared?: PreparedSave
  after: AfterLanding
  /** Set where the run found a setup on the account before it prepared; nothing moves the run after it. */
  stop?: ArmStop
  /** The sign screen's last estimation of the run's batch. */
  estimation?: FeeReading
  /**
   * True while the run submits a hash whose receipt wait failed or ran past its
   * limit, until the holder asks to check again or the write leaves submitting.
   */
  stalled?: boolean
  /** The read of a stored save in flight; absent until the first read starts. */
  lookup?: InFlightLookup
  /** The id of the request the stored save in flight names, while the run holds it. */
  requestId?: string
  /** Where the followed request stands while the run holds no hash. */
  follow?: FollowReading
  /**
   * True where the account's setup shows the save landed while no page
   * followed its hash: the check runs as after a landed receipt.
   */
  landedUnseen?: true
}

/** What moves the save. Every event but `write` carries the run it answers. */
export type ArmEvent =
  | { type: 'write'; event: WriteEvent }
  | { type: 'lookup'; run: number; reading: InFlightLookup }
  | { type: 'alreadySetUp'; run: number }
  | { type: 'prepared'; run: number; prepared: PreparedSave }
  | { type: 'claimed'; run: number; requestId: string }
  | {
      type: 'follow'
      run: number
      requestId: string
      prepared: PreparedSave
      transactionHash?: Hex
      startBlock?: number
    }
  | { type: 'followed'; run: number; reading: FollowReading }
  | { type: 'landedUnseen'; run: number }
  | { type: 'released'; run: number }
  | { type: 'voided'; run: number }
  | { type: 'estimated'; run: number; reading: FeeReading }
  | { type: 'waitStalled'; run: number }
  | { type: 'waitResumed'; run: number }
  | { type: 'confirming'; run: number }
  | { type: 'confirmed'; run: number; outcome: ConfirmOutcome }
  | { type: 'wiped'; run: number }

/** The save's state held outside React, so the run reads where it stands between its steps. */
export interface ArmStore {
  state(): ArmState
  dispatch(event: ArmEvent): void
  /** Calls the listener after each change; returns the unsubscribe. */
  subscribe(listener: () => void): () => void
}

/** The steps of one save, each over the wallet's own seams. */
export interface SaveSteps {
  /** Whether the account already holds a setup, read from the chain at this moment. */
  hasSetup(): Promise<boolean>
  /** The draft as it is committed, the prepared write and its calls. */
  prepare(): Promise<PreparedSave>
  /** The gas check of the batch the controlling key sends. */
  checkGas(save: PreparedSave): Promise<GasCheck>
  /** The account the save writes to. */
  account: Address
  /** A stored save as the run checks it: the draft and the prepared write it sent, and its calls. */
  followedSave(record: SaveInFlightRecord): PreparedSave
  /** A new id for the batch's request in the wallet's queue. */
  newRequestId(): string
  /** The save in flight stored on this device for the account, where one is. */
  readInFlight(): Promise<RecordRead<SaveInFlightRecord>>
  /**
   * Stores the save in flight where none is, with the block read before the
   * send where it was read; answers whether it did, and the record stored.
   */
  claim(
    save: PreparedSave,
    requestId: string,
    startBlock?: number
  ): Promise<SaveInFlightClaimResult>
  /**
   * Writes the hash into the stored save in flight of `requestId`, and the
   * start block where one is given; with none, the record keeps the claim's.
   * Answers the record stored after it.
   */
  markSent(
    requestId: string,
    transactionHash: Hex,
    startBlock?: number
  ): Promise<RecordRead<SaveInFlightRecord>>
  /** Removes the stored save in flight of `requestId`. */
  release(requestId: string): Promise<void>
  /** Where the wallet holds the request `requestId`: its queue, its activity, or neither. */
  requestState(requestId: string): Promise<SendRequestState>
  /** Resolves on the next change of the wallet's queue, or after `limitMs`; never rejects. */
  queueMoved(limitMs: number): Promise<void>
  /** The chain's block number now. */
  blockNumber(): Promise<number>
  /**
   * Sends the batch under `requestId` and follows its receipt from
   * `startBlock`, feeding the write's events to `dispatch`; `onEstimation`
   * hears the sign screen's estimation of the batch. Nothing is read from the
   * network before the request is handed to the wallet.
   */
  send(
    save: PreparedSave,
    dispatch: (event: WriteEvent) => void,
    run: number,
    requestId: string,
    startBlock: number,
    onEstimation?: EstimationListener
  ): Promise<void>
  /**
   * Waits again for the receipt of a hash the run already sent, feeding the
   * answer to `dispatch`; `startBlock` is the block read before the send.
   */
  waitAgain(
    transactionHash: Hex,
    startBlock: number | undefined,
    dispatch: (event: WriteEvent) => void,
    run: number
  ): Promise<void>
  /** The check after the batch lands. */
  confirm(save: PreparedSave): Promise<SetupConfirmation>
  /** Waits for a new block before the check reads again. */
  newBlock: NewBlockWait
  /** Wipes the six setup records. */
  wipe(): Promise<void>
}

/**
 * The follow of a stored save in flight that holds no hash: the steps it
 * started with, the run and the request it follows, and the block the stored
 * save holds, where it holds one.
 */
export interface FollowHold {
  steps: SaveSteps
  run: number
  requestId: string
  startBlock?: number
}

/** A follow as it reads now: its hold and the steps it reads through. */
export interface FollowAt {
  hold: FollowHold
  steps: SaveSteps
}

/**
 * The gone readings of a follow since its last other reading: the hold and
 * the steps they were read through, and the time of the first (ms since epoch).
 */
export interface GoneCount extends FollowAt {
  since: number
}

/** The part of the recovery client the save runs on. */
export type ArmKitClient = Pick<RecoveryKitClient, 'descriptor'> & {
  setup: Pick<ISetupClient, 'setupState' | 'prepareCommitSetup' | 'confirmSetup'>
}

/** What the save's steps are built from. */
export interface SaveStepsInput {
  client: ArmKitClient
  reads: ChainReads
  receipts: ReceiptWait
  port: SendPort
  /** The wallet's queue and activity, read for a request another page queued. */
  requests: SendRequestPort
  records: Pick<WalletRecords, 'saveSetup' | 'saveInFlight'>
  setup: Pick<SetupRecords, 'writeDraftAndPath'>
  chainId: ChainId
  account: Address
  /** The account's facts; the account library builds the batch's transaction from them. */
  facts: ListedAccountFacts
  /** The account's controlling key, which sends the batch and pays its gas. */
  key: KeyHandle
  /** The setup draft as the records hold it. */
  draft: SetupDraft
  /** The recovery password in memory, for an encrypted backup. */
  password: string | undefined
}

// ---------------------------------------------------------------------------
// Arrival
// ---------------------------------------------------------------------------

/** The client as the save takes it. */
export type ArmClientStatus = 'loading' | 'ready' | 'update-the-wallet' | 'failed'

/** The setup records the save reads on arrival. */
export type ArmLoad =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; draft: SetupDraft; enrollments: Enrollment[]; passwordSet: boolean }

/** The setup records as read, with a retry of a read that failed. */
export interface SaveLoad {
  load: ArmLoad
  retry: () => void
}

/** What decides the save on arrival. */
export interface ArrivalInput {
  facts: AccountFactsReading
  client: ArmClientStatus
  load: ArmLoad
  /** The review's gate, run again over the same reads. */
  gate: SaveGate
  /** The setup read of the review's reads; a setup it finds blocks before any other block of the gate. */
  setupState: AccountReads['setupState']
  /** Whether the recovery password is in memory. */
  passwordHeld: boolean
  /** The read of a stored save in flight; undefined until it starts. */
  inFlight: InFlightLookup | undefined
}

/** Which retry clears an unavailable arrival, where one does. */
export type ArrivalRetry = 'facts' | 'client' | null

/**
 * Why an unavailable arrival offers no retry: the wallet does not list the
 * account or reaches no network for it, or holds no key for it.
 */
export type ArrivalUnavailableCause = 'not-listed' | 'view-only'

/**
 * The save on arrival: still reading, unavailable, a wallet that must update,
 * records that could not be read, a block the review's gate (or the missing
 * recovery password) raises, or ready to send.
 */
export type Arrival =
  | { kind: 'loading' }
  | { kind: 'unavailable'; retry: Exclude<ArrivalRetry, null> }
  | { kind: 'unavailable'; retry: null; cause: ArrivalUnavailableCause }
  | { kind: 'update-the-wallet' }
  | { kind: 'load-failed' }
  | { kind: 'blocked'; block: SaveBlock }
  | { kind: 'ready' }

/**
 * What the screen shows: the arrival, the run, a setup the run found already
 * there, the check running, saved, disagreed or the check unanswered.
 */
export type ArmScreenKind =
  | 'arrival'
  | 'run'
  | 'already-set-up'
  | 'confirming'
  | 'saved'
  | 'disagreed'
  | 'unread'

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/** The keys of the save's own title and sentence over a shared write state. */
export interface SaveWriteKeys {
  title?: string
  /** The save's own line in place of the shared state's lines. */
  body?: string
  note?: string
}

/** The account the save writes to and the key a recovery would remove, as the view shows them. */
export interface ArmAccount {
  address: Address
  /** The label the wallet holds for the account, where it holds one. */
  label?: string
  /** The key a recovery would remove, as the reads named it. */
  removedKey?: Address
  /** Whether the account has code on the chain; undefined until the facts are read. */
  deployed?: boolean
}

export interface ArmViewProps {
  arrival: Arrival
  state: ArmState
  account: ArmAccount
  /** The action that will hold the account's authority, where the client named it. */
  action?: AuditedAction | UnknownAction
  chain: RecoveryChain
  /** The level the Recovery Card shows. */
  level: CardLevel
  /** Retries the arrival's reads that did not answer. */
  onRetryReads: () => void
  /** Retries the arrival's unavailable read. */
  onRetryArrival: () => void
  /** Starts the save from a ready arrival; present where the screen offers the button rather than starting by itself. */
  onSave?: () => void
  /** Runs the save again from its prepare. */
  onRetry: () => void
  /**
   * Waits again for the receipt of the sent batch, where the wait failed, or
   * reads again where the wallet holds a followed request, where the read did
   * not answer.
   */
  onCheckAgain: () => void
  /** Reads the account's setup again, where the refused operation may still land. */
  onCheckSetup: () => void
  /** Runs the gas check again from the deposit blocker. */
  onRecheck: () => void
  /** Reads the check after the landing again. */
  onReread: () => void
  navigate: (to: string) => void
  openUrl: (url: string) => void
}

export interface SavedViewProps {
  /** The landed transaction; absent where the save landed while no page followed its hash. */
  transactionHash?: Hex
  chain: RecoveryChain
  account: ArmAccount
  level: CardLevel
  navigate: (to: string) => void
  openUrl: (url: string) => void
}

export interface DisagreedViewProps {
  /** The landed transaction; absent where the save landed while no page followed its hash. */
  transactionHash?: Hex
  chain: RecoveryChain
  /** The check that disagreed; absent where the check did not answer. */
  check?: DisagreedCheck
  onReread: () => void
  navigate: (to: string) => void
  openUrl: (url: string) => void
}

export interface ArmRun {
  state: ArmState
  /** Starts the save, or runs it again from a state that offers the retry. */
  start: () => void
  /** Runs the gas check again from the deposit blocker. */
  recheck: () => void
  /** Reads the check after the landing again, where it did not answer. */
  reread: () => void
  /**
   * Waits again for the receipt of the sent batch, where the wait failed, or
   * reads the followed request again, where its read did not answer.
   */
  checkAgain: () => void
  /** Reads the stored save in flight again, where its read failed. */
  lookAgain: () => void
  /** Reads the account's setup again after a refusal whose operation may still land. */
  checkSetup: () => void
  /** Checks a refusal whose operation may still land as after a landing, where a setup read found a setup. */
  endWhereSetUp: (hasSetup: boolean) => void
}
