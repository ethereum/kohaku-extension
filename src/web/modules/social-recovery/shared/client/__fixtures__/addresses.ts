import type { Address } from '@kohaku-eth/social-recovery'
import { keccak256, stringToHex } from 'viem'

/** A fixed address for a label, distinct per label, for a test that needs one. */
export const addressOf = (label: string): Address =>
  `0x${keccak256(stringToHex(`address:${label}`)).slice(26)}` as Address
