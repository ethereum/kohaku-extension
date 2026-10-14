/**
 * The guardian method (`method-ecdsa`) as the deployed module judges it: the
 * config is the guardian's address, the guardian's wallet signs the place's
 * typed data, and the proof is the signature's bytes. The module recovers a
 * raw 65-byte secp256k1 signature over the digest, with no personal-message
 * prefix, and asks an address that holds code through ERC-1271 otherwise.
 *
 * A 65-byte signature leaves `replyFrom` in the one form the module's library
 * accepts: a low `s` and a recovery byte of 27 or 28. Bytes of any other
 * length are a contract wallet's own and pass through for the chain to judge.
 * `verify` answers satisfied only where the canonical signature recovers to the
 * config's address, so a local yes is never wider than the chain's; any other
 * well-formed bytes are not judged, since the address may hold code.
 */
import {
  decodeAbiParameters,
  encodeAbiParameters,
  hexToBigInt,
  isAddress,
  isAddressEqual,
  isHex,
  numberToHex,
  parseSignature,
  recoverAddress,
  serializeSignature,
  size
} from 'viem'

import type {
  Address,
  DeploymentDescriptor,
  DeviceFacts,
  EnrollFailure,
  Hex,
  IMethodCodec,
  IRecoveryMethod,
  MethodContext,
  ReplyFailure,
  Verdict
} from '@web/modules/social-recovery/sdk-interfaces'

import { ecdsaConfigOf } from '../formats'
import type { EcdsaConfigFields, EcdsaEnrollParams, EcdsaReplyMaterial, ProofFields } from './types'

/** The order of the secp256k1 group. */
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const HALF_N = SECP256K1_N / 2n

const SIGNATURE_BYTES = 65

const ADDRESS_LAYOUT = [{ type: 'address' }] as const

const materialRejected: ReplyFailure = { kind: 'reply-failure', cause: 'material-rejected' }
const enrollRejected: EnrollFailure = { kind: 'enroll-failure', cause: 'material-rejected' }

const isByteHex = (value: unknown): value is Hex => isHex(value) && value.length % 2 === 0

/**
 * The signature in its canonical form, lowercase with a low `s` and a recovery
 * byte of 27 or 28, or null where the bytes are no secp256k1 signature.
 */
const canonicalSignatureOf = (signature: Hex): Hex | null => {
  let parsed: ReturnType<typeof parseSignature>
  try {
    parsed = parseSignature(signature)
  } catch {
    return null
  }
  const s = hexToBigInt(parsed.s)
  return s > HALF_N
    ? serializeSignature({
        r: parsed.r,
        s: numberToHex(SECP256K1_N - s, { size: 32 }),
        yParity: parsed.yParity === 0 ? 1 : 0
      })
    : serializeSignature({ r: parsed.r, s: parsed.s, yParity: parsed.yParity })
}

const codec: IMethodCodec<EcdsaConfigFields, ProofFields> = {
  encodeConfig: ({ address }) => ecdsaConfigOf(address),
  decodeConfig: (config) => {
    const [address] = decodeAbiParameters(ADDRESS_LAYOUT, config)
    // A decode refuses bytes its encode would not reproduce.
    if (encodeAbiParameters(ADDRESS_LAYOUT, [address]).toLowerCase() !== config.toLowerCase()) {
      throw new Error('The bytes are not the canonical encoding of the decoded fields.')
    }
    return { address }
  },
  encodeProof: ({ proof }) => proof,
  decodeProof: (proof) => ({ proof })
}

const describe = (ctx: MethodContext): DeviceFacts => {
  let address: Address | undefined
  try {
    address = codec.decodeConfig(ctx.request.config).address
  } catch {
    address = undefined
  }
  return { kind: 'wallet-typed-data', address, keyOrContractUnknown: true }
}

const verify = async (ctx: MethodContext, proof: Hex): Promise<Verdict> => {
  try {
    if (!isByteHex(proof)) {
      return 'rejected'
    }
    if (size(proof) !== SIGNATURE_BYTES) {
      return 'not-judged'
    }
    const canonical = canonicalSignatureOf(proof)
    if (!canonical) {
      return 'rejected'
    }
    const { address } = codec.decodeConfig(ctx.request.config)
    const signer = await recoverAddress({ hash: ctx.digest, signature: canonical })
    return isAddressEqual(signer, address) && canonical === proof.toLowerCase()
      ? 'satisfied'
      : 'not-judged'
  } catch {
    return 'rejected'
  }
}

/** The kit's guardian method: a guardian's wallet signs the place's typed data. */
export const createEcdsaMethod = (): IRecoveryMethod => ({
  modules: (descriptor: DeploymentDescriptor): Address[] => [descriptor.methodEcdsa],

  // No ceremony runs: the input is the typed address itself.
  enrollInput: (params: unknown): unknown => ({
    address: (params as EcdsaEnrollParams | undefined)?.address
  }),

  configFrom: async (input: unknown): Promise<Hex | EnrollFailure> => {
    const address = (input as EcdsaEnrollParams | undefined)?.address
    // The strict check refuses a mixed-case address with a wrong checksum.
    if (!address || !isAddress(address, { strict: true })) {
      return enrollRejected
    }
    return ecdsaConfigOf(address)
  },

  signingInput: (ctx: MethodContext): unknown => ctx.typedData,

  replyFrom: async (
    ctx: MethodContext,
    input: unknown,
    material: unknown
  ): Promise<Hex | ReplyFailure> => {
    const signature = (material as EcdsaReplyMaterial | undefined)?.signature
    if (!isByteHex(signature) || signature === '0x') {
      return materialRejected
    }
    if (size(signature) !== SIGNATURE_BYTES) {
      return signature
    }
    return canonicalSignatureOf(signature) ?? materialRejected
  },

  verify,
  codec,
  deviceBinding: 'none',
  describe,
  vector: ['method-ecdsa-config.json', 'method-ecdsa-proof.json']
})
