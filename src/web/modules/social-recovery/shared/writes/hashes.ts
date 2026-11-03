import type { Hex } from '@kohaku-eth/social-recovery'

/** Whether two hashes are the same, in any case. */
export const sameHash = (a: Hex, b: Hex): boolean => a.toLowerCase() === b.toLowerCase()
