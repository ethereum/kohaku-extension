import type {
  Address,
  ApproverRequest,
  BlockHeader,
  BlockTag,
  Hex,
  IProvider,
  RawLog,
  BackupChoice
} from '@kohaku-eth/social-recovery'
import type {
  AnonAadhaarMethodOptions,
  ZkPassportMethodOptions
} from '@kohaku-eth/social-recovery/recovery-methods'
import type { CeremonyStep, CeremonyView } from '@web/modules/social-recovery/shared/ceremony'
import type {
  World,
  ExtensionProvider,
  HeldAndPushedQueue,
  NodeTransaction,
  ProviderRead,
  QueueWorld,
  QueuedFor,
  SendRefusalReason,
  SendRequestUpdate,
  SendWorld,
  SignAccountOpState,
  TrackedSend,
  accountFor,
  listedIn,
  queueHolding
} from '@web/modules/social-recovery/shared/client/__tests__/harness'
import type {
  RecoveryKitClient,
  DeploymentFacts,
  ListedAccount,
  PrivacyLevel
} from '@web/modules/social-recovery/shared/client/types'
import type { CeremonyRequestRecord } from '@web/modules/social-recovery/shared/records'
import type { Network } from '@ambire-common/interfaces/network'
import type { Account, AccountStates } from '@ambire-common/interfaces/account'
import type { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import type { SignUserRequest } from '@ambire-common/interfaces/userRequest'

/** An approver request for an approval, the one purpose the module's verify judges a reply for. */
export type ApprovalRequest = Extract<ApproverRequest, { purpose: 'approval' }>

/** One `eth_call` the scripted provider answered: where, what and at which block. */
export interface ProviderCall {
  to: Address
  data: Hex
  block: BlockTag
}

/**
 * A provider a test scripts call by call, for the reads that judge what a
 * node answers at its edges (a pruned history, a log the filter did not ask
 * for, a failed chunk): each call answers the bytes scripted for its address
 * and data, an address with no code answers no bytes, and the logs are
 * filtered by address, topics and range as a node filters them.
 */
export interface ScriptedProvider {
  provider: IProvider & {
    chainId: jest.Mock
    call: jest.Mock
    logs: jest.Mock
    block: jest.Mock
    code: jest.Mock<Promise<Hex>, [Address, BlockTag]>
    transaction: jest.Mock
  }
  head: BlockHeader
  /** Answers one exact call; a function answers it afresh on each call. */
  answer(to: Address, data: Hex, answer: Hex | Error | ((data: Hex) => Hex | Error)): void
  /** Answers every call to `to` whose selector is `selector` and has no exact answer. */
  answerWith(to: Address, selector: Hex, answer: (data: Hex) => Hex | Error): void
  /** Gives `address` its code from block `from` on (block 0 by default); a read at a named tag sees it. */
  setCode(address: Address, code: Hex, from?: number): void
  addLog(log: RawLog): void
  /** Scripts the sender of one transaction, or the error its read rejects with. */
  setSender(hash: Hex, sender: Address | Error): void
  /** Every call answered or refused, in order. */
  calls: ProviderCall[]
}

/** The setup state the scripted manager answers for the account and the action. */
export interface ScriptedState {
  setupCommitment: Hex
  setupNonce: bigint
  setupCommittedAtBlock: number
  /** The attempt's state, as the enum's index. */
  attemptState?: number
  nextAttemptId?: bigint
  attemptId?: bigint
  consumableAfter?: number
}

/** What a setup commit log carries; the action is the world's by default. */
export interface CommittedFields {
  action?: Address
  nonce: bigint
  setupCommitment: Hex
  publicMetadata?: Hex
  privateMetadata?: Hex
}

/** The steps and the views a device reported while a test followed it. */
export interface Followed {
  steps: CeremonyStep[]
  views: CeremonyView[]
}

/** A client over the stand-in's world and the modules of its two identity methods. */
export interface IdentityWorld {
  world: World
  client: RecoveryKitClient
  zkModule: Address
  aadhaarModule: Address
}

/** What a test heard of one scripted phone request: its events in order, and their payloads. */
export interface Heard {
  events: string[]
  proofs: unknown[]
  results: unknown[]
  errors: string[]
}

/** A case's name and the accounts the wallet lists. */
export type ListingCase = [string, () => ListedAccount[]]

/** A case's name or a method, and a value. */
export type NamedValue = [string, unknown]

/** A fee option, read by whether it is selected. */
export type FeeOptionSelection = { selected: boolean }

/** A fee option, read by its amount. */
export type FeeOptionAmount = { amount?: bigint }

/** A case's name and the signing state that resets the estimate. */
export type ResetCase = [string, (id: string) => SignAccountOpState]

/** A case's name and a flag. */
export type FlagCase = [string, boolean]

/** A controller state the wallet pushes. */
export type PushedState = 'accounts' | 'accountStates' | 'networks'

/** A case's name and the chain id. */
export type ChainCase = [string, number | bigint]

/** The stored request of each ceremony call. */
export type RecordsByCall = Record<'enroll' | 'testAccess' | 'createClaim', CeremonyRequestRecord>

/** A validation finding, read by its code. */
export type CodedFinding = { code: string }

/** Who may send a prepared call: the account only, or anyone. */
export type CallSender = 'account' | 'anyone'

/** The arguments of a code read: the address and the block. */
export type CodeReadArgs = [unknown, unknown?]

/** The arguments of a call: the transaction, maybe with no data. */
export type OptionalCallArgs = [{ data?: string }]

/** A case's name, what it changes in the world, and the refusal it reads. */
export type WorldRefusalCase = [string, (world: World) => void, string]

/** A case's name and what it changes in the world. */
export type WorldCase = [string, (world: World) => void]

/** A call, read by its data, if any. */
export type OptionalDataCall = { data?: string }

/** A case's name, the variable's value and the error it throws. */
export type MalformedCase = [string, string, RegExp]

/** A network field and a value. */
export type NetworkField = [keyof Network, unknown]

/** An identity ceremony call. */
export type IdentityCall = 'enroll' | 'createClaim'

/** A case's name and the identity parameters it changes. */
export type ConfigChangeCase = [
  string,
  { nullifier: bigint; nullifierSeed: bigint; freshnessWindow: bigint }
]

/** A case's name, the missing deployment facts, and the method they leave unbuilt. */
export type GapCase = [string, (keyof DeploymentFacts)[], 'zkPassport' | 'aadhaar']

/** A method and the deployment fact it lacks. */
export type UndeployedCase = ['zkPassport' | 'aadhaar', keyof DeploymentFacts]

/** The options each identity method factory was called with, in call order. */
export interface IdentityFactoryCalls {
  zkPassport: ZkPassportMethodOptions[]
  aadhaar: AnonAadhaarMethodOptions[]
}

/** A case's name and the queue that blocks the account. */
export type BlockingCase = [string, (a: Address) => ReturnType<typeof queueHolding>]

/** A case's name and what the queue holds. */
export type QueuedCase = [string, QueuedFor]

/** A push that ends the signing, and whether its operation still carries the request. */
export type SigningEndCase = [string, (id: string) => SendRequestUpdate, boolean]

/** A call, read by its target and data, if any. */
export type PartialCall = { to?: string; data?: string }

/** The arguments of a call: the transaction. */
export type CallArgs = [{ data: string }]

/** A request the node received: its method and its parameters. */
export type NodeRequest = [string, unknown[]]

/** The provider action a revert came from. */
export type ProviderAction = 'call' | 'estimateGas'

/** A case's name, the sender and the block. */
export type CallCase = [string, Address, BlockTag]

/** A case's name and the two answers. */
export type FeeAnswerCase = [string, unknown, unknown]

/** A case's name and the number. */
export type NumberCase = [string, number]

/** A case's name, the block tag asked, and the tag sent. */
export type TagCase = [string, BlockTag | undefined, BlockTag]

/** A case's name, the read, and the call that makes it. */
export type ChecksumCase = [string, ProviderRead, (provider: ExtensionProvider) => Promise<unknown>]

/** A case's name and the broken log. */
export type BrokenLogCase = [string, Record<string, unknown>]

/** An error a node answers for one item of a batch. */
export type NodeError = { code: number; message: string; data?: Hex }

/** A receipt's status: reverted or succeeded. */
export type ReceiptStatus = 0 | 1

/** A case's name, how the replacement differs, and how it reads. */
export type ReplacementCase = [
  string,
  Partial<NodeTransaction>,
  'cancelled' | 'replaced' | 'repriced'
]

/** A case's name, the outcome it brings about, and the state it ends in. */
export type SessionOutcome<Wallet> = [string, (w: Wallet) => Promise<void>, string]

/** A refusal the port reads from the queue, and how a test brings it about. */
export type QueueRefusal = {
  reason: SendRefusalReason
  /** Brings the refusal about once the request is queued with its window open. */
  bring: (q: SendWorld, id: string | number) => Promise<void>
}

/** A case's name and the accounts the wallet lists. */
export type AccountsCase = [string, SendWorld['accounts']]

/** A refusal, its title, whether the wallet listed an operation, and how a test brings it about. */
export type RefusalWords = {
  title: string
  reason: SendRefusalReason
  /** Whether the wallet listed an operation under the request. */
  listed: boolean
  bring: (q: SendWorld, id: string | number) => Promise<void>
}

/** A note, the metadata it reads, and the backup and level it gives. */
export type NoteCase = {
  note: string
  publicMetadata: Hex
  backup: BackupChoice
  level: PrivacyLevel
}

/** A case's name, the message and the signature it yields. */
export type MessageCase = [
  string,
  Parameters<ReturnType<typeof accountFor>['signMessage']>[0]['message'],
  Hex
]

/** A case's name and the signing route. */
export type RouteCase = [string, (q: QueueWorld) => Promise<Hex>]

/** A case's name and the keys. */
export type KeysCase = [string, Address[]]

/** A case's name, the form of the signature, and the signature it reads. */
export type SignatureRefusalCase<Signature> = [string, 'bytes' | 'typed', Signature]

/** A case's name and the form of the signature. */
export type FormCase = [string, 'bytes' | 'typed']

/** A v value, the signature it ends, and the signature it reads as. */
export type ChainIdVCase<Signature> = [number, Hex, Signature]

/** The part of typed data that carries the account. */
export type TypedDataPart = 'message' | 'domain'

/** A case's name and the part of typed data that carries the account. */
export type PlaceCase = [string, 'message' | 'domain']

/** The form a signature takes: bytes or typed data. */
export type SignatureForm = 'bytes' | 'typed'

/** A case's name, the list the wallet shows, and the count it reads. */
export type ListCase = [string, (id: string | number) => ReturnType<typeof listedIn>, number]

/** What a transaction read answers: the sender, or none. */
export type TransactionAnswer = Promise<{ from: string } | null>

/** The arguments of a transaction read: the hash. */
export type HashArgs = [string]

/** The members of an account state a test sets; each has a default. */
export type AccountStateMembers = { nonce?: bigint; balance?: bigint; currentBlock?: bigint }

/** The props of the probe: the account, if any. */
export type OptionalAccountProps = { account: Address | undefined }

/** What the controller states hand the hook; a test changes it and renders again. */
export type ControllerStates = {
  accounts?: Account[]
  accountStates?: AccountStates
  areAccountStatesLoading?: boolean
  keys?: { addr: string; type: string }[]
  networks?: object[]
  providers?: Record<string, { isWorking?: boolean }>
}

/** The props of the probe: the account and the facts it hands the hook. */
export type FactsProbeProps = {
  account: Address
  facts?: Parameters<typeof useRecoveryClient>[1]
}

/** The props of the probe: the account. */
export type AccountProps = { account: Address }

/** A network field and its new value. */
export type NetworkInput = [keyof Network, string]

/** How a promise stands, and its value once settled. */
export type PromiseOutcome = { status: 'pending' | 'resolved' | 'rejected'; value?: unknown }

/** A withdrawal: the refusal it reads, and how a test withdraws, lists, holds and loses the request. */
export type Withdrawal = {
  reason: SendRefusalReason
  withdraw: (q: SendWorld, own: SignUserRequest) => Promise<void>
  listed: (own: SignUserRequest) => HeldAndPushedQueue
  waiting: (own: SignUserRequest) => HeldAndPushedQueue
  gone: () => HeldAndPushedQueue
}

/** A way the send ends, and the status it leaves. */
export type EndingStatus = {
  ending: string
  end: (q: SendWorld, id: string) => Promise<void>
  status: TrackedSend['status']
}

/** A case's name and the queue that holds the request. */
export type HeldCase = [string, (own: SignUserRequest) => HeldAndPushedQueue]

/** A case's name, what happens first, and what lets the request go. */
export type LettingGoCase = [string, (q: SendWorld) => void, (q: SendWorld) => void]

/** A case's name and the push that lets the request go. */
export type LetGoCase = [string, (id: string) => SendRequestUpdate]
