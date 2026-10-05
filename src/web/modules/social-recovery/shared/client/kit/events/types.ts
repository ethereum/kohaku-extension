import type {
  Address,
  FilterSpec,
  Hex,
  Notification
} from '@web/modules/social-recovery/sdk-interfaces'

/** A decoded `SetupCommitted` log: the account, the action, the nonce, the commitment, the two metadata. */
export type SetupCommittedLog = Extract<Notification, { kind: 'setup-committed' }>

/** A decoded `SetupCleared` log: the account, the action and the nonce. */
export type SetupClearedLog = Extract<Notification, { kind: 'setup-cleared' }>

export type SetupLog = SetupCommittedLog | SetupClearedLog

/** The blocks a log scan covers: from a first block to a last one, or to `latest` where none is given. */
export interface LogScan {
  from: number
  to?: number
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
