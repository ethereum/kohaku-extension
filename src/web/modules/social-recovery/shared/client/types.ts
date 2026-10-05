import type { SignedMessage } from '@ambire-common/controllers/activity/types'
import type { EstimationController } from '@ambire-common/controllers/estimation/estimation'
import type { MainController } from '@ambire-common/controllers/main/main'
import type { RequestsController } from '@ambire-common/controllers/requests/requests'
import type { SignAccountOpController } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import type { Account, AccountOnchainState, AccountStates } from '@ambire-common/interfaces/account'
import type { Key } from '@ambire-common/interfaces/keystore'
import type { Network } from '@ambire-common/interfaces/network'
import type { RPCProvider } from '@ambire-common/interfaces/provider'
import type { RecoveryKit } from '@ambire-common/interfaces/recoveryKit'
import type { SignAccountOpError } from '@ambire-common/interfaces/signAccountOp'
import type { Calls, TypedMessage } from '@ambire-common/interfaces/userRequest'
import type { WindowProps } from '@ambire-common/interfaces/window'
import type {
  AccountOpIdentifiedBy,
  SubmittedAccountOp
} from '@ambire-common/libs/accountOp/submittedAccountOp'
import type { AccountOp } from '@ambire-common/libs/accountOp/accountOp'
import type { Call } from '@ambire-common/libs/accountOp/types'
import type { TokenResult } from '@ambire-common/libs/portfolio'
import type { Action } from '@web/extension-services/background/actions'
import type { VisibilitySource } from '@web/modules/social-recovery/shared/ceremony'
import type {
  FitCheckReading,
  IWalletReadsDouble,
  RemovedKeyReading,
  RemovedKeyUnavailableCause
} from '@web/modules/social-recovery/sdk-doubles'
import type {
  Address,
  BlockTag,
  CreationRecord,
  DeploymentDescriptor,
  Hex,
  IMethodModuleReads,
  IMethodsOrchestrator,
  IProvider,
  IRecoveryActionInteractor,
  IRecoveryClient,
  IRecoveryMethod,
  ISetupClient,
  PreparedCall
} from '@web/modules/social-recovery/sdk-interfaces'
import type { ChainId, SlotKind, WalletRecords } from '@web/modules/social-recovery/shared/records'

import type { UNKNOWN_ACTION } from './audited-actions'
import type { RECOVERY_CHAINS } from './chains'
import type { PUBLISHERS } from './deployments'
import type { PROVIDER_READS } from './provider-adapter'
import type { MISSING_SEND_ACTION, SEND_REFUSAL_REASONS } from './sender'
import type { RECOVERY_CALLS } from './sending'
import type { MISSING_BACKGROUND_ACTION, SIGN_FLOW_FAILURE_REASONS, SIGNER_MEMBERS } from './signer'

// ---------------------------------------------------------------------------
// Chains and addresses
// ---------------------------------------------------------------------------

export type RecoveryChain = typeof RECOVERY_CHAINS[number]

/** The addresses one deployment is reached at. */
export interface AddressBook {
  /** The policy manager every setup and attempt call targets. */
  manager: Address
  /** The four shipped method modules. */
  methods: Record<SlotKind, Address>
  /** The recovery action for Kohaku's Ambire-derived account. */
  action: Address
}

// ---------------------------------------------------------------------------
// Audited actions
// ---------------------------------------------------------------------------

export type Publisher = typeof PUBLISHERS[number]

/** The en.json key of a publisher's name, `socialRecovery.display.publishers.<slug>`. */
export type PublisherKey = `socialRecovery.display.publishers.${Publisher}`

/** One audited action on one chain, with its publisher. */
export interface AuditedAction {
  kind: 'audited'
  chain: RecoveryChain
  action: Address
  publisher: Publisher
}

export type UnknownAction = typeof UNKNOWN_ACTION

// ---------------------------------------------------------------------------
// Deployments
// ---------------------------------------------------------------------------

/** One audited action a deployment names, with its publisher. */
export interface DeployedAuditedAction {
  action: Address
  publisher: Publisher
}

/**
 * The facts of a deployed kit on one chain. The two identity methods are
 * absent where that deployment does not serve them.
 */
export interface DeploymentFacts {
  manager: Address
  methodEcdsa: Address
  methodPasskey: Address
  methodAadhaar?: Address
  methodZkpassport?: Address
  action: Address
  /** The block the manager was deployed at, where event reads start. */
  deployedAt: number
  digestVersion: string
  managerVersion: string
  auditedActions: DeployedAuditedAction[]
  /** The block explorer's base address for this deployment's transactions. */
  explorerUrl?: string
}

/** The addresses of one chain's deployment, flat, as a descriptor names them. */
export interface DeploymentAddresses {
  manager: Address
  methodEcdsa: Address
  methodPasskey: Address
  methodAadhaar: Address
  methodZkpassport: Address
  action: Address
  servedImplementation: Address
}

/** A deployment variable's raw text and the facts parsed from it. */
export interface ParsedDeploymentVariable {
  raw: string
  facts: DeploymentFacts
}

/** What a chain runs: the scripted stand-in, or a deployed kit and its facts. */
export type Deployment = { kind: 'stand-in' } | { kind: 'deployed'; facts: DeploymentFacts }

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** The account facts the client configuration carries where the wallet has them. */
export interface AccountFacts {
  /** The account's creation triple and block, read by the handover builder alone. */
  creation?: CreationRecord
  /** The account implementation the wallet is about to deploy, read by the fit check alone. */
  accountImplementation?: Address
  /** The wallet's own keys it asks `isAuthority` about; never the account's signer set. */
  candidateKeys?: Address[]
}

export interface RecoveryClientConfiguration extends AccountFacts {
  /** The one chain the wallet reads, a fixed label with no switch. */
  chain: RecoveryChain
  /** The account the client binds. */
  account: Address
  /** The deployed manager, methods and action (placeholders until deployment). */
  addressBook: AddressBook
  /** The provider adapter over the extension's own provider (`createProviderAdapter`). */
  provider: IProvider
}

// ---------------------------------------------------------------------------
// The provider adapter and the chain reads
// ---------------------------------------------------------------------------

/** The members of the extension's provider the adapter reads through. */
export type AdapterProvider = Pick<RPCProvider, 'call' | 'getLogs' | 'getBlock' | 'send'>

/** One log as the extension's provider answers it. */
export type ProviderLog = Awaited<ReturnType<AdapterProvider['getLogs']>>[number]

export type ProviderRead = typeof PROVIDER_READS[number]

/** A contract answered with a revert: the error carries the raw revert data, `0x` where it gave none. */
export interface RevertedCall extends Error {
  name: 'RevertedCall'
  data: Hex
  read: 'call' | 'estimateGas'
}

/** A read the provider could not make. It is a failure, never an empty answer. */
export interface ProviderReadFailure extends Error {
  name: 'ProviderReadFailure'
  read: ProviderRead
  cause: unknown
}

/** The members of the extension's provider the balance and gas reads use. */
export type ChainReadsProvider = Pick<RPCProvider, 'getBalance' | 'estimateGas' | 'send'>

/** One transaction a key the wallet holds would send, for its gas estimate. */
export interface GasEstimateCall {
  from: Address
  to: Address
  data: Hex
  value?: bigint
}

export interface ChainReads {
  /** The native balance of an address at a block tag (`latest` by default), in wei. */
  nativeBalance(address: Address, block?: BlockTag): Promise<bigint>
  /** The gas one transaction would use. A call that would revert rejects with its revert data. */
  estimateGas(call: GasEstimateCall): Promise<bigint>
  /** The node's gas price, in wei per gas. */
  gasPrice(): Promise<bigint>
}

/** The members of the extension's provider the receipt wait uses. */
export type ReceiptProvider = Pick<
  RPCProvider,
  'getTransaction' | 'getBlockNumber' | 'once' | 'off'
>

/** A transaction as the extension's provider answers it. */
export type ProviderTransaction = NonNullable<
  Awaited<ReturnType<ReceiptProvider['getTransaction']>>
>

/** A transaction receipt as the extension's provider answers it. */
export type ProviderTransactionReceipt = NonNullable<
  Awaited<ReturnType<RPCProvider['getTransactionReceipt']>>
>

/**
 * The receipt of a transaction the wallet broadcast, over the extension's
 * provider. `blockNumber` is read before the send, and `wait` scans for a
 * replacement from that block.
 */
export interface ReceiptWait {
  /** The chain's latest block number. */
  blockNumber(): Promise<number>
  /**
   * Answers ethers' receipt, and rejects with ethers' own `CALL_EXCEPTION`
   * for a receipt with status zero and `TRANSACTION_REPLACED` for a
   * transaction another one took the place of, both as ethers threw them.
   */
  wait(transactionHash: Hex, startBlock: number): Promise<ProviderTransactionReceipt>
}

/** What a receipt wait takes: the signal the caller aborts when it releases the provider. */
export interface ReceiptWaitOptions {
  readonly signal?: AbortSignal
}

/**
 * The rejection of a wait in flight once the caller released the provider,
 * which ethers' own wait never settles by itself. It names the hash, so the
 * write keeps it and a later wait can take it up again.
 */
export interface ReceiptWaitReleased extends Error {
  name: 'ReceiptWaitReleased'
  transactionHash: Hex
}

/** The extension's provider as this folder holds it: the reads it makes, the receipt wait and its teardown. */
export type ExtensionProvider = AdapterProvider &
  ChainReadsProvider &
  ReceiptProvider &
  Pick<RPCProvider, 'getCode' | 'destroy'>

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

/** The wallet's own reads the SDK does not offer, under the name screens use. */
export type WalletReads = IWalletReadsDouble
export type { FitCheckReading, RemovedKeyReading, RemovedKeyUnavailableCause }

// ---------------------------------------------------------------------------
// The account's facts
// ---------------------------------------------------------------------------

/**
 * The wallet's own state the account's facts are read from: the accounts it
 * lists with their state on each chain, the keys the keystore holds and the
 * networks. Each is undefined until the background pushed it.
 */
export interface AccountFactsSources {
  accounts: readonly Account[] | undefined
  accountStates: AccountStates | undefined
  keys: readonly Pick<Key, 'addr' | 'type'>[] | undefined
  networks: readonly Network[] | undefined
  /** False where the recovery chain's provider reports it is not working. */
  providerWorking?: boolean
  /** True once a refresh of the account's state on the chain ran and ended. */
  stateRefreshSettled?: boolean
}

/**
 * What the wallet holds for one listed account on the recovery chain. The
 * reading `useAccountFacts` holds keeps current the members a screen reads
 * (the account's record and label, the state's members the account's own
 * transaction is built from, the network's name and symbol, `deployed`, `key`
 * and `creation`); the others (the state's balance and block, the network's
 * other members) may be older.
 */
export interface ListedAccountFacts {
  /** The listed record, with the wallet's own case. */
  account: Account
  /** The account's state on the chain, as the wallet last read it. */
  state: AccountOnchainState
  /** The chain's network record. */
  network: Network
  /** Whether the account has code on the chain. */
  deployed: boolean
  /**
   * The account's key the keystore holds, which sends the account's own
   * operations and pays their gas. Absent where the keystore holds none of
   * the account's keys: a view-only account.
   */
  key?: KeyHandle
  /** The account's creation record; absent for a basic account. */
  creation?: CreationRecord
}

/**
 * Why the wallet holds no facts for an account: it does not list it, it holds
 * no network for the chain, or it holds no state for the account on the chain
 * and cannot read one (`state-unread`: the chain's provider is not working, or
 * a refresh of the state ended with none).
 */
export type AccountFactsUnavailableCause = 'not-listed' | 'no-network' | 'state-unread'

export type AccountFactsReading =
  | { status: 'loading' }
  | { status: 'unavailable'; cause: AccountFactsUnavailableCause }
  | { status: 'ready'; facts: ListedAccountFacts }

/** What `useAccountFacts` hands a screen: the reading and a retry of the state's refresh. */
export type AccountFactsResult = AccountFactsReading & {
  /** Asks the wallet again for the account's state on the chain, where it holds none. */
  retry: () => void
}

/** The wallet's refresh of one account's state, on the chains it names. */
export interface AccountStateRefresh {
  addr: string
  chainIds: bigint[]
}

/**
 * Where the hook's refresh of the account's state stands, for the account and
 * the attempt `key` names: asked for, seen running in the accounts state, or
 * ended, and how many times the attempt asked the wallet.
 */
export interface StateRefreshProgress {
  key: string
  phase: 'requested' | 'running' | 'settled'
  dispatches: number
}

/** The facts the account library builds a smart account's own transaction from. */
export type AccountBatchSource = Pick<ListedAccountFacts, 'account' | 'state' | 'network'>

/**
 * The mark the wallet's own `calls` request carries for a batch that arms the
 * recovery kit: the manager and its audited actions. With it the sign screen
 * lets the account grant an audited action its privilege in the batch that
 * also commits the setup at that manager; without it that grant is refused as
 * a call to the account itself.
 */
export type RecoveryKitMark = RecoveryKit

/** The account fields the privilege holders read takes. */
export type PrivilegeAccount = Pick<
  Account,
  'addr' | 'associatedKeys' | 'initialPrivileges' | 'creation'
>

/** The members of the extension's provider the privilege holders read uses. */
export type PrivilegeReadsProvider = Pick<RPCProvider, 'send' | 'getCode' | 'call'>

/** The keys holding a privilege on an account, or why they could not be read. */
export type PrivilegeHoldersReading =
  | { kind: 'holders'; keys: Address[] }
  | { kind: 'unreadable'; cause: string }

/** The wallet's own read of who holds a privilege on an account. */
export interface PrivilegeReads {
  privilegeHoldersOf(
    account: PrivilegeAccount,
    chainId: number | bigint
  ): Promise<PrivilegeHoldersReading>
}

/**
 * What the extension holds for one account: the two entry clients, the two
 * narrow seams the builder hands out, the approving side and its methods, and
 * the wallet's own reads. The builder constructed every part once, so all of
 * them read the same manager, action and events.
 */
export interface RecoveryKitClient {
  chain: RecoveryChain
  account: Address
  descriptor: DeploymentDescriptor
  setup: ISetupClient
  recovery: IRecoveryClient
  /** `IRecoveryActionInteractor` alone; the arming seam stays inside the setup client. */
  action: IRecoveryActionInteractor
  /** `IMethodModuleReads` alone; the manager part is never handed out whole. */
  moduleReads: IMethodModuleReads
  /** The approving side, over the builder's method registry; it reads no chain. */
  approving: IMethodsOrchestrator
  /**
   * The method implementation the builder's registry holds for a method slug,
   * a key of the address book's `methods` (`ecdsa`, `passkey`, `aadhaar`,
   * `zkpassport`): the one serving that module. Undefined for any other slug.
   */
  methodFor(slug: string): IRecoveryMethod | undefined
  /** The wallet's own reads the SDK does not offer (wallet-reads.ts). */
  walletReads: WalletReads
}

/**
 * The part of a client a ceremony runs on: the approving side, its methods and
 * the descriptor their modules are read from. No part reads a chain.
 */
export type ApprovingClient = Pick<RecoveryKitClient, 'approving' | 'methodFor' | 'descriptor'>

/** Builds the client for an account on a chain; rejects where it cannot. */
export type CeremonyClientFor = (account: Address, chainId: ChainId) => Promise<ApprovingClient>

export interface CeremonyResolverOptions {
  /** The wallet's records, read for the ceremony request under a request id. */
  records: Pick<WalletRecords, 'ceremonyRequest'>
  clientFor: CeremonyClientFor
  /** The clock a request's age is read against, in ms since epoch. */
  now?: () => number
}

/** The domain name and version a build carries or a manager publishes. */
export interface DomainVersion {
  name: string
  version: string
}

/**
 * The refusal of a client built against another deployment's digest version.
 * `state` is the account step's state for it, drawn by a screen from en.json.
 */
export interface DigestVersionRefusal extends Error {
  name: 'DigestVersionRefusal'
  state: 'update-the-wallet'
  /** What this build derives under. */
  carried: DomainVersion
  /** What the manager publishes, where the wallet read it. */
  published?: DomainVersion
}

export type RecoveryClientState =
  | { status: 'loading' }
  | { status: 'ready'; client: RecoveryKitClient; reads: ChainReads; receipts: ReceiptWait }
  | { status: 'update-the-wallet'; refusal: DigestVersionRefusal }
  | { status: 'failed'; error: unknown }

// ---------------------------------------------------------------------------
// The signer facade
// ---------------------------------------------------------------------------

/** The keystore's own handle of a key: its address and its type. */
export interface KeyHandle {
  addr: Address
  type: Key['type']
}

/** EIP-712 typed data. `types.EIP712Domain` is derived from the domain where the caller leaves it out. */
export interface TypedDataToSign {
  domain: TypedMessage['domain']
  types: TypedMessage['types']
  primaryType: string
  message: Record<string, unknown>
}

/** The facade. Its two members are its whole surface. */
export interface SignerFacade {
  /** An EIP-712 signature over the typed data by the key, after the holder confirms it. */
  signTypedData(key: KeyHandle, typedData: TypedDataToSign, options?: SignOptions): Promise<Hex>
  /** An EIP-191 personal-message signature over the bytes by the key, after the holder confirms it. */
  signBytes(key: KeyHandle, bytes: Hex, options?: SignOptions): Promise<Hex>
}

/**
 * What a caller may pass with one signature. An abort of `signal` before the
 * answer arrives withdraws the request from the queue.
 */
export interface SignOptions {
  signal?: AbortSignal
}

export type SignerMember = typeof SIGNER_MEMBERS[number]

/** The two request-queue actions the facade dispatches: add its request, and withdraw it on a timeout or an abort. */
export type SignRequestAction = Extract<
  Action,
  { type: 'REQUESTS_CONTROLLER_ADD_USER_REQUEST' | 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST' }
>

/** The part of the `signMessage` controller state the facade reads. */
export interface SignMessageState {
  signedMessage?: Pick<SignedMessage, 'fromActionId' | 'signature'> | null
}

/** The part of the `requests` controller state the facade reads. */
export interface RequestsState {
  userRequests?: { id: string | number }[]
  userRequestsWaitingAccountSwitch?: { id: string | number }[]
}

/** One controller state the background pushed, by controller. */
export type SignRequestUpdate =
  | { controller: 'signMessage'; state: SignMessageState }
  | { controller: 'requests'; state: RequestsState }

/** The account records the facade checks a key against. */
export type ListedAccount = Pick<Account, 'addr' | 'associatedKeys' | 'creation'>

/**
 * How the facade reaches the background: the dispatch of `useBackgroundService`,
 * the `signMessage` and `requests` controller states the background pushes,
 * the accounts the wallet lists and the window the request opens beside.
 * `signRequestPort` (signer-port.ts) wires the UI's own.
 */
export interface SignRequestPort {
  dispatch(action: SignRequestAction): void
  /** Calls the listener with each pushed `signMessage` and `requests` state; returns the unsubscribe. */
  subscribe(listener: (update: SignRequestUpdate) => void): () => void
  accounts(): readonly ListedAccount[]
  windowId(): number | undefined
}

/**
 * The facade was asked for a key the request queue cannot sign for: any key
 * that is not itself a basic account the wallet lists.
 *
 * Signing for such a key, or a bare digest, needs the background action
 * `MISSING_BACKGROUND_ACTION`, which does not exist yet. Its shape: params
 * `{ requestId, keyAddr, keyType, content }`, where `content` is a
 * `PlainTextMessage` or a `TypedMessage`. The handler takes
 * `KeystoreController.getSigner(keyAddr, keyType)`, runs `signer.init` with the
 * external signer controller of that type, and answers
 * `signMessage(content.message)` or `signTypedData(content)` with no account
 * lookup and no Ambire envelope. It sends the signature or the error back to
 * the UI under the request id, as `PROVIDER_RPC_REQUEST` does, and it too
 * goes through the action window for the holder's confirmation.
 */
export interface SignerNotWired extends Error {
  name: 'SignerNotWired'
  member: SignerMember
  key: KeyHandle
  missingAction: typeof MISSING_BACKGROUND_ACTION
}

export type SignFlowFailureReason = typeof SIGN_FLOW_FAILURE_REASONS[number]

export interface SignFlowFailure extends Error {
  name: 'SignFlowFailure'
  member: SignerMember
  reason: SignFlowFailureReason
}

export interface SignerFacadeOptions {
  /** The chain the request signs on, the recovery chain's id. */
  chainId: number | bigint
  timeoutMs?: number
}

// ---------------------------------------------------------------------------
// The send port
// ---------------------------------------------------------------------------

/**
 * The four background actions the send port dispatches: add its request and
 * withdraw it, and open and close the activity session it reads the broadcast
 * operation from.
 */
export type SendRequestAction = Extract<
  Action,
  {
    type:
      | 'REQUESTS_CONTROLLER_ADD_USER_REQUEST'
      | 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST'
      | 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS'
      | 'MAIN_CONTROLLER_ACTIVITY_RESET_ACC_OPS_FILTERS'
  }
>

/** The part of the action window's state the send port reads: whether the window is open. */
export interface ActionWindowState {
  actionWindow?: { windowProps?: Pick<NonNullable<WindowProps>, 'id'> | null }
}

/**
 * One request in the wallet's queue, with the members the send port reads:
 * its id, its kind, and the account and chain it is for.
 */
export interface QueuedRequest {
  id: string | number
  action?: { kind?: string }
  meta?: { accountAddr?: string; chainId?: bigint }
}

/**
 * The part of the `requests` controller state the send port reads: the
 * requests in the queue and those waiting for an account switch, and the
 * action window.
 */
export interface SendQueueState extends RequestsState {
  userRequests?: QueuedRequest[]
  userRequestsWaitingAccountSwitch?: QueuedRequest[]
  actions?: ActionWindowState
}

/**
 * The part of the `requests` controller state the send port reads from the
 * queue the screen holds now: the requests in the queue and those waiting for
 * an account switch, as the wallet keeps them.
 */
export type HeldRequestQueue = Partial<
  Pick<RequestsController, 'userRequests' | 'userRequestsWaitingAccountSwitch'>
>

/** A `requests` state the send port reads its requests from: the one the screen holds, or one pushed. */
export type QueueLists = HeldRequestQueue | SendQueueState

/** One operation the activity lists, with the members the send port reads. */
export type SubmittedOperation = Pick<SubmittedAccountOp, 'txnId' | 'status'> & {
  identifiedBy?: Pick<AccountOpIdentifiedBy, 'type'>
  calls?: Pick<Call, 'fromUserRequestId' | 'txnId'>[]
}

/**
 * The part of the `activity` controller state the send port reads: one page of
 * each session's operations, newest first, with the page's index and the
 * number of pages.
 */
export interface ActivityState {
  accountsOps?: {
    [sessionId: string]:
      | { result?: { items?: SubmittedOperation[]; currentPage?: number; maxPages?: number } }
      | undefined
  }
}

/** The part of the `main` controller state the send port reads: whether the wallet signs or broadcasts. */
export interface MainStatusState {
  statuses?: Partial<Pick<MainController['statuses'], 'signAndBroadcastAccountOp'>>
}

/**
 * The part of the `signAccountOp` controller state the send port reads: the
 * operation the sign screen estimates, with the requests its calls came from,
 * the sign screen's signing status, the estimation's status, fee options and
 * own error, the fee speeds, the holder's pick and the errors the sign screen
 * shows, first one first.
 */
export type SignAccountOpState = Partial<
  Pick<
    SignAccountOpController,
    'status' | 'feeSpeeds' | 'selectedFeeSpeed' | 'selectedOption' | 'rbfAccountOps' | 'errors'
  >
> & {
  accountOp?: Pick<AccountOp, 'accountAddr'> & { calls?: Pick<Call, 'fromUserRequestId'>[] }
  estimation?: Partial<Pick<EstimationController, 'status' | 'availableFeeOptions' | 'error'>>
}

/** One controller state the background pushed, by controller. */
export type SendRequestUpdate =
  | { controller: 'requests'; state: SendQueueState }
  | { controller: 'activity'; state: ActivityState }
  | { controller: 'main'; state: MainStatusState }
  | { controller: 'signAccountOp'; state: SignAccountOpState }

/**
 * How the send port reaches the background: the dispatch of
 * `useBackgroundService`, the `requests`, `activity`, `main` and
 * `signAccountOp` controller states the background pushes, the accounts the
 * wallet lists, the request queue as the wallet holds it now, and the window
 * the request opens beside. `sendRequestPort` (sender-port.ts) wires the UI's
 * own.
 */
export interface SendRequestPort {
  dispatch(action: SendRequestAction): void
  /** Calls the listener with each pushed controller state; returns the unsubscribe. */
  subscribe(listener: (update: SendRequestUpdate) => void): () => void
  accounts(): readonly ListedAccount[]
  /** The `requests` controller state the wallet holds now. */
  queue(): HeldRequestQueue
  windowId(): number | undefined
}

/**
 * Where a request the send port queued stands, read by a page that did not
 * queue it:
 *
 * - `queued`: the wallet's queue holds it, or holds it until an account
 *   switch, or the account's activity lists its transaction with no hash yet
 *   and not rejected;
 * - `broadcast`: the account's activity lists it as a transaction of the
 *   sender under `transactionHash`, whatever its status there (pending, stuck,
 *   confirmed or failed); the receipt of that hash decides;
 * - `untracked`: the wallet submitted it as an operation another party sends,
 *   which this wallet cannot follow; it may still reach the chain;
 * - `gone`: neither the queue nor the account's activity holds it, or the
 *   activity lists its transaction as rejected with no hash;
 * - `unread`: the activity did not answer in time, so nothing is known.
 */
export type SendRequestState =
  | { status: 'queued' }
  | { status: 'broadcast'; transactionHash: Hex }
  | { status: 'untracked' }
  | { status: 'gone' }
  | { status: 'unread' }

/**
 * One way the sign screen offers to pay the fee, as its controller holds it.
 * `balance` is what the payer holds of the token. `amount` is what the fee
 * needs at the fee speed the holder picked, and `available` whether the
 * balance covers at least one speed; both are absent until the controller
 * has the option's speeds.
 */
export interface FeeOption {
  paidBy: Address
  token: Pick<TokenResult, 'address' | 'symbol' | 'decimals'>
  balance: bigint
  amount?: bigint
  available?: boolean
  /** Whether the holder picked this option on the sign screen. */
  selected: boolean
}

/**
 * The sign screen's estimation for the port's own request, once it settled:
 * the fee options it offers and one error with its title and code as the
 * wallet gives them. The error is the estimation's own where it has one, and
 * otherwise the first one the sign screen shows.
 */
export interface FeeReading {
  options: FeeOption[]
  error?: Pick<SignAccountOpError, 'title' | 'code'>
}

/**
 * Called with each new reading of the sign screen's estimation for the port's
 * request. The port ignores a throw from the listener.
 */
export type EstimationListener = (reading: FeeReading) => void

/**
 * Sends through the request queue: one transaction from a key the wallet
 * holds, or one batch of calls a smart account the wallet lists runs. Each
 * answers the transaction hash once the wallet broadcast it, and rejects with
 * a `SendRefusal` where the wallet has no transaction under the request.
 */
export interface SendPort {
  /** The transaction the gas check estimated, from that key. */
  send(key: KeyHandle, transaction: GasEstimateCall): Promise<Hex>
  /**
   * The calls, in order, as one operation of the account. The sign screen
   * estimates it and offers the fee options; `onEstimation` hears each
   * reading of that estimation. `recoveryKit` marks a batch that arms the
   * recovery kit (`recoveryKitMarkOf`); no other batch carries it.
   * `requestId` is the id the request is queued under (`newSendRequestId`),
   * so the caller knows it before the send; the port makes one where none is
   * given.
   */
  sendAccountBatch(
    account: Address,
    calls: readonly PreparedCall[],
    onEstimation?: EstimationListener,
    recoveryKit?: RecoveryKitMark,
    requestId?: string
  ): Promise<Hex>
}

/** What the port follows once it queued a request: the request and who the refusal names. */
export interface FollowedRequest {
  id: string
  /** The listed account the request sends for, with the wallet's own case. */
  account: Address
  calls: Calls['calls']
  /** The key type the request carries beside the account, for a key's own transaction. */
  keyType?: Key['type']
  refusal: (reason: SendRefusalReason) => SendRefusal
  onEstimation?: EstimationListener
  /** The recovery kit's mark, for an account's batch that arms the kit. */
  recoveryKit?: RecoveryKitMark
}

export interface SendPortOptions {
  /** The chain the transaction is sent on, the recovery chain's id. */
  chainId: number | bigint
  timeoutMs?: number
  /**
   * The page's document. A hidden tab's dispatch reaches no controller, so a
   * withdrawal the queue has not confirmed is sent again when it is shown.
   */
  visibility?: VisibilitySource
}

export type SendRefusalReason = typeof SEND_REFUSAL_REASONS[number]

/**
 * A refusal the send port holds open for its settle period, whether it
 * withdrew the request, and whether the queue and the sign screen showed the
 * request gone since.
 */
export interface SettlingRefusal {
  reason: SendRefusalReason
  withdrawn: boolean
  confirmed: boolean
}

/**
 * The send port returned no transaction hash. For every reason but
 * `not-a-transaction` the wallet broadcast nothing under the request; for
 * `not-a-transaction` it submitted the request as an operation another party
 * sends, which may still reach the chain (`SEND_REFUSAL_REASONS`). It names
 * the key it was asked to send from, or the account whose batch it was asked
 * to send.
 *
 * `not-wired` is a key the request queue cannot send from: any key that is
 * not itself a basic account the wallet lists. Sending from such a key needs
 * the background action `MISSING_SEND_ACTION`, which does not exist yet. Its
 * shape: params `{ requestId, keyAddr, keyType, chainId, transaction }`, where
 * `transaction` is `{ to, data, value }`. The handler takes
 * `KeystoreController.getSigner(keyAddr, keyType)`, builds the raw transaction
 * with that key's nonce and the network's fee, signs it with
 * `signRawTransaction`, broadcasts it through the network's provider and adds
 * it to the activity under the request id, as the request queue does for an
 * account's own transaction. It too goes through the action window for the
 * holder's confirmation.
 */
export interface SendRefusal extends Error {
  name: 'SendRefusal'
  reason: SendRefusalReason
  key?: KeyHandle
  account?: Address
  missingAction?: typeof MISSING_SEND_ACTION
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type RecoveryCall = typeof RECOVERY_CALLS[number]

/** The keys the signer holds that can send, by role. */
export interface SendingKeys {
  /** The account's controlling key, which signs the account's own operations. */
  accountKey?: KeyHandle
  /** The recoverer's own key, which sends the submission and the execution. */
  recovererKey?: KeyHandle
}
