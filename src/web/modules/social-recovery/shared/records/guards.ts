import type { Address } from 'viem'
import { isAddress } from 'viem'

/** Whether a value read back from outside is an address, in any case. */
export const isStoredAddress = (value: unknown): value is Address =>
  typeof value === 'string' && isAddress(value, { strict: false })

/** Whether a value read back from outside is a decimal string, the form a bigint travels in. */
export const isDecimalString = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9]+$/.test(value)

/** Whether a value read back from outside is a time in whole seconds since epoch. */
export const isStoredSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
