import type { SignedMessage } from '@ambire-common/controllers/activity/types'
import type { Account } from '@ambire-common/interfaces/account'
import type { Key } from '@ambire-common/interfaces/keystore'
import type { RPCProvider } from '@ambire-common/interfaces/provider'
import type { TypedMessage } from '@ambire-common/interfaces/userRequest'
import type { Action } from '@web/extension-services/background/actions'
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
  ISetupClient
} from '@web/modules/social-recovery/sdk-interfaces'
import type { ChainId, WalletRecords } from '@web/modules/social-recovery/shared/records'

import type { PUBLISHERS, UNKNOWN_ACTION } from './audited-actions'
import type { RECOVERY_CHAINS } from './chains'
import type { PROVIDER_READS } from './provider-adapter'
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
  methods: {
    ecdsa: Address
    passkey: Address
    aadhaar: Address
    zkpassport: Address
  }
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

/** The extension's provider as this folder holds it: the reads it makes and its teardown. */
export type ExtensionProvider = AdapterProvider & ChainReadsProvider & Pick<RPCProvider, 'destroy'>

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

/** The wallet's own reads the SDK does not offer, under the name screens use. */
export type WalletReads = IWalletReadsDouble
export type { FitCheckReading, RemovedKeyReading, RemovedKeyUnavailableCause }

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
  | { status: 'ready'; client: RecoveryKitClient; reads: ChainReads }
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
  signTypedData(key: KeyHandle, typedData: TypedDataToSign): Promise<Hex>
  /** An EIP-191 personal-message signature over the bytes by the key, after the holder confirms it. */
  signBytes(key: KeyHandle, bytes: Hex): Promise<Hex>
}

export type SignerMember = typeof SIGNER_MEMBERS[number]

/** The two request-queue actions the facade dispatches: add its request, and withdraw it on a timeout. */
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
