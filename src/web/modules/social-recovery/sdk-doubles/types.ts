/**
 * The doubles' own types: the scripted chain record and its scripts, the thrown
 * values, the doubles' bytes, the method records, the client context and the
 * wallet's own reads.
 */
import type {
  Address,
  ApproverReply,
  ApproverRequest,
  AttemptRequest,
  BlockHeader,
  CancelledBy,
  CancelRequest,
  ClientConfiguration,
  Configuration,
  Credential,
  DeploymentDescriptor,
  DescribedCall,
  Domain,
  Finding,
  GatheringPurpose,
  Hex,
  IActionCodec,
  IEventManager,
  IPolicyManagerInteractor,
  IProvider,
  IRecoveryActionArming,
  IRecoveryActionInteractor,
  KitError,
  ModuleInfo,
  Notification,
  PaymentOrder,
  PrivacyLevel,
  ReadResult,
  RequestErrorCode,
  RequestWarningCode,
  RestoreCause,
  Sender,
  SerializedPaymentOrder,
  TrustedParties,
  ValidationResult,
  Verdict
} from '@web/modules/social-recovery/sdk-interfaces'
import type { P256Point } from '@web/modules/social-recovery/shared/webauthn'

import type { ATTEMPT_STATUSES, CANCELLERS, ScriptedChain } from './chain'
import type { APPROVAL_TYPES, CANCELLATION_TYPES } from './encoding'
import type {
  AadhaarMethodDouble,
  METHOD_KINDS_SHIPPED,
  PasskeyMethodDouble,
  WalletMethodDouble,
  ZkPassportMethodDouble
} from './methods'
import type {
  MODULE_READS,
  SCRIPTED_FINDINGS,
  SCRIPTED_READS,
  SCRIPTED_REFUSALS,
  SCRIPTED_SIMULATIONS
} from './scripts'
import type { REMOVED_KEY_UNAVAILABLE_CAUSES } from './wallet-reads'

// ---------------------------------------------------------------------------
// The scripted chain record
// ---------------------------------------------------------------------------

export type AttemptStatus = typeof ATTEMPT_STATUSES[number]

export type Canceller = typeof CANCELLERS[number]

/** One method module's declaration: what its three module views answer. */
export interface MethodDeclaration {
  moduleInfo: ModuleInfo
  paused: boolean
  trustedParties: TrustedParties
}

export interface NoSetup {
  status: 'none'
  /** The manager's setup nonce; it counts clears as well as commits. */
  setupNonce: bigint
  /** The block of the last setup write, a clear among them; 0 where none ever ran. */
  setupCommittedAtBlock: number
}

export interface CommittedSetup {
  status: 'committed'
  /** The privacy level the two metadata fields encode, read back from them. */
  level: PrivacyLevel
  setupNonce: bigint
  setupCommitment: Hex
  setupCommittedAtBlock: number
  setupBody: Hex
  publicMetadata: Hex
  privateMetadata: Hex
  /** The configuration the script committed, for tests; absent after a raw commit. */
  configuration?: Configuration
}

export type SetupScript = NoSetup | CommittedSetup

/** What the manager keeps of an attempt, beside the event fields it published. */
export interface AttemptRecord {
  attemptId: bigint
  setupNonce: bigint
  setupBody: Hex
  consumableAfter: number
  payload: Hex
  order: PaymentOrder
  usedPlaces: bigint[]
  usedMethods: Address[]
  ignoresPause: boolean
  startedAtBlock: number
}

export type AttemptScript =
  | { status: 'none' }
  | { status: 'waiting'; record: AttemptRecord }
  | {
      status: 'cancelled'
      record: AttemptRecord
      canceller: Canceller
      cancellerAddress: Address
      vetoingMethod: Address
      cancelledBy: CancelledBy
      endedAtBlock: number
    }
  | { status: 'executed'; record: AttemptRecord; endedAtBlock: number }

/** The raw fields a `commitSetup` call carries. */
export interface CommitFields {
  setupCommitment: Hex
  nonce: bigint
  publicMetadata: Hex
  privateMetadata: Hex
  setupBody?: Hex
  configuration?: Configuration
}

/** What landing a prepared call does to the record (see `land`). */
export type ChainEffect =
  | { kind: 'arm' }
  | { kind: 'disarm' }
  | ({ kind: 'commit' } & CommitFields)
  | { kind: 'clear' }
  | { kind: 'start'; request: AttemptRequest }
  | { kind: 'cancel-by-owner' }
  | { kind: 'cancel-by-proofs'; request: CancelRequest }
  | { kind: 'cancel-by-veto'; attemptId: bigint; method: Address }
  | { kind: 'execute'; attemptId: bigint; payload: Hex }

export interface ReadScript {
  mode: 'throw' | 'unanswered'
  module?: Address
  /** The value to throw in place of a `ScriptedReadFailure`. */
  error?: Error
}

/** What `failRead` takes: the one module it limits a module read to, and the value to throw. */
export type FailReadOptions = Omit<ReadScript, 'mode'>

/** What a new chain starts from; every field has a default. */
export interface ChainSeed {
  descriptor?: Partial<DeploymentDescriptor>
  account?: Address
  head?: { number: number; timestamp: number }
  authorities?: Address[]
  otherPrivileged?: Address[]
  authorized?: boolean
  hasCode?: boolean
  supportsAccount?: boolean
}

/** The manager's own views: its name, version, interface answer and EIP-712 domain. */
export interface ManagerViews {
  name: string
  version: string
  supportsInterface: boolean
  domain: Domain
}

/** What `IProvider.call` answers for one scripted call: a result or a revert. */
export type ScriptedCallAnswer = { result: Hex } | { revert: Hex }

/** A notification as the chain emits it, before its log position is known. */
export type NotificationFields = Notification extends infer N
  ? N extends Notification
    ? Omit<N, 'at'>
    : never
  : never

/** How `commitSetup` commits: the privacy level, the configuration and its password. */
export interface CommitSetupOptions {
  level: PrivacyLevel
  configuration: Configuration
  password?: string
}

/** How `openAttempt` opens an attempt; every field has a default. */
export interface OpenAttemptOptions {
  ready?: boolean
  wait?: number
  attemptId?: bigint
  setupNonce?: bigint
  setupBody?: Hex
  payload?: Hex
  order?: PaymentOrder
  usedPlaces?: bigint[]
  usedMethods?: Address[]
  ignoresPause?: boolean
}

/** Who `cancelAttempt` names: the vetoing method, the caller and the places the proofs used. */
export interface CancelAttemptOptions {
  vetoingMethod?: Address
  caller?: Address
  usedPlaces?: bigint[]
}

// ---------------------------------------------------------------------------
// Scripts and thrown values
// ---------------------------------------------------------------------------

export type ScriptedRead = typeof SCRIPTED_READS[number]

export type ModuleRead = typeof MODULE_READS[number]

export type ScriptedRefusalMember = typeof SCRIPTED_REFUSALS[number]

export type ScriptedSimulation = typeof SCRIPTED_SIMULATIONS[number]

export type ScriptedFindings = typeof SCRIPTED_FINDINGS[number]

/**
 * A scripted refusal: validation (thrown with findings), restore (thrown with
 * the cause, `getSetup` and the two inits only) or an ordinary error carrying a
 * code.
 */
export type ThrownRefusal =
  | { kind: 'validation'; findings: ValidationResult }
  | { kind: 'restore'; cause: RestoreCause }
  | { kind: 'error'; code?: string; message?: string }

/**
 * An ordinary error carrying a code and its values, what every refusal of the
 * doubles that is not a validation or a restore refusal throws. The interfaces
 * declare no such shape, so it is the doubles' own. The code is a finding or
 * refusal slug, a kit error name, or a code of the doubles' own (such as
 * `action.no-codec`, `builder.frozen` or `scripted.refused`), which the real
 * SDK may not share. The message is for a developer and never for a screen.
 */
export interface CodedError extends Error {
  code: string
  values: Record<string, unknown>
}

/** The module and the place a read was made for, where it was made per place. */
export interface ReadFailureWhere {
  module?: Address
  place?: number
}

/** The values a `ScriptedReadFailure` carries: the read, and where it was made. */
export interface ReadFailureValues extends ReadFailureWhere {
  read: ScriptedRead
}

/**
 * What `ScriptedChain.land` throws when the chain would revert the call: the
 * kit error the revert decodes to, nothing applied (a batch lands whole or not
 * at all).
 */
export interface LandingRevert extends CodedError {
  error: KitError
}

/** The value a scripted revert rejects with: an error carrying the raw revert data. */
export interface RevertedCall extends Error {
  data: Hex
}

// ---------------------------------------------------------------------------
// The doubles' bytes
// ---------------------------------------------------------------------------

/** One credential with its place and the salt that fills it. */
export interface PlacedCredential {
  place: number
  clause: number
  credential: Credential
  salt: Hex
}

/** The doubles' setup body: what the real body carries, as JSON bytes. */
export interface DoubleSetupBody {
  wait: bigint
  ignoresPause: boolean
  clauses: { threshold: number; credentials: Hex[] }[]
}

export type BackupReading =
  | { form: 'empty' }
  | { form: 'clear'; configuration: Configuration }
  | { form: 'encrypted'; opened: true; configuration: Configuration }
  | { form: 'encrypted'; opened: false }
  | { form: 'unreadable' }

/** The shape the shape-visible level publishes: thresholds and methods, no config values. */
export interface PublicShape {
  wait: bigint
  ignoresPause: boolean
  clauses: { threshold: number; methods: Address[] }[]
}

export type PublicNoteReading =
  | { kind: 'none' }
  | { kind: 'shape'; shape: PublicShape }
  | { kind: 'clear'; configuration: Configuration }
  | { kind: 'opaque'; bytes: Hex }

/**
 * The members a place's digest closes over, every number as a decimal string:
 * the domain, the purpose, and the members of the
 * `Approval` or `Cancellation` type. The credential (method, config, salt) is not
 * among them; the place binds it through the body's credential hash.
 */
export interface DigestMembers {
  chainId: string
  manager: Address
  digestVersion: string
  purpose: GatheringPurpose
  account: Address
  action: Address
  attemptId: string
  setupNonce: string
  setupBodyHash: Hex
  payload?: Hex
  order?: SerializedPaymentOrder
  validUntil: string
  place: number
}

/** The domain facts a submitted request's digest derives under. */
export interface SubmissionDomain {
  chainId: number | bigint
  manager: Address
  digestVersion: string
}

/** The typed data a wallet signs for one place: `{ domain, types, primaryType, message }`. */
export interface PlaceTypedData {
  domain: { name: 'PolicyManager'; version: string; chainId: number; verifyingContract: Address }
  types: typeof APPROVAL_TYPES | typeof CANCELLATION_TYPES
  primaryType: 'Approval' | 'Cancellation'
  message: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// What the chain itself would decide
// ---------------------------------------------------------------------------

export interface RuleEvaluation {
  satisfied: boolean
  clauses: { clause: number; threshold: number; filled: number; places: number[] }[]
  /** The first clause whose filled places miss its threshold, where one does. */
  failingClause?: number
}

// ---------------------------------------------------------------------------
// The method doubles and their records
// ---------------------------------------------------------------------------

export type MethodKind = typeof METHOD_KINDS_SHIPPED[number]

export type AnyMethodDouble =
  | WalletMethodDouble
  | PasskeyMethodDouble
  | ZkPassportMethodDouble
  | AadhaarMethodDouble

/** The proof fields of every method double: the proof is opaque bytes. */
export interface ProofFields {
  proof: Hex
}

export interface WalletConfigFields {
  address: Address
}

/** The credential's P-256 point beside the hash of the relying party id it was enrolled under. */
export interface PasskeyConfigFields extends P256Point {
  rpIdHash: Hex
}

/** The assertion as the authenticator produced it, with `s` in the low half. */
export interface PasskeyProofFields {
  authenticatorData: Hex
  clientDataJSON: Hex
  r: Hex
  s: Hex
}

export interface ZkPassportConfigFields {
  uniqueIdentifier: Hex
}

export interface AadhaarConfigFields {
  nullifier: Hex
}

/** The wallet's enroll params, and its enroll input, which is the params themselves. */
export interface WalletEnrollParams {
  address?: string
}

/** What the guardian's wallet hands back. */
export interface WalletReplyMaterial {
  signature?: unknown
}

export interface PasskeyEnrollParams {
  relyingPartyId?: string
  userName?: string
}

/** The part of the passkey's creation options its enroll reads back. */
export interface PasskeyEnrollInput {
  rp?: { id?: string }
}

/** The members of the browser's attestation response the passkey's enroll reads. */
export interface PasskeyAttestationResponse {
  getPublicKey?: unknown
  getPublicKeyAlgorithm?: unknown
  getAuthenticatorData?: unknown
  attestationObject?: unknown
}

/** What the authenticator hands back at enrollment: the browser's `PublicKeyCredential`. */
export interface PasskeyEnrollMaterial {
  credential?: { response?: PasskeyAttestationResponse }
}

export interface PasskeySigningParams {
  relyingPartyId?: string
  credentialId?: string
}

/** The members of the browser's assertion response the passkey's reply reads. */
export interface PasskeyAssertionResponse {
  authenticatorData?: unknown
  clientDataJSON?: unknown
  signature?: unknown
}

/** What the authenticator hands back for a request: the assertion, its signature in DER. */
export interface PasskeyReplyMaterial {
  assertion?: { response?: PasskeyAssertionResponse }
}

/** The key pair the passkey double's willing device signs with, its public point in hex. */
export interface PasskeyApproverKey {
  privateKey: CryptoKey
  x: Hex
  y: Hex
}

/** The assertion the passkey double's willing device returns. */
export interface PasskeySatisfyingMaterial {
  assertion: {
    response: { authenticatorData: Uint8Array; clientDataJSON: Uint8Array; signature: Uint8Array }
  }
}

/** The members of the client data the passkey's verify reads. */
export interface PasskeyClientData {
  type?: unknown
  challenge?: unknown
}

export interface ZkPassportParams {
  domain?: string
  scope?: string
  name?: string
  logo?: string
  purpose?: string
}

/** What the zkPassport app hands back at enrollment. */
export interface ZkPassportEnrollMaterial {
  result?: { uniqueIdentifier?: unknown }
}

/** What the zkPassport app hands back for a request. */
export interface ZkPassportReplyMaterial {
  proofs?: unknown
}

export interface AadhaarParams {
  nullifierSeed?: string | number
  issuerCertificate?: string
}

/** The Aadhaar prover's arguments: the enroll input and the signing input. */
export interface AadhaarInput {
  nullifierSeed: string
  issuerCertificate: string
  signal: string
}

/** What the page hands the Aadhaar prover. */
export interface AadhaarMaterial {
  qrData?: unknown
}

// ---------------------------------------------------------------------------
// The clients and the builder
// ---------------------------------------------------------------------------

/**
 * The parts both clients share. The action part travels as
 * `IRecoveryActionInteractor` alone: the arming seam goes to the setup client's
 * constructor beside this context and to nothing else.
 */
export interface ClientContext {
  chain: ScriptedChain
  provider: IProvider
  manager: IPolicyManagerInteractor
  action: IRecoveryActionInteractor
  /** The action address the client is bound to (the builder's `.action(address, …)`). */
  actionAddress: Address
  events: IEventManager
  config: ClientConfiguration
  codecs: IActionCodec<unknown>[]
}

export interface ComposeInput {
  name: string
  args: unknown
  target: Address
  sender: Sender
  block: BlockHeader
  effect?: ChainEffect
  describes?: DescribedCall[]
}

export interface MethodReads {
  method: Address
  moduleInfo: ReadResult<ModuleInfo>
  parties: ReadResult<TrustedParties>
  paused: ReadResult<boolean>
}

/** The last setup write one action saw: a commit or a clear, with its nonce. */
export interface LastSetupWrite {
  action: Address
  kind: 'setup-committed' | 'setup-cleared'
  nonce: bigint
}

export type RequestFinding = Finding<RequestErrorCode | RequestWarningCode>

export type RequestRow = [RequestErrorCode, Record<string, unknown>?]

/** How `complete` ranks one satisfying set: lower sorts first, field by field. */
export interface SetRank {
  /** 1 where any place of the set is on a stopped method. */
  stopped: number
  /** The distinct methods of the set that carry a stop. */
  stoppable: number
  /** The filing positions of the set's replies, ascending. */
  filed: number[]
}

export type SimulatedMember =
  | 'recovery.prepareStartAttempt'
  | 'recovery.prepareCancelByProofs'
  | 'recovery.prepareCancelByOwner'
  | 'recovery.prepareCancelByVeto'
  | 'recovery.prepareExecuteHandover'

/**
 * The thrown value of a construction check: an ordinary error carrying the code
 * `construction.<check>` and the check's name in `check` (`descriptor`,
 * `provider`, `account`, `chain-id`, `domain`, `domain-fields`,
 * `digest-version`, `unserved`). `unserved` is the doubles' own: a descriptor
 * or an action this scripted chain does not serve. The interfaces declare no
 * construction-refusal shape, so this one is the doubles' own.
 */
export interface ConstructionRefusal extends CodedError {
  check: string
}

export type ActionPart = IRecoveryActionInteractor & IRecoveryActionArming

/** The action a builder is bound to: its address and its part. */
export interface ActionBinding {
  address: Address
  implementation: ActionPart
}

// ---------------------------------------------------------------------------
// The wallet's own reads
// ---------------------------------------------------------------------------

export type RemovedKeyUnavailableCause = typeof REMOVED_KEY_UNAVAILABLE_CAUSES[number]

export type RemovedKeyReading =
  | { kind: 'named'; key: Address }
  | { kind: 'unavailable'; cause: RemovedKeyUnavailableCause }

/**
 * What the fit check read: against the code the account holds, against the
 * implementation it will deploy, or neither (no code and no implementation named).
 */
export type FitCheckReading =
  | { basis: 'deployed-code'; fits: boolean }
  | { basis: 'code-to-be'; implementation: Address; fits: boolean }
  | { basis: 'no-code'; fits: false }

/** The two configuration fields the wallet's reads take: the creation record and the implementation. */
export type WalletReadsConfiguration = Pick<
  ClientConfiguration,
  'creation' | 'accountImplementation'
>

/**
 * The extension-owned seam over the three reads no SDK member makes. The
 * `Double` suffix marks that the shape lives with the doubles; the real
 * implementation behind `shared/client` answers the same shape until the SDK
 * adopts or renames these reads.
 */
export interface IWalletReadsDouble {
  /** The module's own verdict over one pasted reply against the request it answers. */
  verifyReply(request: ApproverRequest, reply: ApproverReply): Promise<Verdict>
  /** The key a recovery of this account would remove, or why it cannot be named. */
  removedKey(): Promise<RemovedKeyReading>
  /** Whether the action fits the account, judged against the code it will carry. */
  fitCheck(accountImplementation?: Address): Promise<FitCheckReading>
}
