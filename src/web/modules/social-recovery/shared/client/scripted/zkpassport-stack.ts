/**
 * The scripted zkPassport stack: a double of the zkPassport app library and of
 * the phone that answers its requests, for the build with no deployment and
 * the unit tests. The SDK's own zkPassport method runs over it unchanged.
 *
 * A request answers itself on a timer, the way the phone would: received,
 * generating, one outer proof generated, then the success and the result
 * callbacks. At a claim the proof binds the digest text the request bound.
 * The verifier parameters carry the known-answer vector's words, with the
 * unique identifier the proof was generated with, so an enrollment and a
 * claim of one identifier agree and a claim of another does not. `script`
 * makes the phone decline, err, never answer, or prove another identifier.
 */
import type {
  ZkPassportClient,
  ZkPassportQueryBuilder,
  ZkPassportRequest,
  ZkPassportRequestArgs,
  ZkPassportStackProof,
  ZkPassportVerifierParameters
} from '@kohaku-eth/social-recovery'
import type { Hex } from 'viem'
import { numberToHex } from 'viem'

import type {
  ScriptedZkPassportOptions,
  ScriptedZkPassportScript,
  ScriptedZkPassportStack
} from './types'

const DEFAULT_IDENTIFIER = 123n
const DEFAULT_STEP_MS = 400
const PHONE_ERROR = 'The phone could not read the document.'
const OUTER_PROOF_NAME = 'outer_evm_count_4'
const VALIDITY_SECONDS = 86400
const CUSTOM_DATA_KEY = 'custom_data'

const word = (value: bigint): Hex => numberToHex(value, { size: 32 })

/** The outer proof's public inputs: the vector's words, the non-salted type, the identifier. */
const publicInputsOf = (identifier: bigint): Hex[] =>
  [0x0an, 0x0bn, 0x0cn, 0x0dn, 0x0en, 0n, identifier, 0n].map(word)

/** The callbacks one request holds, each a list the phone fires in order. */
const callbackLists = () => ({
  received: [] as (() => void)[],
  generating: [] as (() => void)[],
  generated: [] as ((proof: ZkPassportStackProof) => void)[],
  success: [] as ((response: { proofs: ZkPassportStackProof[]; result: unknown }) => unknown)[],
  result: [] as ((response: unknown) => void)[],
  reject: [] as (() => void)[],
  error: [] as ((error: string) => void)[]
})

export const createScriptedZkPassportStack = (
  options: ScriptedZkPassportOptions = {}
): ScriptedZkPassportStack => {
  const stepMs = options.stepMs ?? DEFAULT_STEP_MS
  const defaultIdentifier = options.identifier ?? DEFAULT_IDENTIFIER
  let current: ScriptedZkPassportScript = {}
  let requests = 0
  // The identifier each proof this stack generated carries, read back by the verifier parameters.
  const identifiers = new WeakMap<ZkPassportStackProof, bigint>()

  const open = (args: ZkPassportRequestArgs, customData: string | undefined): ZkPassportRequest => {
    requests += 1
    const requestId = `stand-in-${requests}`
    const script = current
    const identifier = script.identifier ?? defaultIdentifier
    const callbacks = callbackLists()
    const proof: ZkPassportStackProof = {
      name: OUTER_PROOF_NAME,
      committedInputs:
        customData === undefined ? {} : { bind_evm: { data: { custom_data: customData } } }
    }
    identifiers.set(proof, identifier)
    const proofs = [proof]

    const fire =
      <A extends unknown[]>(list: ((...values: A) => unknown)[], ...values: A) =>
      () =>
        list.forEach((callback) => callback(...values))
    const answered = (): (() => void)[] => {
      switch (script.answer) {
        case 'silent':
          return []
        case 'reject':
          return [fire(callbacks.received), fire(callbacks.reject)]
        case 'error':
          return [fire(callbacks.received), fire(callbacks.error, script.error ?? PHONE_ERROR)]
        case 'result':
        default:
          return [
            fire(callbacks.received),
            fire(callbacks.generating),
            fire(callbacks.generated, proof),
            () => {
              fire(callbacks.success, { proofs, result: {} })()
              fire(callbacks.result, {
                verified: true,
                uniqueIdentifier: identifier.toString(),
                proofs
              })()
            }
          ]
      }
    }
    answered().forEach((answer, index) => setTimeout(answer, stepMs * (index + 1)))

    const query = new URLSearchParams({ id: requestId, scope: args.scope })
    const request = {
      url: `https://zkpassport.stand-in/r?${query.toString()}`,
      requestId,
      onRequestReceived: (callback: () => void) => {
        callbacks.received.push(callback)
      },
      onGeneratingProof: (callback: () => void) => {
        callbacks.generating.push(callback)
      },
      onProofGenerated: (callback: (generated: ZkPassportStackProof) => void) => {
        callbacks.generated.push(callback)
      },
      onSuccess: (
        callback: (response: { proofs: ZkPassportStackProof[]; result: unknown }) => unknown
      ) => {
        callbacks.success.push(callback)
      },
      onReject: (callback: () => void) => {
        callbacks.reject.push(callback)
      },
      onError: (callback: (error: string) => void) => {
        callbacks.error.push(callback)
      },
      onResult: (callback: (response: unknown) => void) => {
        callbacks.result.push(callback)
      }
    }
    return request
  }

  const builderFor = (
    args: ZkPassportRequestArgs,
    customData?: string
  ): ZkPassportQueryBuilder => ({
    bind: (key, value) => builderFor(args, key === CUSTOM_DATA_KEY ? value : customData),
    done: () => open(args, customData)
  })

  const client: ZkPassportClient = {
    request: async (args) => builderFor(args),
    getSolidityVerifierParameters: ({ proof, domain, scope }): ZkPassportVerifierParameters => ({
      version: '1.0.0',
      proofVerificationData: {
        vkeyHash: word(0x63n),
        proof: '0x123456',
        publicInputs: publicInputsOf(identifiers.get(proof) ?? defaultIdentifier)
      },
      committedInputs: '0x1234',
      serviceConfig: { validityPeriodInSeconds: VALIDITY_SECONDS, domain, scope, devMode: false }
    })
  }

  return Object.assign(async () => client, {
    script: (next: ScriptedZkPassportScript) => {
      current = { ...next }
    }
  })
}
