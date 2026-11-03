/**
 * The watcher: the background's alarm polling the recovery registry for every
 * smart account the wallet lists, and the record of each account it writes.
 * The React hook lives in its own file, `useWatchedAttempt`, imported by path,
 * so the background loads this module without the UI's code.
 */
export {
  WATCHER_ALARM,
  WATCH_PERIOD_MINUTES,
  POLL_LIMIT_MS,
  SCAN_LIMIT_MS,
  TICK_LIMIT_MS,
  RESCAN_MARGIN_BLOCKS,
  OPENING_GAPS,
  ENDING_GAPS
} from './constants'
export { registerRecoveryWatcherAlarm, startRecoveryWatcher, watchedNetworkOf } from './alarm'
export { pollAccount, pollAccounts, watchedAccountsOf, countsOnBadge } from './poll'
export {
  watcherKeyOf,
  watcherRecordFrom,
  readWatcherRecord,
  updateWatcherRecord,
  dismissAttempt,
  attemptDismissed,
  storedWatcherRecordOf
} from './record'
export type {
  OpeningGap,
  EndingGap,
  WatchedAttempt,
  Opening,
  AttemptEnding,
  WatcherReading,
  PollFailure,
  WatcherRecord,
  StoredWatchedAttempt,
  StoredAttemptEnding,
  StoredWatcherRecord,
  WatcherStorage,
  WatcherWrite,
  WatcherAlarms,
  PollLimits,
  PollInput,
  RecoveryWatcherOptions,
  RecoveryWatcher,
  WatchedAttemptSources,
  WatchedAttemptState
} from './types'
