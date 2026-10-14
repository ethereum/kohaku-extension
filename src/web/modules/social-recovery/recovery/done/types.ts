import type { Account } from '@ambire-common/interfaces/account'
import type {
  Address,
  Configuration,
  Credential,
  Hex,
  Notification
} from '@web/modules/social-recovery/sdk-interfaces'
import type { RecoveryKitClient } from '@web/modules/social-recovery/shared/client'
import type {
  RecoveryEntryRecord,
  RecoveryRoute,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'
import type { SlotKind } from '@web/modules/social-recovery/shared/records/types'
import type { LandedAttempt, StartedNotice } from '@web/modules/social-recovery/recovery/wait'

// ---------------------------------------------------------------------------
// The consume event
// ---------------------------------------------------------------------------

export type DoneKitClient = Pick<RecoveryKitClient, 'recovery' | 'descriptor' | 'account'>

export type ConsumedNotice = Extract<Notification, { kind: 'attempt-consumed' }>
export type PrivilegeNotice = Extract<Notification, { kind: 'privilege-changed' }>

/** The time of a block by its number, in seconds since epoch. */
export type BlockTimeRead = (blockNumber: number) => Promise<number>

/**
 * The recovery as the manager's consume event and the account's privilege
 * events of the same transaction report it: the key the account granted, the
 * key it removed, when, and what the attempt used.
 */
export interface ConsumeEvent {
  consumed: ConsumedNotice
  /** The opening of the consumed attempt, where the events still name it. */
  started?: StartedNotice
  /** The key the consume's transaction granted a privilege to. */
  granted: Address
  /** The key the consume's transaction set to no privilege. */
  removed: Address
  /** The removed key's latest earlier grant, where a privilege event names one. */
  removedPrivilege?: Hex
  /** The methods the consumed attempt's record names as used. */
  usedMethods: Address[]
  /** The consume's block time, in seconds since epoch. */
  time: number
}

/**
 * What the consume is matched against: the attempt the countdown's record
 * landed on this device, or the ended countdown, where the last act ran.
 */
export type ConsumeMatch = { kind: 'landed'; landed: LandedAttempt } | { kind: 'ended' }

/** What one read of the events found: no consume of the account, or its consume. */
export type ConsumeReading = { kind: 'none' } | { kind: 'found'; event: ConsumeEvent }

export type DoneRead =
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'answered'; reading: ConsumeReading }

export interface DoneReadInput {
  kit: DoneKitClient | null
  /** Null until the countdown's record is read. */
  match: ConsumeMatch | null
  blockTime: BlockTimeRead | null
}

export interface DoneReadHook {
  read: DoneRead
  retry: () => void
}

// ---------------------------------------------------------------------------
// What the recovery did
// ---------------------------------------------------------------------------

/** One credential of the path at its place, the flat position across the clauses. */
export interface PathRow {
  place: number
  clause: number
  credential: Credential
  kind: SlotKind | undefined
}

/**
 * Removing the old passkey row leaves the path with none (the editor refuses
 * it, so a method comes first), with one row (that row becomes the whole
 * rule), or with more (nothing to add).
 */
export type RemovalExit =
  | { kind: 'addFirst' }
  | { kind: 'leavesWholeRule'; remaining: PathRow }
  | { kind: 'none' }

/** The repair of one passkey row at its place, with what removing that row leaves. */
export interface CleanupBlock {
  place: number
  exit: RemovalExit
}

export interface RecoverySummary {
  /** The path's rows, empty where this device holds no path. */
  rows: PathRow[]
  /** The rows the accepted set used, or the used methods' kinds where the path is not on this device. */
  used: PathRow[]
  usedKinds: SlotKind[]
  /** The path holds an address row, so every guardian of it is now discoverable. */
  discoverable: boolean
  /** The path holds a passkey the recovery did not use. */
  unusedPasskey: boolean
  /** The path holds an identity method. */
  identity: boolean
  cleanup: CleanupBlock[]
}

export interface SummaryInput {
  configuration: Configuration | null
  addressBook: { methods: Record<SlotKind, Address> }
  event: ConsumeEvent
}

// ---------------------------------------------------------------------------
// The add on the fast track
// ---------------------------------------------------------------------------

/** Whether the computed creation reproduces the deployed account's address. */
export type CreationBasis = 'reproduced' | 'stand-in'

export interface RecoveredAccountInput {
  account: Address
  granted: Address
  removed: Address
  removedPrivilege?: Hex
  existing: Account[]
}

export interface RecoveredAccount {
  account: Account & { domainName: string | null }
  creation: CreationBasis
}

export type AddState =
  | { status: 'adding' }
  | { status: 'failed' }
  | { status: 'done'; creation?: CreationBasis }

export interface AddInput {
  /** The add also marks the wallet's onboarding complete, on the fast track. */
  completesSetup: boolean
  /** False where the add may only find the account listed with the key, never dispatch. */
  dispatches: boolean
  chainId: number
  account: Address
  event: ConsumeEvent | null
}

/** An add this page started, kept past the screen that started it until the add ends. */
export interface PendingAdd {
  startedAt: number
  creation?: CreationBasis
}

export interface AddHook {
  state: AddState
  retry: () => void
}

// ---------------------------------------------------------------------------
// The screen and the view
// ---------------------------------------------------------------------------

/** The entry record of the account: the route, or null where the record is gone and the wallet lists the account. */
export type DoneEntryReading =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'present'; entry: RecoveryEntryRecord | null }

/** A read of this device's own state, the setup it holds. */
export type LocalRead<T> =
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'answered'; value: T }

/** The last act: the countdown ended, the entry cleared, the recovery password dropped. */
export type FinishState = 'idle' | 'finishing' | 'failed'

export interface DoneBodyProps {
  records: WalletRecords
  account: Address
  entry: RecoveryEntryRecord | null
}

export interface DoneViewProps {
  account: Address
  /** The wallet's name of the account, where it lists the account. */
  accountName: string | null
  route: RecoveryRoute | null
  /** The wallet's name of the account whose key receives control, on the logged-in route. */
  receivingName: string | null
  read: DoneRead
  add: AddState
  summary: RecoverySummary | null
  timeZone: string
  finish: FinishState
  onRetryRead: () => void
  onRetryAdd: () => void
  onClose: () => void
  onEdit: () => void
}

export interface CleanupBlockProps {
  block: CleanupBlock
  row: PathRow | undefined
  disabled: boolean
  onEdit: () => void
}

export interface RecoveryDidBlockProps {
  summary: RecoverySummary
}
