import type {
  Address,
  ApproverRequest,
  DeploymentDescriptor,
  Hex,
  IMethodsOrchestrator,
  RequestDescription,
  Verdict
} from '@kohaku-eth/social-recovery'
import type { PollFacts } from '@web/modules/social-recovery/recovery/checklist'
import type { Action } from '@web/extension-services/background/actions'
import type {
  KeyHandle,
  ListedAccount,
  RecoveryKitClient,
  SignOptions,
  TypedDataToSign
} from '@web/modules/social-recovery/shared/client'

/** The parts of the build's deployment a request's domain is compared with. */
export type DomainOfBuild = Pick<DeploymentDescriptor, 'chainId' | 'manager' | 'digestVersion'>

/** The request the link carries and what the methods orchestrator described of it. */
export interface DescribedRequest {
  request: ApproverRequest
  description: RequestDescription
}

/**
 * The part of the recovery client the page reads the chain through: the
 * wallet reads' attempt state, which makes no removed-key read, and the
 * action's authorization.
 */
export type ApprovalKitClient = Pick<RecoveryKitClient, 'walletReads' | 'action'>

/** One of the four values the lead shows: its label, and its text or null where it cannot be read. */
export interface ApprovalValueLine {
  name: 'accountBeingRecovered' | 'newKey' | 'keyBeingRemoved' | 'payment'
  label: string
  value: string | null
}

/** The lead's four values, and whether every one of them rendered. */
export interface ApprovalValues {
  lines: ApprovalValueLine[]
  rendered: boolean
}

/** The deadline as the details show it, or null where the request's deadline is no time. */
export interface DeadlineView {
  line: string
  passed: boolean
}

/**
 * The chain reads as the page holds them: nothing answered yet since the
 * client was built, the last round's answer, or a round that failed or ran
 * past its limit.
 */
export type ApprovalReads =
  | { status: 'pending' }
  | { status: 'answered'; facts: PollFacts }
  | { status: 'failed' }

/**
 * The client the page reads through, as the screen hands it to the view:
 * refused where the manager publishes a digest version this build does not
 * sign, which no retry changes.
 */
export type ApprovalClient =
  | { status: 'loading' }
  | { status: 'ready'; client: ApprovalKitClient }
  | { status: 'refused' }
  | { status: 'failed'; retry: () => void }

/** Why a request cannot be used any more: used where its own recovery ended, cancelled or executed. */
export type ApprovalDeath = 'expired' | 'void' | 'setup-changed' | 'used'

/**
 * What the page reads of the request in the place of the sign action:
 * - other-deployment: the request's domain is not this build's;
 * - reading: the client or the reads have not answered yet;
 * - failed: the client or a read failed;
 * - waiting: the recoverer submitted this request and its waiting period runs;
 * - dead: the request cannot be used any more;
 * - live: nothing stops a signature, the account authorizes the action or not.
 */
export type ApprovalReading =
  | { kind: 'other-deployment' }
  | { kind: 'reading' }
  | { kind: 'failed' }
  | { kind: 'waiting'; endsAt: number; authorized: boolean }
  | { kind: 'dead'; death: ApprovalDeath }
  | { kind: 'live'; authorized: boolean }

/** What enables the sign action. */
export interface SignGates {
  values: ApprovalValues
  deadline: DeadlineView | null
  reading: ApprovalReading
  acknowledged: boolean
}

export interface ApprovalReadsInput {
  client: ApprovalKitClient | null
  /** The link of the request the page shows: another link starts its own round. */
  link: string
  /** False once nothing is read any more, as after a decline. */
  enabled: boolean
  /** True once the last answer is final, as a death: it stays drawn and no round runs after it. */
  stopped: boolean
}

/** The reads with the link of the request they belong to. */
export interface LinkedApprovalReads {
  link: string
  reads: ApprovalReads
}

export interface ApprovalReadsHook {
  reads: ApprovalReads
  retry: () => void
}

export interface ApproveViewProps {
  described: DescribedRequest
  /** Any reading but another deployment. */
  reading: ApprovalReading
  networkName: string
  /** Milliseconds since epoch, the page's clock as it last ticked. */
  now: number
  timeZone: string
  keyReading: KeyReading
  signing: GuardianSigning
  /** The typed data the request asks to sign, or null where the approving side refuses it. */
  typedData: TypedDataToSign | null
  onSign: () => void
  onClose: () => void
  onDecline: () => void
  onRetry: () => void
}

export interface LeadBlockProps {
  values: ApprovalValues
}

export interface DetailsBlockProps {
  described: DescribedRequest
  networkName: string
}

export interface StageLineProps {
  /** The approval's step the page stands at: the call, the signature, the approval sent back. */
  step: number
}

export interface ApprovingAsideProps {
  /** Whether the card on what the wallet's prompt shows is drawn, beside a request that can be signed. */
  walletNotes: boolean
}

export interface SignBlockProps {
  acknowledged: boolean
  onAcknowledged: (value: boolean) => void
  enabled: boolean
  values: ApprovalValues
  deadline: DeadlineView | null
  keyReading: KeyReading
  busy: boolean
  failure: SigningFailure | null
  onSign: () => void
  onOpenOffline: () => void
  onDecline: () => void
}

export interface AcknowledgmentBoxProps {
  acknowledged: boolean
  onAcknowledged: (value: boolean) => void
}

export interface ValueLinesProps {
  values: ApprovalValues
  /** The prefix of each value's test id. */
  testID: string
}

/** The four values with the deadline beside them and who can submit the request until then. */
export interface ValueBlockProps {
  values: ApprovalValues
  deadline: DeadlineView | null
  testID: string
}

export interface OfflineBlockProps {
  described: DescribedRequest
  values: ApprovalValues
  deadline: DeadlineView | null
  typedData: TypedDataToSign | null
  acknowledged: boolean
  onAcknowledged: (value: boolean) => void
  /** Whether every gate of the sign action other than the held key holds. */
  enabled: boolean
  busy: boolean
  failure: OfflineFailure | null
  onAdd: (text: string) => void
  onBack: () => void
  onDecline: () => void
}

export interface SignedBlockProps {
  approval: SignedApproval
  account: Address
}

/**
 * The states drawn while no answered reading stands: reading and failed in
 * place of the sign action, another deployment in place of the whole page.
 */
export interface StatusBlockProps {
  reading: ApprovalReading
  onRetry: () => void
}

/** The states drawn in place of the sign action: waiting and the deaths. */
export interface OutcomeBlockProps {
  reading: ApprovalReading
  /** Milliseconds since epoch, the page's clock as it last ticked. */
  now: number
  timeZone: string
  onClose: () => void
}

export interface DeclinedBlockProps {
  account: Address
  /** The new key in full, or null where the request's handover cannot be read. */
  newKey: string | null
  onClose: () => void
}

/** Whether a copy reached the clipboard. */
export interface CopyFeedback {
  what: string
  copied: boolean
}

export interface CopyHook {
  feedback: CopyFeedback | null
  copy: (what: string, text: string) => void
}

export interface CopyFeedbackLineProps {
  feedback: CopyFeedback | null
  /** The prefix of the line's test id. */
  testID: string
}

/**
 * The key the request names, as this wallet holds it:
 * - held: the keystore holds it and is unlocked, so the sign action can ask for it;
 * - locked: the keystore is locked, so the sign action goes to the unlock first;
 * - missing: the keystore does not hold it, or there is no keystore at all;
 * - unreadable: the request's credential names no key this page reads.
 */
export type KeyReading =
  | { kind: 'held'; key: KeyHandle }
  | { kind: 'locked'; address: Address }
  | { kind: 'missing'; address: Address }
  | { kind: 'unreadable' }

/** The keystore's state the key reading reads. */
export interface KeystoreFacts {
  keys: readonly { addr: string; type: KeyHandle['type'] }[] | undefined
  isUnlocked: boolean
  hasPasswordSecret: boolean
}

/** Why the wallet's own signature brought no approval. */
export type SigningFailure = 'refused' | 'failed' | 'wrongKey'

/** Why a pasted signature brought no approval. */
export type OfflineFailure = 'notASignature' | 'wrongSigner'

/** The approval the guardian sends back: the one line, and the proof it carries. */
export interface SignedApproval {
  line: string
  proof: Hex
}

/**
 * What the approving side made of a signature: the approval with its verdict
 * for the request's place, or a signature it could not package into a reply.
 */
export type ApprovalOutcome = { approval: SignedApproval; verdict: Verdict } | 'unpackaged'

/** The approving side's three calls the page signs through. */
export type ApprovingCalls = Pick<IMethodsOrchestrator, 'signingInput' | 'replyFrom' | 'verify'>

/** The wallet's own action that selects a listed account. */
export type SelectAccountAction = Extract<Action, { type: 'MAIN_CONTROLLER_SELECT_ACCOUNT' }>

/** The wallet's edges the account selection reads: its dispatch and the accounts it lists. */
export interface KeyAccountSelectionInput {
  dispatch: (action: SelectAccountAction) => void
  accounts: () => readonly ListedAccount[] | undefined
}

/**
 * Selects the key's listed basic account in the wallet, and settles once the
 * wallet reports it selected. It rejects where the selection does not land in
 * time or the signal aborts first.
 */
export type SelectKeyAccount = (key: KeyHandle, signal?: AbortSignal) => Promise<void>

export interface GuardianSigningInput {
  approving: ApprovingCalls | null
  request: ApproverRequest | null
  signTypedData: (key: KeyHandle, typedData: TypedDataToSign, options?: SignOptions) => Promise<Hex>
  /**
   * Whether the request no longer takes an approval as the page reads it at
   * the call: its deadline passed on the page's clock, or a read found it
   * dead or submitted.
   */
  ended: () => boolean
}

/** The signing's state, kept for the one request it belongs to. */
export interface SigningState {
  request: ApproverRequest | null
  busy: boolean
  failure: SigningFailure | null
  offlineFailure: OfflineFailure | null
  approval: SignedApproval | null
}

export interface GuardianSigning {
  busy: boolean
  failure: SigningFailure | null
  offlineFailure: OfflineFailure | null
  approval: SignedApproval | null
  /** Signs the typed data with the held key in the wallet's own sign window. */
  sign: (key: KeyHandle, typedData: TypedDataToSign) => void
  /** Turns a signature made off this device into the approval. */
  addSignature: (typedData: TypedDataToSign, text: string) => void
  /**
   * Withdraws the signing of the request shown: its sign request leaves the
   * queue, a later answer is dropped, and the request signs no more.
   */
  withdraw: () => void
}
