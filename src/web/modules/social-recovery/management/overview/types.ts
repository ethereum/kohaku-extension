import type { ReactNode } from 'react'

import type {
  EntryRead,
  HiddenLevel,
  ReadoutRowContext,
  ShapeNote,
  UnlockState
} from '@web/modules/social-recovery/recovery/entry/types'
import type {
  Address,
  Configuration,
  LogPosition,
  SetupDraft,
  SetupState
} from '@kohaku-eth/social-recovery'
import type {
  PrivacyLevel,
  AccountFactsResult,
  ChainReads,
  KeyHandle,
  ListedAccountFacts,
  ReceiptReads,
  RecoveryKitClient,
  SendPort,
  SendRequestPort
} from '@web/modules/social-recovery/shared/client'
import type { RecoveryClientState } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import type { ChainId, WalletRecords } from '@web/modules/social-recovery/shared/records'
import type {
  OverviewIntent,
  OwnerWrite,
  WriteState
} from '@web/modules/social-recovery/shared/writes'
import type { ArmRun, SaveWriteKeys } from '@web/modules/social-recovery/setup/arm'
import type { TrustRow } from '@web/modules/social-recovery/setup/review'
import type { AttemptEnding, WatcherStorage } from '@web/modules/social-recovery/watcher'

// ---------------------------------------------------------------------------
// The chain's reading of the account
// ---------------------------------------------------------------------------

/** What the overview draws from the setup and the account's authorization of the recovery action. */
export type OverviewKind =
  /** No setup is committed and the account does not authorize the action. */
  | 'not-set-up'
  /** A setup is committed and the account authorizes the action: recovery works. */
  | 'set-up'
  /**
   * A committed setup the account no longer authorizes: no recovery against it
   * can execute. Repaired by re-authorizing it or by clearing it.
   */
  | 'dormant'
  /**
   * An authorization the account still holds with no setup behind it, as a
   * clear alone leaves it. Repaired by removing the authorization.
   */
  | 'mirror'

/** The setup state and whether an attempt is open on the account, pending or ready. */
export interface OverviewFacts {
  setup: SetupState
  attemptOpen: boolean
}

/** The chain read of the overview, with the client's own state where it cannot read. */
export type OverviewFactsRead =
  | EntryRead<OverviewFacts>
  /** This wallet version cannot read the setup; only an update of the wallet helps. */
  | { status: 'update-the-wallet' }

// ---------------------------------------------------------------------------
// The path
// ---------------------------------------------------------------------------

/** How the overview stands with the path of the committed setup. */
export type PathStep =
  | { kind: 'none' }
  | { kind: 'reading' }
  | { kind: 'read-failed' }
  | { kind: 'no-details' }
  | { kind: 'mismatch' }
  /** This device cannot read the path until the recovery password opens it. */
  | { kind: 'locked'; level: HiddenLevel; shape?: ShapeNote }
  | { kind: 'readable'; configuration: Configuration }

// ---------------------------------------------------------------------------
// The notices
// ---------------------------------------------------------------------------

/** A method whose trusted keys moved since the setup was committed, at its latest update. */
export interface MovedKeys {
  method: Address
  at: LogPosition
}

/** What the logs since the commit hold: the moved keys and the attempts a cancel ended. */
export interface OverviewNotices {
  moved: MovedKeys[]
  cancelledAttempts: bigint[]
}

/** The notice after an ended attempt: the road that ended it and when, in seconds. */
export interface EndedNotice {
  road: 'ownerCancel' | 'setupWrite'
  at: number
}

// ---------------------------------------------------------------------------
// The reads hook
// ---------------------------------------------------------------------------

/**
 * What this device has seen of the account's setup at the client's
 * deployment: the highest setup nonce, and the block of the watcher's last
 * reading where it found a setup.
 */
export interface KnownFloor {
  setupNonce?: bigint
  setupBlock?: number
}

export interface OverviewReadsInput {
  client: RecoveryClientState & { retry: () => void }
  records: Pick<WalletRecords, 'decryptedSetupCache'>
  /** The storage the watcher keeps its record of each account in; with none, only the cache sets the floor. */
  watcherStorage?: WatcherStorage
  chainId: ChainId
  account: Address
}

export interface OverviewReads {
  facts: OverviewFactsRead
  path: PathStep
  /** The password ask, shared by the locked path and the re-authorize step. */
  ask: UnlockState
  notices: EntryRead<OverviewNotices>
  /** Reads the setup state and the attempt again, and everything that follows from them. */
  retry: () => void
  retryPath: () => void
  retryNotices: () => void
  /** Opens the setup with the recovery password and keeps it on this device. */
  unlock: (password: string) => void
  /** Leaves the wrong password's line for the password field. */
  askAgain: () => void
}

// ---------------------------------------------------------------------------
// The writes
// ---------------------------------------------------------------------------

/** The three writes the overview sends. */
export type { OverviewIntent }

/** The screen that follows a write stored by another screen, the line's key and its link's label key. */
export interface ElsewhereLink {
  route: string
  line: string
  label: string
}

/** The privacy level the committed setup reads at, or a setup this build cannot read. */
export type LevelRead = EntryRead<PrivacyLevel> | { status: 'unreadable' }

export interface OverviewStepsInput {
  intent: OverviewIntent
  client: RecoveryKitClient
  reads: ChainReads
  receipts: ReceiptReads
  port: SendPort
  requests: SendRequestPort
  records: Pick<WalletRecords, 'saveSetup' | 'saveInFlight' | 'setup' | 'decryptedSetupCache'>
  chainId: ChainId
  account: Address
  facts: ListedAccountFacts
  key: KeyHandle
  /** The re-authorize's rebuilt draft; a removal carries the removal's stand-in. */
  draft: SetupDraft
  password: string | undefined
  /** The re-authorize found an attempt open before it prepared, and sent nothing. */
  onAttemptOpen: () => void
}

/** The keys of a write step's title, lead and action. */
export interface StepHeadings {
  title: string
  lead: string
  action: string
}

// ---------------------------------------------------------------------------
// The views
// ---------------------------------------------------------------------------

export interface PathLockedAskProps {
  ask: UnlockState
  onUnlock: (password: string) => void
  onAskAgain: () => void
  onRetry: () => void
  /** Leaves out the title and the line, where the step around the ask carries its own. */
  bare?: boolean
  testID: string
}

export interface PathLockedBodyProps {
  ask: UnlockState
  /** The field is open: the holder pressed the locked notice's action, or the step asks at once. */
  asking: boolean
  onAsk: () => void
  typed: string
  onChange: (text: string) => void
  onSubmit: () => void
  onRetry: () => void
  testID: string
}

export interface OverviewViewProps {
  reads: OverviewReads
  context: ReadoutRowContext
  /** The recovery chain's name, as the wallet lists its network. */
  networkName: string
  timeZone: string
  /** The last ending the watcher read for the account, where it read one. */
  ending: AttemptEnding | undefined
  /** The wallet's name of a method, for the moved-keys notice. */
  methodNameOf: (method: Address) => string
  /** The admin a moved method's declaration names, where its read answered. */
  adminOf: (method: Address) => Address | undefined
  /** The cancel lane's banner of the account, drawn while an attempt is open. */
  banner: ReactNode
  /** The open write step, drawn in place of the overview's body. */
  step: ReactNode
  /**
   * The pointer to a write another screen stored as in flight, drawn under the
   * title and the status line in place of the overview's body.
   */
  held: ReactNode
  onOpen: (intent: OverviewIntent) => void
  navigate: (to: string) => void
}

export interface OverviewWriteStepProps {
  intent: OverviewIntent
  client: RecoveryKitClient
  chainReads: ChainReads
  receipts: ReceiptReads
  records: OverviewStepsInput['records']
  chainId: ChainId
  account: Address
  facts: OverviewFacts
  reads: OverviewReads
  /** Starts the write once it can, where the press that opened the step was the holder's confirmation. */
  autoStart: boolean
  /** The run ended where the overview reads the chain again. */
  onFinished: () => void
  /** The run stopped before its send at a write the management editor holds, which only the editor follows. */
  onLeft: () => void
  onClose: () => void
  navigate: (to: string) => void
}

export interface OverviewStageProps {
  records: WalletRecords
  chainId: ChainId
  account: Address
  navigate: (to: string) => void
}

// ---------------------------------------------------------------------------
// The parts of the views
// ---------------------------------------------------------------------------

export interface OverviewTitleProps {
  lead?: string
}

export interface OverviewNavigateProps {
  navigate: (to: string) => void
}

export interface OverviewChipsProps {
  kind: OverviewKind
  path: PathStep
  attemptOpen: boolean
}

export interface DormantBlockProps {
  attemptOpen: boolean
  onOpen: (intent: OverviewIntent) => void
}

export interface MirrorBlockProps {
  onOpen: (intent: OverviewIntent) => void
}

export type NoticesBlockProps = Pick<
  OverviewViewProps,
  'reads' | 'context' | 'timeZone' | 'ending' | 'methodNameOf' | 'adminOf' | 'navigate'
>

export type PathBodyProps = Pick<OverviewViewProps, 'reads' | 'context' | 'networkName'>

export type PathBlockProps = PathBodyProps & {
  kind: OverviewKind
  attemptOpen: boolean
  navigate: (to: string) => void
}

export interface WriteStepUnavailableProps {
  accountFacts: AccountFactsResult
}

export interface ReauthorizeArrivalProps {
  reads: OverviewReads
  level: LevelRead
  onRetryLevel: () => void
  /** The committed level hides the setup and this tab holds no recovery password. */
  passwordMissing: boolean
  rows: readonly TrustRow[]
  client: RecoveryKitClient
  onRetryTrust: (method: Address) => void
}

export interface WriteStepArrivalProps {
  /** The re-authorize's own arrival, drawn above the actions. */
  children?: ReactNode
  /** The clear is open while an attempt is: it says the clear ends that recovery. */
  clearCancels: boolean
  /** The stored write, or the account's facts, are still being read. */
  reading: boolean
  lookupFailed: boolean
  onLookAgain: () => void
  startAction: ReactNode
  back: ReactNode
}

export interface WriteStepUnreadProps {
  onReread: () => void
}

export interface RunBlockProps {
  run: ArmRun
  /** The write whose copy the shared states read, where it is not the run's own. */
  write?: OwnerWrite
  /** The key of the line for a write the network dropped. */
  droppedLine: string
  /** The screen's own words over a write state, where it carries any. */
  keysOf?: (state: WriteState) => SaveWriteKeys
  testID: string
}

/** The step the overview has open, and whether it starts by itself. */
export interface OpenStep {
  intent: OverviewIntent
  autoStart: boolean
}
