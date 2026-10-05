/**
 * The contract interactor: the two entry clients, the manager part and its
 * module-read seam, the action part and its arming seam, the prepared call and
 * batch, the two state records, the configuration and confirmation records, and
 * the module and action records.
 *
 * Imported from no SDK package. Types only. The manager's `ActionState` and
 * `Attempt` fields keep the manager contract's own names.
 *
 * Refusals throw: `prepareCommitSetup`, `prepareClearSetup`,
 * `prepareStartAttempt`, `prepareCancelByProofs`, `prepareCancelByVeto`,
 * `prepareExecuteHandover`, `initRecoveryGathering`, `initCancelGathering`,
 * `complete`, `getSetup` and `confirmSetup` throw an ordinary error; a refusal
 * raised by validation is a `ValidationRefusal` and the one `getSetup` (and the
 * two inits) throw on a restore is a `RestoreRefusal` (utilities.ts).
 * `addApproverReply` returns its typed result instead.
 */
import type { Address, BlockHeader, Hex, ReadResult } from './common'
import type { IEventManager, LogPosition } from './events'
import type { AttemptRequest, CancelRequest, PaymentOrder } from './formats'
import type {
  AddResult,
  ApproverReply,
  ApproverRequest,
  Assessment,
  Gathering,
  GatheringWindow
} from './gathering'
import type { KitError, SetupDescription, ValidationResult } from './utilities'

/** The two doors of the kit's surface, the caller a target accepts a call from. */
export const SENDERS = ['account', 'anyone'] as const
export type Sender = typeof SENDERS[number]

/** The options every prepare but `prepareCancelByOwner` takes. */
export interface PrepareOptions {
  simulate?: boolean
  from?: Address
}

/**
 * A simulation's outcome: success, or a typed error, with the address it ran
 * from. The error is a decoded `KitError`: the source, the name, the selector
 * and the argument values by name.
 */
export type Simulation = { ok: true; from: Address } | { ok: false; from: Address; error: KitError }

/**
 * One call of the batch the action will run, a description and never something
 * to sign. The fields are Ambire's `Transaction(to, value, data)` tuple.
 */
export interface DescribedCall {
  to: Address
  value: bigint
  data: Hex
}

/**
 * The record every write comes back as. It has no members of its own, so it
 * persists and moves as it stands. `simulation` is absent when the integrator
 * skipped it; `describes` is present on the execute alone.
 */
export interface PreparedCall {
  kind: 'call'
  target: Address
  value: bigint
  data: Hex
  sender: Sender
  block: { number: number; hash: Hex }
  simulation?: Simulation
  describes?: DescribedCall[]
}

/**
 * The second shape: a list of prepared calls that are one transaction, flagged
 * atomic, each carrying its own simulation at the one block the batch pinned.
 */
export interface PreparedBatch {
  kind: 'batch'
  calls: PreparedCall[]
  atomic: true
  block: { number: number; hash: Hex }
}

/** The manager's `AttemptState` enum. */
export const ATTEMPT_STATES = ['None', 'Waiting', 'Cancelled', 'Consumed'] as const
export type AttemptState = typeof ATTEMPT_STATES[number]

/** The manager's `Attempt` record, under the manager's own names. */
export interface Attempt {
  state: AttemptState
  attemptId: bigint
  setupNonce: bigint
  consumableAfter: number
  payloadHash: Hex
  order: PaymentOrder
  usedMethods: Address[]
  ignoresPause: boolean
}

/** What the manager's `stateOf` returns. */
export interface ActionState {
  setupCommitment: Hex
  setupNonce: bigint
  nextAttemptId: bigint
  setupCommittedAtBlock: number
  attempt: Attempt
}

/**
 * The setup-side reading of the bound account, pinned to one block carried by
 * number, timestamp and hash.
 */
export interface SetupState {
  isAuthorized: boolean
  hasSetup: boolean
  setupCommitment: Hex
  setupNonce: bigint
  setupCommittedAtBlock: number
  attemptActive: boolean
  block: BlockHeader
}

/**
 * The recovery-side reading of the bound account, pinned the same way.
 * `removedKey` is the address a handover would remove, or `'no-creation-triple'`
 * when no creation triple was given; that literal is the extension's own.
 */
export interface RecoveryState {
  attempt: Attempt
  nextAttemptId: bigint
  setupCommitment: Hex
  setupNonce: bigint
  removedKey: Address | 'no-creation-triple'
  block: BlockHeader
}

/**
 * One credential of a draft or a configuration: method address, config in the
 * method's own layout, the contact-book label the commitment does not cover,
 * and a salt where the holder supplied one.
 */
export interface Credential {
  method: Address
  config: Hex
  label?: string
  salt?: Hex
}

/** One clause of the rule: a threshold over its credentials. */
export interface Clause {
  threshold: number
  credentials: Credential[]
}

/** The three states of the backup payload. */
export const BACKUP_FORMS = ['encrypted', 'clear', 'empty'] as const
export type BackupForm = typeof BACKUP_FORMS[number]

/**
 * The setup draft `validateSetup`, `describeSetup` and `prepareCommitSetup`
 * read. A draft holds the privacy dial and the backup choice a configuration
 * does not.
 */
export interface SetupDraft {
  wait: bigint
  clauses: Clause[]
  ignoresPause: boolean
  privacy: { publicMetadata: Hex; backup: BackupForm }
}

/**
 * The holder's private configuration, what the commitment closes over: the
 * clauses, any supplied salts, the wait and the pause choice. Not a draft.
 */
export interface Configuration {
  clauses: Clause[]
  wait: bigint
  ignoresPause: boolean
}

/**
 * The source of a restore: the password that opens the backup, or the
 * configuration itself. A caller that already holds the configuration, for
 * example a cached copy, passes it directly.
 */
export type ConfigurationSource = { password: string } | Configuration

/** What `confirmSetup` returns; `landed: false` is an answer, not a refusal. */
export interface SetupConfirmation {
  landed: boolean
  nonce: bigint
  setupCommitment: Hex
  isAuthorized: boolean
  position?: LogPosition
}

/**
 * What `moduleInfo(module)` yields: name, version and the method-interface
 * probe. The SDK names the three values; the field names are the extension's.
 */
export interface ModuleInfo {
  name: string
  version: string
  supportsInterface: boolean
}

/**
 * What `actionInfo()` yields: name, version and the policy-action probe. The
 * SDK names the three values; the field names are the extension's.
 */
export interface ActionInfo {
  name: string
  version: string
  supportsInterface: boolean
}

/** The five values a method's `trustedParties` declares, under the contract's names. */
export interface TrustedParties {
  admin: Address
  pendingAdmin: Address
  trustedKeys: Hex[]
  pauseHolder: Address
  pendingPauseHolder: Address
}

/** The ERC-5267 domain `eip712Domain()` returns. */
export interface Domain {
  fields: Hex
  name: string
  version: string
  chainId: bigint
  verifyingContract: Address
  salt: Hex
  extensions: bigint[]
}

/**
 * The handover the opening init takes: the new authority always, the removed
 * one optional only where the client configuration carries the creation triple.
 */
export interface HandoverInput {
  newAuthority: Address
  removedAuthority?: Address
}

/**
 * The entry a holder's integrator builds while the holder still holds their
 * key.
 */
export interface ISetupClient {
  validateSetup(draft: SetupDraft): Promise<ValidationResult>
  describeSetup(draft: SetupDraft): Promise<SetupDescription>
  prepareCommitSetup(
    draft: SetupDraft,
    password?: string,
    options?: PrepareOptions
  ): Promise<PreparedCall | PreparedBatch>
  prepareClearSetup(options?: PrepareOptions): Promise<PreparedCall | PreparedBatch>
  confirmSetup(
    draft: SetupDraft,
    prepared: PreparedCall | PreparedBatch
  ): Promise<SetupConfirmation>
  setupState(): Promise<SetupState>
  getSetup(source: ConfigurationSource): Promise<Configuration>
  events: IEventManager
}

/**
 * The entry built when a key is lost. `now` is the moment the caller judges
 * against; the SDK reads no wall clock. `selection` defaults to none (pass
 * undefined).
 */
export interface IRecoveryClient {
  initRecoveryGathering(
    source: ConfigurationSource,
    handover: HandoverInput,
    order: PaymentOrder,
    window: GatheringWindow
  ): Promise<Gathering>
  initCancelGathering(source: ConfigurationSource, window: GatheringWindow): Promise<Gathering>
  getApproverRequests(gathering: Gathering): ApproverRequest[]
  addApproverReply(gathering: Gathering, reply: ApproverReply): AddResult
  assess(gathering: Gathering, now: number): Assessment
  complete(
    gathering: Gathering,
    selection: number[] | undefined,
    now: number
  ): AttemptRequest | CancelRequest
  prepareStartAttempt(
    request: AttemptRequest,
    now: number,
    options?: PrepareOptions
  ): Promise<PreparedCall>
  prepareCancelByProofs(
    request: CancelRequest,
    now: number,
    options?: PrepareOptions
  ): Promise<PreparedCall>
  prepareCancelByOwner(): Promise<PreparedCall>
  prepareCancelByVeto(method: Address, options?: PrepareOptions): Promise<PreparedCall>
  prepareExecuteHandover(
    attempt: Attempt,
    payload: Hex,
    options?: PrepareOptions
  ): Promise<PreparedCall>
  recoveryState(): Promise<RecoveryState>
  events: IEventManager
}

/**
 * The read seam over the manager part's three module views, what the builder's
 * `methodModuleReads()` hands out.
 */
export interface IMethodModuleReads {
  moduleInfo(module: Address): Promise<ReadResult<ModuleInfo>>
  paused(module: Address): Promise<ReadResult<boolean>>
  trustedParties(module: Address): Promise<ReadResult<TrustedParties>>
}

/**
 * The shared part for the manager, bound to the account and the action. Its six
 * prepares take the contract's own argument lists and encode; the clients
 * validate and simulate around them. The builder never hands it out whole.
 */
export interface IPolicyManagerInteractor extends IMethodModuleReads {
  stateOf(): Promise<ActionState>
  // `place` is bigint here because the manager's `hashApproval` and `hashCancel` take the
  // contract's uint256 place, while the gathering records carry it as a number.
  hashApproval(request: AttemptRequest, place: bigint): Promise<Hex>
  hashCancel(request: CancelRequest, place: bigint): Promise<Hex>
  eip712Domain(): Promise<Domain>
  name(): Promise<string>
  version(): Promise<string>
  supportsInterface(interfaceId: Hex): Promise<boolean>
  prepareCommitSetup(
    action: Address,
    setupCommitment: Hex,
    nonce: bigint,
    publicMetadata: Hex,
    privateMetadata: Hex
  ): Promise<PreparedCall>
  prepareClearSetup(action: Address): Promise<PreparedCall>
  prepareStartAttempt(request: AttemptRequest): Promise<PreparedCall>
  prepareCancelByProofs(request: CancelRequest): Promise<PreparedCall>
  prepareCancelByOwner(action: Address): Promise<PreparedCall>
  prepareCancelByVeto(
    account: Address,
    action: Address,
    attemptId: bigint,
    method: Address
  ): Promise<PreparedCall>
}

/**
 * The shared part for one action contract, bound to the account, what the
 * builder's `recoveryAction()` hands out. It reads and disarms and prepares no
 * spend.
 */
export interface IRecoveryActionInteractor {
  supportsAccount(): Promise<boolean>
  isAuthority(key: Address): Promise<boolean>
  isAuthorized(): Promise<boolean>
  holdsAnyPrivilege(candidate: Address): Promise<boolean>
  actionInfo(): Promise<ActionInfo>
  disarmingCall(): Promise<PreparedCall>
}

/**
 * The arming seam, handed to the setup client alone and never returned by the
 * builder.
 */
export interface IRecoveryActionArming {
  armingCall(): Promise<PreparedCall>
}
