/**
 * How long after it went out a write whose transactions the node does not
 * know, and whose effect the chain does not hold, reads as dropped, in ms. A
 * stored save of the setup counts from the time its hash was first written,
 * or from its claim where it holds a hash and no such time; one that holds no
 * hash never reads as dropped. The recovery's writes count from their claim.
 */
export const DROPPED_AFTER_MS = 60 * 60 * 1000

/**
 * How long after a first reading that the node knows none of a write's
 * transactions a second such reading, at the same block number, reads it as
 * dropped, in ms. A second reading at a higher block number needs no wait.
 */
export const DROPPED_RECHECK_MS = 60_000
