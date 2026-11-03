import type {
  Address,
  Attempt,
  BlockHeader,
  CancelledBy,
  Configuration,
  Hex,
  KitNotification,
  PreparedCall
} from '@kohaku-eth/social-recovery'
import type { VisibilitySource } from '@web/modules/social-recovery/shared/ceremony'
import type {
  AddGate,
  ChainReads,
  ReceiptReads,
  RecoveryKitClient,
  SendPort,
  SendRequestPort,
  TransactionKnown
} from '@web/modules/social-recovery/shared/client'
import type {
  ChainId,
  CountdownRead,
  ExecutionClaimResult,
  ExecutionInFlightClaim,
  ExecutionInFlightRecord,
  RecoveryEntryRecord,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'
import type {
  GasCheck,
  GasNetwork,
  RequestHold,
  UnknownReading,
  WriteEvent,
  WriteMachineState
} from '@web/modules/social-recovery/shared/writes'
import type { SendingPlan, SendingReading } from '@web/modules/social-recovery/recovery/submit'

import type { CANNOT_EXECUTE_CAUSES } from './constants'

// ---------------------------------------------------------------------------
// The client and the page
// ---------------------------------------------------------------------------

export type WaitKitClient = Pick<
  RecoveryKitClient,
  'chain' | 'account' | 'descriptor' | 'recovery' | 'setup' | 'walletReads' | 'action'
>

/** The recovery client of the account being recovered, as the wait reads it. */
export type WaitClient =
  | { status: 'loading' }
  | { status: 'ready'; client: WaitKitClient; reads: ChainReads; receipts: ReceiptReads }
  | { status: 'update-the-wallet' }
  | { status: 'failed' }

/** The recovery entry record of the account being recovered, as the wait reads it. */
/**
 * The attempt the submission landed, as the countdown's record names it: its
 * id, its setup number and the hash of the payload it carried. Only the
 * attempt and the opening event with all three are the recovery's own.
 */
export interface LandedAttempt {
  attemptId: bigint
  setupNonce: bigint
  payloadHash: Hex
}

/**
 * The countdown's record: the landed session, when it was saved, the attempt
 * it landed, and when that attempt becomes executable in seconds since epoch,
 * each null where the record was stored without it.
 */
export type CountdownReading =
  | { status: 'loading' }
  | { status: 'failed' }
  | {
      status: 'present'
      savedAt: number
      landed: LandedAttempt | null
      executableAt: number | null
    }

// ---------------------------------------------------------------------------
// The poll
// ---------------------------------------------------------------------------

/**
 * The two keys of the handover the wait checks the account against: the key
 * the recovery installs, and the key it removes as this wallet read it, null
 * where the wallet no longer finds that key holding anything on the account.
 */
export interface HandoverKeys {
  newKey: Address
  removedKey: Address | null
}

/** The key being removed as this wallet read it: null where it names none holding on the account. */
export type RemovedKeyReading =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'named'; key: Address | null }

export type HandoverKeysReading =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; keys: HandoverKeys }

/** One poll's reads: the attempt with the block it is pinned to, and the account's four checks. */
export interface WaitFacts {
  attempt: Attempt
  block: BlockHeader
  /** The account still authorizes the action. */
  authorized: boolean
  /** The action still fits the account. */
  supported: boolean
  /** The key being removed still holds a key value on the account. */
  removedHolds: boolean
  /** The new key already holds a privilege on the account. */
  newKeyHolds: boolean
}

export type StartedNotice = Extract<KitNotification, { kind: 'attempt-started' }>
export type CancelledNotice = Extract<KitNotification, { kind: 'attempt-cancelled' }>

/**
 * What the manager's events tell of the recovery's attempt: its opening (the
 * payload the execution sends, the transaction that started it) and how it
 * ended where it ended. `rival` is set where an opening under the recovery's
 * id is not its own: the events under that id are then another's, and neither
 * an opening, a cancel nor a consume is taken from them.
 */
export interface AttemptStory {
  started?: StartedNotice
  cancelled?: CancelledNotice
  consumed: boolean
  rival: boolean
}

export type CannotExecuteCause = typeof CANNOT_EXECUTE_CAUSES[number]

/**
 * Whether the attempt a poll read is the recovery's own, another one, or one
 * under the recovery's id the wait cannot match as its own.
 */
export type AttemptMatch = 'ours' | 'other' | 'unmatched'

/** Where the recovery stands after one poll. */
export type WaitPhase =
  | { kind: 'waiting'; attempt: Attempt }
  | { kind: 'executionDue'; attempt: Attempt }
  | { kind: 'cannotExecute'; attempt: Attempt; cause: CannotExecuteCause }
  /** `by` is null where the attempt read says cancelled and no event names who cancelled it. */
  | { kind: 'cancelled'; by: CancelledBy | null }
  | { kind: 'consumed' }

/** A poll that answered: its reads, the events read with them, the phase, and its round's number. */
export interface WaitRound {
  facts: WaitFacts
  story: AttemptStory
  phase: WaitPhase
  round: number
}

export type WaitPoll =
  | { status: 'pending' }
  | { status: 'failed' }
  | ({ status: 'answered' } & WaitRound)

export interface WaitPollInput {
  kit: WaitKitClient | null
  keys: HandoverKeys | null
  landed: LandedAttempt | null
  visibility?: VisibilitySource
}

export interface WaitPollHook {
  poll: WaitPoll
  /** A round is reading; the last answer stays on screen meanwhile. */
  polling: boolean
  retry: () => void
}

/** The countdown's anchor from one poll: the attempt's end and the pinned block's time, in ms. */
export interface CountdownAnchor {
  endMs: number
  blockMs: number
  round: number
}

/** The seconds the view's clock counted since the poll of one round. */
export interface CountdownTicks {
  round: number | null
  ticks: number
}

// ---------------------------------------------------------------------------
// The execution
// ---------------------------------------------------------------------------

/**
 * The release of a claim that may not carry a hash the caller does not know:
 * released; kept, since it now carries another hash; gone already, or
 * replaced by another claim; or nothing done, since the countdown now names
 * another attempt.
 */
export type ExecutionRelease =
  | { status: 'released' }
  | { status: 'hashed'; transactionHash: Hex }
  | { status: 'gone' }
  | { status: 'replaced' }

/**
 * A read of the countdown for a run: the countdown's own read, or `replaced`
 * where the record names another attempt than the run's, or none.
 */
export type RunCountdownRead = CountdownRead | { status: 'replaced' }

/** A claim on the run's countdown, or `replaced` where the countdown now names another attempt. */
export type RunClaim = ExecutionClaimResult | 'replaced'

/** Whether a write of the run went to its own countdown, or found it replaced and wrote nothing. */
export type RunWrite = 'written' | 'replaced'

export interface ExecuteState {
  write: WriteMachineState
  prepared?: PreparedCall
  /** The sending key's latest balance while the deposit step shows. */
  balance?: bigint
  /** The request id of the claim this page wrote on the countdown and sends under. */
  requestId?: string
  /** The request id of a claim another page (or this page before a reload) wrote, which this run follows. */
  followed?: string
  /** The followed claim while it carries no hash yet. */
  follow?: ExecutionInFlightClaim
  /** The first reading that the node knows none of the run's transactions, kept until a second one apart from it. */
  unknownReading?: UnknownReading
  /** The countdown now names another attempt: the run holds nothing on it, and the screen reads it again. */
  replaced?: true
}

export type ExecuteEvent =
  | { type: 'write'; event: WriteEvent }
  | { type: 'prepared'; run: number; prepared: PreparedCall }
  | { type: 'balance'; run: number; balance: bigint }
  | { type: 'claimed'; run: number; requestId: string }
  | { type: 'released'; run: number }
  | { type: 'follow'; run: number; claim: ExecutionInFlightRecord }
  | { type: 'voided'; run: number }
  | { type: 'replaced'; run: number }
  | { type: 'unknownRead'; run: number; reading: UnknownReading }
  | { type: 'unknownCleared'; run: number }

export interface ExecuteStore {
  state(): ExecuteState
  dispatch(event: ExecuteEvent): void
  subscribe(listener: () => void): () => void
}

/** The execution's steps over the wallet's seams. */
export interface ExecuteSteps {
  /** The countdown's record, with the execution in flight it carries, or `replaced` where it names another attempt. */
  readCountdown(): Promise<RunCountdownRead>
  /** The execution call for the attempt and the payload that started it. */
  prepare(): Promise<PreparedCall>
  checkGas(prepared: PreparedCall): Promise<GasCheck>
  /** The chain's latest block number, the earliest block the execution can land in. */
  blockNumber(): Promise<number>
  newRequestId(): string
  /** Writes the execution in flight on the countdown, or answers the one already there. */
  claim(claim: ExecutionInFlightClaim): Promise<RunClaim>
  /**
   * Writes the hash on this page's claim, writing the claim back where another
   * page released it; writes nothing where the countdown names another attempt.
   */
  markSent(claim: ExecutionInFlightClaim, transactionHash: Hex): Promise<RunWrite>
  /** Releases the claim under `requestId`; releases nothing where the countdown names another attempt. */
  release(requestId: string): Promise<RunWrite>
  /** Releases the claim under `requestId` where it carries no hash or one of `hashes`. */
  releaseClaim(requestId: string, hashes: readonly Hex[]): Promise<ExecutionRelease>
  /** Where the wallet holds the request a claim was queued under. */
  requestHold(requestId: string): Promise<RequestHold>
  /** The send under this page's claim, its receipt waited on from the claim's block. */
  send(
    prepared: PreparedCall,
    dispatch: (event: WriteEvent) => void,
    run: number,
    startBlock: number,
    requestId: string,
    /** Whether the run still holds its claim, asked right before the add. */
    canAdd: AddGate
  ): Promise<void>
  /** Waits once more for the receipt of a hash the run follows. */
  waitAgain(
    transactionHash: Hex,
    startBlock: number | undefined,
    dispatch: (event: WriteEvent) => void,
    run: number
  ): Promise<void>
  /** Whether the recovery's attempt executed since `startBlock`, by its consume event. */
  consumedSince(startBlock: number): Promise<boolean>
  transactionKnown(transactionHash: Hex): Promise<TransactionKnown>
  /** Milliseconds since epoch. */
  now(): number
}

export interface ExecuteStepsInput {
  records: WalletRecords
  chainId: ChainId
  account: Address
  landed: LandedAttempt
  client: WaitKitClient
  reads: ChainReads
  receipts: ReceiptReads
  port: SendPort
  /** The wallet's queue and activity, read for the request of a claim with no hash. */
  requests: SendRequestPort
  plan: SendingPlan
  network: GasNetwork
  attempt: Attempt
  payload: Hex
  now: () => number
}

export interface ExecuteRun {
  state: ExecuteState
  start: () => void
  /** Reads the run's hashes where the attempt read disagrees with a send, for the dropped reading. */
  checkDropped: () => void
  /** Waits on the run's hash again where its receipt wait ended in an error that kept the hash. */
  checkReceiptAgain: () => void
  /** Drops the run once its attempt executed, so nothing of it is taken up again. */
  release: () => void
}

// ---------------------------------------------------------------------------
// The home surface
// ---------------------------------------------------------------------------

/** One landed recovery on the home surface, as the latest attempt read gives it. */
export type CountdownHeadline =
  | { kind: 'waiting'; anchor: CountdownAnchor }
  | { kind: 'executionDue' }
  | { kind: 'other' }

/** The headline of one countdown, null while it loads or where it cannot be read; a hook. */
export type CountdownHeadlineHook = (account: Address) => CountdownHeadline | null

export interface WaitHomeLineProps {
  account: Address
  useHeadline?: CountdownHeadlineHook
  onOpen: () => void
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/** Leaving a terminal: the countdown ended and the entry cleared, then the route's entry. */
export type LeaveState = 'idle' | 'leaving' | 'failed'

export interface WaitViewProps {
  account: Address
  /** The name of the network the account lives on, beside the account's one line. */
  networkName: string
  client: WaitClient
  keys: HandoverKeysReading
  poll: WaitPoll
  /** A later round is reading; the answered poll stays on screen with a line that says so. */
  polling: boolean
  /**
   * The time left from the last poll's anchor, by the view's own clock; until
   * a poll answers, from the countdown's record where it holds the executable
   * time; else null.
   */
  remainingMs: number | null
  /** When the landed attempt becomes executable, in seconds since epoch, from the countdown's record; null where it lacks it. */
  executableAt: number | null
  /**
   * When the submission landed on this device, in ms since epoch: the start
   * shown where this device holds no setup to take the chain's start from.
   */
  startedAt: number
  timeZone: string
  /** The setup's configuration where this device holds it, for the path line and the cancel's threshold. */
  configuration: Configuration | null
  execute: ExecuteState
  sending: SendingReading
  /** Whether this wallet holds the account's own key, so moving the funds is the holder's to take. */
  holdsAccountKey: boolean
  leave: LeaveState
  onExecute: () => void
  onRetryPoll: () => void
  onRetryKeys: () => void
  onRetryClient: () => void
  onLeave: () => void
  /** Leaves the wait for the route's entry and keeps every record. */
  onBack: () => void
  onMoveFunds: () => void
  onOpenExplorer: (transactionHash: Hex) => void
}

export interface WaitBodyProps {
  records: WalletRecords
  account: Address
  entry: RecoveryEntryRecord
  savedAt: number
  landed: LandedAttempt | null
  /** When the landed attempt becomes executable, in seconds since epoch; null where the record lacks it. */
  executableAt: number | null
  /** Reads the countdown's record again, where the run found it names another attempt. */
  onCountdownReplaced: () => void
}

export type WaitGateProps = Omit<
  WaitBodyProps,
  'savedAt' | 'landed' | 'executableAt' | 'onCountdownReplaced'
>

export interface CountdownBlockProps {
  /** When the attempt becomes executable, in seconds since epoch. */
  executableAt: number
  /** Whether execution is due: the waiting period ended. */
  due: boolean
  account: Address
  networkName: string
  newKey?: Address
  remainingMs: number | null
  startedAt: number
  timeZone: string
  configuration: Configuration | null
}

export interface ExecuteBlockProps {
  execute: ExecuteState
  sending: SendingReading
  /** Whether execution is due and the events named the payload the execution sends. */
  ready: boolean
  onExecute: () => void
}

export interface CannotExecuteBlockProps {
  cause: CannotExecuteCause
  holdsAccountKey: boolean
  onMoveFunds: () => void
}

export interface CancelledBlockProps {
  account: Address
  by: CancelledBy | null
  /** Whether one approval satisfies the rule, so the same credential can cancel again. */
  thresholdOne: boolean
  leave: LeaveState
  onLeave: () => void
}

export interface PollFailedBlockProps {
  onRetry: () => void
}
