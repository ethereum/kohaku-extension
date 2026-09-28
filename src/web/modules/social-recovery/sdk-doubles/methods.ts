/* eslint-disable max-classes-per-file -- the four shipped method doubles share one base and one file */
/**
 * One scripted `IRecoveryMethod` double per shipped kind: wallet
 * (`method-ecdsa`), passkey, zkPassport and Aadhaar. Each carries the ten members
 * with its kind's params and material records, and none runs a device, a
 * prover or real cryptography.
 *
 * The doubles' proof convention: a proof satisfies a credential exactly when it
 * equals `doubleProof(config, digest)`. The wallet, passkey and zkPassport
 * doubles package whatever bytes the device handed back (the signature, the
 * assertion, the proofs) and judge them by that rule; the Aadhaar double proves
 * itself from the QR data, as the in-page prover does. `satisfyingMaterial`
 * builds the material a willing approver's device would return.
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
  decodeAbiParameters,
  encodeAbiParameters,
  isAddress,
  isHex,
  sha256,
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
  PasskeyConfigFields,
  PasskeyEnrollInput,
  PasskeyEnrollMaterial,
  PasskeyEnrollParams,
  PasskeyReplyMaterial,
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

/** A pass-through proof codec: the doubles' proofs are opaque bytes. */
const opaqueProof = {
  encodeProof: ({ proof }: ProofFields): Hex => proof,
  decodeProof: (proof: Hex): ProofFields => ({ proof })
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
    if (this.chain?.enrollFailure) return enrollFailure(this.chain.enrollFailure)
    return this.enrollConfig(input, material)
  }

  async replyFrom(
    ctx: MethodContext,
    input: unknown,
    material: unknown
  ): Promise<Hex | ReplyFailure> {
    if (this.chain?.replyFailure) return replyFailure(this.chain.replyFailure)
    return this.proofFrom(ctx, input, material)
  }

  async verify(ctx: MethodContext, proof: Hex): Promise<Verdict> {
    if (this.chain?.verdict) return this.chain.verdict
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
    decodeConfig: (config) => ({ address: decodeAbiParameters([{ type: 'address' }], config)[0] }),
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
    if (!address || !isAddress(address, { strict: true })) return enrollFailure('material-rejected')
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

/** `method-passkey`: a WebAuthn credential; config is the public key beside the rpId hash. */
export class PasskeyMethodDouble extends MethodDouble {
  readonly kind = 'passkey' as const

  readonly deviceBinding = 'browser-authenticator' as const

  readonly deviceKind = 'webauthn-authenticator' as const

  readonly vector = ['method-passkey-config.json', 'method-passkey-proof.json']

  readonly codec: IMethodCodec<PasskeyConfigFields, ProofFields> = {
    encodeConfig: ({ publicKey, rpIdHash }) =>
      encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes32' }], [publicKey, rpIdHash]),
    decodeConfig: (config) => {
      const [publicKey, rpIdHash] = decodeAbiParameters(
        [{ type: 'bytes' }, { type: 'bytes32' }],
        config
      )
      return { publicKey, rpIdHash }
    },
    ...opaqueProof
  }

  modules(descriptor: DeploymentDescriptor): Address[] {
    return [descriptor.methodPasskey]
  }

  /** `params: { relyingPartyId, userName }`; returns the creation options. */
  enrollInput(params: unknown): unknown {
    const p = params as PasskeyEnrollParams | undefined
    if (!p?.relyingPartyId)
      throw codedError('params-missing', { method: 'passkey', missing: ['relyingPartyId'] })
    return {
      rp: { id: p.relyingPartyId },
      user: { name: p.userName ?? '' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { userVerification: 'required', residentKey: 'required' },
      attestation: 'none'
    }
  }

  /** `material: { credential }`, the double's credential carrying its `publicKey` bytes. */
  protected enrollConfig(input: unknown, material: unknown): Hex | EnrollFailure {
    const rpId = (input as PasskeyEnrollInput | undefined)?.rp?.id
    const publicKey = (material as PasskeyEnrollMaterial | undefined)?.credential?.publicKey
    if (!rpId || !nonEmptyHex(publicKey)) return enrollFailure('material-rejected')
    // WebAuthn's rpIdHash is the SHA-256 of the relying party id.
    return this.codec.encodeConfig({ publicKey, rpIdHash: sha256(stringToHex(rpId)) })
  }

  /** `params: { relyingPartyId, credentialId? }`; the digest is the challenge. */
  signingInput(ctx: MethodContext, params?: unknown): unknown {
    const p = params as PasskeySigningParams | undefined
    if (!p?.relyingPartyId)
      throw codedError('params-missing', { method: 'passkey', missing: ['relyingPartyId'] })
    return {
      challenge: ctx.digest,
      rpId: p.relyingPartyId,
      userVerification: 'required',
      allowCredentials: p.credentialId ? [{ type: 'public-key', id: p.credentialId }] : []
    }
  }

  /** `material: { assertion }`, the double's assertion being the proof bytes. */
  protected proofFrom(ctx: MethodContext, input: unknown, material: unknown): Hex | ReplyFailure {
    const assertion = (material as PasskeyReplyMaterial | undefined)?.assertion
    return nonEmptyHex(assertion) ? assertion : replyFailure('material-rejected')
  }

  satisfyingMaterial(request: ApproverRequest) {
    return { assertion: doubleProof(request.config, digestOfRequest(request)) }
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
    decodeConfig: (config) => ({
      uniqueIdentifier: decodeAbiParameters([{ type: 'bytes32' }], config)[0]
    }),
    ...opaqueProof
  }

  modules(descriptor: DeploymentDescriptor): Address[] {
    return [descriptor.methodZkpassport]
  }

  private requestRecord(params: unknown, boundData: string): unknown {
    const p = params as ZkPassportParams
    if (!p?.domain || !p?.scope)
      throw codedError('params-missing', { method: 'zkpassport', missing: ['domain', 'scope'] })
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
    if (!nonEmptyHex(id) || id.length !== 66) return enrollFailure('material-rejected')
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
    decodeConfig: (config) => ({
      nullifier: decodeAbiParameters([{ type: 'bytes32' }], config)[0]
    }),
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
    if (seed === undefined || !nonEmptyHex(qrData)) return enrollFailure('material-rejected')
    return this.codec.encodeConfig({ nullifier: AadhaarMethodDouble.nullifierOf(seed, qrData) })
  }

  signingInput(ctx: MethodContext, params?: unknown): unknown {
    return this.args(params, ctx.digest)
  }

  protected proofFrom(ctx: MethodContext, input: unknown, material: unknown): Hex | ReplyFailure {
    const seed = (input as Partial<AadhaarInput> | undefined)?.nullifierSeed
    const qrData = (material as AadhaarMaterial | undefined)?.qrData
    if (seed === undefined || !nonEmptyHex(qrData)) return replyFailure('material-rejected')
    const config = this.codec.encodeConfig({
      nullifier: AadhaarMethodDouble.nullifierOf(seed, qrData)
    })
    if (config.toLowerCase() !== ctx.request.config.toLowerCase())
      return replyFailure('material-rejected')
    return doubleProof(ctx.request.config, ctx.digest)
  }

  /**
   * The QR data can't be derived back from a nullifier, so the Aadhaar double's
   * satisfying material is the one enrolled: pass the QR data used at enrollment.
   */
  satisfyingMaterial(_request: ApproverRequest, qrData?: Hex) {
    if (!qrData) throw codedError('material-missing', { method: 'aadhaar', missing: ['qrData'] })
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
