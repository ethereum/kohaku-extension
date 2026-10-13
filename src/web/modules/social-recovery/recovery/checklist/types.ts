import type { ReactNode } from 'react'

import type {
  Address,
  ApproverReply,
  ApproverRequest,
  Assessment,
  Attempt,
  Configuration,
  Gathering,
  GatheringPlace,
  Hex,
  Verdict
} from '@web/modules/social-recovery/sdk-interfaces'
import type {
  CeremonyOutcome,
  PasskeyFacts,
  ReportStore,
  ReportSubscribe,
  VisibilitySource
} from '@web/modules/social-recovery/shared/ceremony'
import type { RecoveryKitClient } from '@web/modules/social-recovery/shared/client'
import type { CollectionChip } from '@web/modules/social-recovery/shared/display'
import type {
  ChainId,
  DirectWipeEvent,
  LiveRecoverySession,
  RecoveryEntryRecord,
  RecoveryRoute,
  RowNote,
  SessionRevision,
  WalletRecords,
  WipedRecoverySession
} from '@web/modules/social-recovery/shared/records'
import type { MethodKind } from '@web/modules/social-recovery/setup/review'

export type Navigate = (to: string, options?: { replace?: boolean }) => void

// ---------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------

/** The checklist's search: the account being recovered, and a ceremony that returned. */
export interface ChecklistSearch {
  account: Address
  ceremony?: string
}

// ---------------------------------------------------------------------------
// The rows
// ---------------------------------------------------------------------------

/** One place of the gathering as the checklist draws it, with the clause it stands in. */
export interface ChecklistRow {
  place: number
  clause: number
  kind: MethodKind | undefined
  gatheringPlace: GatheringPlace
}

/**
 * One clause of more than one member: its header counts the filled members
 * against the threshold.
 */
export interface ChecklistGroup {
  clause: number
  /** The group's number among the path's groups, from one. */
  number: number
  threshold: number
  rows: ChecklistRow[]
}

/** The rows of a path: the required rows first, then each group. */
export interface ChecklistLayout {
  required: ChecklistRow[]
  groups: ChecklistGroup[]
}

/** The headline's count: a required row and a group each count as one unit. */
export interface ChecklistHeadline {
  done: number
  total: number
}

/** The unlock line's key by the path's shape. */
export type UnlockLineKey =
  | 'socialRecovery.checklist.continueUnlock'
  | 'socialRecovery.checklist.continueUnlockRequiredOnly'
  | 'socialRecovery.checklist.continueUnlockGroupsOnly'

/**
 * What the checklist knows of a row beyond the gathering: its note, and how
 * this tab answered it.
 */
export interface RowState {
  chip: CollectionChip
  replied: boolean
  note?: RowNote
}

/** What a row's state reads beyond the assessment and the notes. */
export interface RowStateExtras {
  /** The places the submission would carry, where the client named them; a filled place outside reads not needed. */
  chosen?: ReadonlySet<number>
  /** The places whose method did not answer this time. */
  didNotAnswer?: ReadonlySet<number>
}

/** Why the path cannot be satisfied yet, read from the rows' own states, in the order the checklist names them. */
export type UnsatisfiedReading =
  | { kind: 'didNotAnswer'; places: number[] }
  | { kind: 'groupCannotReach'; clauses: number[] }
  | { kind: 'guardianOpen' }
  | { kind: 'needsMore' }

// ---------------------------------------------------------------------------
// The client and the inputs
// ---------------------------------------------------------------------------

export type ChecklistKitClient = Pick<
  RecoveryKitClient,
  'recovery' | 'setup' | 'walletReads' | 'action'
>

export type ChecklistClient =
  | { status: 'loading' }
  | { status: 'ready'; client: ChecklistKitClient }
  | { status: 'update-the-wallet'; retry: () => void }
  | { status: 'failed'; retry: () => void }

/** The key the recovery installs: the receiving account's controlling key. */
export type DestinationReading =
  | { status: 'loading' }
  | { status: 'ready'; key: Address }
  | { status: 'unavailable'; retry: () => void }

/** The page's own helpers the checklist uses. */
export interface ChecklistDeps {
  reportStore: ReportStore
  reportSubscribe: ReportSubscribe
  newRequestId: () => string
  /** Milliseconds since epoch. */
  now: () => number
  timeZone: string
  /** The relying-party hash of this page's origin, the one a passkey here answers under. */
  rpIdHash: Hex
  /** Whether this page serves passkeys. */
  passkeysServed: boolean
  readPassword: (chainId: ChainId, account: Address) => string | undefined
  /** Drops the recovery password held in memory, so the readout asks it again. */
  forgetPassword: (chainId: ChainId, account: Address) => void
  /** The page's document, whose return to view polls the chain at once. */
  visibility?: VisibilitySource
  /** Every entry the records' storage holds, by key. */
  storedEntries: () => Promise<Record<string, unknown>>
}

export interface ChecklistBodyProps {
  records: WalletRecords
  account: Address
  entry: RecoveryEntryRecord
  search: ChecklistSearch
}

export interface ChecklistViewProps {
  records: WalletRecords
  chainId: ChainId
  account: Address
  entry: RecoveryEntryRecord
  client: ChecklistClient
  destination: DestinationReading
  search: ChecklistSearch
  navigate: Navigate
  deps: ChecklistDeps
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

/** A live session as the checklist holds it: the record, its revision and the path's clauses. */
export interface LiveChecklist {
  session: LiveRecoverySession
  revision: SessionRevision
  savedAt: number
  configuration: Configuration
}

/** The title and body keys of an alert. */
export interface AlertKeys {
  title: string
  body: string
}

/**
 * Why the checklist could not open: the records, the setup, the gathering or
 * the destination key.
 */
export type ChecklistFailure = 'records' | 'setup' | 'open' | 'destination'

export type ChecklistLoad =
  | { phase: 'loading' }
  | { phase: 'failed'; cause: ChecklistFailure }
  | {
      phase: 'wiped'
      session: WipedRecoverySession
      revision: SessionRevision
      /** Whether the gathering held a reply when this tab wiped it; unknown for a wipe read from storage. */
      hadReplies?: boolean
      /** The request this tab wiped; unknown for a wipe read from storage. */
      died?: DeadRequest
    }
  | ({ phase: 'live' } & LiveChecklist)
  /** Another tab changed the session after this one read it. */
  | { phase: 'conflict' }

/** The request a wipe ended, as its ceremony requests name it. */
export interface DeadRequest {
  attemptId: string
  setupNonce: string
}

/** What opening the checklist found or made. */
export type OpenResult =
  | {
      kind: 'live'
      session: LiveRecoverySession
      revision: SessionRevision
      savedAt: number
      /** The configuration the gathering was opened over, where it is not the one passed in. */
      configuration?: Configuration
    }
  | { kind: 'wiped'; session: WipedRecoverySession; revision: SessionRevision }
  | { kind: 'landed' }
  /** No session is stored and the destination key is not known yet. */
  | { kind: 'needs-destination' }
  /** The cached setup is stale and no recovery password is held to read it again. */
  | { kind: 'needs-password' }

/** Where the configuration came from: the decrypted cache, or the recovery password. */
export type ConfigurationSourceKind = 'cache' | 'password'

export interface OpenInput {
  records: WalletRecords
  chainId: ChainId
  account: Address
  client: ChecklistKitClient
  configuration: Configuration
  source: ConfigurationSourceKind
  /** The recovery password held in memory, which reads the setup again over a stale cache. */
  password: string | undefined
  destination: Address | undefined
}

export interface GatherAgainInput extends OpenInput {
  /** The revision of the wiped session the holder read. */
  revision: SessionRevision
}

export interface ConfigurationInput {
  records: WalletRecords
  chainId: ChainId
  account: Address
  client: ChecklistKitClient
  password: string | undefined
}

/**
 * Where the setup's configuration comes from: the decrypted cache, or the
 * password held in memory.
 */
export type ConfigurationReading =
  | { kind: 'configuration'; configuration: Configuration; source: ConfigurationSourceKind }
  | { kind: 'none' }

/** The configuration the checklist holds, with where it came from. */
export interface HeldConfiguration {
  configuration: Configuration
  source: ConfigurationSourceKind
}

/** What adding a reply came to. */
export type AddReplyResult =
  | { kind: 'added' }
  | { kind: 'refused'; cause: string }
  | { kind: 'conflict' }
  | { kind: 'write-failed' }

export interface ChecklistState {
  load: ChecklistLoad
  assessment: Assessment | null
  retry: () => void
  addReply: (reply: ApproverReply) => Promise<AddReplyResult>
  setNote: (place: number, note: RowNote | null) => Promise<void>
  noteFailed: boolean
  /** Wipes the live session; `onWiped` runs once the wipe lands, before the tab leaves. */
  abandon: (onWiped?: () => void) => Promise<void>
  abandonFailed: boolean
  gatherAgain: () => Promise<void>
  /** Gathering again did not open; the wiped reason stays on screen. */
  gatherFailed: boolean
  /** Clears the wiped line, the decrypted setup and the password held, and sends the holder to the readout. */
  readSetupAgain: () => Promise<void>
  /** The last poll of the account's recovery state. */
  poll: PollState
  retryPoll: () => void
  /** A death the poll read could not be wiped; the next poll tries again. */
  deathFailed: boolean
  /** A death or a landing the poll read is being written; nothing goes on meanwhile. */
  dying: boolean
  busy: boolean
}

export interface ChecklistHookInput {
  records: WalletRecords
  chainId: ChainId
  account: Address
  entry: RecoveryEntryRecord
  client: ChecklistClient
  destination: DestinationReading
  navigate: Navigate
  deps: Pick<ChecklistDeps, 'now' | 'readPassword' | 'forgetPassword' | 'visibility'>
}

// ---------------------------------------------------------------------------
// The poll
// ---------------------------------------------------------------------------

/** One poll's reading of the account: the attempt, the counters and whether the account authorizes the action. */
export interface PollFacts {
  attempt: Attempt
  nextAttemptId: bigint
  setupNonce: bigint
  authorized: boolean
}

/**
 * The poll as the checklist reads it: nothing returned yet since the session
 * opened, the last round answered with the clock read before it, or the last
 * round failed or ran past its limit.
 */
export type PollState =
  | { status: 'pending' }
  | { status: 'answered'; facts: PollFacts; clock: number }
  | { status: 'failed' }

/** What a poll reads for a live request: one of its deaths, or its own submission landed. */
export type PollOutcome = DirectWipeEvent | 'landed'

/** Which session the poll reads for: the request of a live session, or a session another attempt voided. */
export type PollTarget =
  | { kind: 'live'; key: string; gathering: Gathering }
  | { kind: 'void'; key: string }

export interface PollInput {
  kit: ChecklistKitClient | null
  target: PollTarget | null
  deps: Pick<ChecklistDeps, 'now' | 'visibility'>
  /**
   * Runs after each round, with what it read (undefined where the read failed)
   * and the clock read before its read.
   */
  after: (facts: PollFacts | undefined, clock: number) => void
}

export interface PollHook {
  poll: PollState
  retry: () => void
}

// ---------------------------------------------------------------------------
// The passkey claim
// ---------------------------------------------------------------------------

/** What a stored claim request asked for, read back when its ceremony returns. */
export interface ClaimAsked {
  place: number
  request: ApproverRequest
  handOff: boolean
}

export interface ClaimRequestInput {
  account: Address
  chainId: ChainId
  request: ApproverRequest
  handOff: boolean
}

/** The account and chain a claim request must name to be this checklist's. */
export interface ClaimTarget {
  account: Address
  chainId: ChainId
}

/** A passed claim's reply, with where the authenticator sat where the report says. */
export interface PassedClaim {
  reply: ApproverReply
  facts?: Pick<PasskeyFacts, 'place'>
}

/** A passed claim waiting for the live session to take it. */
export interface ClaimReply extends PassedClaim {
  place: number
  /** The ceremony request's id, kept until the reply is added. */
  id: string
}

/** How this tab saw a place answered: from the phone or on this device, and when. */
export interface AnsweredMemory {
  phone: boolean
  at: number
}

/** One place's last ceremony outcome, with the route the holder chose for it. */
export interface ClaimOutcome {
  outcome: CeremonyOutcome<unknown>
  handOff: boolean
}

export interface PasskeyClaimInput {
  records: WalletRecords
  chainId: ChainId
  account: Address
  search: ChecklistSearch
  navigate: Navigate
  deps: Pick<
    ChecklistDeps,
    'reportStore' | 'reportSubscribe' | 'newRequestId' | 'now' | 'storedEntries'
  >
}

export interface PasskeyClaim {
  /** Stores the claim's request and opens the ceremony tab. */
  launch: (request: ApproverRequest, handOff: boolean) => Promise<void>
  /** The last outcome each place's ceremony reported, a passed one included. */
  outcomes: Partial<Record<number, ClaimOutcome>>
  /** A passed claim the checklist has not added yet. */
  pending: ClaimReply | null
  /**
   * The checklist took the pending reply: the request record and the
   * ceremony id go, and a refusal reads as the place's note.
   */
  settle: (place: number, refusal?: CeremonyOutcome<unknown>) => void
  /**
   * The session was abandoned: the pending or undelivered claim's request and
   * report go.
   */
  forgetPending: () => void
  /**
   * The session was wiped: the request and the report of every claim this
   * checklist knows of go, and every stored claim request of this account
   * for the request that died, or for any request where that is unknown.
   */
  forgetAll: (died?: DeadRequest) => void
  /** The places this tab asked: a claim launched, pending or undelivered. */
  asked: ReadonlySet<number>
  /** The place whose report never came back, with its retry. */
  undelivered: ClaimAsked | null
  retryUndelivered: () => Promise<void>
  launchFailed: boolean
  busy: boolean
}

// ---------------------------------------------------------------------------
// The rows' components
// ---------------------------------------------------------------------------

export interface RowFrameProps {
  row: ChecklistRow
  state: RowState
  /** The method's kind name. */
  title: string
  label?: string
  children?: ReactNode
}

export interface PasskeyRowProps {
  row: ChecklistRow
  state: RowState
  request: ApproverRequest | undefined
  outcome: ClaimOutcome | undefined
  answered: AnsweredMemory | undefined
  rpIdHash: Hex
  served: boolean
  busy: boolean
  timeZone: string
  route: RecoveryRoute
  launch: (request: ApproverRequest, handOff: boolean) => void
}

export interface GuardianRowProps {
  row: ChecklistRow
  state: RowState
  request: ApproverRequest | undefined
  support: GuardianSupport
  busy: boolean
  setNote: (place: number, note: RowNote | null) => void
  addReply: (reply: ApproverReply) => Promise<AddReplyResult>
}

/** The guardian row's carriers, its message and its paste field mount here. */
export interface GuardianCarriersProps {
  place: number
  request: ApproverRequest | undefined
  replied: boolean
  /** The row still takes an approval: not complete and not outside the smallest set. */
  open: boolean
  busy: boolean
  addReply: AddReply
  support: GuardianSupport
}

// ---------------------------------------------------------------------------
// The guardian rows' link, values and paste check
// ---------------------------------------------------------------------------

export type AddReply = (reply: ApproverReply) => Promise<AddReplyResult>

/** The key the recovery removes, as the checklist read it for the guardian rows. */
export type RemovedKeyRead =
  | { status: 'loading' }
  | { status: 'named'; key: Address }
  | { status: 'unavailable' }
  | { status: 'failed' }

/** A removed-key reading with the kit and the read attempt that produced it. */
export interface RemovedKeyStored {
  kit: ChecklistKitClient | null
  attempt: number
  reading: RemovedKeyRead
}

export type GuardianValueName = 'account' | 'newKey' | 'keyBeingRemoved' | 'payment'

/** One value of a guardian row's block: its label, and the value once it rendered. */
export interface GuardianValueLine {
  name: GuardianValueName
  label: string
  value: string | null
}

/** The four values a guardian compares, and whether all four rendered. */
export interface GuardianValueBlock {
  lines: GuardianValueLine[]
  ready: boolean
}

/** The error line a paste renders, one per written error. */
export type PasteError =
  | { kind: 'notAnApproval' }
  | { kind: 'duplicate' }
  | { kind: 'expired'; one: boolean }
  | { kind: 'noMatch' }
  | { kind: 'checkFailed' }
  | { kind: 'writeFailed' }
  /** Another tab changed the session; the checklist renders the reload. */
  | { kind: 'conflict' }

/** The pure steps' answer: a written error, or the reply to verify against its own place's request. */
export type PasteJudgement =
  | { kind: 'refused'; error: PasteError }
  | { kind: 'verify'; reply: ApproverReply; request: ApproverRequest | undefined }

/** What a paste came to: the reply added to its place, or one written error. */
export type PasteOutcome = { kind: 'added'; place: number } | { kind: 'error'; error: PasteError }

/** What the verify of one reply came to: passed on to the add, rejected, or a check that failed. */
export type VerifyStep = 'pass' | 'rejected' | 'failed'

export type VerifyReply = (request: ApproverRequest, reply: ApproverReply) => Promise<Verdict>

export interface PasteJudgeInput {
  text: string
  gathering: Gathering
  requests: ReadonlyMap<number, ApproverRequest>
  /** The clock read before any await, in seconds. */
  nowSeconds: number
  /** One approval is the whole request: a one-row path or a group of threshold one. */
  oneApproval: boolean
  /** Whether the client refuses the reply's kind or version. */
  versionRefused: (reply: ApproverReply) => boolean
}

export interface PasteInput extends Omit<PasteJudgeInput, 'nowSeconds'> {
  /** Milliseconds since epoch. */
  now: () => number
  verifyReply: VerifyReply
  addReply: AddReply
}

export type Paste = (text: string, addReply: AddReply) => Promise<PasteOutcome>

/** What every guardian row of the checklist shares: the values read once, and what a paste checks against. */
export interface GuardianSupport {
  /** The page the link opens on: the extension's own full-tab page. */
  tabUrl: string
  newKey: Address | undefined
  removed: RemovedKeyRead
  retryRemoved: () => void
  timeZone: string
  /** When this tab added each place's approval, ms since epoch. */
  addedAt: Partial<Record<number, number>>
  /** Null while the session is not live. */
  paste: Paste | null
}

export interface GuardianSupportInput {
  kit: ChecklistKitClient | null
  gathering: Gathering | null
  requests: ReadonlyMap<number, ApproverRequest>
  layout: ChecklistLayout | null
  destination: DestinationReading
  now: () => number
  timeZone: string
}

/** The copy result a carrier shows under the buttons. */
export interface CopyFeedback {
  what: 'link' | 'message'
  copied: boolean
}

export interface GuardianValuesProps {
  place: number
  request: ApproverRequest
  block: GuardianValueBlock
  removed: RemovedKeyRead
  retryRemoved: () => void
}

export interface PasteFieldProps {
  place: number
  busy: boolean
  paste: Paste | null
  addReply: AddReply
}

export interface IdentityRowProps {
  row: ChecklistRow
  state: RowState
}

export interface ChecklistRowsProps {
  layout: ChecklistLayout
  assessment: Assessment
  renderRow: (row: ChecklistRow) => ReactNode
}

export interface AbandonBlockProps {
  busy: boolean
  failed: boolean
  onAbandon: () => void
}

/** Whether the account's one attempt slot is held, as the last poll read it on a voided session. */
export type SlotReading = 'unread' | 'held' | 'free' | 'failed'

export interface WipedBlockProps {
  session: WipedRecoverySession
  timeZone: string
  busy: boolean
  failed: boolean
  onGatherAgain: () => void
  /** Whether the gathering held a reply; unknown reads as the regather line. */
  hadReplies?: boolean
  slot: SlotReading
  onRetryPoll: () => void
  onReadSetupAgain: () => void
}

export interface DeadlineBlockProps {
  gathering: Gathering
  layout: ChecklistLayout
  now: () => number
  timeZone: string
  /** Runs once the page's clock passes the deadline. */
  onPassed: () => void
}

export interface UnsatisfiedBlockProps {
  reading: UnsatisfiedReading
}

export interface PollAlertProps {
  /** Whether rows sit under the alert, so it says they may be out of date. */
  withRows: boolean
  onRetry: () => void
}

// ---------------------------------------------------------------------------
// The recovery in progress and the home band
// ---------------------------------------------------------------------------

/**
 * One live session of the chain with its entry, as the in-progress screen and
 * the home band list it.
 */
export interface InProgressItem {
  account: Address
  session: LiveRecoverySession
  revision: SessionRevision
  entry: RecoveryEntryRecord | null
  /** When the request was made, ms since epoch. */
  startedAt: number
}

export type InProgressLoad =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; items: InProgressItem[] }

/** The headline of one listed session, null where it cannot be read; a hook. */
export type SessionHeadlineHook = (item: InProgressItem) => ChecklistHeadline | null

export interface InProgressViewProps {
  records: WalletRecords
  chainId: ChainId
  navigate: Navigate
  timeZone: string
  /** Whether this device holds the unlocked recovery path of the account. */
  holdsPath: (account: Address) => Promise<boolean>
  useHeadline: SessionHeadlineHook
  /** The route whose chrome the listed recoveries take, once the list is read. */
  onRoute?: (route: RecoveryRoute) => void
}

export interface InProgressRowProps {
  item: InProgressItem
  holds: boolean | undefined
  useHeadline: SessionHeadlineHook
  timeZone: string
  busy: boolean
  onContinue: (item: InProgressItem, holds: boolean) => void
  onAbandon: (item: InProgressItem) => void
}

export interface HomeRecoveryLineProps {
  item: InProgressItem
  timeZone: string
  useHeadline: SessionHeadlineHook
  onOpen: () => void
}

export interface HomeRecoveryBandViewProps {
  records: WalletRecords
  chainId: ChainId
  navigate: Navigate
  timeZone: string
  useHeadline: SessionHeadlineHook
}
