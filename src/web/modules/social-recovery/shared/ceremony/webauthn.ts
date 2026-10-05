/**
 * The pure half of the passkey ceremony: the relying party, the flags of the
 * authenticator data, the synced or device-bound kind, the high-s rule of a
 * P-256 signature and the reading of the browser's own errors.
 *
 * Nothing here touches `navigator`, `window` or storage, so every function
 * runs under Jest's node environment.
 */
/* eslint-disable no-bitwise -- byte handling of the authenticator data and of DER */
import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'
import { bytesToHex, numberToBytes, sha256, stringToBytes } from 'viem'

import type {
  AuthenticatorData,
  AuthenticatorFlags,
  AuthenticatorPlace,
  CeremonyCall,
  CeremonyStop,
  PasskeyFacts,
  PasskeyKind,
  RelyingParty,
  WebAuthnCall
} from './types'
import { dismissed, failed, isBrowserErrorName, messageOf, unavailable } from './verdicts'

// ---------------------------------------------------------------------------
// The relying party
// ---------------------------------------------------------------------------

/** The hash the config commits: sha256 of the full origin string, never of the bare id. */
export const rpIdHashOf = (origin: string): Hex => sha256(stringToBytes(origin))

/**
 * The relying party of the page at `location`, read at runtime, so the code
 * fixes no extension id. A `location` whose protocol is not an extension
 * scheme yields the same shape over its own origin, which is what the web dev
 * build and a test see.
 */
export const relyingPartyOf = (location: { protocol: string; host: string }): RelyingParty => {
  const relyingPartyId = `${location.protocol}//${location.host}`
  return { rpId: location.host, relyingPartyId, rpIdHash: rpIdHashOf(relyingPartyId) }
}

/** Whether the page runs from a Chromium extension origin, the one origin passkeys serve. */
export const isExtensionOrigin = (location: { protocol: string }): boolean =>
  location.protocol === 'chrome-extension:'

// ---------------------------------------------------------------------------
// The authenticator data
// ---------------------------------------------------------------------------

/** The flag bits of the authenticator data (WebAuthn Level 3, §6.1). */
export const AUTHENTICATOR_FLAGS = {
  userPresent: 0x01,
  userVerified: 0x04,
  backupEligible: 0x08,
  backedUp: 0x10,
  attestedCredentialData: 0x40,
  extensionData: 0x80
} as const

const toBytes = (data: ArrayBuffer | ArrayBufferView): Uint8Array =>
  data instanceof Uint8Array
    ? data
    : ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data)

const formatAaguid = (bytes: Uint8Array): string => {
  const hex = bytesToHex(bytes).slice(2)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`
}

/** Reads the rp id hash, the flags, the counter and the AAGUID of an authenticator data. */
export const readAuthenticatorData = (data: ArrayBuffer | ArrayBufferView): AuthenticatorData => {
  const bytes = toBytes(data)
  if (bytes.length < 37) throw new Error('The authenticator data is shorter than 37 bytes.')
  const flagsByte = bytes[32]
  const flags: AuthenticatorFlags = {
    userPresent: (flagsByte & AUTHENTICATOR_FLAGS.userPresent) !== 0,
    userVerified: (flagsByte & AUTHENTICATOR_FLAGS.userVerified) !== 0,
    backupEligible: (flagsByte & AUTHENTICATOR_FLAGS.backupEligible) !== 0,
    backedUp: (flagsByte & AUTHENTICATOR_FLAGS.backedUp) !== 0,
    attestedCredentialData: (flagsByte & AUTHENTICATOR_FLAGS.attestedCredentialData) !== 0,
    extensionData: (flagsByte & AUTHENTICATOR_FLAGS.extensionData) !== 0
  }
  const signCount = ((bytes[33] << 24) | (bytes[34] << 16) | (bytes[35] << 8) | bytes[36]) >>> 0
  const aaguid =
    flags.attestedCredentialData && bytes.length >= 53
      ? formatAaguid(bytes.slice(37, 53))
      : undefined
  return {
    rpIdHash: bytesToHex(bytes.slice(0, 32)),
    flags,
    signCount,
    ...(aaguid ? { aaguid } : {})
  }
}

/**
 * The authenticator data inside a CBOR attestation object, for a browser whose
 * attestation response carries no `getAuthenticatorData()`. It reads the byte
 * string under the text key `authData`, the one layout attestation `none`
 * produces, and returns null where it finds none.
 */
export const authDataFromAttestationObject = (
  attestationObject: ArrayBuffer | ArrayBufferView
): Uint8Array | null => {
  const bytes = toBytes(attestationObject)
  // CBOR text string of length 8 (0x68) followed by "authData".
  const key = [0x68, ...Array.from(stringToBytes('authData'))]
  for (let i = 0; i + key.length < bytes.length; i++) {
    if (key.every((b, j) => bytes[i + j] === b)) {
      let at = i + key.length
      const head = bytes[at]
      const major = head >> 5
      const info = head & 0x1f
      if (major !== 2) return null
      at += 1
      let length: number
      if (info < 24) length = info
      else if (info === 24) {
        length = bytes[at]
        at += 1
      } else if (info === 25) {
        length = (bytes[at] << 8) | bytes[at + 1]
        at += 2
      } else if (info === 26) {
        length =
          ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
        at += 4
      } else return null
      if (at + length > bytes.length) return null
      return bytes.slice(at, at + length)
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// The kind: synced or device-bound
// ---------------------------------------------------------------------------

/** The two kinds a passkey row names, read from the ceremony's own flags. */
export const PASSKEY_KINDS = ['synced', 'device-bound'] as const

/** Where the authenticator sat, read from the attachment and the transports. */
export const AUTHENTICATOR_PLACES = ['this-device', 'phone', 'security-key', 'unknown'] as const

/**
 * The kind of a credential from its flags: backup eligible (BE) is a
 * multi-device credential, synced; otherwise device-bound. A BS bit without BE
 * breaks WebAuthn §6.1.3 and reads device-bound, since only BE promises a copy
 * outside this authenticator.
 */
export const passkeyKindOf = (flags: Pick<AuthenticatorFlags, 'backupEligible'>): PasskeyKind =>
  flags.backupEligible ? 'synced' : 'device-bound'

/**
 * Where the authenticator sat: a platform attachment is this device; a
 * cross-platform one over the hybrid transport is a phone; over USB, NFC or
 * BLE alone it is a security key.
 */
export const authenticatorPlaceOf = (
  attachment: string | null | undefined,
  transports: readonly string[] = []
): AuthenticatorPlace => {
  if (attachment === 'platform') return 'this-device'
  if (transports.includes('hybrid')) return 'phone'
  if (attachment === 'cross-platform' || transports.some((t) => ['usb', 'nfc', 'ble'].includes(t)))
    return 'security-key'
  if (transports.includes('internal')) return 'this-device'
  return 'unknown'
}

/** The facts of one ceremony from its authenticator data, attachment and transports. */
export const passkeyFactsOf = (input: {
  authenticatorData: ArrayBuffer | ArrayBufferView
  authenticatorAttachment?: string | null
  transports?: readonly string[]
}): PasskeyFacts => {
  const data = readAuthenticatorData(input.authenticatorData)
  const transports = [...(input.transports ?? [])]
  const attachment =
    input.authenticatorAttachment === 'platform' ||
    input.authenticatorAttachment === 'cross-platform'
      ? input.authenticatorAttachment
      : null
  return {
    kind: passkeyKindOf(data.flags),
    backedUp: data.flags.backedUp,
    place: authenticatorPlaceOf(attachment, transports),
    attachment,
    transports,
    ...(data.aaguid ? { aaguid: data.aaguid } : {})
  }
}

// ---------------------------------------------------------------------------
// The high-s rule
// ---------------------------------------------------------------------------

/** The order `n` of the P-256 curve. */
export const P256_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551')

/** Half the order: an `s` above it is high. */
export const P256_HALF_N = P256_N / BigInt(2)

/** The low form of `s`: `n - s` where `s > n/2`, `s` itself otherwise. */
export const normalizeP256S = (s: bigint): bigint => (s > P256_HALF_N ? P256_N - s : s)

export const isHighS = (s: bigint): boolean => s > P256_HALF_N

const readDerLength = (bytes: Uint8Array, at: number): { length: number; next: number } => {
  const first = bytes[at]
  if (first === undefined) throw new Error('The DER signature ends early.')
  if (first < 0x80) return { length: first, next: at + 1 }
  const count = first & 0x7f
  if (count < 1 || count > 2) throw new Error('The DER signature has an unsupported length.')
  let length = 0
  for (let i = 0; i < count; i++) {
    const b = bytes[at + 1 + i]
    if (b === undefined) throw new Error('The DER signature ends early.')
    length = (length << 8) | b
  }
  return { length, next: at + 1 + count }
}

const readDerInteger = (bytes: Uint8Array, at: number): { value: bigint; next: number } => {
  if (bytes[at] !== 0x02) throw new Error('The DER signature holds no integer where one belongs.')
  const { length, next } = readDerLength(bytes, at + 1)
  if (length === 0 || next + length > bytes.length)
    throw new Error('The DER signature holds a malformed integer.')
  const value = BigInt(bytesToHex(bytes.slice(next, next + length)))
  return { value, next: next + length }
}

/** The `r` and `s` of an ECDSA signature in DER, the form an authenticator returns. */
export const parseDerSignature = (der: ArrayBuffer | ArrayBufferView): { r: bigint; s: bigint } => {
  const bytes = toBytes(der)
  if (bytes[0] !== 0x30) throw new Error('The signature is not a DER sequence.')
  const { length, next } = readDerLength(bytes, 1)
  if (next + length !== bytes.length) throw new Error('The DER sequence length does not match.')
  const r = readDerInteger(bytes, next)
  const s = readDerInteger(bytes, r.next)
  if (s.next !== bytes.length) throw new Error('The DER signature carries trailing bytes.')
  return { r: r.value, s: s.value }
}

const derInteger = (value: bigint): number[] => {
  if (value < BigInt(0)) throw new Error('A DER integer of a signature is never negative.')
  const body = Array.from(numberToBytes(value))
  // A leading byte with its top bit set would read negative: prefix a zero.
  if (body[0] >= 0x80) body.unshift(0)
  return [0x02, body.length, ...body]
}

/** The DER encoding of `(r, s)`. */
export const encodeDerSignature = ({ r, s }: { r: bigint; s: bigint }): Uint8Array => {
  const content = [...derInteger(r), ...derInteger(s)]
  const length = content.length < 0x80 ? [content.length] : [0x81, content.length]
  return Uint8Array.from([0x30, ...length, ...content])
}

/**
 * The signature the method receives: a high `s` becomes `n - s` and the DER is
 * re-encoded; a low `s` returns the same bytes unchanged. Google Password
 * Manager can return a high `s`, and the verifier rejects one.
 */
export const normalizeDerSignature = (
  der: ArrayBuffer | ArrayBufferView
): { signature: Uint8Array; normalized: boolean } => {
  const bytes = toBytes(der)
  const { r, s } = parseDerSignature(bytes)
  if (!isHighS(s)) return { signature: bytes, normalized: false }
  return { signature: encodeDerSignature({ r, s: normalizeP256S(s) }), normalized: true }
}

// ---------------------------------------------------------------------------
// The browser's own errors
// ---------------------------------------------------------------------------

/**
 * How long a WebAuthn prompt waits, in milliseconds. A hand-off rejected at or
 * past this span is a phone that never connected rather than a dismissal.
 */
export const CEREMONY_TIMEOUT_MS = 180000

const errorName = (error: unknown): string | undefined =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { name?: unknown }).name === 'string'
    ? (error as { name: string }).name
    : undefined

/**
 * Reads an error the `navigator.credentials` call threw, before the method
 * runs. It returns the stop the host reports:
 *
 * - `NotAllowedError` at a test access (`get`): failed, with the browser's
 *   error name as its cause (`browser-error`), since the browser cannot tell a
 *   dismissed prompt from a missing credential. The row reads
 *   "Test failed · NotAllowedError".
 * - `NotAllowedError` at an enrollment (`create`) or a claim (`get`): the
 *   holder dismissed the prompt, the cancelled note; the browser refusing an
 *   unfocused page or a permission policy, the refused note.
 *
 * `lifecycle` names the lifecycle call that ran the prompt. Without it, `get`
 * reads as a test access.
 * - `NotAllowedError` at or past the timeout of a phone hand-off, at either
 *   call: unavailable with the unreachable cause (the phone never connected).
 * - `AbortError`: the holder's own abort, the cancelled note.
 * - `InvalidStateError`, `ConstraintError`, `NotSupportedError`: the
 *   authenticator cannot meet the request, the refused note.
 * - `SecurityError`: the browser or the provider refused the extension's
 *   relying party, failed with the relying-party mismatch.
 * - Any other error the browser names: failed with its name (`browser-error`).
 *   An error with no such name: failed, `thrown`, with no text a screen shows.
 */
export const stopOfCeremonyError = (
  error: unknown,
  context: {
    call?: WebAuthnCall
    lifecycle?: CeremonyCall
    handOff?: boolean
    elapsedMs?: number
    timeoutMs?: number
  } = {}
): CeremonyStop => {
  const name = errorName(error)
  const message = messageOf(error) ?? ''
  switch (name) {
    case 'NotAllowedError': {
      const timeoutMs = context.timeoutMs ?? CEREMONY_TIMEOUT_MS
      if (context.handOff && (context.elapsedMs ?? 0) >= timeoutMs) {
        return unavailable('unreachable', name)
      }
      const isTest = context.lifecycle ? context.lifecycle === 'testAccess' : context.call === 'get'
      if (isTest) return failed('browser-error', name)
      if (/focus|permissions? policy|feature policy/i.test(message)) {
        return dismissed('refused', name)
      }
      return dismissed('cancelled', name)
    }
    case 'AbortError':
      return dismissed('cancelled', name)
    case 'InvalidStateError':
    case 'ConstraintError':
    case 'NotSupportedError':
      return dismissed('refused', name)
    case 'SecurityError':
      return failed('relying-party-mismatch', name)
    default:
      return name && isBrowserErrorName(name) ? failed('browser-error', name) : failed('thrown')
  }
}

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

/** base64url without padding, the form a credential id travels in. */
export const toBase64Url = (data: ArrayBuffer | ArrayBufferView): string => {
  const bytes = toBytes(data)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The bytes of a base64url string, with or without padding. */
export const fromBase64Url = (text: string): Uint8Array => {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export { toBytes }
