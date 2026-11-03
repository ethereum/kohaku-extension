/**
 * What the holder typed in the account field: an address, a name to resolve,
 * or neither. A value that starts like an address but is not a complete one,
 * or whose mixed case fails its checksum, is refused before any read; so is a
 * value with no dot, which no name service resolves.
 */
import { isError } from 'ethers'
import { isAddress, isHex } from 'viem'

import { NAME_ABSENT_OFFCHAIN_REASON, NAME_ABSENT_REVERTS } from './constants'
import type { FieldError, LookupInput } from './types'

const HEX_PREFIX = /^0x/i

/** The revert data an ethers error message carries, as `data="0x…"`. */
const MESSAGE_REVERT_DATA = /data="(0x[0-9a-fA-F]*)"/

const SELECTOR_LENGTH = 10

export const lookupInputOf = (value: string): LookupInput => {
  const trimmed = value.trim()
  if (trimmed === '') {
    return { kind: 'empty' }
  }
  if (HEX_PREFIX.test(trimmed)) {
    return isAddress(trimmed, { strict: true })
      ? { kind: 'address', address: trimmed }
      : { kind: 'malformed' }
  }
  if (!trimmed.includes('.') || /\s/.test(trimmed)) {
    return { kind: 'malformed' }
  }
  return { kind: 'name', name: trimmed }
}

/**
 * The revert data of a failed call. The wallet's page provider forwards each
 * call to the background and gets back only the background's error message,
 * so the data is read from that message where the error itself carries none.
 */
const revertDataOf = (error: unknown): string | null => {
  if (!isError(error, 'CALL_EXCEPTION')) {
    return null
  }
  if (isHex(error.data)) {
    return error.data
  }
  const forwarded: unknown = error.info?.error?.message
  if (typeof forwarded !== 'string') {
    return null
  }
  return MESSAGE_REVERT_DATA.exec(forwarded)?.[1] ?? null
}

/**
 * Why a name lookup that threw failed: the name has no resolver, its resolver
 * is no contract or reverted, it holds no address record, or its off-chain
 * gateway answered that it holds none, all of which mean the name does not
 * resolve; anything else, a gateway error or a transport failure among them,
 * is a read that failed.
 */
export const nameLookupFailureOf = (error: unknown): FieldError => {
  if (isError(error, 'OFFCHAIN_FAULT')) {
    return error.reason === NAME_ABSENT_OFFCHAIN_REASON ? 'name' : 'read-failed'
  }
  const data = revertDataOf(error)
  if (data === null) {
    return 'read-failed'
  }
  const selector = data.slice(0, SELECTOR_LENGTH).toLowerCase()
  return NAME_ABSENT_REVERTS.some((absent) => absent === selector) ? 'name' : 'read-failed'
}
