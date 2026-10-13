import type {
  Address,
  Assessment,
  Configuration,
  Gathering,
  Hex,
  PreparedCall,
  RecoveryState
} from '@web/modules/social-recovery/sdk-interfaces'
import type {
  ChainReads,
  KeyHandle,
  ListedAccountFacts,
  ReceiptReads,
  RecoveryKitClient,
  SendPort,
  SendRequestPort,
  TransactionKnown
} from '@web/modules/social-recovery/shared/client'
import type {
  ChainId,
  LiveRecoverySession,
  RecoveryEntryRecord,
  RecoveryRoute,
  RecoverySessionRecord,
  SessionRead,
  SessionRevision,
  SubmissionInFlightClaim,
  SubmissionInFlightRecord,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'
import type {
  GasCheck,
  GasNetwork,
  UnknownReading,
  WriteEvent,
  WriteMachineState
} from '@web/modules/social-recovery/shared/writes'
import type {
  ChecklistLayout,
  ChecklistRow,
  Navigate,
  RemovedKeyRead
} from '@web/modules/social-recovery/recovery/checklist'

import type { ALREADY_RUNNING_CAUSES, ALREADY_RUNNING_FINDINGS } from './constants'

// ---------------------------------------------------------------------------
// The client and the page
// ---------------------------------------------------------------------------

export type SubmitKitClient = Pick<
  RecoveryKitClient,
  'recovery' | 'setup' | 'walletReads' | 'action'
>

/** The recovery client of the account being recovered, as the screen reads it. */
export type SubmitClient =
  | { status: 'loading' }
  | { status: 'ready'; client: SubmitKitClient; reads: ChainReads; receipts: ReceiptReads }
  | { status: 'update-the-wallet' }
  | { status: 'failed' }

/** The recovery entry record of the account being recovered, as the screen reads it. */
export type AlreadyRunningCause = typeof ALREADY_RUNNING_CAUSES[number]

export type AlreadyRunningFinding = typeof ALREADY_RUNNING_FINDINGS[number]

// ---------------------------------------------------------------------------
// The confirmation's load
// ---------------------------------------------------------------------------

/** What the confirmation renders from: the live session, the setup's configuration and the set the submission carries. */
export interface SubmitReady {
  phase: 'ready'
  session: LiveRecoverySession
  revision: SessionRevision
  configuration: Configuration
  layout: ChecklistLayout
  assessment: Assessment
  /** The places of the smallest set the client chose for the submission. */
  chosen: ReadonlySet<number>
}

export type SubmitLoadFailure = 'records' | 'setup' | 'client'

export type SubmitLoad =
  | { phase: 'loading' }
  | { phase: 'update-the-wallet' }
  | { phase: 'failed'; cause: SubmitLoadFailure }
  | SubmitReady

export interface SubmitLoadInput {
  records: WalletRecords
  chainId: ChainId
  account: Address
  client: SubmitClient
  navigate: Navigate
  readPassword: (chainId: ChainId, account: Address) => string | undefined
  /** Milliseconds since epoch. */
  now: () => number
}

export interface SubmitLoadHook {
  load: SubmitLoad
  retry: () => void
}

// ---------------------------------------------------------------------------
// The verify again
// ---------------------------------------------------------------------------

/**
 * The verify of every approval of the set before the confirmation: running,
 * every one satisfied, one rejected, or a read that failed.
 */
export type VerifyReading =
  | { status: 'checking' }
  | { status: 'verified' }
  | { status: 'rejected'; place: number }
  | { status: 'failed' }

export type VerifyStepResult = 'satisfied' | 'rejected' | 'failed'

export interface VerifyHook {
  verify: VerifyReading
  retry: () => void
}

// ---------------------------------------------------------------------------
// The sending key
// ---------------------------------------------------------------------------

/**
 * How the submission is sent: from a basic account's own key as its own
 * transaction (on the fast track, the key the recovery installs), or as a
 * smart account's own batch, with its controlling key as the payer.
 */
export type SendingPlan =
  | { kind: 'key'; key: KeyHandle }
  | { kind: 'account-batch'; key: KeyHandle; facts: ListedAccountFacts; account: Address }

/**
 * The sending key as the screen reads it: loading, ready, none the wallet
 * holds, or the wallet's facts of the receiving account not read.
 */
export type SendingReading =
  | { status: 'loading' }
  | { status: 'ready'; plan: SendingPlan; network: GasNetwork }
  | { status: 'unavailable' }
  | { status: 'failed' }

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** After a landed receipt: the attempt read, its failure, and the landing of the session. */
export type AfterLanding = 'none' | 'confirming' | 'unread' | 'landed'

/** The read of a claim stored before anything ran: reading, none stored, or a read that failed. */
export type ClaimLookup = 'reading' | 'none' | 'failed'

/** A claim with no hash that the run follows, sent from another page or before a reload. */
export type FollowedClaim = Omit<SubmissionInFlightRecord, 'transactionHash'>

export interface SubmitState {
  write: WriteMachineState
  lookup?: ClaimLookup
  /** The claim this run wrote and sends under. */
  requestId?: string
  /** A claim with no hash this run follows instead of sending. */
  follow?: FollowedClaim
  /** The claim whose hash this run follows. */
  followed?: string
  prepared?: PreparedCall
  /** The sending key's latest balance while the deposit step shows. */
  balance?: bigint
  /** The manager refuses the start because another attempt runs on the account. */
  refusal?: 'already-running'
  /** The attempt this run would start was found started while no page followed its hash. */
  landedUnseen?: boolean
  /** The run ended because the screen goes back to the checklist: the set changed, the session went, or it is another request's. */
  toChecklist?: boolean
  /** The first reading that the node knows none of the run's transactions, kept until a second one apart from it. */
  unknownReading?: UnknownReading
  /** The run's transactions read as dropped: the claim released and the start offered again. */
  dropped?: true
  after: AfterLanding
}

export type SubmitEvent =
  | { type: 'write'; event: WriteEvent }
  | { type: 'lookup'; run: number; reading: ClaimLookup }
  | { type: 'prepared'; run: number; prepared: PreparedCall }
  | { type: 'claimed'; run: number; requestId: string }
  | { type: 'released'; run: number }
  | { type: 'follow'; run: number; claim: SubmissionInFlightRecord }
  | { type: 'voided'; run: number }
  | { type: 'dropped'; run: number }
  | { type: 'unknownRead'; run: number; reading: UnknownReading }
  | { type: 'unknownCleared'; run: number }
  | { type: 'leftDeposit'; run: number }
  | { type: 'toChecklist'; run: number }
  | { type: 'refused'; run: number }
  | { type: 'balance'; run: number; balance: bigint }
  | { type: 'landedUnseen'; run: number }
  | { type: 'confirming'; run: number }
  | { type: 'unread'; run: number }
  | { type: 'landed'; run: number }

export interface SubmitStore {
  state(): SubmitState
  dispatch(event: SubmitEvent): void
  subscribe(listener: () => void): () => void
}

/** What the attempt read says of the attempt this request would start. */
export type AttemptReading = 'ours' | 'other' | 'none'

/** The judgement of a followed claim with no hash older than the claim's age. */
export type OldClaimReading =
  | { status: 'wait' }
  | { status: 'started' }
  | { status: 'hashed'; transactionHash: Hex }
  | { status: 'released' }
  | { status: 'gone' }

/**
 * The claim of the submission: written under this run's request id; another
 * page's claim found, which is followed; or a stored session that is another
 * request's, on which nothing is claimed.
 */
export type SubmitClaim =
  | { status: 'claimed' }
  | { status: 'followed'; submission: SubmissionInFlightRecord }
  | { status: 'other-request' }

/** The landing of the session: done, or refused since the stored session is another request's. */
export type LandOutcome = 'landed' | 'other-request'

/** The prepared start, or a set of approvals other than the one the screen verified and shows. */
export type PrepareOutcome =
  | { status: 'prepared'; prepared: PreparedCall }
  | { status: 'set-changed' }

/**
 * The release of a claim that may not carry a hash the caller does not know:
 * released; kept, since it now carries another hash; or gone already, or
 * replaced by another claim.
 */
export type ClaimRelease =
  | { status: 'released' }
  | { status: 'hashed'; transactionHash: Hex }
  | { status: 'gone' }

/**
 * Where the wallet holds the request a claim was queued under: still held
 * (queued, or on a route it cannot follow), broadcast under a hash, or no
 * longer held anywhere.
 */
export type RequestHold =
  | { status: 'held' }
  | { status: 'broadcast'; transactionHash: Hex }
  | { status: 'free' }

/** The submission's steps over the wallet's seams. */
export interface SubmitSteps {
  readSession(): Promise<SessionRead>
  attemptRead(): Promise<RecoveryState>
  /** The attempt this request would start, as one attempt read names it. */
  attemptOf(state: RecoveryState): AttemptReading
  /**
   * Whether a stored session is this run's: a live one whose request is this
   * run's, or a landed one under this request's attempt.
   */
  ownsSession(session: RecoverySessionRecord): boolean
  /** The request from the smallest set, and the start call it prepares, where its set is the one verified. */
  prepare(): Promise<PrepareOutcome>
  checkGas(prepared: PreparedCall): Promise<GasCheck>
  blockNumber(): Promise<number>
  newRequestId(): string
  /** Milliseconds since epoch. */
  now(): number
  /** The claim on the live session, read again after another tab moved it. */
  claim(claim: SubmissionInFlightClaim): Promise<SubmitClaim>
  /** The hash on the claim; where another tab released the claim meanwhile, the claim written back with it. */
  markSent(claim: SubmissionInFlightClaim, transactionHash: Hex): Promise<void>
  release(requestId: string): Promise<void>
  /** Releases the claim under `requestId` where it carries no hash or one of `hashes`. */
  releaseClaim(requestId: string, hashes: readonly Hex[]): Promise<ClaimRelease>
  /** How old a claim with no hash grows before the manager's events judge it, in ms. */
  claimAgeMs: number
  /** Where the wallet holds the request a claim was queued under. */
  requestHold(requestId: string): Promise<RequestHold>
  transactionKnown(transactionHash: Hex): Promise<TransactionKnown>
  send(
    prepared: PreparedCall,
    dispatch: (event: WriteEvent) => void,
    run: number,
    startBlock: number,
    requestId: string,
    /** Awaited before the receipt wait, so the claim holds the hash before a receipt can end the run. */
    beforeReceipt: () => Promise<void>
  ): Promise<void>
  waitAgain(
    transactionHash: Hex,
    startBlock: number | undefined,
    dispatch: (event: WriteEvent) => void,
    run: number
  ): Promise<void>
  /** Whether the manager's events name this request's attempt started since the claim's block. */
  startedSince(claim: FollowedClaim): Promise<boolean>
  /** The session landed as the countdown's record, read again after another tab moved it. */
  land(): Promise<LandOutcome>
}

export interface SubmitStepsInput {
  client: SubmitKitClient
  reads: ChainReads
  receipts: ReceiptReads
  port: SendPort
  requests: SendRequestPort
  records: WalletRecords
  chainId: ChainId
  account: Address
  gathering: Gathering
  plan: SendingPlan
  network: GasNetwork
  /** The places of the set the screen verified and shows. */
  chosen: ReadonlySet<number>
  now: () => number
}

export interface SubmitRun {
  state: SubmitState
  start: () => void
  /** Waits for a hash's receipt again, or reads a followed claim again at once. */
  checkAgain: () => void
  /** Reads the attempt again after a landing it did not confirm. */
  reread: () => void
  /** Leaves the deposit step: the prepared start is dropped, so a return prepares and verifies again. */
  leaveDeposit: () => void
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/** The three values of the lead and what their lines need. */
export interface LeadInput {
  account: Address
  /** The name the public name service resolves for the account, where one does. */
  name?: string
  newKey?: Address
  /** The receiving account's name in this wallet, for the logged-in route's new-key line. */
  receivingName?: string
  removed: RemovedKeyRead
}

/** One row of the path block: its kind's name, its label and whether the submission carries it. */
export interface PathRowView {
  row: ChecklistRow
  title: string
  label?: string
  carried: boolean
}

export interface SubmitViewProps {
  route: RecoveryRoute
  load: SubmitLoad
  lead: LeadInput
  verify: VerifyReading
  run: SubmitState
  sending: SendingReading
  onStart: () => void
  onCheckAgain: () => void
  onReread: () => void
  onRetryVerify: () => void
  onRetryLoad: () => void
  onRetryRemoved: () => void
  onRetrySending: () => void
  onBack: () => void
}

export interface SubmitBodyProps {
  records: WalletRecords
  account: Address
  entry: RecoveryEntryRecord
}

export interface LeadBlockProps {
  route: RecoveryRoute
  lead: LeadInput
  onRetryRemoved: () => void
}

export interface DetailsBlockProps {
  route: RecoveryRoute
  ready: SubmitReady
  /** Called each time the expander opens, so the lock knows the payment line rendered. */
  onOpened: () => void
}

export interface RunBlockProps {
  run: SubmitState
  onStart: () => void
  onCheckAgain: () => void
  onReread: () => void
  onBack: () => void
}
