import type { Address } from 'viem'
import { isAddress, isHex } from 'viem'

import type { Credential } from '@kohaku-eth/social-recovery'

/** Whether a value read back from outside is an address, in any case. */
export const isStoredAddress = (value: unknown): value is Address =>
  typeof value === 'string' && isAddress(value, { strict: false })

/** Whether a value read back from outside is a decimal string, the form a bigint travels in. */
export const isDecimalString = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9]+$/.test(value)

/** Whether a value read back from outside is a time in whole seconds since epoch. */
export const isStoredSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Whether a value read back from outside is a plain object, never an array. */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Whether a stored value is a credential: its method address, its config and,
 * where present, its label and salt.
 */
export const isStoredCredential = (value: unknown): value is Credential =>
  isPlainObject(value) &&
  isStoredAddress(value.method) &&
  isHex(value.config) &&
  (value.label === undefined || typeof value.label === 'string') &&
  (value.salt === undefined || isHex(value.salt))
