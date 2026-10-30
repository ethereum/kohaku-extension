/* eslint-disable no-bitwise -- byte handling of DER */
import { bytesToHex, numberToBytes } from 'viem'

import { bytesOf } from './bytes'
import type { BytesLike, NormalizedDerSignature, SignatureParts } from './types'

/** The order `n` of the P-256 curve. */
export const P256_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551')

/** Half the order: an `s` above it is high. */
export const P256_HALF_N = P256_N / BigInt(2)

/** The low form of `s`: `n - s` where `s > n/2`, `s` itself otherwise. */
export const normalizeP256S = (s: bigint): bigint => (s > P256_HALF_N ? P256_N - s : s)

export const isHighS = (s: bigint): boolean => s > P256_HALF_N

const readDerLength = (bytes: Uint8Array, at: number): { length: number; next: number } => {
  const first = bytes[at]
  if (first === undefined) {
    throw new Error('The DER signature ends early.')
  }
  if (first < 0x80) {
    return { length: first, next: at + 1 }
  }
  const count = first & 0x7f
  if (count < 1 || count > 2) {
    throw new Error('The DER signature has an unsupported length.')
  }
  let length = 0
  for (let i = 0; i < count; i++) {
    const b = bytes[at + 1 + i]
    if (b === undefined) {
      throw new Error('The DER signature ends early.')
    }
    length = (length << 8) | b
  }
  return { length, next: at + 1 + count }
}

const readDerInteger = (bytes: Uint8Array, at: number): { value: bigint; next: number } => {
  if (bytes[at] !== 0x02) {
    throw new Error('The DER signature holds no integer where one belongs.')
  }
  const { length, next } = readDerLength(bytes, at + 1)
  if (length === 0 || next + length > bytes.length) {
    throw new Error('The DER signature holds a malformed integer.')
  }
  const value = BigInt(bytesToHex(bytes.slice(next, next + length)))
  return { value, next: next + length }
}

/** The `r` and `s` of an ECDSA signature in DER, the form an authenticator returns. */
export const parseDerSignature = (der: BytesLike): SignatureParts => {
  const bytes = bytesOf(der)
  if (bytes[0] !== 0x30) {
    throw new Error('The signature is not a DER sequence.')
  }
  const { length, next } = readDerLength(bytes, 1)
  if (next + length !== bytes.length) {
    throw new Error('The DER sequence length does not match.')
  }
  const r = readDerInteger(bytes, next)
  const s = readDerInteger(bytes, r.next)
  if (s.next !== bytes.length) {
    throw new Error('The DER signature carries trailing bytes.')
  }
  return { r: r.value, s: s.value }
}

const derInteger = (value: bigint): number[] => {
  if (value < BigInt(0)) {
    throw new Error('A DER integer of a signature is never negative.')
  }
  const body = Array.from(numberToBytes(value))
  // A leading byte with its top bit set would read negative: prefix a zero.
  if (body[0] >= 0x80) {
    body.unshift(0)
  }
  return [0x02, body.length, ...body]
}

/** The DER encoding of `(r, s)`. */
export const encodeDerSignature = ({ r, s }: SignatureParts): Uint8Array => {
  const content = [...derInteger(r), ...derInteger(s)]
  const length = content.length < 0x80 ? [content.length] : [0x81, content.length]
  return Uint8Array.from([0x30, ...length, ...content])
}

/**
 * The signature the method receives: a high `s` becomes `n - s` and the DER is
 * re-encoded; a low `s` returns the same bytes unchanged. Google Password
 * Manager can return a high `s`, and the verifier rejects one.
 */
export const normalizeDerSignature = (der: BytesLike): NormalizedDerSignature => {
  const bytes = bytesOf(der)
  const { r, s } = parseDerSignature(bytes)
  if (!isHighS(s)) {
    return { signature: bytes, normalized: false }
  }
  return { signature: encodeDerSignature({ r, s: normalizeP256S(s) }), normalized: true }
}
