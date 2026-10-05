import type {
  BlockRange,
  FilterSpec,
  IProvider,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'

import type { LogScan } from './types'

/** The widest block range one log query asks for, since a node may cap the range. */
export const LOG_CHUNK_BLOCKS = 10_000

/** The ranges of at most `LOG_CHUNK_BLOCKS` blocks that cover `from` to `to`, both included. */
export const chunksOf = (from: number, to: number): BlockRange[] => {
  const chunks: BlockRange[] = []
  for (let first = from; first <= to; first += LOG_CHUNK_BLOCKS) {
    chunks.push({ from: first, to: Math.min(first + LOG_CHUNK_BLOCKS - 1, to) })
  }
  return chunks
}

/**
 * The logs of a filter over a scan, one chunk after the other, in chain
 * order. A scan with no last block reads `latest` first.
 */
export const logsInChunks = async (
  provider: IProvider,
  filter: FilterSpec,
  scan: LogScan
): Promise<RawLog[]> => {
  const last = scan.to ?? (await provider.block('latest')).number
  return chunksOf(scan.from, last).reduce<Promise<RawLog[]>>(async (earlier, range) => {
    const logs = await earlier
    return [...logs, ...(await provider.logs(filter, range))]
  }, Promise.resolve([]))
}
