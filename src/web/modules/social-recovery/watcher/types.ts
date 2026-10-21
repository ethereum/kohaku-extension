import type { Account } from '@ambire-common/interfaces/account'
import type { Network } from '@ambire-common/interfaces/network'
import type { Address, CancelledBy, DeploymentDescriptor, Hex } from '@kohaku-eth/social-recovery'
import type {
  WatcherConnection,
  WatcherReads
} from '@web/modules/social-recovery/shared/client/types'
import type {
  ChainId,
  RecordDeployment,
  RecordStorage
} from '@web/modules/social-recovery/shared/records/types'

import type { ENDING_GAPS, OPENING_GAPS } from './constants'

/**
 * Why an open attempt names no key yet: the read of its opening failed, the
 * scan found no opening whose payload matches the attempt's hash, or the
 * payload is not in the action's layout.
 */
export type OpeningGap = typeof OPENING_GAPS[number]

/**
 * Why an ending whose logs were read lacks a field: no log of it was found, or
 * the opening's payload is not in the action's layout. Such an ending is
 * settled and its logs are not read again.
 */
export type EndingGap = typeof ENDING_GAPS[number]

/** An attempt the manager holds as waiting, as one poll read it. */
export interface WatchedAttempt {
  attemptId: bigint
  setupNonce: bigint
  /** The hash of the payload the attempt committed. */
  payloadHash: Hex
  /** When the attempt can execute, in seconds since epoch, from the manager's record. */
  consumableAfter: number
  /** The pinned block's time is at or past `consumableAfter`, and nobody has executed. */
  executionDue: boolean
  /** When the attempt opened: the time of the block of its opening log, in seconds, once read. */
  openedAt?: number
  /** The key the attempt hands the account to, once the opening's payload decoded. */
  newKey?: Address
  /** The key the attempt removes, once the opening's payload decoded. */
  removedKey?: Address
  /** Why no key is named yet; absent once the decode returned a key. */
  openingGap?: OpeningGap
  /**
   * The last block a scan found no opening up to. Present while the opening is
   * not found; the next poll scans again from a margin below it.
   */
  scannedTo?: number
  /**
   * The lowest block the scans reached below `scannedTo` where they ran out
   * before the setup block: the blocks from the setup block to the one below
   * it are still to scan. Absent where the scans reached the setup block.
   */
  scannedFrom?: number
  /**
   * The block a scan found the opening in where the poll ended before it read
   * the opening's time; the next poll reads that block alone first.
   */
  openingBlock?: number
}

/** What a poll reads of an attempt's opening. */
export type Opening = Pick<
  WatchedAttempt,
  'openedAt' | 'newKey' | 'removedKey' | 'openingGap' | 'scannedTo' | 'scannedFrom' | 'openingBlock'
>

/**
 * How the attempt the manager holds ended. A field left undefined with no
 * `endingGap` is one whose log is not read yet; the next poll reads it again.
 * A log not found is looked for again until the pinned block is a margin past
 * `notFoundAt`, and the ending settles with `endingGap` only then.
 */
export type AttemptEnding =
  | {
      attemptId: bigint
      road: 'executed'
      /** The key that controls the account since: the new key of the attempt's payload. */
      controller?: Address
      /** The time of the block of the consume log, in seconds. */
      at?: number
      /** Why a field is missing although the logs were read. */
      endingGap?: EndingGap
      /** The pinned block of the first scan that found a log of the ending missing. */
      notFoundAt?: number
    }
  | {
      attemptId: bigint
      road: 'cancelled'
      cancelledBy?: CancelledBy
      /** The time of the block of the cancel log, in seconds. */
      at?: number
      /** Why a field is missing although the logs were read. */
      endingGap?: EndingGap
      /** The pinned block of the first scan that found a log of the ending missing. */
      notFoundAt?: number
    }

/** One account's reading at one block. */
export interface WatcherReading {
  account: Address
  /** The latest block the poll pinned every read to, its time in seconds. */
  block: { number: number; timestamp: number }
  /** The account holds a setup commitment at the manager. */
  hasSetup: boolean
  /** The account holds a setup and no longer authorizes the action. */
  dormant: boolean
  /** The attempt that is open; absent where none is. */
  attempt?: WatchedAttempt
  /** The ending of the last attempt, where the manager holds an ended one. */
  ended?: AttemptEnding
  /** The manager and the action the reading came from; absent on a reading an earlier build wrote. */
  readonly deployment?: RecordDeployment
}

/** A poll that failed or did not answer in time; `at` in ms since epoch. */
export interface PollFailure {
  at: number
  message: string
}

/**
 * The watcher's record of one account: the last good reading, the failure of
 * the last poll where it failed, and the attempts the holder dismissed.
 */
export interface WatcherRecord {
  reading?: WatcherReading
  failed?: PollFailure
  dismissed: bigint[]
  /** When the poll that wrote the reading or the failure last started, in ms since epoch. */
  polledAt?: number
}

/** The open attempt as storage holds it, its two bigints as decimal strings. */
export type StoredWatchedAttempt = Omit<WatchedAttempt, 'attemptId' | 'setupNonce'> & {
  attemptId: string
  setupNonce: string
}

/** An ending as storage holds it, its attempt id as a decimal string. */
export type StoredAttemptEnding =
  | (Omit<Extract<AttemptEnding, { road: 'executed' }>, 'attemptId'> & { attemptId: string })
  | (Omit<Extract<AttemptEnding, { road: 'cancelled' }>, 'attemptId'> & { attemptId: string })

/** The record as storage holds it: every bigint as a decimal string. */
export interface StoredWatcherRecord {
  reading?: Omit<WatcherReading, 'attempt' | 'ended'> & {
    attempt?: StoredWatchedAttempt
    ended?: StoredAttemptEnding
  }
  failed?: PollFailure
  dismissed: string[]
  polledAt?: number
}

/**
 * How one record write is made: the clock its save time is stamped with, and
 * when the poll whose reading or failure it writes started, in ms since epoch.
 */
export interface WatcherWrite {
  now?: () => number
  polledAt?: number
}

/** The storage the watcher's records live in. */
export type WatcherStorage = Pick<RecordStorage, 'get' | 'set'>

/** The alarm API the watcher registers with: the extension's `alarms`. */
export interface WatcherAlarms {
  create(name: string, info: { periodInMinutes: number }): unknown
  clear(name: string): unknown
  onAlarm: {
    addListener(listener: (alarm: { name: string }) => void): void
    removeListener(listener: (alarm: { name: string }) => void): void
  }
}

/** How long the two parts of one account's poll may run, in ms. */
export interface PollLimits {
  /** The latest block, the account's code, the manager's record and the authorization. */
  stateMs: number
  /** The opening and ending logs, counted from the state read's return. */
  scanMs: number
}

/** What one poll over the watched accounts takes. */
export interface PollInput {
  reads: WatcherReads
  /** The manager and the action `reads` go to, written with each reading. */
  deployment: RecordDeployment
  accounts: readonly Address[]
  chainId: ChainId
  storage: WatcherStorage
  /** The clock a failure is stamped with, in ms since epoch. */
  now: () => number
  /** When the poll started, in ms since epoch; the clock's time at the call where none is given. */
  polledAt?: number
  /** How long the state reads of the poll may run, in ms. */
  limitMs: number
  /** How long the log scans of one account may run once its state read returned, in ms. */
  scanLimitMs: number
}

/** What the background starts the watcher with. */
export interface RecoveryWatcherOptions {
  /** The accounts the wallet lists. */
  accounts: () => readonly Account[]
  /** The network record of the recovery chain. */
  network: () => Network | undefined
  /**
   * Settles once the accounts controller has loaded the listed accounts; no
   * poll runs before it.
   */
  ready: Promise<unknown>
  /** Receives, after every poll that read the accounts, the number the badge counts. */
  onBadge: (count: number) => void
  /** The deployment the watcher reads; the build's deployed kit where none is given. */
  deployment?: () => DeploymentDescriptor | undefined
  alarms?: WatcherAlarms
  storage?: WatcherStorage
  connect?: (network: Network, deployment: DeploymentDescriptor) => WatcherConnection
  now?: () => number
  limitMs?: number
  scanLimitMs?: number
  tickLimitMs?: number
}

/** A started watcher. */
export interface RecoveryWatcher {
  /** Runs one poll, or nothing where a poll still runs. */
  tick(): Promise<void>
  /** Clears the alarm and releases the provider. */
  stop(): void
}

/** What the hook reads a record through. */
export interface WatchedAttemptSources {
  read(key: string): Promise<unknown>
  subscribe(key: string, onValue: (value: unknown) => void): () => void
}

/** The hook's state for one account. */
export type WatchedAttemptState =
  | { status: 'loading' }
  /** The watcher has not polled this account yet. */
  | { status: 'unwatched' }
  /** The record could not be read, or holds no watcher record. */
  | { status: 'failed'; retry: () => void }
  | {
      status: 'watched'
      /** The last good reading; absent where no poll has answered yet. */
      reading?: WatcherReading
      /** The failure of the last poll, beside the last good reading. */
      failed?: PollFailure
      /** The open attempt is one the holder dismissed. */
      attemptDismissed: boolean
    }
