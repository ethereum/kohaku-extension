/* eslint-disable no-bitwise -- byte handling of the authenticator data */
import { bytesToHex, concat, hexToBytes } from 'viem'

import { hexToArrayBuffer, bytesOf } from './bytes'
import { readCborItem } from './cbor'
import type { BytesLike, P256Point } from './types'

/** The COSE algorithm number of ES256, ECDSA over P-256 with SHA-256. */
export const ES256 = -7

/** The DER head of an uncompressed P-256 SubjectPublicKeyInfo, up to the point's own 0x04. */
const P256_SPKI_HEAD = hexToBytes('0x3059301306072a8648ce3d020106082a8648ce3d030107034200')

const COSE_KTY_EC2 = 2
const COSE_CRV_P256 = 1
const COSE_KEY = { kty: 1, alg: 3, crv: -1, x: -2, y: -3 } as const

const ATTESTED_CREDENTIAL_DATA = 0x40

/** The point of a P-256 key in SubjectPublicKeyInfo DER, what `getPublicKey()` returns; null for any other key. */
export const pointFromSpki = (data: BytesLike): P256Point | null => {
  const bytes = bytesOf(data)
  if (bytes.length !== P256_SPKI_HEAD.length + 65) {
    return null
  }
  if (!P256_SPKI_HEAD.every((b, i) => bytes[i] === b) || bytes[P256_SPKI_HEAD.length] !== 0x04) {
    return null
  }
  const at = P256_SPKI_HEAD.length + 1
  return { x: bytesToHex(bytes.slice(at, at + 32)), y: bytesToHex(bytes.slice(at + 32, at + 64)) }
}

/** The point of an EC2 P-256 COSE key; null for any other key or a key that does not read. */
export const pointFromCoseKey = (data: BytesLike, at = 0): P256Point | null => {
  let key
  try {
    key = readCborItem(data, at).value
  } catch {
    return null
  }
  if (!(key instanceof Map)) {
    return null
  }
  const alg = key.get(COSE_KEY.alg)
  if (key.get(COSE_KEY.kty) !== COSE_KTY_EC2 || key.get(COSE_KEY.crv) !== COSE_CRV_P256) {
    return null
  }
  if (alg !== undefined && alg !== ES256) {
    return null
  }
  const x = key.get(COSE_KEY.x)
  const y = key.get(COSE_KEY.y)
  if (
    !(x instanceof Uint8Array) ||
    !(y instanceof Uint8Array) ||
    x.length !== 32 ||
    y.length !== 32
  ) {
    return null
  }
  return { x: bytesToHex(x), y: bytesToHex(y) }
}

/**
 * The credential's point in the attested credential data of an authenticator
 * data: rpIdHash (32), flags (1), counter (4), AAGUID (16), id length (2), id,
 * then the COSE key. Null where the data carries no such key.
 */
export const pointFromAuthenticatorData = (data: BytesLike): P256Point | null => {
  const bytes = bytesOf(data)
  if (bytes.length < 55 || (bytes[32]! & ATTESTED_CREDENTIAL_DATA) === 0) {
    return null
  }
  const idLength = (bytes[53]! << 8) | bytes[54]!
  return pointFromCoseKey(bytes, 55 + idLength)
}

/** The raw form WebCrypto imports a P-256 key from: `0x04 || x || y`. */
export const uncompressedPoint = ({ x, y }: P256Point): ArrayBuffer =>
  hexToArrayBuffer(concat(['0x04', x, y]))
