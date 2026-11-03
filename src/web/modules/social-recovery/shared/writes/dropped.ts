import { DROPPED_RECHECK_MS } from './constants'
import { sameHash } from './hashes'
import type { UnknownReading } from './types'

/**
 * Whether `reading` read a higher block number than `kept`, or came
 * `DROPPED_RECHECK_MS` after it. A lower number is a node that lags.
 */
export const apartFrom = (kept: UnknownReading, reading: UnknownReading): boolean =>
  reading.block > kept.block || reading.at - kept.at >= DROPPED_RECHECK_MS

/** Whether the kept reading read every hash `reading` asked for. */
export const coversHashes = (kept: UnknownReading, reading: UnknownReading): boolean =>
  reading.hashes.every((hash) => kept.hashes.some((seen) => sameHash(seen, hash)))
