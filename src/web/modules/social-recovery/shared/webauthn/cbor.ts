/* eslint-disable no-bitwise -- byte handling of CBOR */
import { bytesToString, stringToBytes } from 'viem'

import { bytesOf } from './bytes'
import type { BytesLike, CborMap, CborRead } from './types'

/**
 * The authenticator data inside a CBOR attestation object, for a browser whose
 * attestation response carries no `getAuthenticatorData()`. It reads the byte
 * string under the text key `authData`, the one layout attestation `none`
 * produces, and returns null where it finds none.
 */
export const authDataFromAttestationObject = (attestationObject: BytesLike): Uint8Array | null => {
  const bytes = bytesOf(attestationObject)
  // CBOR text string of length 8 (0x68) followed by "authData".
  const key = [0x68, ...Array.from(stringToBytes('authData'))]
  for (let i = 0; i + key.length < bytes.length; i++) {
    if (key.every((b, j) => bytes[i + j] === b)) {
      let at = i + key.length
      const head = bytes[at]
      const major = head >> 5
      const info = head & 0x1f
      if (major !== 2) {
        return null
      }
      at += 1
      let length: number
      if (info < 24) {
        length = info
      } else if (info === 24) {
        length = bytes[at]
        at += 1
      } else if (info === 25) {
        length = (bytes[at] << 8) | bytes[at + 1]
        at += 2
      } else if (info === 26) {
        length =
          ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
        at += 4
      } else {
        return null
      }
      if (at + length > bytes.length) {
        return null
      }
      return bytes.slice(at, at + length)
    }
  }
  return null
}

const readArgument = (bytes: Uint8Array, at: number): { argument: number; next: number } => {
  const info = bytes[at]! & 0x1f
  if (info < 24) {
    return { argument: info, next: at + 1 }
  }
  const size = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : 0
  if (size === 0 || at + 1 + size > bytes.length) {
    throw new Error('The CBOR item has a length this reader does not take.')
  }
  let argument = 0
  for (let i = 0; i < size; i++) {
    argument = argument * 256 + bytes[at + 1 + i]!
  }
  return { argument, next: at + 1 + size }
}

/**
 * One CBOR item at `at`: an integer, a byte string, a text string or a map of
 * those, the subset a COSE key uses. Any other item throws.
 */
export const readCborItem = (data: BytesLike, at = 0): CborRead => {
  const bytes = bytesOf(data)
  const head = bytes[at]
  if (head === undefined) {
    throw new Error('The CBOR data ends early.')
  }
  const major = head >> 5
  const { argument, next } = readArgument(bytes, at)
  if (major === 0) {
    return { value: argument, next }
  }
  if (major === 1) {
    return { value: -1 - argument, next }
  }
  if (major === 2 || major === 3) {
    if (next + argument > bytes.length) {
      throw new Error('The CBOR string runs past the data.')
    }
    const body = bytes.slice(next, next + argument)
    return { value: major === 2 ? body : bytesToString(body), next: next + argument }
  }
  if (major === 5) {
    const map: CborMap = new Map()
    let cursor = next
    for (let i = 0; i < argument; i++) {
      const key = readCborItem(bytes, cursor)
      if (typeof key.value !== 'number' && typeof key.value !== 'string') {
        throw new Error('The CBOR map has a key this reader does not take.')
      }
      const value: CborRead = readCborItem(bytes, key.next)
      map.set(key.value, value.value)
      cursor = value.next
    }
    return { value: map, next: cursor }
  }
  throw new Error('The CBOR item is of a kind this reader does not take.')
}
