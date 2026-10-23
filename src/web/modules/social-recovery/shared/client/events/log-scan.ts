/**
 * The log scan the extension runs beside the SDK's event manager: the logs of
 * one of its filters over a range, read in chunks of at most the configured
 * width, each chunk read again after a pause where it failed, and decoded by
 * the same event manager. The SDK's own `fetch` fails a whole read on the
 * first chunk the provider rejects, while a transient failure on one chunk
 * must not fail a scan that would pass a second later. A failure the node's
 * rate limit caused is not read again here, since the provider adapter
 * already made that read again with its own pauses. A scan with no last block
 * reads `latest` first. Logs the node reports as removed are dropped.
 */
import type {
  BlockRange,
  FilterSpec,
  IEventManager,
  IProvider,
  KitNotification,
  RawLog
} from '@kohaku-eth/social-recovery'

import { delayPromise } from '@common/utils/promises'

import { LOG_CHUNK_SIZE } from '../configuration'
import { rateLimited } from '../provider-adapter'
import type { LogScan } from './types'

/** The widest block range one log query asks for: the wallet's own configured width. */
export const LOG_CHUNK_BLOCKS = LOG_CHUNK_SIZE

export const LOG_CHUNK_RETRIES = 3
export const LOG_CHUNK_RETRY_MS = 1_000

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
  provider: Pick<IProvider, 'logs'>,
  filter: FilterSpec,
  range: BlockRange,
  retriesLeft = LOG_CHUNK_RETRIES,
  pauseMs = LOG_CHUNK_RETRY_MS
): Promise<readonly RawLog[]> => {
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

/** The raw logs of a filter over a scan, one chunk after the other, in chain order. */
export const logsInChunks = async (
  provider: Pick<IProvider, 'logs' | 'block'>,
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

/** The notifications the event manager decodes from a filter's logs over a scan, in chain order. */
export const notificationsInChunks = async (
  provider: Pick<IProvider, 'logs' | 'block'>,
  events: Pick<IEventManager, 'decodeLog'>,
  filter: FilterSpec,
  scan: LogScan,
  width = LOG_CHUNK_BLOCKS
): Promise<KitNotification[]> => {
  const logs = await logsInChunks(provider, filter, scan, width)
  return logs
    .filter((log) => !log.removed)
    .map((log) => events.decodeLog(log))
    .filter((notification): notification is KitNotification => notification !== undefined)
}
