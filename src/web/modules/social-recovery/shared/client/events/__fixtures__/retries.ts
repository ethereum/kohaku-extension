import {
  LOG_CHUNK_RETRIES,
  LOG_CHUNK_RETRY_MS
} from '@web/modules/social-recovery/shared/client/events'
import type { AsyncFakeTimers } from '@web/modules/social-recovery/shared/client/events/__fixtures__/types'

/** Every pause one chunk's retries wait, end to end: one second, then two, then four. */
export const RETRY_PAUSES_MS = LOG_CHUNK_RETRY_MS * (2 ** LOG_CHUNK_RETRIES - 1)

/** Advances Jest's fake clock by `ms`, running the promises each timer settles before the next. */
export const advanceClock = (ms: number): Promise<void> =>
  (jest as unknown as AsyncFakeTimers).advanceTimersByTimeAsync(ms)

/**
 * Settles `read` under Jest's fake clock once every retry pause of one chunk
 * has passed, so a read whose chunk keeps failing rejects with no real wait.
 */
export const pastRetryPauses = async <T>(read: Promise<T>): Promise<T> => {
  read.catch(() => undefined)
  await advanceClock(RETRY_PAUSES_MS)
  return read
}
