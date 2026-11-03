/**
 * The passkey device: the extension calls the authenticator itself,
 * `navigator.credentials.create` at enrollment and `navigator.credentials.get`
 * at a claim and at an access test, and hands the method the result.
 *
 * - The method's input names the relying party by the full origin string and
 *   carries the options for the browser under `options.publicKey`. The device
 *   accepts that origin string and nothing else, and hands the browser the
 *   origin's host as `rp.id` and `rpId`. The credential's rp id hash must
 *   equal `sha256("chrome-extension://<id>")`, never the hash of the bare id.
 *   A mismatch is reported before the method runs.
 * - The synced or device-bound kind comes from the ceremony's own flags.
 * - A high `s` is lowered before the method receives the assertion.
 * - A browser error is read before the method runs.
 *
 * The credentials container, the relying party, the clock and the randomness
 * are parameters, so a test runs the device with a mocked
 * `navigator.credentials` and a fabricated authenticator data.
 */
import { isBytesLike } from '@web/modules/social-recovery/shared/webauthn'

import type {
  AssertionResponseLike,
  AttestationResponseLike,
  DeviceCallContext,
  DeviceResult,
  NormalizedAssertion,
  PasskeyCeremonyDevice,
  PasskeyDeviceOptions,
  PasskeyEnrollInput,
  PasskeySigningInput,
  PublicKeyCredentialLike,
  RelyingParty,
  WebAuthnCall
} from './types'
import { dismissed, failed } from './verdicts'
import {
  authDataFromAttestationObject,
  CEREMONY_TIMEOUT_MS,
  normalizeDerSignature,
  passkeyFactsOf,
  readAuthenticatorData,
  stopOfCeremonyError,
  toBytes
} from './webauthn'

/** The relying party's display name the authenticator may show beside the rp id. */
export const RELYING_PARTY_NAME = 'Kohaku'

const ES256 = -7

const defaultRandomBytes = (length: number): Uint8Array =>
  globalThis.crypto.getRandomValues(new Uint8Array(length))

/** A copy of `bytes` as its own ArrayBuffer, the buffer type WebAuthn's options take. */
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

/**
 * Whether the method asked for the extension's own relying party: the full
 * origin string `chrome-extension://<id>` and nothing else. The bare id, an
 * empty string or no value is refused: the host hands the method that origin
 * string itself, so a method that names another value names a relying party
 * this extension does not serve.
 */
export const isOwnRelyingParty = (asked: string | undefined, rp: RelyingParty): boolean =>
  asked === rp.relyingPartyId

/**
 * Whether the method's input names the extension's own relying party, as its
 * relying party id and, where its options name one, inside the options.
 */
const asksOwnRelyingParty = (
  relyingPartyId: string | undefined,
  inOptions: string | undefined,
  rp: RelyingParty
): boolean =>
  isOwnRelyingParty(relyingPartyId, rp) &&
  (inOptions === undefined || isOwnRelyingParty(inOptions, rp))

/**
 * The options `navigator.credentials.create` takes, from the method's options.
 * The method names the relying party by its origin string, the browser by the
 * host: the host replaces the id and keeps every other member the method set.
 * The challenge and the user id are the device's own random bytes: the
 * method's are a fixed challenge and an id derived from the user name, so two
 * passkeys of one name would replace each other on one authenticator. The
 * hand-off asks for a cross-platform authenticator over the hybrid route.
 */
export const creationOptionsFrom = (
  asked: Partial<PublicKeyCredentialCreationOptions>,
  rp: RelyingParty,
  settings: { handOff?: boolean; timeoutMs: number; challenge: Uint8Array; userId: Uint8Array }
): PublicKeyCredentialCreationOptions => {
  const name = asked.user?.name || RELYING_PARTY_NAME
  const options: PublicKeyCredentialCreationOptions & { hints?: string[] } = {
    ...asked,
    rp: { id: rp.rpId, name: RELYING_PARTY_NAME },
    user: {
      id: toArrayBuffer(settings.userId),
      name,
      displayName: asked.user?.displayName || name
    },
    challenge: toArrayBuffer(settings.challenge),
    pubKeyCredParams: asked.pubKeyCredParams?.length
      ? asked.pubKeyCredParams
      : [{ type: 'public-key', alg: ES256 }],
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
      ...asked.authenticatorSelection,
      ...(settings.handOff ? { authenticatorAttachment: 'cross-platform' } : {})
    },
    attestation: asked.attestation ?? 'none',
    timeout: settings.timeoutMs,
    ...(settings.handOff ? { hints: ['hybrid'] } : {})
  }
  return options
}

/**
 * The options `navigator.credentials.get` takes, from the method's options:
 * the method's challenge and credentials, under the origin's host as `rpId`.
 */
export const requestOptionsFrom = (
  asked: Partial<PublicKeyCredentialRequestOptions> & { challenge: BufferSource },
  rp: RelyingParty,
  settings: { handOff?: boolean; timeoutMs: number }
): PublicKeyCredentialRequestOptions => {
  const options: PublicKeyCredentialRequestOptions & { hints?: string[] } = {
    ...asked,
    challenge: toArrayBuffer(toBytes(asked.challenge)),
    rpId: rp.rpId,
    userVerification: asked.userVerification ?? 'required',
    timeout: settings.timeoutMs,
    ...(settings.handOff ? { hints: ['hybrid'] } : {})
  }
  return options
}

const enrollmentAuthData = (response: AttestationResponseLike): Uint8Array | null => {
  if (typeof response.getAuthenticatorData === 'function') {
    return toBytes(response.getAuthenticatorData())
  }
  return response.attestationObject
    ? authDataFromAttestationObject(response.attestationObject)
    : null
}

/** The passkey device over a credentials container and a relying party. */
export const createPasskeyDevice = ({
  credentials,
  relyingParty,
  timeoutMs = CEREMONY_TIMEOUT_MS,
  now = () => Date.now(),
  randomBytes = defaultRandomBytes
}: PasskeyDeviceOptions): PasskeyCeremonyDevice => {
  const run = async (
    context: DeviceCallContext,
    webAuthnCall: WebAuthnCall,
    call: () => Promise<Credential | null>,
    read: (credential: PublicKeyCredentialLike) => DeviceResult
  ): Promise<DeviceResult> => {
    if (context.signal?.aborted) {
      return { ok: false, stop: dismissed('cancelled', 'AbortError') }
    }
    context.onStep?.(context.handOff ? 'waitingForPhone' : 'waitingForDevice')
    const startedAt = now()
    let credential: Credential | null
    try {
      credential = await call()
    } catch (error) {
      return {
        ok: false,
        stop: stopOfCeremonyError(error, {
          call: webAuthnCall,
          lifecycle: context.call,
          handOff: context.handOff,
          elapsedMs: now() - startedAt,
          timeoutMs
        })
      }
    }
    if (!credential) {
      return { ok: false, stop: dismissed('cancelled') }
    }
    if (context.signal?.aborted) {
      return { ok: false, stop: dismissed('cancelled', 'AbortError') }
    }
    try {
      return read(credential as unknown as PublicKeyCredentialLike)
    } catch (error) {
      return {
        ok: false,
        stop: failed('material-rejected')
      }
    }
  }

  return {
    relyingParty,

    async enroll(input: unknown, context: DeviceCallContext): Promise<DeviceResult> {
      const asked = input as PasskeyEnrollInput | undefined
      const options = asked?.options?.publicKey
      if (!asksOwnRelyingParty(asked?.relyingPartyId, options?.rp?.id, relyingParty)) {
        return { ok: false, stop: failed('relying-party-mismatch') }
      }
      if (asked?.kind !== 'ceremony' || !options) {
        return { ok: false, stop: failed('material-rejected') }
      }
      const publicKey = creationOptionsFrom(options, relyingParty, {
        handOff: context.handOff,
        timeoutMs,
        challenge: randomBytes(32),
        userId: randomBytes(16)
      })
      return run(
        context,
        'create',
        () => credentials.create({ publicKey, signal: context.signal }),
        (credential) => {
          const response = credential.response as AttestationResponseLike
          const authData = enrollmentAuthData(response)
          if (!authData) {
            throw new Error('The credential carries no authenticator data.')
          }
          if (readAuthenticatorData(authData).rpIdHash !== relyingParty.rpIdHash) {
            return { ok: false, stop: failed('relying-party-mismatch') }
          }
          const facts = passkeyFactsOf({
            authenticatorData: authData,
            authenticatorAttachment: credential.authenticatorAttachment,
            transports: typeof response.getTransports === 'function' ? response.getTransports() : []
          })
          return { ok: true, material: { credential }, facts, credentialId: credential.id }
        }
      )
    },

    async sign(input: unknown, context: DeviceCallContext): Promise<DeviceResult> {
      const asked = input as PasskeySigningInput | undefined
      const options = asked?.options?.publicKey
      const challenge = options?.challenge
      if (!options || !isBytesLike(challenge)) {
        return { ok: false, stop: failed('material-rejected') }
      }
      if (!asksOwnRelyingParty(asked?.relyingPartyId, options.rpId, relyingParty)) {
        return { ok: false, stop: failed('relying-party-mismatch') }
      }
      const publicKey = requestOptionsFrom({ ...options, challenge }, relyingParty, {
        handOff: context.handOff,
        timeoutMs
      })
      return run(
        context,
        'get',
        () => credentials.get({ publicKey, signal: context.signal }),
        (credential) => {
          const response = credential.response as AssertionResponseLike
          const authData = toBytes(response.authenticatorData)
          if (readAuthenticatorData(authData).rpIdHash !== relyingParty.rpIdHash) {
            return { ok: false, stop: failed('relying-party-mismatch') }
          }
          const { signature, normalized } = normalizeDerSignature(response.signature)
          const assertion: NormalizedAssertion = {
            id: credential.id,
            rawId: credential.rawId,
            type: credential.type,
            authenticatorAttachment: credential.authenticatorAttachment ?? null,
            response: {
              authenticatorData: response.authenticatorData,
              clientDataJSON: response.clientDataJSON,
              signature: toArrayBuffer(signature),
              userHandle: response.userHandle ?? null
            },
            signatureNormalized: normalized,
            getClientExtensionResults: () => credential.getClientExtensionResults?.() ?? {}
          }
          const facts = passkeyFactsOf({
            authenticatorData: authData,
            authenticatorAttachment: credential.authenticatorAttachment
          })
          return { ok: true, material: { assertion }, facts, credentialId: credential.id }
        }
      )
    }
  }
}
