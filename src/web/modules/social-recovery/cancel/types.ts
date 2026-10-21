import type { Account } from '@ambire-common/interfaces/account'
import type { Network } from '@ambire-common/interfaces/network'
import type {
  Address,
  CancelledBy,
  DeploymentDescriptor,
  Hex,
  IEventManager,
  KitNotification,
  PreparedCall
} from '@kohaku-eth/social-recovery'
import type {
  AddGate,
  ChainReads,
  KeyHandle,
  ListedAccountFacts,
  ProviderTransactionReceipt,
  ReceiptReads,
  RecoveryKitClient,
  SendPort,
  SendRequestPort,
  WatcherConnection,
  WatcherReads
} from '@web/modules/social-recovery/shared/client/types'
import type { ChainId, RecordDeployment } from '@web/modules/social-recovery/shared/records/types'
import type {
  GasCheck,
  RequestHold,
  WriteEvent,
  WriteMachineState
} from '@web/modules/social-recovery/shared/writes'
import type {
  AttemptEnding,
  PollFailure,
  WatchedAttempt,
  WatchedAttemptState,
  WatcherReading,
  WatcherStorage
} from '@web/modules/social-recovery/watcher/types'

// ---------------------------------------------------------------------------
// The banner
// ---------------------------------------------------------------------------

/** An open attempt as the banner shows it, with the block of the reading that holds it. */
export interface OpenAttempt {
  attempt: WatchedAttempt
  /** The account no longer authorizes the action, so the attempt cannot execute until it does. */
  dormant: boolean
  block: WatcherReading['block']
}

export type ExecutedEnding = Extract<AttemptEnding, { road: 'executed' }>

/**
 * What the banner of one account shows: nothing, an open attempt, a failed
 * poll with the open attempt the last good reading holds, or the notice that a
 * recovery executed.
 */
export type BannerReading =
  | { kind: 'none' }
  | { kind: 'open'; open: OpenAttempt }
  | {
      kind: 'failed'
      failed: PollFailure
      /**
       * The time of the block the last good reading was pinned to, in ms, where
       * the record holds one; the record keeps no time of the poll itself.
       */
      lastBlockAt?: number
      open?: OpenAttempt
    }
  /** The record could not be read from storage, or is not a watcher record. */
  | { kind: 'unreadable'; retry: () => void }
  | { kind: 'executed'; ending: ExecutedEnding }

/** Reads the watcher's record of one account for a page; `useWatchedAttempt` by default. */
export type WatchedAttemptHook = (account: Address) => WatchedAttemptState

/** The attempt ids the holder dismissed for one account, undefined while the record is read. */
export type DismissedHook = (account: Address, state: WatchedAttemptState) => bigint[] | undefined

export interface RecoveryAttemptBannerViewProps {
  /** The accounts the wallet lists. */
  accounts: readonly Account[]
  useAttempt: WatchedAttemptHook
  useDismissed: DismissedHook
  /** Opens the cancel of one account in a full tab. */
  onCancel: (account: Address) => void
  /** Hides the warning for one attempt of one account. */
  onDismiss: (account: Address, attemptId: bigint) => Promise<unknown>
  /** Runs one poll of one account and writes its record. */
  onRetry: (account: Address) => Promise<unknown>
  timeZone: string
}

export interface AccountAttemptBannerProps {
  account: Address
  /**
   * Where the wallet lists several accounts, the wallet's label for the
   * account, shown with its truncated address; an empty label shows the
   * address alone. Undefined where the account line is not shown.
   */
  name?: string
  useAttempt: WatchedAttemptHook
  useDismissed: DismissedHook
  onCancel: (account: Address) => void
  onDismiss: (account: Address, attemptId: bigint) => Promise<unknown>
  onRetry: (account: Address) => Promise<unknown>
  timeZone: string
}

export interface AttemptLinesProps {
  open: OpenAttempt
  /** Whether the lines carry the attempt's title; the banner's own title stands for it otherwise. */
  titled: boolean
  account: Address
  timeZone: string
  onCancel: (account: Address) => void
  onDismiss: (account: Address, attemptId: bigint) => Promise<unknown>
}

/** The dashboard banner types the recovery banner takes: an attempt, or a failed read. */
export type AttemptBannerType = 'warning' | 'error'

/** The attempts the holder dismissed for one account, as last read. */
export interface HeldDismissed {
  account: Address
  dismissed: bigint[]
}

/** What one poll of one account from a page takes; the extension's own by default. */
export interface PollOnceInput {
  account: Address
  /** The network record of the recovery chain. */
  network: Network | undefined
  deployment?: () => DeploymentDescriptor | undefined
  connect?: (network: Network, deployment: DeploymentDescriptor) => WatcherConnection
  storage?: WatcherStorage
  now?: () => number
  limitMs?: number
  scanLimitMs?: number
}

// ---------------------------------------------------------------------------
// The attempt read
// ---------------------------------------------------------------------------

/** One fresh reading of an account's attempt, written to its watcher record. */
export interface AttemptReaderInput {
  reads: WatcherReads
  /** The manager and the action `reads` go to, written with each reading. */
  deployment: RecordDeployment
  account: Address
  chainId: ChainId
  storage: WatcherStorage
  now?: () => number
  limitMs?: number
  scanLimitMs?: number
}

export type AttemptReader = () => Promise<WatcherReading>

/** An attempt's cancel as the manager's log names it. */
export type CancelLog = Extract<KitNotification, { kind: 'attempt-cancelled' }>

/** The members of a log on ethers' receipt that the decoding reads. */
export type ReceiptLog = Pick<
  ProviderTransactionReceipt['logs'][number],
  | 'address'
  | 'topics'
  | 'data'
  | 'blockNumber'
  | 'blockHash'
  | 'index'
  | 'transactionHash'
  | 'removed'
>

/** Where the owner's cancel of the account is looked for in a receipt's logs. */
export interface OwnerCancelInput {
  logs: readonly ReceiptLog[]
  /** The transaction the receipt is of; a log under another hash is not this transaction's. */
  transactionHash: Hex
  /** The kit's events feed of the account, whose decoding owns the manager's logs. */
  events: Pick<IEventManager, 'decodeLog'>
  account: Address
  /** The recovery action the account's attempts run on. */
  action: Address
}

/** What the read after a landed cancel knows of the run. */
export interface LandingInput {
  /** The attempt the run meant to cancel. */
  target: bigint
  /** That attempt as the read before the send found it open, where the run read it. */
  known?: WatchedAttempt
  /** The block read before the send. */
  startBlock: number
  /** The block of the cancel's receipt. */
  landedBlock: number
  /** The transaction the receipt is of: only its own log of the owner's cancel is this cancel's. */
  transactionHash: Hex
  /** The owner's cancel the receipt's own logs carry, where they could be read. */
  cancelled?: CancelLog
}

/** What a landed cancel ended, from a fresh reading and the ending logs from the receipt's block on. */
export type LandingOutcome = Extract<AfterLanding, { stage: 'cancelled' } | { stage: 'otherRoad' }>

/** Answers undefined while the reads do not say yet what the cancel ended. */
export type LandingReader = (input: LandingInput) => Promise<LandingOutcome | undefined>

export interface LandingReaderInput {
  reads: WatcherReads
  account: Address
  readAttempt: AttemptReader
  limitMs?: number
}

/** The cancel screen's read of the attempt on arrival. */
export type AttemptRead =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'read'; arrival: Arrival }

/** The arrival's read: the fresh reading, whose open attempt is the one the holder can cancel. */
export interface Arrival {
  reading: WatcherReading
}

export type ArrivalReader = () => Promise<Arrival>

/** The arrival's read as the hook last stored it, with the reader and the round it belongs to. */
export interface StoredAttemptRead {
  reader: ArrivalReader | null
  attempt: number
  read: AttemptRead
}

export interface AttemptReadResult {
  read: AttemptRead
  retry: () => void
}

/** How an attempt the holder meant to cancel stands in a reading. */
export type AttemptStanding =
  | { kind: 'open'; attempt: WatchedAttempt; dormant: boolean }
  | { kind: 'gone'; ending?: AttemptEnding }

// ---------------------------------------------------------------------------
// The cancel in flight on this device
// ---------------------------------------------------------------------------

/**
 * A cancel sent to the wallet and not yet settled, stored on this device so a
 * reloaded page or a second tab follows it instead of sending another one.
 */
export interface CancelClaim {
  /** The attempt the cancel meant to end. */
  attemptId: bigint
  /** The id the request is queued under. */
  requestId: string
  /** The block read before the send, from which the receipt wait scans. */
  startBlock: number
  /** When the claim was stored, in ms since epoch: past the send limit its page adds nothing. */
  claimedAt: number
  /** The hash, once the wallet broadcast the cancel. */
  transactionHash?: Hex
}

/** A claim as a run asks for it; the store stamps the time. */
export type NewCancelClaim = Omit<CancelClaim, 'claimedAt' | 'transactionHash'>

/** The claim as storage holds it, its attempt id as a decimal string. */
export type StoredCancelClaim = Omit<CancelClaim, 'attemptId'> & { attemptId: string }

export type ClaimAnswer = { claimed: true } | { claimed: false; held: CancelClaim }

export interface CancelClaims {
  read(): Promise<CancelClaim | undefined>
  /** Stores the claim where none is stored, and answers the stored one otherwise. */
  claim(claim: NewCancelClaim): Promise<ClaimAnswer>
  /**
   * Whether the claim of `requestId` is still stored with no hash and younger
   * than the send limit: the gate the wallet asks right before it adds the request.
   */
  canStillSend(requestId: string): Promise<boolean>
  /** How long, in ms, the page that stored `claim` may still add its request; zero or less once past. */
  sendableMs(claim: CancelClaim): number
  /**
   * How long, in ms, `claim` is still followed while the wallet reports its
   * request as an operation it cannot follow to a hash; zero or less once past.
   */
  untrackedFollowMs(claim: CancelClaim): number
  /** Writes the hash on the claim of `requestId`. */
  markSent(requestId: string, transactionHash: Hex): Promise<void>
  /** Removes the claim of `requestId`; a claim of another request stays. */
  release(requestId: string): Promise<void>
}

// ---------------------------------------------------------------------------
// The cancel's run
// ---------------------------------------------------------------------------

/**
 * Where the wallet holds the cancel's request: the shared reading, or
 * `untracked` where the wallet sent it as an operation it cannot follow to a
 * transaction hash, which may still reach the chain.
 */
export type CancelHold = RequestHold | { status: 'untracked' }

/** What the send of one run takes. */
export interface CancelSendInput {
  prepared: PreparedCall
  dispatch: (event: WriteEvent) => void
  run: number
  requestId: string
  startBlock: number
  canAdd: AddGate
}

/** The run's seams over the wallet: the reads, the prepare, the gas check, the send and the stored claim. */
export interface CancelSteps {
  readAttempt: AttemptReader
  readLanding: LandingReader
  prepare(): Promise<PreparedCall>
  checkGas(prepared: PreparedCall): Promise<GasCheck>
  newRequestId(): string
  blockNumber(): Promise<number>
  claims: CancelClaims
  send(input: CancelSendInput): Promise<void>
  wait(transactionHash: Hex, startBlock: number): Promise<ProviderTransactionReceipt>
  /** The owner's cancel of the account in the logs of a landed transaction's receipt, or none. */
  receiptCancel(transactionHash: Hex, startBlock: number): Promise<CancelLog | undefined>
  /** Where the wallet holds a request; throws where it does not answer. */
  requestHold(requestId: string): Promise<CancelHold>
  /**
   * Asks the wallet to withdraw a request from its queue; throws where it
   * cannot. The wallet keeps a request its sign screen signs or pauses on, so
   * only a later hold read tells whether the request left.
   */
  withdrawRequest(requestId: string): void
}

/** What the run reads after its cancel landed. */
export type AfterLanding =
  | { stage: 'none' }
  | { stage: 'reading' }
  /** The reads after the landing did not agree yet; check again reads once more. */
  | { stage: 'unread' }
  /** The owner's cancel ended `attemptId`, named by its new key where the reads found it. */
  | { stage: 'cancelled'; attemptId: bigint; newKey?: Address }
  | { stage: 'otherRoad'; attemptId: bigint; road: Exclude<CancelledBy, 'cancelByOwner'> }

export interface CancelState {
  write: WriteMachineState
  /** The attempt the run cancels. */
  target?: bigint
  /** That attempt as the run's read before the send found it open. */
  targetAttempt?: WatchedAttempt
  /** The block read before the run's send, or the followed claim's. */
  startBlock?: number
  /**
   * The newest reading in which the run found its attempt no longer open, and
   * sent nothing: the attempt ended, or another one is open and is offered.
   */
  gone?: WatcherReading
  after: AfterLanding
  /** A stored cancel followed without sending: the wallet still holds its request, or did not answer. */
  follow?: 'held' | 'unread'
  /**
   * The follow's newest reading where it finds the followed attempt no longer
   * open while the wallet still holds the request, shown beside the follow.
   */
  followGone?: WatcherReading
  /** The receipt wait of the sent cancel failed; check again waits once more. */
  stalled?: boolean
  /** The request the run's cancel is queued under, once the run claimed it or follows it. */
  requestId?: string
}

/** The follow of a run's own request while the send waits in the wallet. */
export interface OwnSendWatch {
  /** Ends the follow: no read runs after it. */
  stop(): void
  /** The newest reading in which the attempt read ended or another one open, while the send waited. */
  gone(): WatcherReading | undefined
}

export interface CancelStore {
  state(): CancelState
  subscribe(listener: () => void): () => void
  update(change: (state: CancelState) => CancelState): void
}

export interface CancelRun {
  state: CancelState
  start: (target: bigint) => void
  recheck: () => void
  checkAgain: () => void
}

/** What the steps over the wallet's seams are built from. */
export interface CancelStepsInput {
  account: Address
  chainId: ChainId
  client: RecoveryKitClient
  /** The balance and gas reads over the extension's provider. */
  chainReads: ChainReads
  receipts: ReceiptReads
  port: SendPort
  requests: SendRequestPort
  /** The wallet's facts of the account, whose key sends the cancel and pays its gas. */
  facts: ListedAccountFacts
  key: KeyHandle
  readAttempt: AttemptReader
  readLanding: LandingReader
  storage: WatcherStorage
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/**
 * Whether the page can send the cancel: the client and the account's facts
 * still load, are ready with the account's key, failed to load (with a retry),
 * or the keystore holds none of the account's keys.
 */
export type CancelReadiness = 'loading' | 'ready' | 'failed' | 'noKey'

export interface CancelBodyProps {
  account: Address
}

export interface CancelViewProps {
  read: AttemptRead
  run: CancelState
  readiness: CancelReadiness
  timeZone: string
  onRetryRead: () => void
  /** Builds the client and reads the account's facts again. */
  onRetryReady: () => void
  onSend: (target: bigint) => void
  onRecheck: () => void
  onCheckAgain: () => void
  onBack: () => void
  onDone: () => void
  onMoveFunds: () => void
  /** The wallet is selecting the account before the transfer screen opens. */
  moveFundsBusy: boolean
}

export interface AttemptFactsProps {
  attempt: WatchedAttempt
  /** The account does not authorize the action: the dormant reading replaces the end's. */
  dormant: boolean
  timeZone: string
}

export interface EndedBlockProps {
  reading: WatcherReading
  /** The attempt the holder meant to cancel, where one was named; its ending alone is told. */
  target?: bigint
  onBack: () => void
  /** Reads again where the ending's road is not read yet; no action where the page reads again by itself. */
  onCheckAgain?: () => void
  /**
   * The wallet still holds the cancel's request, which may still be signed:
   * the ending's own line alone, never that nothing was sent.
   */
  held?: boolean
}

export interface CancelledBlockProps {
  after: LandingOutcome
  onMoveFunds: () => void
  moveFundsBusy: boolean
  onDone: () => void
}

/** A selection of the account the page waits for before it opens the transfer screen. */
export interface MoveFundsWaiting {
  account: Address
  timer: ReturnType<typeof setTimeout>
}

export interface MoveFunds {
  move: () => void
  /** A selection is awaited; the button reads disabled until it lands or times out. */
  busy: boolean
}
