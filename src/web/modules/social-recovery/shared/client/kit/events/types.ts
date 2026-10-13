import type {
  Address,
  DeploymentDescriptor,
  FilterSpec,
  Hex,
  IProvider,
  Notification
} from '@web/modules/social-recovery/sdk-interfaces'

/** A decoded `SetupCommitted` log: the account, the action, the nonce, the commitment, the two metadata. */
export type SetupCommittedLog = Extract<Notification, { kind: 'setup-committed' }>

/** A decoded `SetupCleared` log: the account, the action and the nonce. */
export type SetupClearedLog = Extract<Notification, { kind: 'setup-cleared' }>

export type SetupLog = SetupCommittedLog | SetupClearedLog

/** A decoded `AttemptStarted`, `AttemptCancelled` or `AttemptConsumed` log. */
export type AttemptLog = Extract<
  Notification,
  { kind: 'attempt-started' | 'attempt-cancelled' | 'attempt-consumed' }
>

/** What the events feed of one account's deployment reads through. */
export interface KitEventManagerInput {
  provider: IProvider
  descriptor: Pick<DeploymentDescriptor, 'manager' | 'action'>
  account: Address
  /** The widest block range one log query asks for; the kit's own default where none is given. */
  chunkWidth?: number
}

/** The blocks a log scan covers: from a first block to a last one, or to `latest` where none is given. */
export interface LogScan {
  from: number
  to?: number
}

/** A decoded `LogPrivilegeChanged` log: the account that emitted it, the address and its new value. */
export type PrivilegeChangedLog = Extract<Notification, { kind: 'privilege-changed' }>

/**
 * The privilege writes of an account. The read scans in chunks, keeps only
 * the account's own logs of the event that decode, and drops a log a reorg
 * removed. A failed log read rejects with the adapter's failure.
 */
export interface PrivilegeEvents {
  privilegeFilter(account: Address): FilterSpec
  /** Every privilege write of the account over the scan, in chain order. */
  privilegeLogsOf(account: Address, scan: LogScan): Promise<PrivilegeChangedLog[]>
}

/** The commit a save looks for: its account, its action, its nonce and its commitment. */
export interface CommitQuery {
  account: Address
  action: Address
  nonce: bigint
  setupCommitment: Hex
}

/**
 * The setup logs of one manager. The reads scan in chunks, keep only the
 * manager's own logs of the two setup events that decode, and drop a log a
 * reorg removed. A failed log read rejects with the adapter's failure.
 */
export interface SetupEvents {
  /** Both setup events of an account, at any action. */
  setupFilter(account: Address): FilterSpec
  /** The commits of an account at one action. */
  commitFilter(account: Address, action: Address): FilterSpec
  /** Every setup commit and clear of an account, at any action, in chain order. */
  setupLogsOf(account: Address, scan: LogScan): Promise<SetupLog[]>
  /** The first commit with the query's account, action, nonce and commitment, if one landed. */
  commitOf(query: CommitQuery, scan: LogScan): Promise<SetupCommittedLog | undefined>
}
