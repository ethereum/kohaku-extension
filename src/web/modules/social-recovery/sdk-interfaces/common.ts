/**
 * Shared primitives of the SDK interfaces. Imported from no SDK package; types
 * only.
 */
import type { Address, Hex } from 'viem'

export type { Address, Hex }

/**
 * The tag a read pins at: `latest` for a screen somebody waits at, `finalized`
 * for a watcher, or a block number a caller resolved. The SDK takes no other
 * tag.
 */
export type BlockTag = 'latest' | 'finalized' | number

/**
 * One block's number, timestamp and hash, what `IProvider.block(tag)` returns
 * and every pinned record carries.
 */
export interface BlockHeader {
  number: number
  timestamp: number
  hash: Hex
}

/**
 * A module read that says whether it was answered at all beside what it
 * answered, so a provider that failed is told from a contract that replied.
 */
export type ReadResult<T> = { answered: true; value: T } | { answered: false }
