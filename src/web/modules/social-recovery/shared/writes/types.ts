import type { TransactionReceipt } from 'ethers'

import type {
  Address,
  Hex,
  KitError,
  KitErrorName,
  PreparedBatch,
  PreparedCall
} from '@web/modules/social-recovery/sdk-interfaces'
import type {
  ChainReads,
  EstimationListener,
  GasEstimateCall,
  KeyHandle,
  ProviderReadFailure,
  ReceiptWait,
  SendPort
} from '@web/modules/social-recovery/shared/client'

import type { ATTEMPT_ENDS, ATTEMPT_STILL_RUNNING, REPLACED_REASONS } from './classify'
import type { DEPOSIT_ROUTES } from './gas'
import type { OWNER_WRITES, PAYERS, RECOVERY_CALLS, WRITE_KINDS } from './kinds'
import type { WRITE_ANSWER_TYPES } from './machine'
import type { FAILED_STATUSES, WRITE_STATUSES } from './states'

// ---------------------------------------------------------------------------
// The writes
// ---------------------------------------------------------------------------

export type WriteKind = typeof WRITE_KINDS[number]

export type OwnerWrite = typeof OWNER_WRITES[number]

export type RecoveryCall = typeof RECOVERY_CALLS[number]

export type Payer = typeof PAYERS[number]

// ---------------------------------------------------------------------------
// The states
// ---------------------------------------------------------------------------

export type WriteStatus = typeof WRITE_STATUSES[number]

export type FailedStatus = typeof FAILED_STATUSES[number]

/** Nothing asked yet. */
export interface IdleState {
  status: 'idle'
  write: WriteKind
}

/** The gas check runs: the estimate, the gas price and the sending key's balance. */
export interface CheckingGasState {
  status: 'checkingGas'
  write: WriteKind
}

/**
 * A read of the gas check could not run: the balance, the estimate or the gas
 * price. It is part of the gas check, not a reading of the failed state: the
 * write was never about to be sent, so it offers the check again rather than
 * reading that the transaction was rejected.
 */
export interface GasReadErrorState {
  status: 'gasReadError'
  write: WriteKind
  error: ProviderReadFailure
}

/** The sending key holds too little: the deposit step, rather than a failed transaction. */
export interface NeedsDepositState {
  status: 'needsDeposit'
  write: WriteKind
  step: DepositStep
}

/**
 * The one submitting state. `transactionHash` is present once the wallet
 * broadcast the call; the state holds until its receipt comes back.
 * `startBlock` is the block read before the send, from which a wait for the
 * receipt scans for a replacement.
 */
export interface SubmittingState {
  status: 'submitting'
  write: WriteKind
  transactionHash?: Hex
  startBlock?: number
}

/** The call ran: a receipt with status one. */
export interface LandedState {
  status: 'landed'
  write: WriteKind
  transactionHash: Hex
  receipt: WriteReceipt
}

/**
 * The first reading of the failed state: the wallet never sent the call, so
 * nothing reached the chain and the account stands as it did. `error` is what
 * the wallet met before any transaction hash: a refused signature, a gas
 * estimate that would revert, or a broadcast that failed. `replaced` is
 * present where another transaction took the call's place before it was mined
 * (`cancelled` or `replaced`), so the call itself never ran.
 */
export interface FailedNotSentState {
  status: 'failedNotSent'
  write: WriteKind
  error: unknown
  replaced?: ReplacedReason
}

/**
 * The second reading of the failed state: the call reached the chain and
 * reverted. It names the cause the receipt carries, and the gas it spent is
 * gone (`gasSpent` where the receipt carries both factors). `decoded` keeps
 * the kit error the wallet decoded, so the attempt read of a cancel can judge
 * the cause again once it returns.
 */
export interface FailedRevertedState {
  status: 'failedReverted'
  write: WriteKind
  transactionHash: Hex
  receipt: WriteReceipt
  cause: RevertCause
  decoded?: KitError
  gasSpent?: bigint
}

/** The one failed state, with its two readings. */
export type FailedState = FailedNotSentState | FailedRevertedState

/** Every state of a write. */
export type WriteState =
  | IdleState
  | CheckingGasState
  | GasReadErrorState
  | NeedsDepositState
  | SubmittingState
  | LandedState
  | FailedState

// ---------------------------------------------------------------------------
// Receipts, failures and the causes of a revert
// ---------------------------------------------------------------------------

/**
 * The members of ethers' `TransactionReceipt` a write's receipt reads. A
 * receipt a thrown value carries may lack the block number or a gas factor.
 */
export type ProviderReceipt = Pick<TransactionReceipt, 'hash' | 'status'> &
  Partial<Pick<TransactionReceipt, 'blockNumber' | 'gasUsed' | 'gasPrice'>>

/** The part of a transaction receipt the classification reads. */
export interface WriteReceipt {
  transactionHash: Hex
  /** 1 for a call that ran, 0 for a call that reverted. */
  status: 0 | 1
  blockNumber?: number
  gasUsed?: bigint
  effectiveGasPrice?: bigint
}

export type ReplacedReason = typeof REPLACED_REASONS[number]

/**
 * What the wallet knows of a write that did not land. `error` is what the send
 * threw; `transactionHash` is present once the wallet broadcast the call;
 * `receipt` is present once one came back; `cause` is the revert the wallet
 * decoded for that receipt (the SDK's error decoding over the call), where it
 * read one; `replaced` is present where another transaction took the call's
 * place before it was mined.
 */
export interface WriteFailure {
  error?: unknown
  transactionHash?: Hex
  receipt?: WriteReceipt
  cause?: KitError
  replaced?: ReplacedReason
}

export type AttemptEnd = typeof ATTEMPT_ENDS[number]

/**
 * The attempt read after a reverted cancel: how the attempt had ended and the
 * account's controller as it now stands, or that it still runs.
 * The controller is the key the consume event handed the account after an
 * execution, and the account's own key where another road ended the attempt.
 * An attempt that still runs reads the plain reverted reading, with the retry
 * and the move-funds action, since the attack goes on.
 */
export type AttemptAfterCancel =
  | { ended: AttemptEnd; controller?: Address }
  | { ended: typeof ATTEMPT_STILL_RUNNING }

/**
 * The cause a reverted state names.
 *
 * - `named`: a kit error the wallet decoded (`KIT_ERROR_NAMES`), which it names
 *   in its own words.
 * - `unnamed`: a revert that carries no cause the wallet can name, with its raw
 *   data where it read any.
 * - `attemptGone`: the owner's cancel reverted because the attempt was already
 *   gone. `ended` names the road, and `controller` the account's controller
 *   after an execution, once the attempt read returned; before it, the state
 *   names no controller rather than one it guessed.
 */
export type RevertCause =
  | { kind: 'named'; name: KitErrorName; error: KitError }
  | { kind: 'unnamed'; data?: Hex }
  | { kind: 'attemptGone'; ended?: AttemptEnd; controller?: Address }

/** What classifying a write's end needs beside the end itself. */
export interface FailureContext {
  write: WriteKind
  /** For a cancel: the attempt read after the revert, where it returned. */
  attemptAfter?: AttemptAfterCancel
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

/** The run a state belongs to: 0 before the first `start`, one more at each accepted `start`. */
export interface WriteRun {
  run: number
}

/**
 * A write's state in the machine: one of the shared states, with its run. The
 * submitting state also keeps `sentHashes`, every hash the run's call went out
 * under: the first one and each replacement after it.
 */
export type WriteMachineState =
  | (Exclude<WriteState, SubmittingState> & WriteRun)
  | (SubmittingState & WriteRun & { sentHashes?: readonly Hex[] })

export type SubmittingInRun = Extract<WriteMachineState, { status: 'submitting' }>

/**
 * What moves a write. The consumer drives the send: it reports each hash with
 * `sent`, supplies the decoded cause of a revert on `receipt` or `error`, and
 * sends `attemptRead` after a cancel's revert.
 */
export type WriteEvent =
  /** Runs the gas check and opens a new run: from `idle`, or from a state that offers the retry. */
  | { type: 'start' }
  /** The gas check answered: `enough` sends, `deposit` shows the step. */
  | { type: 'gasChecked'; run: number; check: GasCheck }
  /** From the deposit step: run the check again in the same run, since the funds may have arrived. */
  | { type: 'recheck' }
  /** The wallet broadcast the call; `startBlock` is the block read before the send. */
  | { type: 'sent'; run: number; transactionHash: Hex; startBlock?: number }
  /**
   * A receipt came back for a hash announced with `sent` (or named by an
   * `error`) before it, with the revert's decoded cause where the wallet read
   * one. A receipt for any other hash leaves the state as it was.
   */
  | {
      type: 'receipt'
      run: number
      receipt: WriteReceipt
      cause?: KitError
      attemptAfter?: AttemptAfterCancel
    }
  /** The gas check or the send threw; the hash is the one the wallet holds, where it holds one. */
  | {
      type: 'error'
      run: number
      error: unknown
      transactionHash?: Hex
      cause?: KitError
      attemptAfter?: AttemptAfterCancel
    }
  /** The attempt read after a cancel's revert returned. */
  | { type: 'attemptRead'; run: number; attemptAfter: AttemptAfterCancel }
  /** Back to `idle`, keeping the run count. */
  | { type: 'reset' }

export type WriteAnswer = Extract<WriteEvent, { type: typeof WRITE_ANSWER_TYPES[number] }>

/** What every drive takes: the machine's dispatch and run, and the receipt wait. */
export interface DriveRun {
  /** The machine's dispatch. */
  dispatch: (event: WriteEvent) => void
  /** The run of the submitting state the send answers. */
  run: number
  /** The receipt wait over the extension's provider (`createReceiptWait`). */
  receipts: ReceiptWait
}

/** What `driveSend` takes: the drive's run, the send port and what the key sends. */
export interface SendDrive extends DriveRun {
  /** The send port the client hands out (`createSendPort`). */
  port: SendPort
  /** The key that sends the transaction and pays its gas. */
  key: KeyHandle
  /** The transaction the gas check estimated, from that key (`gasTransactionOf`). */
  transaction: GasEstimateCall
}

/** What `driveAccountBatch` takes: the drive's run, the send port and the batch the account runs. */
export interface AccountBatchDrive extends DriveRun {
  /** The send port the client hands out (`createSendPort`). */
  port: SendPort
  /** The account the wallet lists that runs the batch on itself. */
  account: Address
  /** The batch's calls, in order, each with the account as its sender. */
  calls: readonly PreparedCall[]
  /** Hears each reading of the sign screen's estimation for the batch. */
  onEstimation?: EstimationListener
}

// ---------------------------------------------------------------------------
// The gas check and its deposit step
// ---------------------------------------------------------------------------

/** The network the key must be funded on. An extension `Network` record satisfies it. */
export interface GasNetwork {
  name: string
  nativeAssetSymbol: string
}

/**
 * An account this wallet holds, by its address and the name the wallet gives
 * it. `deployed` is false where the account has no code yet (the wallet's own
 * account state knows), so its transfer must deploy it through the account
 * factory first.
 */
export interface WalletAccountRef {
  address: Address
  name: string
  deployed?: boolean
}

/** The estimate of one transaction: its gas, the gas price, their product and the amount asked for. */
export interface GasEstimate {
  /** The gas the transaction would use, as the provider estimated it. */
  gas: bigint
  /** The node's gas price, in wei per gas. */
  gasPrice: bigint
  /** `gas * gasPrice`, in wei. */
  cost: bigint
  /** The cost with the fee headroom, in wei: what the key must hold. */
  required: bigint
}

export type DepositRouteKind = typeof DEPOSIT_ROUTES[number]

/**
 * One route that fills the key. `amount` is rounded up to the precision the
 * step renders, so a holder who sends what the step shows covers it.
 *
 * - `transfer`: from an account this wallet holds, the account the key
 *   operates, to the key. It is itself an operation that key must send and pay
 *   for, so a key at zero cannot take it alone, and its amount is the
 *   shortfall plus the transfer's own fee (`fee`) with the headroom.
 * - `outside`: a deposit from outside this wallet into the key's address, the
 *   shortfall.
 */
export type DepositRoute =
  | { kind: 'transfer'; from: WalletAccountRef; to: Address; amount: bigint; fee: GasEstimate }
  | { kind: 'outside'; to: Address; amount: bigint }

/** The deposit step's data. The copy lives in `renderDepositStep`. */
export interface DepositStep {
  write: WriteKind
  /** The account's controlling key for an owner write, the sending key for a recovery call. */
  payer: Payer
  /** The fast track's step: a recovery call from the fresh key of a fresh install. */
  fastTrack: boolean
  /** The address of the key that sends the write and pays its gas. */
  key: Address
  /** The network the key must be funded on. */
  network: { name: string; symbol: string }
  estimate: GasEstimate
  /** The key's native balance when the check ran, in wei. */
  balance: bigint
  /** `estimate.required - balance`, in wei, above zero. */
  shortfall: bigint
  /** The routes that fill the key, the transfer first where the step offers it. */
  routes: DepositRoute[]
  /** The account this wallet holds that the key operates, off the fast track. */
  operates?: WalletAccountRef
}

/** What the gas check answers: enough, so the step is skipped, or the deposit step. */
export type GasCheck =
  | { kind: 'enough'; write: WriteKind; key: Address; estimate: GasEstimate; balance: bigint }
  | { kind: 'deposit'; step: DepositStep }

/** What the gas check takes. */
export interface GasCheckInput {
  write: WriteKind
  /** The prepared write, as the SDK returned it. */
  prepared: PreparedCall | PreparedBatch
  /** The key that sends the write and pays its gas. */
  key: KeyHandle
  /** The balance and gas reads over the extension's provider. */
  reads: ChainReads
  network: GasNetwork
  /**
   * The transaction the key sends where the write rides the account's own
   * execute: a call whose sender is the account, or a batch. The account
   * library builds it from the prepared write, to the account the key operates
   * (`operates`), or to `ACCOUNT_FACTORY` where it deploys an account with no
   * code yet; `gasCallOf` refuses those calls. A call anyone may send
   * is estimated as it stands, so this is ignored for one.
   */
  transaction?: GasEstimateCall
  /**
   * The account this wallet holds that the key operates, the source of the
   * transfer route. Every step but the fast track's needs it.
   */
  operates?: WalletAccountRef
  /**
   * The transaction the key sends for the transfer route, built through the
   * account library, carrying its one call to the key with no value (the check
   * adds what the value costs). By default the account's own `executeBySender`
   * (`transferTransactionOf`), which holds only for an account with code. For
   * an account with no code yet (`operates.deployed` false, or a write whose
   * own transaction deploys it through `ACCOUNT_FACTORY`), the check takes no
   * default: pass the factory's deploy-and-transfer transaction, or the step
   * offers the deposit from outside alone.
   */
  transferTransaction?: GasEstimateCall
  /** The fast track's step. Only a recovery call takes it. */
  fastTrack?: boolean
  /** The fee headroom in percent, `FEE_HEADROOM_PERCENT` by default. */
  feeHeadroomPercent?: number
}

/** What the deposit step is built from: the check's estimate and a balance that falls short of it. */
export interface DepositStepInput {
  write: WriteKind
  key: Address
  network: GasNetwork
  estimate: GasEstimate
  balance: bigint
  operates?: WalletAccountRef
  transferFee?: GasEstimate
  fastTrack?: boolean
}

// ---------------------------------------------------------------------------
// The copy
// ---------------------------------------------------------------------------

/** A state as the screen reads it. */
export interface RenderedWriteState {
  status: WriteStatus
  /** The in-progress chip of the submitting state. */
  chip?: string
  /** The state's own title, where it has one. A write's screen may set its own over it. */
  title?: string
  /** The state's sentences, in order. */
  lines: string[]
  /** The account's controller as it now stands, after a cancel whose attempt executed. */
  controller?: { label: string; address: string }
  /** The retry action's label, where the state offers the retry. */
  retry?: string
  /** Whether the state offers the cancel's move-funds action. */
  offersMoveFunds: boolean
}

/** One route as the step reads it. */
export interface RenderedRoute {
  kind: DepositRouteKind
  line: string
  note?: string
}

/** The deposit step as the screen reads it, in order. */
export interface RenderedDepositStep {
  /** The small line over the title, where the variant has one. */
  eyebrow?: string
  title: string
  lead: string[]
  /** The name of the key over its address, where the variant names it apart from the title. */
  keyLabel?: string
  /** The address of the key to fund, in full and checksummed. */
  keyAddress: string
  copyLabel: string
  /** The line the view shows where copying the key's address failed. */
  copyFailed: string
  routes: RenderedRoute[]
  notes: string[]
  /** The lines of a step that waits for the funds to arrive. */
  waiting: string[]
  /** The line under the write's own continue action, where the step waits for the funds. */
  actionHint?: string
  /**
   * The short panel a write's own screen shows when the check at sending comes
   * up short: its title and its sentence. It leads to the step.
   */
  blocker: { title: string; line: string }
}

/** How the deposit step renders. */
export interface DepositStepRenderOptions {
  /** The key's latest balance for the waiting line, the step's own by default. */
  balance?: bigint
}
