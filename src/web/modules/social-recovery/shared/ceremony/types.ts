import type { Storage } from '@ambire-common/interfaces/storage'
import type {
  Address,
  ApproverReply,
  ApproverRequest,
  DeviceBinding,
  Hex,
  IMethodsOrchestrator,
  IRecoveryMethod,
  MethodFailureCause
} from '@web/modules/social-recovery/sdk-interfaces'
import type { CollectionChip, MethodChip } from '@web/modules/social-recovery/shared/display'

import type { CEREMONY_STEPS } from './device'
import type { PASSKEY_DEVICES, PASSKEY_PROVIDERS, PLATFORMS } from './kindLine'
import type { CEREMONY_CALLS, CEREMONY_VERDICTS, DISMISSAL_NOTES, HOST_CAUSES } from './verdicts'
import type { AUTHENTICATOR_PLACES, PASSKEY_KINDS } from './webauthn'

// ---------------------------------------------------------------------------
// The verdicts
// ---------------------------------------------------------------------------

export type CeremonyCall = typeof CEREMONY_CALLS[number]
export type CeremonyVerdict = typeof CEREMONY_VERDICTS[number]
export type DismissalNote = typeof DISMISSAL_NOTES[number]
export type HostCause = typeof HOST_CAUSES[number]
export type CeremonyCause = MethodFailureCause | HostCause

export type PassedOutcome<T> = { kind: 'verdict'; verdict: 'passed'; retry: false; value: T }
export type FailedOutcome = {
  kind: 'verdict'
  verdict: 'failed'
  retry: true
  cause: CeremonyCause
  detail?: string
}
export type UnavailableOutcome = {
  kind: 'verdict'
  verdict: 'unavailable'
  retry: true
  cause: CeremonyCause
  detail?: string
}
export type NotSupportedOutcome = {
  kind: 'verdict'
  verdict: 'notSupported'
  retry: false
  cause: CeremonyCause
}
export type DismissedOutcome = { kind: 'dismissed'; note: DismissalNote; detail?: string }

/** What every host returns: exactly one of the four verdicts, or the dismissal. */
export type CeremonyOutcome<T = unknown> =
  | PassedOutcome<T>
  | FailedOutcome
  | UnavailableOutcome
  | NotSupportedOutcome
  | DismissedOutcome

/** Every outcome but passed, the shape a host returns before it has a value. */
export type CeremonyStop = Exclude<CeremonyOutcome<never>, PassedOutcome<never>>

/** A chip a row shows: a method chip in setup, a collection chip on the checklist. */
export type RowChip =
  | { set: 'method'; chip: MethodChip }
  | { set: 'collection'; chip: CollectionChip }

// ---------------------------------------------------------------------------
// The passkey ceremony
// ---------------------------------------------------------------------------

/**
 * The extension's relying party, three values from one origin.
 *
 * - `rpId`: the origin's host, the extension id. The value `rp.id` and `rpId`
 *   take in the `navigator.credentials` calls.
 * - `relyingPartyId`: the full origin string `chrome-extension://<id>`. The
 *   value the wallet hands the SDK as the relying party id.
 * - `rpIdHash`: `sha256(relyingPartyId)`, the hash the passkey config commits
 *   and the hash Chromium writes into the authenticator data of an extension
 *   origin. Never the hash of the bare id.
 */
export interface RelyingParty {
  rpId: string
  relyingPartyId: string
  rpIdHash: Hex
}

export interface AuthenticatorFlags {
  userPresent: boolean
  userVerified: boolean
  /** BE: the credential may be backed up, a multi-device (synced) credential. */
  backupEligible: boolean
  /** BS: the credential is backed up now. */
  backedUp: boolean
  attestedCredentialData: boolean
  extensionData: boolean
}

export interface AuthenticatorData {
  rpIdHash: Hex
  flags: AuthenticatorFlags
  signCount: number
  /** The authenticator's AAGUID where the data carries attested credential data. */
  aaguid?: string
}

export type PasskeyKind = typeof PASSKEY_KINDS[number]
export type AuthenticatorPlace = typeof AUTHENTICATOR_PLACES[number]

/**
 * What the ceremony itself reports about the credential. The kind comes from
 * the backup flags alone and never from the operating system.
 * The place names where the authenticator sat, for the row's `{{device}}`.
 */
export interface PasskeyFacts {
  kind: PasskeyKind
  backedUp: boolean
  place: AuthenticatorPlace
  attachment: 'platform' | 'cross-platform' | null
  transports: string[]
  aaguid?: string
}

/** The two WebAuthn calls: `create` at enrollment, `get` at a test or a claim. */
export type WebAuthnCall = 'create' | 'get'

// ---------------------------------------------------------------------------
// The kind line
// ---------------------------------------------------------------------------

export type PasskeyProvider = typeof PASSKEY_PROVIDERS[number]
export type PasskeyDevice = typeof PASSKEY_DEVICES[number]
export type Platform = typeof PLATFORMS[number]

/** One kind line: its key, and the key of the name it interpolates. */
export type KindLine =
  | { key: 'socialRecovery.ceremony.syncedKind'; param: 'provider'; nameKey: string }
  | { key: 'socialRecovery.ceremony.deviceBoundKind'; param: 'device'; nameKey: string }

// ---------------------------------------------------------------------------
// The visibility gate
// ---------------------------------------------------------------------------

/** The part of `document` the gate reads. */
export interface VisibilitySource {
  readonly visibilityState: string
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

export interface VisibilityGate {
  /**
   * Runs `dispatch` now where the source is visible, or holds it until the
   * source turns visible. Held dispatches run in the order they arrived.
   */
  dispatch<T>(dispatch: () => T | Promise<T>): Promise<T>
  /** How many dispatches wait for the tab to be shown. */
  pending(): number
  /** Drops the listener. Held dispatches never run and their promises reject. */
  dispose(): void
}

/** A dispatch the gate holds while the tab is hidden. */
export type Held = { run: () => void; drop: (reason: Error) => void }

// ---------------------------------------------------------------------------
// The device call
// ---------------------------------------------------------------------------

export type CeremonyStep = typeof CEREMONY_STEPS[number]

export interface DeviceCallContext {
  /** Aborts the device call; an aborted call is the cancelled note. */
  signal?: AbortSignal
  /** The holder chose the browser's phone hand-off. */
  handOff?: boolean
  /** The lifecycle call the device serves; a test and a claim read a dismissal apart. */
  call?: CeremonyCall
  onStep?: (step: CeremonyStep) => void
}

export type DeviceResult =
  | {
      ok: true
      material: unknown
      /** The ceremony's own facts, a passkey's kind among them. */
      facts?: PasskeyFacts
      /** The credential id, base64url, where the ceremony minted or used one. */
      credentialId?: string
    }
  | { ok: false; stop: CeremonyStop }

export interface CeremonyDevice {
  /** The enrollment ceremony: `input` is what the method's `enrollInput` returned. */
  enroll(input: unknown, context: DeviceCallContext): Promise<DeviceResult>
  /** The signing ceremony: `input` is what the method's `signingInput` returned. */
  sign(input: unknown, context: DeviceCallContext): Promise<DeviceResult>
}

// ---------------------------------------------------------------------------
// The passkey device
// ---------------------------------------------------------------------------

/**
 * The page's own passkey device: a device that carries the relying party it
 * was built over, so a host hands the method that relying party's origin
 * string and never one a caller chose.
 */
export interface PasskeyCeremonyDevice extends CeremonyDevice {
  readonly relyingParty: RelyingParty
}

/** The part of `navigator.credentials` the device calls. */
export interface CredentialsLike {
  create(options: CredentialCreationOptions): Promise<Credential | null>
  get(options: CredentialRequestOptions): Promise<Credential | null>
}

export interface PasskeyDeviceOptions {
  credentials: CredentialsLike
  relyingParty: RelyingParty
  timeoutMs?: number
  now?: () => number
  randomBytes?: (length: number) => Uint8Array
}

/** The creation options a passkey method's `enrollInput` returns. */
export interface PasskeyEnrollInput {
  rp?: { id?: string; name?: string }
  user?: { id?: string; name?: string; displayName?: string }
  pubKeyCredParams?: { type: 'public-key'; alg: number }[]
  authenticatorSelection?: AuthenticatorSelectionCriteria
  attestation?: AttestationConveyancePreference
  excludeCredentials?: { type?: 'public-key'; id: string }[]
  challenge?: string
}

/** The request options a passkey method's `signingInput` returns. */
export interface PasskeySigningInput {
  challenge: Hex | string
  rpId?: string
  userVerification?: UserVerificationRequirement
  allowCredentials?: { type?: 'public-key'; id: string }[]
}

/**
 * The assertion the method receives: the browser's `PublicKeyCredential` copied
 * field by field, with `response.signature` in the low-s form.
 */
export interface NormalizedAssertion {
  id: string
  rawId: ArrayBuffer
  type: string
  authenticatorAttachment: string | null
  response: {
    authenticatorData: ArrayBuffer
    clientDataJSON: ArrayBuffer
    signature: ArrayBuffer
    userHandle: ArrayBuffer | null
  }
  /** Whether the device lowered a high `s`. */
  signatureNormalized: boolean
  getClientExtensionResults(): AuthenticationExtensionsClientOutputs
}

export type AttestationResponseLike = {
  attestationObject?: ArrayBuffer
  getAuthenticatorData?: () => ArrayBuffer
  getTransports?: () => string[]
}

export type AssertionResponseLike = {
  authenticatorData: ArrayBuffer
  clientDataJSON: ArrayBuffer
  signature: ArrayBuffer
  userHandle?: ArrayBuffer | null
}

export type PublicKeyCredentialLike = {
  id: string
  rawId: ArrayBuffer
  type: string
  authenticatorAttachment?: string | null
  response: unknown
  getClientExtensionResults?: () => AuthenticationExtensionsClientOutputs
}

// ---------------------------------------------------------------------------
// The hosts
// ---------------------------------------------------------------------------

/**
 * The page's own devices by binding. The `browser-authenticator` slot holds
 * the page's own passkey device, which carries the relying party it was built
 * over.
 */
export type PageDevices = Partial<
  Record<Exclude<DeviceBinding, 'browser-authenticator'>, CeremonyDevice>
> & { 'browser-authenticator'?: PasskeyCeremonyDevice }

export interface HostContext {
  orchestrator: IMethodsOrchestrator
  /** The implementation, read for its `deviceBinding`. */
  method: IRecoveryMethod
  /**
   * The device a caller's record supplies, for a method whose material the
   * caller already holds (a guardian's address or signature, a zkPassport
   * result, an Aadhaar QR). Never used for the `browser-authenticator` binding.
   */
  device?: CeremonyDevice
  /**
   * The page's own devices by binding. A `browser-authenticator` method always
   * runs the page's own passkey device from here, so the rp id hash check and
   * the high-s normalization always run; where it is absent the host reports
   * not supported.
   */
  devices?: PageDevices
  /** The holder chose the browser's phone hand-off. */
  handOff?: boolean
  signal?: AbortSignal
  onStep?: (step: CeremonyStep) => void
}

/**
 * What a passed enrollment carries: the config bytes, the ceremony's own facts
 * (the synced or device-bound kind) and the credential id a later test or
 * claim names in `allowCredentials`.
 */
export interface EnrollValue {
  config: Hex
  facts?: PasskeyFacts
  credentialId?: string
}

/** What a passed access test carries: the proof the local check satisfied. */
export interface TestAccessValue {
  proof: Hex
  facts?: PasskeyFacts
}

/** What a passed claim carries: the reply for one place. */
export interface ClaimValue {
  reply: ApproverReply
  facts?: PasskeyFacts
}

/** What a passed call carries: an enrollment's config, a test's proof or a claim's reply. */
export type CeremonyValue = EnrollValue | TestAccessValue | ClaimValue

/** The device a call runs and the params the method receives. */
export type DeviceChoice = { device: CeremonyDevice; params: unknown }

/** The signing half's answer: the reply, or the outcome that ends the call. */
export type SignedReply =
  | { ok: true; reply: ApproverReply; facts?: PasskeyFacts }
  | { ok: false; outcome: CeremonyOutcome<never> }

// ---------------------------------------------------------------------------
// The tab's route
// ---------------------------------------------------------------------------

export interface CeremonyParams {
  call: CeremonyCall
  method: string
  id: string
  handOff: boolean
  returnTo?: string
}

export type ParsedCeremony =
  | { ok: true; params: CeremonyParams }
  | { ok: false; reason: 'call' | 'method' | 'id' | 'returnTo' }

// ---------------------------------------------------------------------------
// The return channel
// ---------------------------------------------------------------------------

/** One ceremony's outcome as the caller reads it. */
export interface CeremonyReport<T = unknown> {
  id: string
  call: CeremonyCall
  method: string
  outcome: CeremonyOutcome<T>
  reportedAt: number
  /** `reportedAt` plus `CEREMONY_REPORT_TTL_MS`: no reader delivers the report after it. */
  expiresAt: number
}

/** What a caller expects a report to be for. */
export type ReportIdentity = Pick<CeremonyParams, 'id' | 'call' | 'method'>

/**
 * The extension's storage as the channel uses it: its own `set` and `remove`,
 * and a `get` that reads one key, never the whole store.
 */
export type ReportStore = Pick<Storage, 'set' | 'remove'> & {
  get(key: string, defaultValue?: unknown): Promise<unknown>
}

/** Subscribes to changes of one storage key, parsed; returns the unsubscribe. */
export type ReportSubscribe = (key: string, onValue: (value: unknown) => void) => () => void

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * What the caller's record resolves to: the injected orchestrator and method
 * implementation (typed by `sdk-interfaces`, never the doubles), and the
 * inputs of the call. Enroll needs `methodAddress` and `params`; test access
 * and create claim need `request`. A method whose material the caller already
 * holds (a guardian's address or signature, a zkPassport result, an Aadhaar
 * QR) passes its own `device`.
 *
 * A `browser-authenticator` method ignores `device` and runs the page's own
 * passkey device from `RunDeps.devices`, and its `params.relyingPartyId` is
 * replaced with the page's full origin string: the host owns the relying
 * party id.
 */
export interface ResolvedCeremony {
  orchestrator: IMethodsOrchestrator
  method: IRecoveryMethod
  methodAddress?: Address
  params?: unknown
  request?: ApproverRequest
  device?: CeremonyDevice
}

/** Finds the ceremony a request id names; null where nothing waits under it. */
export type CeremonyResolver = (params: CeremonyParams) => Promise<ResolvedCeremony | null>

export interface RunDeps {
  devices?: PageDevices
  signal?: AbortSignal
  onStep?: (step: CeremonyStep) => void
}
