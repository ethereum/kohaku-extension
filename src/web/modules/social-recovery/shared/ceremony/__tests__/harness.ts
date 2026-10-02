/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "chrome-extension://cgjhdpkjghcgpplimocodhjgcceglpoj/tab.html#/social-recovery/ceremony"}
 */
/**
 * Every test file reads the ceremony module through the adapter at the bottom
 * of this file, so a rename in the module changes this file alone. The adapter
 * is strict: a host result that is not exactly one of the four verdicts or one
 * note throws instead of being coerced.
 *
 * The fakes of `IRecoveryMethod` and `IMethodsOrchestrator` are hand-written and
 * typed by `sdk-interfaces/`: the ESLint fence forbids this module to import the
 * doubles of `sdk-doubles/`. `navigator.credentials` is mocked; no test reaches
 * a real authenticator.
 */
/* eslint-disable max-classes-per-file -- the WebAuthn classes jsdom lacks, and one encoder */
import type {
  Address,
  ApproverReply,
  ApproverRequest,
  DeviceBinding,
  EnrollFailure,
  Hex,
  IMethodCodec,
  IMethodsOrchestrator,
  IRecoveryMethod,
  MethodContext,
  MethodFailureCause,
  ReplyFailure,
  RequestDescription,
  Verdict
} from '@web/modules/social-recovery/sdk-interfaces'

// ---------------------------------------------------------------------------
// The jsdom globals the module needs and jest-environment-jsdom 29 leaves out
// ---------------------------------------------------------------------------

/* eslint-disable global-require, @typescript-eslint/no-var-requires */
// jsdom 20 has no TextEncoder, no TextDecoder and no crypto.subtle. They are
// installed here, before the module loads (it is required lazily below),
// so a module that builds an encoder at load time finds one.
interface NodeEncoder {
  encode(input?: string): Uint8Array
  encodeInto(source: string, destination: Uint8Array): { read: number; written: number }
}
if (typeof globalThis.TextEncoder === 'undefined') {
  const util = require('util') as { TextEncoder: new () => NodeEncoder; TextDecoder: unknown }
  const nodeEncoder = new util.TextEncoder()
  // Node's encoder returns Node's Uint8Array, which fails `instanceof
  // Uint8Array` inside jsdom's realm; this one copies into the page's own.
  class PageTextEncoder {
    readonly encoding = 'utf-8'

    encode(input = ''): Uint8Array {
      return new Uint8Array(nodeEncoder.encode(input))
    }

    encodeInto(source: string, destination: Uint8Array) {
      return nodeEncoder.encodeInto(source, destination)
    }
  }
  Object.defineProperty(globalThis, 'TextEncoder', { value: PageTextEncoder, configurable: true })
  Object.defineProperty(globalThis, 'TextDecoder', { value: util.TextDecoder, configurable: true })
}
if (!globalThis.crypto?.subtle) {
  const { webcrypto } = require('crypto') as { webcrypto: Crypto }
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}
// viem builds a TextEncoder when it loads, so it loads after the globals above
// and a jsdom test reads its helpers from here.
const viem = require('viem') as typeof import('viem')
/* eslint-enable global-require, @typescript-eslint/no-var-requires */

export const { bytesToHex, hexToBytes, zeroHash } = viem
const { isHex, numberToBytes } = viem

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The id of a real Chrome build, the page origin every test runs under. */
export const EXTENSION_ID = 'cgjhdpkjghcgpplimocodhjgcceglpoj'

/** The full origin string the relying party hash commits. */
export const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`

/**
 * `sha256("chrome-extension://cgjhdpkjghcgpplimocodhjgcceglpoj")`, the rp id
 * hash real authenticators committed for that build. A fixed vector, so the
 * test does not compute the expected value the way the module does.
 */
export const ORIGIN_HASH: Hex = '0x6a28d0a23c3534862fbdfb5c1689fc35b89dcd9367cbc2e33d4b0cb2f76c6535'

/** The order n of the P-256 curve. */
export const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551')
/** The largest low `s`: n is odd, so `s <= n/2` means `s <= (n - 1) / 2`. */
export const P256_HALF_N = (P256_N - BigInt(1)) / BigInt(2)

export const PASSKEY_METHOD: Address = '0x000000000000000000000000000000000000beef'
export const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

export const concatBytes = (...parts: (Uint8Array | number[])[]): Uint8Array => {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)))
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0))
  let at = 0
  arrays.forEach((a) => {
    out.set(a, at)
    at += a.length
  })
  return out
}

/** A fresh ArrayBuffer holding exactly `bytes`, as WebAuthn returns. */
export const toBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.length)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

const bigToBytes = (value: bigint, length?: number): Uint8Array => {
  const bytes = numberToBytes(value)
  if (length === undefined || bytes.length >= length) {
    return bytes
  }
  return concatBytes(new Uint8Array(length - bytes.length), bytes)
}

const bytesToBig = (bytes: Uint8Array): bigint =>
  bytes.length ? BigInt(bytesToHex(bytes)) : BigInt(0)

const base64url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Reads any byte-like value the module may hand on: bytes, a buffer, a view or 0x hex. */
export const asBytes = (value: unknown): Uint8Array | null => {
  // Realm-blind checks: WebCrypto in jsdom hands back Node's buffers.
  const tag = Object.prototype.toString.call(value)
  if (tag === '[object ArrayBuffer]') {
    return new Uint8Array(value as ArrayBuffer)
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  if (isHex(value) && value.length % 2 === 0) {
    return hexToBytes(value)
  }
  return null
}

// ---------------------------------------------------------------------------
// ECDSA signatures, DER and raw
// ---------------------------------------------------------------------------

const derInteger = (value: bigint): Uint8Array => {
  let bytes = bigToBytes(value)
  // eslint-disable-next-line no-bitwise
  if (bytes[0] & 0x80) {
    bytes = concatBytes([0], bytes)
  }
  return concatBytes([0x02, bytes.length], bytes)
}

/** The DER form WebAuthn returns for an ES256 signature. */
export const derSignature = (r: bigint, s: bigint): Uint8Array => {
  const body = concatBytes(derInteger(r), derInteger(s))
  return concatBytes([0x30, body.length], body)
}

/** The raw `r || s` form, 32 bytes each. */
export const rawSignature = (r: bigint, s: bigint): Uint8Array =>
  concatBytes(bigToBytes(r, 32), bigToBytes(s, 32))

export interface ParsedSignature {
  r: bigint
  s: bigint
  form: 'der' | 'raw'
}

/** Parses a strict DER ECDSA signature, or null. */
export const parseDer = (bytes: Uint8Array): ParsedSignature | null => {
  if (bytes.length < 8 || bytes[0] !== 0x30 || bytes[1] !== bytes.length - 2) {
    return null
  }
  let at = 2
  const ints: bigint[] = []
  for (let k = 0; k < 2; k++) {
    if (bytes[at] !== 0x02) {
      return null
    }
    const len = bytes[at + 1]
    const start = at + 2
    if (len === 0 || start + len > bytes.length) {
      return null
    }
    ints.push(bytesToBig(bytes.slice(start, start + len)))
    at = start + len
  }
  if (at !== bytes.length) {
    return null
  }
  return { r: ints[0], s: ints[1], form: 'der' }
}

/** Parses a signature in either form: DER first, then 64 raw bytes. */
export const parseSignature = (value: unknown): ParsedSignature | null => {
  const bytes = asBytes(value)
  if (!bytes) {
    return null
  }
  const der = parseDer(bytes)
  if (der) {
    return der
  }
  if (bytes.length === 64) {
    return { r: bytesToBig(bytes.slice(0, 32)), s: bytesToBig(bytes.slice(32)), form: 'raw' }
  }
  return null
}

/**
 * Every signature anywhere inside `value`: byte-like leaves that parse as one,
 * and `{ r, s }` pairs held as bigints or hex. The claim host hands the method
 * a material whose shape is the module's own, so the test looks everywhere.
 */
export const signaturesIn = (value: unknown, depth = 0, seen = new Set<unknown>()) => {
  const found: ParsedSignature[] = []
  if (depth > 8 || value === null || value === undefined) {
    return found
  }
  const direct = parseSignature(value)
  if (direct) {
    return [direct]
  }
  if (typeof value !== 'object' || seen.has(value)) {
    return found
  }
  seen.add(value)
  const record = value as Record<string, unknown>
  const toBig = (v: unknown): bigint | null => {
    if (typeof v === 'bigint') {
      return v
    }
    if (isHex(v) && v !== '0x') {
      return BigInt(v)
    }
    return null
  }
  const r = toBig(record.r)
  const s = toBig(record.s)
  if (r !== null && s !== null) {
    found.push({ r, s, form: 'raw' })
  }
  Object.keys(record).forEach((key) => {
    found.push(...signaturesIn(record[key], depth + 1, seen))
  })
  return found
}

const includesBytes = (hay: Uint8Array, needle: Uint8Array): boolean => {
  if (!needle.length || needle.length > hay.length) {
    return false
  }
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let j = 0
    while (j < needle.length && hay[i + j] === needle[j]) {
      j++
    }
    if (j === needle.length) {
      return true
    }
  }
  return false
}

/**
 * Whether `value` carries any of `needles` anywhere inside it: the same object,
 * the same string, or bytes (or hex) that contain the needle's bytes. The module
 * shapes the material it hands the method, so the test looks everywhere.
 */
export const carries = (
  value: unknown,
  needles: { objects?: unknown[]; strings?: string[]; bytes?: Uint8Array[] },
  depth = 0,
  seen = new Set<unknown>()
): boolean => {
  if (depth > 8 || value === null || value === undefined) {
    return false
  }
  if (needles.objects?.some((o) => o === value)) {
    return true
  }
  if (typeof value === 'string' && needles.strings?.includes(value)) {
    return true
  }
  const bytes = asBytes(value)
  if (bytes && needles.bytes?.some((b) => includesBytes(bytes, b))) {
    return true
  }
  if (typeof value !== 'object' || seen.has(value)) {
    return false
  }
  seen.add(value)
  const record = value as Record<string, unknown>
  return Object.keys(record).some((key) => carries(record[key], needles, depth + 1, seen))
}

/** Every string anywhere inside `value`. */
export const stringsIn = (value: unknown, depth = 0, seen = new Set<unknown>()): string[] => {
  if (depth > 8 || value === null || value === undefined) {
    return []
  }
  if (typeof value === 'string') {
    return [value]
  }
  if (typeof value !== 'object' || seen.has(value)) {
    return []
  }
  seen.add(value)
  const record = value as Record<string, unknown>
  return Object.keys(record).flatMap((key) => stringsIn(record[key], depth + 1, seen))
}

// ---------------------------------------------------------------------------
// Authenticator data, fabricated
// ---------------------------------------------------------------------------

/** The flag bits of the authenticator data (WebAuthn Level 3, 6.1). */
export const FLAGS = { UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40, ED: 0x80 } as const

/** A synced passkey: backup eligible and backed up. */
export const SYNCED_FLAGS = FLAGS.UP | FLAGS.UV | FLAGS.BE | FLAGS.BS // eslint-disable-line no-bitwise
/** A device-bound passkey: neither backup eligible nor backed up. */
export const DEVICE_BOUND_FLAGS = FLAGS.UP | FLAGS.UV // eslint-disable-line no-bitwise

export interface P256Point {
  x: Uint8Array
  y: Uint8Array
}

/** A real P-256 public point, so a module that imports the key finds a valid one. */
export const generatePoint = async (): Promise<P256Point> => {
  const pair = (await globalThis.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair
  const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', pair.publicKey))
  return { x: raw.slice(1, 33), y: raw.slice(33, 65) }
}

/** The COSE_Key of an ES256 public key, CBOR encoded (RFC 9053). */
export const coseKey = ({ x, y }: P256Point): Uint8Array =>
  concatBytes(
    [0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20],
    x,
    [0x22, 0x58, 0x20],
    y
  )

/** The SPKI DER of an ES256 public key, what `getPublicKey()` returns. */
export const spki = ({ x, y }: P256Point): Uint8Array =>
  concatBytes(hexToBytes('0x3059301306072a8648ce3d020106082a8648ce3d030107034200'), [0x04], x, y)

export interface AuthDataOptions {
  flags: number
  rpIdHash?: Hex
  signCount?: number
  credentialId?: Uint8Array
  point?: P256Point
  /** The AAGUID in its dashed form; all zero by default, as attestation `none` may give. */
  aaguid?: string
}

/** Google Password Manager's AAGUID. */
export const GOOGLE_AAGUID = 'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4'
/** iCloud Keychain's AAGUID (the community list of passkey provider AAGUIDs). */
export const APPLE_AAGUID = 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd'
export const ZERO_AAGUID = '00000000-0000-0000-0000-000000000000'
/** An AAGUID no list names. */
export const UNKNOWN_AAGUID = '0badc0de-1234-4abc-8def-0123456789ab'

/**
 * Authenticator data: rpIdHash (32) | flags (1) | signCount (4), then the
 * attested credential data where `AT` is set: aaguid (16) | id length (2) | id |
 * COSE key.
 */
export const authenticatorData = ({
  flags,
  rpIdHash = ORIGIN_HASH,
  signCount = 0,
  credentialId,
  point,
  aaguid = ZERO_AAGUID
}: AuthDataOptions): Uint8Array => {
  const head = concatBytes(hexToBytes(rpIdHash), [flags], bigToBytes(BigInt(signCount), 4))
  // eslint-disable-next-line no-bitwise
  if (!(flags & FLAGS.AT)) {
    return head
  }
  if (!credentialId || !point) {
    throw new Error('attested credential data needs an id and a key')
  }
  return concatBytes(
    head,
    hexToBytes(`0x${aaguid.replace(/-/g, '')}`),
    bigToBytes(BigInt(credentialId.length), 2),
    credentialId,
    coseKey(point)
  )
}

const cborText = (text: string): Uint8Array => {
  const bytes = new TextEncoder().encode(text)
  return concatBytes([0x60 + bytes.length], bytes)
}

const cborBytes = (bytes: Uint8Array): Uint8Array => {
  if (bytes.length < 24) {
    return concatBytes([0x40 + bytes.length], bytes)
  }
  if (bytes.length < 256) {
    return concatBytes([0x58, bytes.length], bytes)
  }
  return concatBytes([0x59], bigToBytes(BigInt(bytes.length), 2), bytes)
}

/** The attestation object `{ fmt: "none", attStmt: {}, authData }`, CBOR encoded. */
export const attestationObject = (authData: Uint8Array): Uint8Array =>
  concatBytes(
    [0xa3],
    cborText('fmt'),
    cborText('none'),
    cborText('attStmt'),
    [0xa0],
    cborText('authData'),
    cborBytes(authData)
  )

// ---------------------------------------------------------------------------
// Credentials, fabricated
// ---------------------------------------------------------------------------

type Ctor = new (...args: never[]) => object

/**
 * The WebAuthn classes jsdom lacks, so a module that checks `instanceof
 * PublicKeyCredential` or calls one of its statics runs. Installed once.
 */
export const installWebAuthnClasses = () => {
  const g = globalThis as unknown as Record<string, unknown>
  if (typeof g.PublicKeyCredential === 'undefined') {
    class PublicKeyCredential {
      static isUserVerifyingPlatformAuthenticatorAvailable = async () => true

      static isConditionalMediationAvailable = async () => false

      static getClientCapabilities = async () => ({})
    }
    g.PublicKeyCredential = PublicKeyCredential
  }
  if (typeof g.AuthenticatorResponse === 'undefined') {
    class AuthenticatorResponse {}
    class AuthenticatorAttestationResponse extends AuthenticatorResponse {}
    class AuthenticatorAssertionResponse extends AuthenticatorResponse {}
    g.AuthenticatorResponse = AuthenticatorResponse
    g.AuthenticatorAttestationResponse = AuthenticatorAttestationResponse
    g.AuthenticatorAssertionResponse = AuthenticatorAssertionResponse
  }
}

const instanceOf = <T extends object>(ctorName: string, props: T): T => {
  installWebAuthnClasses()
  const ctor = (globalThis as unknown as Record<string, Ctor>)[ctorName]
  return Object.assign(Object.create(ctor.prototype) as object, props) as T
}

const clientData = (type: 'webauthn.create' | 'webauthn.get', challenge: Uint8Array) =>
  new TextEncoder().encode(
    JSON.stringify({ type, challenge: base64url(challenge), origin: EXTENSION_ORIGIN })
  )

export interface FakeAttestation {
  credential: PublicKeyCredential
  rawId: Uint8Array
  point: P256Point
  authData: Uint8Array
}

export interface AttestationOptions {
  flags: number
  point: P256Point
  attachment?: 'platform' | 'cross-platform'
  transports?: string[]
  rawId?: Uint8Array
  aaguid?: string
  rpIdHash?: Hex
}

/** A `PublicKeyCredential` as `navigator.credentials.create` resolves it. */
export const fakeAttestation = ({
  flags,
  point,
  attachment = 'platform',
  transports = ['internal', 'hybrid'],
  rawId = Uint8Array.from({ length: 20 }, (_, i) => i + 1),
  aaguid,
  rpIdHash
}: AttestationOptions): FakeAttestation => {
  const authData = authenticatorData({
    // eslint-disable-next-line no-bitwise
    flags: flags | FLAGS.AT,
    credentialId: rawId,
    point,
    aaguid,
    rpIdHash
  })
  const response = instanceOf('AuthenticatorAttestationResponse', {
    clientDataJSON: toBuffer(clientData('webauthn.create', new Uint8Array(32))),
    attestationObject: toBuffer(attestationObject(authData)),
    getAuthenticatorData: () => toBuffer(authData),
    getPublicKey: () => toBuffer(spki(point)),
    getPublicKeyAlgorithm: () => -7,
    getTransports: () => transports
  })
  const credential = instanceOf('PublicKeyCredential', {
    id: base64url(rawId),
    rawId: toBuffer(rawId),
    type: 'public-key',
    authenticatorAttachment: attachment,
    response,
    getClientExtensionResults: () => ({})
  }) as unknown as PublicKeyCredential
  return { credential, rawId, point, authData }
}

export interface FakeAssertion {
  credential: PublicKeyCredential
  signature: Uint8Array
  authData: Uint8Array
}

export interface AssertionOptions {
  r: bigint
  s: bigint
  flags?: number
  attachment?: 'platform' | 'cross-platform'
  rawId?: Uint8Array
  challenge?: Uint8Array
  rpIdHash?: Hex
}

/** A `PublicKeyCredential` as `navigator.credentials.get` resolves it, signature DER. */
export const fakeAssertion = ({
  r,
  s,
  flags = SYNCED_FLAGS,
  attachment = 'cross-platform',
  rawId = Uint8Array.from({ length: 20 }, (_, i) => i + 1),
  challenge = new Uint8Array(32),
  rpIdHash
}: AssertionOptions): FakeAssertion => {
  const authData = authenticatorData({ flags, signCount: 0, rpIdHash })
  const signature = derSignature(r, s)
  const response = instanceOf('AuthenticatorAssertionResponse', {
    clientDataJSON: toBuffer(clientData('webauthn.get', challenge)),
    authenticatorData: toBuffer(authData),
    signature: toBuffer(signature),
    userHandle: toBuffer(new Uint8Array([7, 7, 7]))
  })
  const credential = instanceOf('PublicKeyCredential', {
    id: base64url(rawId),
    rawId: toBuffer(rawId),
    type: 'public-key',
    authenticatorAttachment: attachment,
    response,
    getClientExtensionResults: () => ({})
  }) as unknown as PublicKeyCredential
  return { credential, signature, authData }
}

/** The browser's own error for a prompt the holder dismissed or the browser refused. */
export const notAllowedError = () =>
  new DOMException(
    'The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/#sctn-privacy-considerations-client.',
    'NotAllowedError'
  )

// ---------------------------------------------------------------------------
// navigator.credentials, mocked
// ---------------------------------------------------------------------------

export interface FakeCredentials {
  create: jest.Mock<Promise<Credential | null>, [CredentialCreationOptions?]>
  get: jest.Mock<Promise<Credential | null>, [CredentialRequestOptions?]>
}

/** Replaces `navigator.credentials` with two mocks; `restore` puts the old one back. */
export const installCredentials = (
  impl: {
    create?: (options?: CredentialCreationOptions) => Promise<Credential | null>
    get?: (options?: CredentialRequestOptions) => Promise<Credential | null>
  } = {}
): FakeCredentials & { restore: () => void } => {
  installWebAuthnClasses()
  const nav = globalThis.navigator as unknown as Record<string, unknown>
  const saved = Object.getOwnPropertyDescriptor(nav, 'credentials')
  const fake: FakeCredentials = {
    create: jest.fn(impl.create ?? (async () => null)),
    get: jest.fn(impl.get ?? (async () => null))
  }
  Object.defineProperty(nav, 'credentials', { value: fake, configurable: true, writable: true })
  return {
    ...fake,
    restore: () => {
      if (saved) {
        Object.defineProperty(nav, 'credentials', saved)
      } else {
        delete nav.credentials
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The page's visibility
// ---------------------------------------------------------------------------

/** Sets `document.visibilityState` and `document.hidden`, and fires `visibilitychange`. */
export const setVisibility = (state: DocumentVisibilityState, fire = true) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' })
  if (fire) {
    document.dispatchEvent(new Event('visibilitychange'))
  }
}

/** Gives the page back jsdom's own visibility getters. */
export const resetVisibility = () => {
  delete (document as unknown as Record<string, unknown>).visibilityState
  delete (document as unknown as Record<string, unknown>).hidden
}

/** Lets every settled promise run its handlers. */
export const flush = async (rounds = 10) => {
  for (let i = 0; i < rounds; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve()
  }
}

// ---------------------------------------------------------------------------
// The request and the context a claim works from
// ---------------------------------------------------------------------------

export const fixtureRequest = (overrides: Partial<ApproverRequest> = {}): ApproverRequest => ({
  kind: 'recovery-proof-request',
  version: 1,
  purpose: 'approval',
  chainId: '11155111',
  manager: '0x2222222222222222222222222222222222222222',
  digestVersion: '1',
  account: ACCOUNT,
  action: '0x3333333333333333333333333333333333333333',
  attemptId: '1',
  setupNonce: '1',
  setupBodyHash: `0x${'44'.repeat(32)}`,
  validUntil: '1790000000',
  place: 0,
  method: PASSKEY_METHOD,
  config: `0x${'55'.repeat(64)}`,
  salt: `0x${'66'.repeat(32)}`,
  ...overrides
})

export const FIXTURE_DIGEST: Hex = `0x${'ab'.repeat(32)}`

// ---------------------------------------------------------------------------
// The fake method and the fake orchestrator
// ---------------------------------------------------------------------------

/** What one scripted member answers: a value, a typed failure, or a thrown error. */
export type Scripted<T> = T | { throws: unknown }

export interface MethodScript {
  configFrom?: Scripted<Hex | EnrollFailure>
  replyFrom?: Scripted<Hex | ReplyFailure>
  verify?: Scripted<Verdict>
  enrollInput?: Scripted<unknown>
  signingInput?: Scripted<unknown>
}

const answer = async <T>(scripted: Scripted<T>): Promise<T> => {
  if (scripted && typeof scripted === 'object' && 'throws' in (scripted as object)) {
    throw (scripted as { throws: unknown }).throws
  }
  return scripted as T
}

const answerSync = <T>(scripted: Scripted<T>): T => {
  if (scripted && typeof scripted === 'object' && 'throws' in (scripted as object)) {
    throw (scripted as { throws: unknown }).throws
  }
  return scripted as T
}

export const CONFIG_HEX: Hex = `0x${'c0'.repeat(64)}`
export const PROOF_HEX: Hex = `0x${'9f'.repeat(96)}`

export const enrollFailure = (cause: MethodFailureCause): EnrollFailure => ({
  kind: 'enroll-failure',
  cause
})
export const replyFailure = (cause: MethodFailureCause): ReplyFailure => ({
  kind: 'reply-failure',
  cause
})

const opaqueCodec: IMethodCodec = {
  encodeConfig: () => CONFIG_HEX,
  decodeConfig: (config: Hex) => ({ config }),
  encodeProof: () => PROOF_HEX,
  decodeProof: (proof: Hex) => ({ proof })
}

/** A hand-written `IRecoveryMethod` whose every member is a spy. */
export interface FakeMethod extends IRecoveryMethod {
  modules: jest.Mock<Address[], [unknown]>
  enrollInput: jest.Mock<unknown, [unknown]>
  configFrom: jest.Mock<Promise<Hex | EnrollFailure>, [unknown, unknown]>
  signingInput: jest.Mock<unknown, [MethodContext, unknown?]>
  replyFrom: jest.Mock<Promise<Hex | ReplyFailure>, [MethodContext, unknown, unknown]>
  verify: jest.Mock<Promise<Verdict>, [MethodContext, Hex]>
  describe: jest.Mock
}

export const fakeMethod = (
  script: MethodScript = {},
  deviceBinding: DeviceBinding = 'browser-authenticator'
): FakeMethod => ({
  modules: jest.fn<Address[], [unknown]>(() => [PASSKEY_METHOD]),
  enrollInput: jest.fn((params: unknown) => {
    if (script.enrollInput !== undefined) {
      return answerSync(script.enrollInput)
    }
    const p = params as { relyingPartyId?: string; userName?: string } | undefined
    return { rp: { id: p?.relyingPartyId }, user: { name: p?.userName }, params }
  }),
  configFrom: jest.fn<Promise<Hex | EnrollFailure>, [unknown, unknown]>(async () =>
    answer(script.configFrom ?? CONFIG_HEX)
  ),
  signingInput: jest.fn((ctx: MethodContext, params?: unknown) => {
    if (script.signingInput !== undefined) {
      return answerSync(script.signingInput)
    }
    const p = params as { relyingPartyId?: string } | undefined
    return { challenge: ctx.digest, rpId: p?.relyingPartyId, params }
  }),
  replyFrom: jest.fn<Promise<Hex | ReplyFailure>, [MethodContext, unknown, unknown]>(async () =>
    answer(script.replyFrom ?? PROOF_HEX)
  ),
  verify: jest.fn<Promise<Verdict>, [MethodContext, Hex]>(async () =>
    answer(script.verify ?? 'satisfied')
  ),
  codec: opaqueCodec,
  deviceBinding,
  describe: jest.fn(() => ({ kind: 'webauthn-authenticator' as const })),
  vector: []
})

/** A hand-written `IMethodsOrchestrator` that serves `method` for every address. */
export interface FakeOrchestrator extends IMethodsOrchestrator {
  describeRequest: jest.Mock<RequestDescription, [ApproverRequest]>
  verify: jest.Mock<Promise<Verdict>, [ApproverRequest, number, Hex]>
  signingInput: jest.Mock<unknown, [ApproverRequest, unknown?]>
  replyFrom: jest.Mock<Promise<ApproverReply | ReplyFailure>, [ApproverRequest, unknown, unknown]>
  enrollInput: jest.Mock<unknown, [Address, unknown]>
  configFrom: jest.Mock<Promise<Hex | EnrollFailure>, [Address, unknown, unknown]>
}

const ctxOf = (request: ApproverRequest): MethodContext => ({
  request,
  place: request.place,
  digest: FIXTURE_DIGEST,
  typedData: {}
})

export const fakeOrchestrator = (method: FakeMethod): FakeOrchestrator => ({
  describeRequest: jest.fn(
    (request: ApproverRequest): RequestDescription => ({
      account: request.account,
      chainId: BigInt(request.chainId),
      manager: request.manager,
      action: request.action,
      attemptId: BigInt(request.attemptId),
      setupNonce: BigInt(request.setupNonce),
      purpose: request.purpose,
      validUntil: Number(request.validUntil),
      place: request.place,
      identityPublic: {},
      device: method.describe(ctxOf(request))
    })
  ),
  verify: jest.fn((request: ApproverRequest, place: number, proof: Hex) =>
    method.verify({ ...ctxOf(request), place }, proof)
  ),
  signingInput: jest.fn((request: ApproverRequest, params?: unknown) =>
    method.signingInput(ctxOf(request), params)
  ),
  replyFrom: jest.fn(async (request: ApproverRequest, input: unknown, material: unknown) => {
    const out = await method.replyFrom(ctxOf(request), input, material)
    if (typeof out !== 'string') {
      return out
    }
    return {
      kind: 'recovery-proof-reply' as const,
      version: request.version,
      chainId: request.chainId,
      manager: request.manager,
      account: request.account,
      action: request.action,
      attemptId: request.attemptId,
      purpose: request.purpose,
      place: request.place,
      method: request.method,
      config: request.config,
      salt: request.salt,
      digest: FIXTURE_DIGEST,
      proof: out
    }
  }),
  enrollInput: jest.fn((_address: Address, params: unknown) => method.enrollInput(params)),
  configFrom: jest.fn((_address: Address, input: unknown, material: unknown) =>
    method.configFrom(input, material)
  )
})

/** Every member that runs the method, on both fakes: none may run before a dismissed ceremony returns. */
export const methodRunCount = (method: FakeMethod, orchestrator: FakeOrchestrator): number =>
  method.configFrom.mock.calls.length +
  method.replyFrom.mock.calls.length +
  method.verify.mock.calls.length +
  orchestrator.configFrom.mock.calls.length +
  orchestrator.replyFrom.mock.calls.length +
  orchestrator.verify.mock.calls.length

// ---------------------------------------------------------------------------
// The adapter onto the module
// ---------------------------------------------------------------------------

/** The four verdicts every test reports, under the tests' own names. */
export type FourVerdict = 'passed' | 'failed' | 'unavailable' | 'not-supported'

/** The two notes of a dismissal. */
export type Note = 'cancelled' | 'refused'

export type Outcome =
  | { type: 'verdict'; verdict: FourVerdict; cause?: string; retry: boolean; raw: unknown }
  | { type: 'note'; note: Note; raw: unknown }

type CeremonyModule = typeof import('@web/modules/social-recovery/shared/ceremony')
type BrowserDefaultsModule =
  typeof import('@web/modules/social-recovery/shared/ceremony/screen/browserDefaults')
type CeremonyOutcome = import('@web/modules/social-recovery/shared/ceremony').CeremonyOutcome
type CeremonyCall = import('@web/modules/social-recovery/shared/ceremony').CeremonyCall
type CeremonyDevice = import('@web/modules/social-recovery/shared/ceremony').CeremonyDevice

/* eslint-disable global-require, @typescript-eslint/no-var-requires */
/** The module's pure entry, loaded after the globals above exist. */
export const ceremony = (): CeremonyModule =>
  require('@web/modules/social-recovery/shared/ceremony') as CeremonyModule

/** The tab's browser defaults: the passkey device over `navigator.credentials` at this page's origin. */
export const browserDefaults = (): BrowserDefaultsModule =>
  require('@web/modules/social-recovery/shared/ceremony/screen/browserDefaults') as BrowserDefaultsModule
/* eslint-enable global-require, @typescript-eslint/no-var-requires */

const MODULE_VERDICT: Record<string, FourVerdict> = {
  passed: 'passed',
  failed: 'failed',
  unavailable: 'unavailable',
  notSupported: 'not-supported'
}

/**
 * Reads one host result as exactly one verdict or one note, and throws on
 * anything else: no result may carry two, none may carry neither, and no
 * verdict may fall outside the closed four. The cause text joins the module's
 * cause slug and the detail it carries (a thrown refusal's message).
 */
export const toOutcome = (raw: unknown): Outcome => {
  const r = raw as Record<string, unknown>
  if (!r || typeof r !== 'object') {
    throw new Error(`host result is not a record: ${String(raw)}`)
  }
  if (r.kind === 'verdict') {
    if ('note' in r) {
      throw new Error('host result carries a verdict and a note at once')
    }
    const verdict = typeof r.verdict === 'string' ? MODULE_VERDICT[r.verdict] : undefined
    if (!verdict) {
      throw new Error(`unknown verdict ${String(r.verdict)}`)
    }
    const cause = [r.cause, r.detail].filter((c) => typeof c === 'string' && c).join(': ')
    return { type: 'verdict', verdict, cause: cause || undefined, retry: r.retry === true, raw }
  }
  if (r.kind === 'dismissed') {
    if ('verdict' in r) {
      throw new Error('host result carries a verdict and a note at once')
    }
    if (r.note !== 'cancelled' && r.note !== 'refused') {
      throw new Error(`unknown note ${String(r.note)}`)
    }
    return { type: 'note', note: r.note, raw }
  }
  throw new Error(`host result carries neither a verdict nor a note: ${JSON.stringify(raw)}`)
}

export interface HostEnv {
  method: FakeMethod
  orchestrator: FakeOrchestrator
  request?: ApproverRequest
  /** What the caller's record hands the method; by default the origin string as its relying party id. */
  params?: unknown
  /** The holder chose the browser's phone hand-off. */
  handOff?: boolean
  /** The device the caller's record supplies (`ResolvedCeremony.device`). */
  resolvedDevice?: CeremonyDevice
  /** The holder's abort. */
  signal?: AbortSignal
}

/** The params a caller hands a passkey method: the full origin string as its relying party id. */
export const callerParams = () => ({ relyingPartyId: EXTENSION_ORIGIN, userName: 'holder' })

/**
 * Runs one call the way the tab does: `runCeremony` with the page's own
 * passkey device (`browserPasskeyDevice`, over the mocked
 * `navigator.credentials` at this page's origin) for the browser-authenticator
 * binding. The device is built per call, after the test installed its mock.
 */
const runCall = async (call: CeremonyCall, env: HostEnv): Promise<unknown> => {
  const page = browserDefaults().browserPasskeyDevice()
  return ceremony().runCeremony(
    { call, method: 'passkey', id: 'req-1', handOff: env.handOff ?? false },
    {
      orchestrator: env.orchestrator,
      method: env.method,
      methodAddress: PASSKEY_METHOD,
      params: env.params ?? callerParams(),
      request: env.request ?? fixtureRequest(),
      ...(env.resolvedDevice ? { device: env.resolvedDevice } : {})
    },
    { devices: page ? { 'browser-authenticator': page } : {}, signal: env.signal }
  )
}

/** The four hosts, each run to its result. */
export const hosts = {
  enroll: async (env: HostEnv): Promise<Outcome> => toOutcome(await runCall('enroll', env)),
  testAccess: async (env: HostEnv): Promise<Outcome> => toOutcome(await runCall('testAccess', env)),
  createClaim: async (env: HostEnv): Promise<Outcome> =>
    toOutcome(await runCall('createClaim', env)),
  healthCheck: async (env: HostEnv): Promise<Outcome> =>
    toOutcome(await runCall('healthCheck', env))
}
export type HostName = keyof typeof hosts

/** The calls a host runs to a verdict for a scripted method. */
export type Call = Exclude<HostName, 'healthCheck'>

/** One scripted method and the verdict its host reports. */
export interface Case {
  title: string
  script: MethodScript
  verdict: FourVerdict
  cause?: string | RegExp
}

/** A listener on the extension's `storage.onChanged`. */
export type ChangeListener = (changes: Record<string, { newValue?: unknown }>, area: string) => void

/** One JSX tag found in a route file's text. */
export interface RouteTag {
  text: string
  start: number
  end: number
  selfClosing: boolean
  closes?: number
}

/** The synced or device-bound kind the module reads from authenticator data. */
export const kindFromAuthData = (authData: Uint8Array): string =>
  ceremony().passkeyFactsOf({ authenticatorData: authData }).kind

/** The module's high-`s` normalization, on a DER signature. */
export const normalizeSignature = (signature: Uint8Array): unknown =>
  ceremony().normalizeDerSignature(signature).signature

/** The relying party the tab reads at runtime from this page's location. */
export const relyingParty = (): { id: string; origin: string; idHash: string } => {
  const rp = ceremony().relyingPartyOf(window.location)
  return { id: rp.rpId, origin: rp.relyingPartyId, idHash: rp.rpIdHash }
}

/** The module's visibility gate over this document, as a send that holds while hidden. */
export const backgroundGate = (send: (message: unknown) => unknown) => {
  const gate = ceremony().createVisibilityGate(document)
  // A test reads what `send` received; the promise the gate returns is not the subject.
  const dispatch = (message: unknown): void => {
    gate.dispatch(() => send(message)).catch(() => undefined)
  }
  return Object.assign(dispatch, { gate })
}

/** The chip a row shows after `call`, as `set:chip`, or null where the row keeps its chip. */
export const rowChipOf = (outcome: Outcome, call: CeremonyCall): string | null => {
  const chip = ceremony().chipOfOutcome(outcome.raw as CeremonyOutcome, call)
  return chip ? `${chip.set}:${chip.chip}` : null
}

/** The en.json note an outcome of `call` renders on its row, or null. */
export const noteKeyOf = (outcome: Outcome, call: CeremonyCall): string | null =>
  ceremony().noteKeyOfOutcome(outcome.raw as CeremonyOutcome, call)

/** The en.json line an outcome of `call` renders under its chip, or null. */
export const lineKeyOf = (outcome: Outcome, call: CeremonyCall): string | null =>
  ceremony().lineKeyOfOutcome(outcome.raw as CeremonyOutcome, call)

/** The one raw text a screen may show for an outcome: the browser's error name. */
export const browserErrorNameOf = (outcome: Outcome): string | null =>
  ceremony().browserErrorNameOf(outcome.raw as CeremonyOutcome)

/** The synced or device-bound kind a passed enrollment carries. */
export const enrolledKind = (outcome: Outcome): unknown =>
  (outcome.raw as { value?: { facts?: { kind?: unknown } } }).value?.facts?.kind

// ---------------------------------------------------------------------------
// The tab's screen files, transpiled with React JSX
// ---------------------------------------------------------------------------

/* eslint-disable global-require, import/no-dynamic-require, @typescript-eslint/no-var-requires */
/**
 * Loads a file of the tab under Jest's own `require`. The repository's Jest
 * config compiles TSX with `jsx: react-native`, which keeps the JSX, so the
 * entry and every `.tsx` file it reaches through a relative import are
 * transpiled here with the TypeScript compiler's React JSX. Each file runs once
 * per load, so the files of one load share one module, and one React context.
 * Every other import resolves through Jest's aliases and the test's mocks, and
 * so does a `.tsx` file the test mocks, named in `mocked` by its path without
 * the extension.
 */
export const loadWithReactJsx = (
  entry: string,
  { mocked = [] }: { mocked?: string[] } = {}
): Record<string, unknown> => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const ts = require('typescript') as typeof import('typescript')
  const loaded = new Map<string, Record<string, unknown>>()
  const load = (file: string): Record<string, unknown> => {
    const known = loaded.get(file)
    if (known) {
      return known
    }
    const mod = { exports: {} as Record<string, unknown> }
    loaded.set(file, mod.exports)
    const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true
      }
    })
    const fileRequire = (id: string): unknown => {
      if (!id.startsWith('.')) {
        return require(id)
      }
      const resolved = path.resolve(path.dirname(file), id)
      const transpiled = !mocked.includes(resolved) && fs.existsSync(`${resolved}.tsx`)
      return transpiled ? load(`${resolved}.tsx`) : require(resolved)
    }
    // The transpiled file is this repository's own source.
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
    new Function('require', 'module', 'exports', outputText)(fileRequire, mod, mod.exports)
    return mod.exports
  }
  return load(entry)
}
/* eslint-enable global-require, import/no-dynamic-require, @typescript-eslint/no-var-requires */

// ---------------------------------------------------------------------------
// The harness's own checks
// ---------------------------------------------------------------------------

// Registered only when Jest runs this file itself: a suite that imports the
// harness does not run its checks again under its own hooks.
const runningHarnessItself = expect.getState().testPath === __filename

const describeHarness = runningHarnessItself ? describe : () => undefined

describeHarness('ceremony test harness', () => {
  it('round-trips a DER signature with a high s', () => {
    const s = P256_N - BigInt(5)
    const der = derSignature(BigInt(7), s)
    expect(parseDer(der)).toEqual({ r: BigInt(7), s, form: 'der' })
  })

  it('reads a raw r || s signature', () => {
    expect(parseSignature(rawSignature(BigInt(9), BigInt(10)))).toEqual({
      r: BigInt(9),
      s: BigInt(10),
      form: 'raw'
    })
  })

  it('finds a signature nested in a material record', () => {
    const material = {
      assertion: { response: { signature: toBuffer(derSignature(BigInt(3), BigInt(4))) } }
    }
    expect(signaturesIn(material)).toEqual([{ r: BigInt(3), s: BigInt(4), form: 'der' }])
  })

  it('lays out authenticator data with the flags at byte 32', () => {
    const data = authenticatorData({ flags: SYNCED_FLAGS })
    expect(data.length).toBe(37)
    expect(bytesToHex(data.slice(0, 32))).toBe(ORIGIN_HASH)
    expect(data[32]).toBe(SYNCED_FLAGS)
  })

  it('counts no method run on fresh fakes', () => {
    const method = fakeMethod()
    expect(methodRunCount(method, fakeOrchestrator(method))).toBe(0)
  })

  it('gives jsdom the TextEncoder and WebCrypto the module needs', async () => {
    expect(new TextEncoder().encode('a')).toEqual(Uint8Array.from([0x61]))
    const point = await generatePoint()
    expect(point.x).toHaveLength(32)
    expect(point.y).toHaveLength(32)
  })

  it('fabricates credentials the module can check with instanceof', async () => {
    const { credential, authData } = fakeAttestation({
      flags: SYNCED_FLAGS,
      point: await generatePoint()
    })
    const g = globalThis as unknown as Record<string, new () => object>
    expect(credential).toBeInstanceOf(g.PublicKeyCredential)
    expect(credential.response).toBeInstanceOf(g.AuthenticatorAttestationResponse)
    const fromResponse = new Uint8Array(
      (credential.response as AuthenticatorAttestationResponse).getAuthenticatorData()
    )
    expect(Array.from(fromResponse)).toEqual(Array.from(authData))
    // eslint-disable-next-line no-bitwise
    expect(authData[32] & FLAGS.AT).toBe(FLAGS.AT)
  })

  it('swaps navigator.credentials and puts it back', async () => {
    const before = (navigator as unknown as { credentials?: unknown }).credentials
    const creds = installCredentials({ get: async () => null })
    expect(navigator.credentials.get).toBe(creds.get)
    await navigator.credentials.get({})
    expect(creds.get).toHaveBeenCalledTimes(1)
    creds.restore()
    expect((navigator as unknown as { credentials?: unknown }).credentials).toBe(before)
  })

  it('drives document.visibilityState and fires visibilitychange', () => {
    const seen: string[] = []
    const listener = () => seen.push(document.visibilityState)
    document.addEventListener('visibilitychange', listener)
    setVisibility('hidden')
    setVisibility('visible')
    document.removeEventListener('visibilitychange', listener)
    resetVisibility()
    expect(seen).toEqual(['hidden', 'visible'])
    expect(document.visibilityState).toBe('visible')
  })
})
