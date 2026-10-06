/* eslint-disable max-classes-per-file -- the four shipped method doubles share one base and one file */
/**
 * One scripted `IRecoveryMethod` double per shipped kind: wallet
 * (`method-ecdsa`), passkey, zkPassport and Aadhaar. Each carries the ten members
 * with its kind's params and material records, and none runs a device, a
 * prover or real cryptography.
 *
 * The doubles' proof convention: a proof satisfies a credential exactly when it
 * equals `doubleProof(config, digest)`. The wallet and zkPassport doubles
 * package whatever bytes the device handed back (the signature, the proofs) and
 * judge them by that rule; the Aadhaar double proves itself from the QR data, as
 * the in-page prover does. The passkey double alone reads the browser's own
 * credential and assertion and checks the P-256 signature through WebCrypto.
 * `satisfyingMaterial` builds the material a willing approver's device would
 * return.
 *
 * The scripted chain's `replyFailure`, `enrollFailure` and `verdict` override
 * every double's answer while set.
 */
import type {
  Address,
  ApproverRequest,
  DeploymentDescriptor,
  DeviceBinding,
  DeviceFacts,
  DeviceKind,
  EnrollFailure,
  Hex,
  IMethodCodec,
  IRecoveryMethod,
  MethodContext,
  ReplyFailure,
  Verdict
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  authDataFromAttestationObject,
  bytesOf,
  encodeDerSignature,
  ES256,
  hexToArrayBuffer,
  isBytesLike,
  isHighS,
  normalizeP256S,
  parseDerSignature,
  pointFromAuthenticatorData,
  pointFromSpki,
  toBase64Url,
  uncompressedPoint
} from '@web/modules/social-recovery/shared/webauthn'
import {
  bytesToBigInt,
  bytesToHex,
  concat,
  decodeAbiParameters,
  encodeAbiParameters,
  hexToBigInt,
  hexToBytes,
  hexToString,
  isAddress,
  isHex,
  numberToHex,
  sha256,
  stringToBytes,
  stringToHex
} from 'viem'

import type { ScriptedChain } from './chain'
import { digestOfRequest, doubleProof, hashOf } from './encoding'
import { codedError } from './scripts'
import type {
  AadhaarConfigFields,
  AadhaarInput,
  AadhaarMaterial,
  AadhaarParams,
  AnyMethodDouble,
  MethodKind,
  PasskeyApproverKey,
  PasskeyAttestationResponse,
  PasskeyClientData,
  PasskeyConfigFields,
  PasskeyEnrollInput,
  PasskeyEnrollMaterial,
  PasskeyEnrollParams,
  PasskeyProofFields,
  PasskeyReplyMaterial,
  PasskeySatisfyingMaterial,
  PasskeySigningParams,
  ProofFields,
  WalletConfigFields,
  WalletEnrollParams,
  WalletReplyMaterial,
  ZkPassportConfigFields,
  ZkPassportEnrollMaterial,
  ZkPassportParams,
  ZkPassportReplyMaterial
} from './types'

/** The four shipped method kinds. */
export const METHOD_KINDS_SHIPPED = ['wallet', 'passkey', 'zkpassport', 'aadhaar'] as const

const replyFailure = (cause: ReplyFailure['cause']): ReplyFailure => ({
  kind: 'reply-failure',
  cause
})
const enrollFailure = (cause: EnrollFailure['cause']): EnrollFailure => ({
  kind: 'enroll-failure',
  cause
})

const nonEmptyHex = (value: unknown): value is Hex => isHex(value) && value !== '0x'

/**
 * A decode refuses bytes its encode would not reproduce: trailing bytes, a
 * non-canonical offset or dirty padding all fail the re-encode comparison.
 */
const refuseNonCanonical = (input: Hex, reencoded: Hex): void => {
  if (reencoded.toLowerCase() !== input.toLowerCase()) {
    throw new Error('The bytes are not the canonical encoding of the decoded fields.')
  }
}

/** A pass-through proof codec: the doubles' proofs are opaque bytes. */
const opaqueProof = {
  encodeProof: ({ proof }: ProofFields): Hex => proof,
  decodeProof: (proof: Hex): ProofFields => ({ proof })
}

/** The passkey config's ABI layout: the point's x and y, then the rpId hash. */
export const PASSKEY_CONFIG = [
  { type: 'bytes32' },
  { type: 'bytes32' },
  { type: 'bytes32' }
] as const
const PASSKEY_PROOF = [
  { type: 'bytes' },
  { type: 'bytes' },
  { type: 'bytes32' },
  { type: 'bytes32' }
] as const

/** The rpId hash, the flags byte and the four-byte counter. */
const AUTHENTICATOR_DATA_MIN = 37

/** The user-present and user-verified bits of the authenticator data's flags. */
const USER_PRESENT_AND_VERIFIED = 0x05

const P256_ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const
const ECDSA_SHA256 = { name: 'ECDSA', hash: 'SHA-256' } as const

const APPROVER_ORIGIN = 'https://passkey.double'

const webCrypto = (): SubtleCrypto => {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('The runtime has no WebCrypto (crypto.subtle).')
  }
  return subtle
}

/** The key the passkey double's willing device signs with, made on first use and kept. */
let approverKey: Promise<PasskeyApproverKey> | undefined

const makeApproverKey = async (): Promise<PasskeyApproverKey> => {
  const subtle = webCrypto()
  const pair = (await subtle.generateKey(P256_ECDSA, true, ['sign', 'verify'])) as CryptoKeyPair
  const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey))
  return {
    privateKey: pair.privateKey,
    x: bytesToHex(raw.slice(1, 33)),
    y: bytesToHex(raw.slice(33, 65))
  }
}

const theApproverKey = (): Promise<PasskeyApproverKey> => {
  if (!approverKey) {
    approverKey = makeApproverKey().catch((error: unknown) => {
      approverKey = undefined
      throw error
    })
  }
  return approverKey
}

/** The authenticator data of an attestation response, from its getter or its attestation object. */
const attestedAuthData = (response: PasskeyAttestationResponse): Uint8Array | null => {
  const data =
    typeof response.getAuthenticatorData === 'function'
      ? response.getAuthenticatorData()
      : undefined
  if (isBytesLike(data)) {
    return bytesOf(data)
  }
  return isBytesLike(response.attestationObject)
    ? authDataFromAttestationObject(response.attestationObject)
    : null
}

/** Whether the client data is a `webauthn.get` whose challenge is `digest` in base64url. */
const assertsDigest = (clientDataJSON: Hex, digest: Hex): boolean => {
  let clientData: PasskeyClientData | null
  try {
    clientData = JSON.parse(hexToString(clientDataJSON))
  } catch {
    return false
  }
  return (
    typeof clientData === 'object' &&
    clientData !== null &&
    clientData.type === 'webauthn.get' &&
    clientData.challenge === toBase64Url(hexToBytes(digest))
  )
}

abstract class MethodDouble implements IRecoveryMethod {
  abstract readonly kind: MethodKind

  abstract readonly deviceBinding: DeviceBinding

  abstract readonly deviceKind: DeviceKind

  abstract readonly vector: string[]

  abstract readonly codec: IMethodCodec

  constructor(protected readonly chain?: ScriptedChain) {}

  abstract modules(descriptor: DeploymentDescriptor): Address[]

  abstract enrollInput(params: unknown): unknown

  protected abstract enrollConfig(input: unknown, material: unknown): Hex | EnrollFailure

  abstract signingInput(ctx: MethodContext, params?: unknown): unknown

  /** The proof bytes the material packages, or the failure. */
  protected abstract proofFrom(
    ctx: MethodContext,
    input: unknown,
    material: unknown
  ): Hex | ReplyFailure

  /** The material a willing approver's device returns for this request. */
  abstract satisfyingMaterial(request: ApproverRequest): unknown

  async configFrom(input: unknown, material: unknown): Promise<Hex | EnrollFailure> {
    if (this.chain?.enrollFailure) {
      return enrollFailure(this.chain.enrollFailure)
    }
    return this.enrollConfig(input, material)
  }

  async replyFrom(
    ctx: MethodContext,
    input: unknown,
    material: unknown
  ): Promise<Hex | ReplyFailure> {
    if (this.chain?.replyFailure) {
      return replyFailure(this.chain.replyFailure)
    }
    return this.proofFrom(ctx, input, material)
  }

  async verify(ctx: MethodContext, proof: Hex): Promise<Verdict> {
    if (this.chain?.verdict) {
      return this.chain.verdict
    }
    return proof.toLowerCase() === doubleProof(ctx.request.config, ctx.digest).toLowerCase()
      ? 'satisfied'
      : 'rejected'
  }

  describe(ctx: MethodContext): DeviceFacts {
    return { kind: this.deviceKind, place: ctx.place }
  }
}

// ---------------------------------------------------------------------------

/** `method-ecdsa`: a guardian's wallet signs typed data; config is the address. */
export class WalletMethodDouble extends MethodDouble {
  readonly kind = 'wallet' as const

  readonly deviceBinding = 'none' as const

  readonly deviceKind = 'wallet-typed-data' as const

  readonly vector = ['method-ecdsa-config.json', 'method-ecdsa-proof.json']

  readonly codec: IMethodCodec<WalletConfigFields, ProofFields> = {
    encodeConfig: ({ address }) => encodeAbiParameters([{ type: 'address' }], [address]),
    decodeConfig: (config) => {
      const [address] = decodeAbiParameters([{ type: 'address' }], config)
      refuseNonCanonical(config, encodeAbiParameters([{ type: 'address' }], [address]))
      return { address }
    },
    ...opaqueProof
  }

  modules(descriptor: DeploymentDescriptor): Address[] {
    return [descriptor.methodEcdsa]
  }

  /** `params: { address }`; no ceremony runs, so the input is the address itself. */
  enrollInput(params: unknown): unknown {
    return { address: (params as WalletEnrollParams | undefined)?.address }
  }

  protected enrollConfig(input: unknown): Hex | EnrollFailure {
    const address = (input as WalletEnrollParams | undefined)?.address
    // The strict check refuses a mixed-case address with a wrong checksum, which
    // the encoder would otherwise throw on.
    if (!address || !isAddress(address, { strict: true })) {
      return enrollFailure('material-rejected')
    }
    return this.codec.encodeConfig({ address: address as Address })
  }

  /**
   * The typed data the guardian's wallet signs, handed over as it is:
   * `{ domain, types, primaryType, message }`, numeric chain id, the `Approval`
   * or `Cancellation` members alone (the orchestrator builds it into the ctx).
   */
  signingInput(ctx: MethodContext): unknown {
    return ctx.typedData
  }

  protected proofFrom(ctx: MethodContext, input: unknown, material: unknown): Hex | ReplyFailure {
    const signature = (material as WalletReplyMaterial | undefined)?.signature
    return nonEmptyHex(signature) ? signature : replyFailure('material-rejected')
  }

  satisfyingMaterial(request: ApproverRequest) {
    return { signature: doubleProof(request.config, digestOfRequest(request)) }
  }

  describe(ctx: MethodContext): DeviceFacts {
    let address: Address | undefined
    try {
      address = this.codec.decodeConfig(ctx.request.config).address
    } catch {
      address = undefined
    }
    return { kind: this.deviceKind, address, keyOrContractUnknown: true }
  }
}

// ---------------------------------------------------------------------------

/** `method-passkey`: a WebAuthn credential; config is the P-256 point beside the rpId hash. */
export class PasskeyMethodDouble extends MethodDouble {
  readonly kind = 'passkey' as const

  readonly deviceBinding = 'browser-authenticator' as const

  readonly deviceKind = 'webauthn-authenticator' as const

  readonly vector = ['method-passkey-config.json', 'method-passkey-proof.json']

  readonly codec: IMethodCodec<PasskeyConfigFields, PasskeyProofFields> = {
    encodeConfig: ({ x, y, rpIdHash }) => encodeAbiParameters(PASSKEY_CONFIG, [x, y, rpIdHash]),
    decodeConfig: (config) => {
      const [x, y, rpIdHash] = decodeAbiParameters(PASSKEY_CONFIG, config)
      refuseNonCanonical(config, encodeAbiParameters(PASSKEY_CONFIG, [x, y, rpIdHash]))
      return { x, y, rpIdHash }
    },
    encodeProof: ({ authenticatorData, clientDataJSON, r, s }) =>
      encodeAbiParameters(PASSKEY_PROOF, [authenticatorData, clientDataJSON, r, s]),
    decodeProof: (proof) => {
      const [authenticatorData, clientDataJSON, r, s] = decodeAbiParameters(PASSKEY_PROOF, proof)
      refuseNonCanonical(
        proof,
        encodeAbiParameters(PASSKEY_PROOF, [authenticatorData, clientDataJSON, r, s])
      )
      return { authenticatorData, clientDataJSON, r, s }
    }
  }

  modules(descriptor: DeploymentDescriptor): Address[] {
    return [descriptor.methodPasskey]
  }

  /** `params: { relyingPartyId, userName }`; returns the creation options. */
  enrollInput(params: unknown): unknown {
    const p = params as PasskeyEnrollParams | undefined
    if (!p?.relyingPartyId) {
      throw codedError('params-missing', { method: 'passkey', missing: ['relyingPartyId'] })
    }
    return {
      rp: { id: p.relyingPartyId },
      user: { name: p.userName ?? '' },
      pubKeyCredParams: [{ type: 'public-key', alg: ES256 }],
      authenticatorSelection: { userVerification: 'required', residentKey: 'required' },
      attestation: 'none'
    }
  }

  /**
   * `material: { credential }`, the browser's `PublicKeyCredential`. The point
   * comes from `getPublicKey()` where the browser offers it, else from the COSE
   * key in the authenticator data. A key that is not ES256 on P-256, a missing
   * relying party id or authenticator data minted under another relying party
   * is refused.
   */
  protected enrollConfig(input: unknown, material: unknown): Hex | EnrollFailure {
    const rpId = (input as PasskeyEnrollInput | undefined)?.rp?.id
    const response = (material as PasskeyEnrollMaterial | undefined)?.credential?.response
    if (!rpId || typeof response !== 'object' || response === null) {
      return enrollFailure('material-rejected')
    }
    // WebAuthn's rpIdHash is the SHA-256 of the relying party id.
    const rpIdHash = sha256(stringToHex(rpId))
    try {
      const authData = attestedAuthData(response)
      if (authData && bytesToHex(authData.slice(0, 32)) !== rpIdHash) {
        return enrollFailure('material-rejected')
      }
      const algorithm =
        typeof response.getPublicKeyAlgorithm === 'function'
          ? response.getPublicKeyAlgorithm()
          : undefined
      if (algorithm !== undefined && algorithm !== ES256) {
        return enrollFailure('material-rejected')
      }
      const spki = typeof response.getPublicKey === 'function' ? response.getPublicKey() : null
      const point = isBytesLike(spki)
        ? pointFromSpki(spki)
        : authData
        ? pointFromAuthenticatorData(authData)
        : null
      if (!point) {
        return enrollFailure('material-rejected')
      }
      return this.codec.encodeConfig({ ...point, rpIdHash })
    } catch {
      return enrollFailure('material-rejected')
    }
  }

  /** `params: { relyingPartyId, credentialId? }`; the digest is the challenge. */
  signingInput(ctx: MethodContext, params?: unknown): unknown {
    const p = params as PasskeySigningParams | undefined
    if (!p?.relyingPartyId) {
      throw codedError('params-missing', { method: 'passkey', missing: ['relyingPartyId'] })
    }
    return {
      challenge: ctx.digest,
      rpId: p.relyingPartyId,
      userVerification: 'required',
      allowCredentials: p.credentialId ? [{ type: 'public-key', id: p.credentialId }] : []
    }
  }

  /**
   * `material: { assertion }`, the assertion the device returned: the
   * authenticator data, the client data JSON and the DER signature, packaged
   * with `s` lowered to the low half.
   */
  protected proofFrom(ctx: MethodContext, input: unknown, material: unknown): Hex | ReplyFailure {
    const response = (material as PasskeyReplyMaterial | undefined)?.assertion?.response
    const authenticatorData = response?.authenticatorData
    const clientDataJSON = response?.clientDataJSON
    const signature = response?.signature
    if (
      !isBytesLike(authenticatorData) ||
      !isBytesLike(clientDataJSON) ||
      !isBytesLike(signature)
    ) {
      return replyFailure('material-rejected')
    }
    const authData = bytesOf(authenticatorData)
    const clientData = bytesOf(clientDataJSON)
    if (authData.length < AUTHENTICATOR_DATA_MIN || clientData.length === 0) {
      return replyFailure('material-rejected')
    }
    try {
      const { r, s } = parseDerSignature(signature)
      return this.codec.encodeProof({
        authenticatorData: bytesToHex(authData),
        clientDataJSON: bytesToHex(clientData),
        r: numberToHex(r, { size: 32 }),
        s: numberToHex(normalizeP256S(s), { size: 32 })
      })
    } catch {
      return replyFailure('material-rejected')
    }
  }

  /**
   * The proof leaves the device only when it passes the same check `verify`
   * runs; a runtime without WebCrypto cannot check it, so the device counts as
   * unavailable.
   */
  async replyFrom(
    ctx: MethodContext,
    input: unknown,
    material: unknown
  ): Promise<Hex | ReplyFailure> {
    const proof = await super.replyFrom(ctx, input, material)
    if (typeof proof !== 'string') {
      return proof
    }
    const verdict = await this.judge(ctx.request.config, proof, ctx.digest)
    if (verdict === 'satisfied') {
      return proof
    }
    return replyFailure(verdict === 'not-judged' ? 'device-unavailable' : 'material-rejected')
  }

  async verify(ctx: MethodContext, proof: Hex): Promise<Verdict> {
    if (this.chain?.verdict) {
      return this.chain.verdict
    }
    return this.judge(ctx.request.config, proof, ctx.digest)
  }

  /**
   * Satisfied where the proof's P-256 signature over `authenticatorData ||
   * sha256(clientDataJSON)` verifies under the config's point, `s` is low, the
   * authenticator data carries the config's rpId hash with the user present
   * and verified, and the client data is a `webauthn.get` over the digest in
   * base64url. A runtime without WebCrypto judges nothing.
   */
  private async judge(configBytes: Hex, proof: Hex, digest: Hex): Promise<Verdict> {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) {
      return 'not-judged'
    }
    let config: PasskeyConfigFields
    let fields: PasskeyProofFields
    try {
      config = this.codec.decodeConfig(configBytes)
      fields = this.codec.decodeProof(proof)
    } catch {
      return 'rejected'
    }
    const authData = hexToBytes(fields.authenticatorData)
    if (authData.length < AUTHENTICATOR_DATA_MIN) {
      return 'rejected'
    }
    if (bytesToHex(authData.slice(0, 32)) !== config.rpIdHash.toLowerCase()) {
      return 'rejected'
    }
    // eslint-disable-next-line no-bitwise
    if ((authData[32]! & USER_PRESENT_AND_VERIFIED) !== USER_PRESENT_AND_VERIFIED) {
      return 'rejected'
    }
    if (isHighS(hexToBigInt(fields.s)) || !assertsDigest(fields.clientDataJSON, digest)) {
      return 'rejected'
    }
    try {
      const key = await subtle.importKey('raw', uncompressedPoint(config), P256_ECDSA, false, [
        'verify'
      ])
      const verified = await subtle.verify(
        ECDSA_SHA256,
        key,
        hexToArrayBuffer(concat([fields.r, fields.s])),
        hexToArrayBuffer(concat([fields.authenticatorData, sha256(fields.clientDataJSON)]))
      )
      return verified ? 'satisfied' : 'rejected'
    } catch {
      return 'rejected'
    }
  }

  /** The config of the credential the double's willing device holds, under `relyingPartyId`. */
  async satisfyingConfig(relyingPartyId: string): Promise<Hex> {
    const { x, y } = await theApproverKey()
    return this.codec.encodeConfig({
      x,
      y,
      rpIdHash: sha256(stringToHex(relyingPartyId))
    })
  }

  /**
   * The assertion the double's willing device returns: signed with the key
   * `satisfyingConfig` commits, over the request's digest, with the signature
   * in DER as the authenticator gives it.
   */
  async satisfyingMaterial(request: ApproverRequest): Promise<PasskeySatisfyingMaterial> {
    const { rpIdHash } = this.codec.decodeConfig(request.config)
    const authenticatorData = hexToBytes(
      concat([rpIdHash, numberToHex(USER_PRESENT_AND_VERIFIED, { size: 1 }), '0x00000000'])
    )
    const clientDataJSON = stringToBytes(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: toBase64Url(hexToBytes(digestOfRequest(request))),
        origin: APPROVER_ORIGIN
      })
    )
    const subtle = webCrypto()
    const { privateKey } = await theApproverKey()
    const raw = new Uint8Array(
      await subtle.sign(
        ECDSA_SHA256,
        privateKey,
        hexToArrayBuffer(concat([bytesToHex(authenticatorData), sha256(clientDataJSON)]))
      )
    )
    const signature = encodeDerSignature({
      r: bytesToBigInt(raw.slice(0, 32)),
      s: bytesToBigInt(raw.slice(32, 64))
    })
    return { assertion: { response: { authenticatorData, clientDataJSON, signature } } }
  }

  describe(ctx: MethodContext): DeviceFacts {
    let rpIdHash: Hex | undefined
    try {
      rpIdHash = this.codec.decodeConfig(ctx.request.config).rpIdHash
    } catch {
      rpIdHash = undefined
    }
    return { kind: this.deviceKind, rpIdHash }
  }
}

// ---------------------------------------------------------------------------

/** `method-zkpassport`: the zkPassport app proves; config is the unique identifier. */
export class ZkPassportMethodDouble extends MethodDouble {
  readonly kind = 'zkpassport' as const

  readonly deviceBinding = 'external-app' as const

  readonly deviceKind = 'external-proving-app' as const

  readonly vector = ['method-zkpassport-config.json', 'method-zkpassport-proof.json']

  readonly codec: IMethodCodec<ZkPassportConfigFields, ProofFields> = {
    encodeConfig: ({ uniqueIdentifier }) =>
      encodeAbiParameters([{ type: 'bytes32' }], [uniqueIdentifier]),
    decodeConfig: (config) => {
      const [uniqueIdentifier] = decodeAbiParameters([{ type: 'bytes32' }], config)
      refuseNonCanonical(config, encodeAbiParameters([{ type: 'bytes32' }], [uniqueIdentifier]))
      return { uniqueIdentifier }
    },
    ...opaqueProof
  }

  modules(descriptor: DeploymentDescriptor): Address[] {
    return [descriptor.methodZkpassport]
  }

  private requestRecord(params: unknown, boundData: string): unknown {
    const p = params as ZkPassportParams
    if (!p?.domain || !p?.scope) {
      throw codedError('params-missing', { method: 'zkpassport', missing: ['domain', 'scope'] })
    }
    return {
      domain: p.domain,
      scope: p.scope,
      name: p.name,
      logo: p.logo,
      purpose: p.purpose,
      boundData,
      url: `https://zkpassport.double/request?bound=${boundData}`
    }
  }

  /** `params: { domain, scope, name, logo, purpose }`; bound to the enrollment marker. */
  enrollInput(params: unknown): unknown {
    return this.requestRecord(params, 'enrollment')
  }

  /** `material: { result }`, the double's result carrying the `uniqueIdentifier`. */
  protected enrollConfig(_input: unknown, material: unknown): Hex | EnrollFailure {
    const id = (material as ZkPassportEnrollMaterial | undefined)?.result?.uniqueIdentifier
    if (!nonEmptyHex(id) || id.length !== 66) {
      return enrollFailure('material-rejected')
    }
    return this.codec.encodeConfig({ uniqueIdentifier: id })
  }

  signingInput(ctx: MethodContext, params?: unknown): unknown {
    return this.requestRecord(params, ctx.digest)
  }

  /** `material: { proofs }`, the double's proofs being the proof bytes. */
  protected proofFrom(ctx: MethodContext, input: unknown, material: unknown): Hex | ReplyFailure {
    const proofs = (material as ZkPassportReplyMaterial | undefined)?.proofs
    return nonEmptyHex(proofs) ? proofs : replyFailure('material-rejected')
  }

  satisfyingMaterial(request: ApproverRequest) {
    return { proofs: doubleProof(request.config, digestOfRequest(request)) }
  }

  describe(): DeviceFacts {
    return { kind: this.deviceKind, phoneShowsNameLogoPurpose: true }
  }
}

// ---------------------------------------------------------------------------

/** `method-aadhaar`: an in-page prover over the QR data; config is the nullifier. */
export class AadhaarMethodDouble extends MethodDouble {
  readonly kind = 'aadhaar' as const

  readonly deviceBinding = 'in-browser-prover' as const

  readonly deviceKind = 'in-page-prover' as const

  readonly vector = ['method-aadhaar-config.json', 'method-aadhaar-proof.json']

  readonly codec: IMethodCodec<AadhaarConfigFields, ProofFields> = {
    encodeConfig: ({ nullifier }) => encodeAbiParameters([{ type: 'bytes32' }], [nullifier]),
    decodeConfig: (config) => {
      const [nullifier] = decodeAbiParameters([{ type: 'bytes32' }], config)
      refuseNonCanonical(config, encodeAbiParameters([{ type: 'bytes32' }], [nullifier]))
      return { nullifier }
    },
    ...opaqueProof
  }

  modules(descriptor: DeploymentDescriptor): Address[] {
    return [descriptor.methodAadhaar]
  }

  /** The nullifier the double's circuit derives from the seed and the QR data. */
  static nullifierOf(nullifierSeed: string, qrData: Hex): Hex {
    return hashOf({ nullifier: [nullifierSeed, qrData] })
  }

  private args(params: unknown, signal: string): AadhaarInput {
    const p = params as AadhaarParams | undefined
    if (p?.nullifierSeed === undefined || !p?.issuerCertificate) {
      throw codedError('params-missing', {
        method: 'aadhaar',
        missing: ['nullifierSeed', 'issuerCertificate']
      })
    }
    return {
      nullifierSeed: String(p.nullifierSeed),
      issuerCertificate: p.issuerCertificate,
      signal
    }
  }

  /** `params: { nullifierSeed, issuerCertificate }`; the signal is the enrollment marker. */
  enrollInput(params: unknown): unknown {
    return this.args(params, 'enrollment')
  }

  /** `material: { qrData, onProgress?, signal? }`; the double proves at once. */
  protected enrollConfig(input: unknown, material: unknown): Hex | EnrollFailure {
    const seed = (input as Partial<AadhaarInput> | undefined)?.nullifierSeed
    const qrData = (material as AadhaarMaterial | undefined)?.qrData
    if (seed === undefined || !nonEmptyHex(qrData)) {
      return enrollFailure('material-rejected')
    }
    return this.codec.encodeConfig({ nullifier: AadhaarMethodDouble.nullifierOf(seed, qrData) })
  }

  signingInput(ctx: MethodContext, params?: unknown): unknown {
    return this.args(params, ctx.digest)
  }

  protected proofFrom(ctx: MethodContext, input: unknown, material: unknown): Hex | ReplyFailure {
    const seed = (input as Partial<AadhaarInput> | undefined)?.nullifierSeed
    const qrData = (material as AadhaarMaterial | undefined)?.qrData
    if (seed === undefined || !nonEmptyHex(qrData)) {
      return replyFailure('material-rejected')
    }
    const config = this.codec.encodeConfig({
      nullifier: AadhaarMethodDouble.nullifierOf(seed, qrData)
    })
    if (config.toLowerCase() !== ctx.request.config.toLowerCase()) {
      return replyFailure('material-rejected')
    }
    return doubleProof(ctx.request.config, ctx.digest)
  }

  /**
   * The QR data can't be derived back from a nullifier, so the Aadhaar double's
   * satisfying material is the one enrolled: pass the QR data used at enrollment.
   */
  satisfyingMaterial(_request: ApproverRequest, qrData?: Hex) {
    if (!qrData) {
      throw codedError('material-missing', { method: 'aadhaar', missing: ['qrData'] })
    }
    return { qrData }
  }

  describe(): DeviceFacts {
    return { kind: this.deviceKind, qrStaysOnDevice: true, provingTakesTensOfSeconds: true }
  }
}

/** The four shipped method doubles, each reading the chain's approving-side scripts. */
export const shippedMethodDoubles = (chain?: ScriptedChain): AnyMethodDouble[] => [
  new WalletMethodDouble(chain),
  new PasskeyMethodDouble(chain),
  new ZkPassportMethodDouble(chain),
  new AadhaarMethodDouble(chain)
]
