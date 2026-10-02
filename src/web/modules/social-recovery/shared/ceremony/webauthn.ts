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
import { bytesOf } from '@web/modules/social-recovery/shared/webauthn'
import { bytesToHex, sha256, stringToBytes } from 'viem'

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

const formatAaguid = (bytes: Uint8Array): string => {
  const hex = bytesToHex(bytes).slice(2)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`
}

/** Reads the rp id hash, the flags, the counter and the AAGUID of an authenticator data. */
export const readAuthenticatorData = (data: ArrayBuffer | ArrayBufferView): AuthenticatorData => {
  const bytes = bytesOf(data)
  if (bytes.length < 37) {
    throw new Error('The authenticator data is shorter than 37 bytes.')
  }
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
  if (attachment === 'platform') {
    return 'this-device'
  }
  if (transports.includes('hybrid')) {
    return 'phone'
  }
  if (
    attachment === 'cross-platform' ||
    transports.some((t) => ['usb', 'nfc', 'ble'].includes(t))
  ) {
    return 'security-key'
  }
  if (transports.includes('internal')) {
    return 'this-device'
  }
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
      if (isTest) {
        return failed('browser-error', name)
      }
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

export {
  authDataFromAttestationObject,
  encodeDerSignature,
  fromBase64Url,
  isHighS,
  normalizeDerSignature,
  normalizeP256S,
  P256_HALF_N,
  P256_N,
  parseDerSignature,
  toBase64Url,
  bytesOf as toBytes
} from '@web/modules/social-recovery/shared/webauthn'
