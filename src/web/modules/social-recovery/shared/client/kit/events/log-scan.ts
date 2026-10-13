import type {
  BlockRange,
  FilterSpec,
  IProvider,
  LogPosition,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'

import type { LogScan } from './types'

/** The widest block range one log query asks for, since a node may cap the range. */
export const LOG_CHUNK_BLOCKS = 10_000

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

/**
 * The logs of a filter over a scan, one chunk of at most `width` blocks after
 * the other, in chain order. A scan with no last block reads `latest` first.
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
    return [...logs, ...(await provider.logs(filter, range))]
  }, Promise.resolve([]))
}
