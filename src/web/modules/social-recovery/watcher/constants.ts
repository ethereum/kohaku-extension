/** The name of the watcher's browser alarm. */
export const WATCHER_ALARM = 'socialRecovery:watcher'

/**
 * How often the alarm fires, in minutes: a recovery waits at least a day before
 * it can run, so an attempt reaches the holder long before it can end.
 */
export const WATCH_PERIOD_MINUTES = 30

/** How long the state reads of one poll may run before the poll reads as failed, in ms. */
export const POLL_LIMIT_MS = 30_000

/**
 * How long the log scans of one account may run once its state read returned,
 * in ms; a scan that runs longer leaves its fields unread for the next poll.
 */
export const SCAN_LIMIT_MS = 15_000

/**
 * How long one tick may run, in ms, the record reads and writes and their lock
 * included: longer than a poll and its scans, shorter than the alarm's period.
 */
export const TICK_LIMIT_MS = 55_000

/**
 * The blocks below a scan's last block that a later scan reads again, since a
 * node that lags at the head or a reorganization can hold a log there that the
 * first scan did not see; and how many blocks past its first not-found an
 * ending's logs are looked for before the ending settles without them.
 */
export const RESCAN_MARGIN_BLOCKS = 64

/** Why an open attempt names no key yet. */
export const OPENING_GAPS = ['read-failed', 'not-found', 'undecodable'] as const

/** Why an ending whose logs were read lacks a field: its controller, its canceller or its time. */
export const ENDING_GAPS = ['not-found', 'undecodable'] as const
