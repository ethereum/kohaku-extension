import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'

/** Whether two hashes are the same, in any case. */
export const sameHash = (a: Hex, b: Hex): boolean => a.toLowerCase() === b.toLowerCase()
