import { delayPromise } from '@common/utils/promises'
import type {
  BlockRange,
  FilterSpec,
  IProvider,
  LogPosition,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'

import { rateLimited } from '../../provider-adapter'
import type { LogScan } from './types'

/** The widest block range one log query asks for, since a node may cap the range. */
export const LOG_CHUNK_BLOCKS = 10_000

/**
 * A chunk whose read fails is read again, up to this many more times, after
 * a pause that starts at `LOG_CHUNK_RETRY_MS` and doubles each time: a
 * transient failure on one chunk must not fail a read that would pass a
 * second later. A failure the node's rate limit caused is not read again
 * here, since the provider adapter already made that read again with its own
 * pauses.
 */
export const LOG_CHUNK_RETRIES = 3
export const LOG_CHUNK_RETRY_MS = 1_000

/** Where a raw log sits in the chain; a log with no removed flag reads as not removed. */
export const positionOf = (log: RawLog): LogPosition => ({
  blockNumber: log.blockNumber,
  blockHash: log.blockHash,
  logIndex: log.logIndex,
  transactionHash: log.transactionHash,
  removed: log.removed ?? false
})

/**
 * The ranges of at most `width` blocks that cover `from` to `to`, both
 * included. A width below one block would never advance, so it is refused
 * before the loop rather than looped on.
 */
export const chunksOf = (from: number, to: number, width = LOG_CHUNK_BLOCKS): BlockRange[] => {
  if (!Number.isInteger(width) || width < 1) {
    throw new RangeError(
      `a log chunk width must be a whole number of blocks above zero, not ${width}`
    )
  }
  const chunks: BlockRange[] = []
  for (let first = from; first <= to; first += width) {
    chunks.push({ from: first, to: Math.min(first + width - 1, to) })
  }
  return chunks
}

/** One chunk's logs; a failed read rejects with its last failure once the retries are spent. */
const chunkLogs = async (
  provider: IProvider,
  filter: FilterSpec,
  range: BlockRange,
  retriesLeft = LOG_CHUNK_RETRIES,
  pauseMs = LOG_CHUNK_RETRY_MS
): Promise<RawLog[]> => {
  try {
    return await provider.logs(filter, range)
  } catch (failure) {
    if (retriesLeft === 0 || rateLimited(failure)) {
      throw failure
    }
    await delayPromise(pauseMs)
    return chunkLogs(provider, filter, range, retriesLeft - 1, pauseMs * 2)
  }
}

/**
 * The logs of a filter over a scan, one chunk of at most `width` blocks after
 * the other, in chain order. A scan with no last block reads `latest` first.
 * A failed chunk is read again before the scan fails.
 */
export const logsInChunks = async (
  provider: IProvider,
  filter: FilterSpec,
  scan: LogScan,
  width = LOG_CHUNK_BLOCKS
): Promise<RawLog[]> => {
  const last = scan.to ?? (await provider.block('latest')).number
  return chunksOf(scan.from, last, width).reduce<Promise<RawLog[]>>(async (earlier, range) => {
    const logs = await earlier
    return [...logs, ...(await chunkLogs(provider, filter, range))]
  }, Promise.resolve([]))
}
