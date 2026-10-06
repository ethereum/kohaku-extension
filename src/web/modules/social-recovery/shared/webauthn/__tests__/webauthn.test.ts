/* eslint-disable no-bitwise -- byte fixtures */
import {
  authDataFromAttestationObject,
  encodeDerSignature,
  fromBase64Url,
  isHighS,
  normalizeDerSignature,
  P256_N,
  parseDerSignature,
  pointFromAuthenticatorData,
  pointFromCoseKey,
  pointFromSpki,
  readCborItem,
  toBase64Url,
  uncompressedPoint
} from '@web/modules/social-recovery/shared/webauthn'
import { bytesToBigInt, bytesToHex, numberToBytes, sha256, stringToBytes } from 'viem'

const ECDSA_P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const
const ECDSA_SHA256 = { name: 'ECDSA', hash: 'SHA-256' } as const

const bytes = (...parts: (Uint8Array | number[])[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((p) => Array.from(p)))

const generated = async () => {
  const pair = (await crypto.subtle.generateKey(ECDSA_P256, true, [
    'sign',
    'verify'
  ])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))
  return { pair, raw, spki, x: raw.slice(1, 33), y: raw.slice(33, 65) }
}

/** An EC2 COSE key: kty, alg, crv, x, y; ES256 on P-256 by default. */
const coseKey = (x: Uint8Array, y: Uint8Array, { kty = 0x02, crv = 0x01, alg = 0x26 } = {}) =>
  bytes([0xa5, 0x01, kty, 0x03, alg, 0x20, crv, 0x21, 0x58, 0x20], x, [0x22, 0x58, 0x20], y)

const attestedAuthData = (cose: Uint8Array, flags = 0x45) => {
  const credentialId = Uint8Array.from([9, 8, 7, 6])
  return bytes(
    sha256(stringToBytes('wallet.example'), 'bytes'),
    [flags, 0, 0, 0, 1],
    new Uint8Array(16),
    [0, credentialId.length],
    credentialId,
    cose
  )
}

const text = (value: string) => {
  const encoded = stringToBytes(value)
  return bytes([0x60 + encoded.length], encoded)
}

describe('P-256 point readers', () => {
  it('reads the point of the SPKI WebCrypto exports for a generated key', async () => {
    const key = await generated()
    expect(pointFromSpki(key.spki)).toEqual({ x: bytesToHex(key.x), y: bytesToHex(key.y) })
  })

  it('refuses an SPKI of another length or another curve', async () => {
    const key = await generated()
    expect(pointFromSpki(key.spki.slice(0, -1))).toBeNull()
    const otherCurve = key.spki.slice()
    otherCurve[20] ^= 0xff
    expect(pointFromSpki(otherCurve)).toBeNull()
  })

  it('reads the point of an EC2 P-256 COSE key built from a generated key', async () => {
    const key = await generated()
    expect(pointFromCoseKey(coseKey(key.x, key.y))).toEqual({
      x: bytesToHex(key.x),
      y: bytesToHex(key.y)
    })
  })

  it('refuses a COSE key of another key type, curve or algorithm', async () => {
    const key = await generated()
    expect(pointFromCoseKey(coseKey(key.x, key.y, { kty: 0x03 }))).toBeNull()
    expect(pointFromCoseKey(coseKey(key.x, key.y, { crv: 0x02 }))).toBeNull()
    // alg -8, EdDSA.
    expect(pointFromCoseKey(coseKey(key.x, key.y, { alg: 0x27 }))).toBeNull()
  })

  it('refuses a COSE key that does not read as a CBOR map', () => {
    expect(pointFromCoseKey(Uint8Array.from([0xa5, 0x01]))).toBeNull()
    expect(pointFromCoseKey(Uint8Array.from([0x01]))).toBeNull()
  })

  it('reads the point from the attested credential data of authenticator data', async () => {
    const key = await generated()
    expect(pointFromAuthenticatorData(attestedAuthData(coseKey(key.x, key.y)))).toEqual({
      x: bytesToHex(key.x),
      y: bytesToHex(key.y)
    })
  })

  it('finds no point in authenticator data without attested credential data', async () => {
    const key = await generated()
    expect(pointFromAuthenticatorData(attestedAuthData(coseKey(key.x, key.y), 0x05))).toBeNull()
    expect(pointFromAuthenticatorData(new Uint8Array(37))).toBeNull()
  })

  it('gives WebCrypto a raw point it imports as the same key', async () => {
    const key = await generated()
    const point = pointFromSpki(key.spki)
    if (!point) {
      throw new Error('the SPKI did not read')
    }
    const imported = await crypto.subtle.importKey(
      'raw',
      uncompressedPoint(point),
      ECDSA_P256,
      true,
      ['verify']
    )
    expect(new Uint8Array(await crypto.subtle.exportKey('raw', imported))).toEqual(key.raw)
  })
})

describe('DER signatures', () => {
  it('round-trips an r and an s whose top bit is set', () => {
    const r = BigInt(`0x${'f0'.repeat(32)}`)
    const s = BigInt(`0x${'81'.repeat(32)}`)
    const der = encodeDerSignature({ r, s })
    // Each integer gains a leading zero byte, so it does not read as negative.
    expect(der.length).toBe(2 + 2 * (2 + 33))
    expect(parseDerSignature(der)).toEqual({ r, s })
  })

  it('encodes small integers in their shortest form', () => {
    const der = encodeDerSignature({ r: BigInt(1), s: BigInt(127) })
    expect(bytesToHex(der)).toBe('0x300602010102017f')
    expect(parseDerSignature(der)).toEqual({ r: BigInt(1), s: BigInt(127) })
  })

  it('refuses a signature that is no sequence, has a wrong length or trailing bytes', () => {
    const der = encodeDerSignature({ r: BigInt(5), s: BigInt(6) })
    expect(() => parseDerSignature(bytes([0x31], der.slice(1)))).toThrow()
    expect(() => parseDerSignature(bytes(der, [0x00]))).toThrow()
    expect(() => parseDerSignature(bytes([0x30, der[1]! + 1], der.slice(2), [0x00]))).toThrow()
    expect(() => parseDerSignature(new Uint8Array(0))).toThrow()
  })

  it('lowers a high s to n - s and marks the signature normalized', () => {
    const r = BigInt(7)
    const s = P256_N - BigInt(5)
    expect(isHighS(s)).toBe(true)
    const { signature, normalized } = normalizeDerSignature(encodeDerSignature({ r, s }))
    expect(normalized).toBe(true)
    expect(parseDerSignature(signature)).toEqual({ r, s: BigInt(5) })
  })

  it('returns a low s in the same bytes', () => {
    const der = encodeDerSignature({ r: BigInt(7), s: BigInt(5) })
    const { signature, normalized } = normalizeDerSignature(der)
    expect(normalized).toBe(false)
    expect(bytesToHex(signature)).toBe(bytesToHex(der))
  })

  it('keeps a real signature valid through DER and the low-s rule', async () => {
    const key = await generated()
    const message = Uint8Array.from(stringToBytes('the signed bytes')).buffer
    const raw = new Uint8Array(await crypto.subtle.sign(ECDSA_SHA256, key.pair.privateKey, message))
    const r = bytesToBigInt(raw.slice(0, 32))
    const s = bytesToBigInt(raw.slice(32))
    // Start from the high form, the one some authenticators return.
    const high = isHighS(s) ? s : P256_N - s
    const { signature } = normalizeDerSignature(encodeDerSignature({ r, s: high }))
    const parts = parseDerSignature(signature)
    expect(isHighS(parts.s)).toBe(false)
    const lowRaw = bytes(numberToBytes(parts.r, { size: 32 }), numberToBytes(parts.s, { size: 32 }))
    await expect(
      crypto.subtle.verify(ECDSA_SHA256, key.pair.publicKey, lowRaw.buffer as ArrayBuffer, message)
    ).resolves.toBe(true)
  })
})

describe('the CBOR reader', () => {
  it('reads a small map of integers, negative integers, byte and text strings', () => {
    const map = bytes(
      [0xa4],
      [0x01, 0x02],
      [0x03, 0x26],
      [0x21, 0x42, 0xca, 0xfe],
      text('fmt'),
      text('none')
    )
    const { value, next } = readCborItem(map)
    expect(next).toBe(map.length)
    expect(value).toEqual(
      new Map<number | string, unknown>([
        [1, 2],
        [3, -7],
        [-2, Uint8Array.from([0xca, 0xfe])],
        ['fmt', 'none']
      ])
    )
  })

  it('reads one- and two-byte arguments and an item at an offset', () => {
    expect(readCborItem(Uint8Array.from([0x00, 0x18, 0xc8]), 1)).toEqual({ value: 200, next: 3 })
    expect(readCborItem(Uint8Array.from([0x39, 0x01, 0x00])).value).toBe(-257)
  })

  it('refuses data that ends early and items it does not take', () => {
    expect(() => readCborItem(new Uint8Array(0))).toThrow()
    expect(() => readCborItem(Uint8Array.from([0x44, 0x01]))).toThrow()
    // An array, major type 4.
    expect(() => readCborItem(Uint8Array.from([0x81, 0x01]))).toThrow()
  })

  it('finds the authenticator data inside an attestation object', async () => {
    const key = await generated()
    const authData = attestedAuthData(coseKey(key.x, key.y))
    const object = bytes(
      [0xa3],
      text('fmt'),
      text('none'),
      text('attStmt'),
      [0xa0],
      text('authData'),
      [0x59, authData.length >> 8, authData.length & 0xff],
      authData
    )
    expect(authDataFromAttestationObject(object)).toEqual(authData)
    expect(authDataFromAttestationObject(bytes([0xa1], text('fmt'), text('none')))).toBeNull()
  })
})

describe('base64url', () => {
  it('round-trips bytes without padding', () => {
    const data = Uint8Array.from([0xfb, 0xff, 0xfe, 0x01])
    const encoded = toBase64Url(data)
    expect(encoded).toBe('-__-AQ')
    expect(fromBase64Url(encoded)).toEqual(data)
  })
})
