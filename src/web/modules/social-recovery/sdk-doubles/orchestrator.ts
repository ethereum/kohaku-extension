/**
 * The `IMethodsOrchestrator` double: the approving and enrolling side, holding
 * a method registry and a codec registry and no provider. It works from the
 * request alone: the request's chain id, manager and digest version
 * make the domain, its action picks the codec, its method picks the
 * implementation. It builds the `ctx` and nothing else does.
 *
 * Refusals: `signingInput` and `enrollInput` throw (an unread record, an
 * unserved method, a binding this runtime cannot meet, or a scripted refusal);
 * `replyFrom` and `configFrom` return the typed failures; `verify` answers a
 * verdict.
 */
import type {
  Address,
  ApproverReply,
  ApproverRequest,
  EnrollFailure,
  Handover,
  Hex,
  IActionCodec,
  IMethodsOrchestrator,
  IRecoveryMethod,
  MethodContext,
  ReplyFailure,
  RequestDescription,
  Verdict
} from '@web/modules/social-recovery/sdk-interfaces'
import { isHex } from 'viem'

import type { ScriptedChain } from './chain'
import { deserializeOrder, digestOf, membersOfRequest, typedDataOf } from './encoding'
import { codedError } from './scripts'

/** The record version this build of the doubles reads. */
export const RECORD_VERSION = 1

const isText = (value: unknown): value is string => typeof value === 'string'
const isDecimal = (value: unknown): boolean => isText(value) && /^[0-9]+$/.test(value)

/**
 * Whether this build reads a request record: its kind, its version, and every
 * field with its type, so a malformed record is refused as `version-unread`
 * rather than failing half-way through a digest.
 */
export const requestReadable = (request: ApproverRequest): boolean => {
  if (!request || typeof request !== 'object') return false
  const r = request as unknown as Record<string, unknown>
  const approval = r.purpose === 'approval'
  const order = r.order as Record<string, unknown> | undefined
  return (
    r.kind === 'recovery-proof-request' &&
    r.version === RECORD_VERSION &&
    (approval || r.purpose === 'cancellation') &&
    isDecimal(r.chainId) &&
    isHex(r.manager) &&
    isText(r.digestVersion) &&
    isHex(r.account) &&
    isHex(r.action) &&
    isDecimal(r.attemptId) &&
    isDecimal(r.setupNonce) &&
    isHex(r.setupBodyHash) &&
    isDecimal(r.validUntil) &&
    typeof r.place === 'number' &&
    Number.isInteger(r.place) &&
    isHex(r.method) &&
    isHex(r.config) &&
    isHex(r.salt) &&
    (!approval ||
      (isHex(r.payload) &&
        !!order &&
        isHex(order.token) &&
        isDecimal(order.amount) &&
        isHex(order.payee)))
  )
}

const reads = requestReadable

/**
 * Whether a pasted reply has the record's shape: every field present with its
 * type, the digest and the proof among them. A reply that does not is one this
 * build does not read: `addApproverReply` refuses it as `version-unread` and the
 * seam's `verifyReply` answers `rejected`, never a thrown error.
 */
export const replyReadable = (reply: unknown): reply is ApproverReply => {
  if (!reply || typeof reply !== 'object') return false
  const r = reply as Record<string, unknown>
  return (
    r.kind === 'recovery-proof-reply' &&
    r.version === RECORD_VERSION &&
    isText(r.chainId) &&
    isHex(r.manager) &&
    isHex(r.account) &&
    isHex(r.action) &&
    isText(r.attemptId) &&
    (r.purpose === 'approval' || r.purpose === 'cancellation') &&
    typeof r.place === 'number' &&
    Number.isInteger(r.place) &&
    isHex(r.method) &&
    isHex(r.config) &&
    isHex(r.salt) &&
    isHex(r.digest) &&
    isHex(r.proof)
  )
}

export class MethodsOrchestratorDouble implements IMethodsOrchestrator {
  private readonly methods = new Map<string, IRecoveryMethod>()

  private readonly codecs = new Map<string, IActionCodec<unknown>>()

  /**
   * @param methodRegistry the implementations keyed by the module addresses each serves
   * @param codecs the action codecs, keyed by their `actions`
   * @param chain the scripted chain, read for its approving-side scripts alone
   */
  constructor(
    methodRegistry: Map<string, IRecoveryMethod>,
    codecs: IActionCodec<unknown>[],
    private readonly chain?: ScriptedChain
  ) {
    methodRegistry.forEach((m, module) => this.methods.set(module.toLowerCase(), m))
    codecs.forEach((c) => c.actions.forEach((a) => this.codecs.set(a.toLowerCase(), c)))
  }

  private methodFor(address: Address): IRecoveryMethod | undefined {
    return this.methods.get(address.toLowerCase())
  }

  /**
   * The one record four implementation members take, built here and nowhere
   * else: the request, the place, the place's EIP-712 digest and the typed data
   * it is the hash of, `{ domain, types, primaryType, message }` with a numeric
   * chain id and the `Approval` or `Cancellation` members alone.
   */
  contextOf(request: ApproverRequest, place: number = request.place): MethodContext {
    const at = { ...request, place }
    const members = membersOfRequest(at)
    return { request: at, place, digest: digestOf(members), typedData: typedDataOf(members) }
  }

  /** The context, or undefined for a request whose values do not make a digest. */
  private safeContext(request: ApproverRequest, place?: number): MethodContext | undefined {
    try {
      return this.contextOf(request, place)
    } catch {
      return undefined
    }
  }

  describeRequest(request: ApproverRequest): RequestDescription {
    if (!reads(request)) throw codedError('version-unread', { kind: request?.kind })
    const approval = request.purpose === 'approval'
    let handover: RequestDescription['handover']
    if (approval) {
      const codec = this.codecs.get(request.action.toLowerCase())
      try {
        handover =
          codec && request.payload
            ? {
                decoded: true,
                value: codec.decode(request.payload) as Handover
              }
            : { decoded: false }
      } catch {
        handover = { decoded: false }
      }
    }
    const method = this.methodFor(request.method)
    const ctx = this.safeContext(request)
    let identityPublic: unknown
    try {
      identityPublic = method ? method.codec.decodeConfig(request.config) : undefined
    } catch {
      identityPublic = undefined
    }
    return {
      account: request.account,
      chainId: BigInt(request.chainId),
      manager: request.manager,
      action: request.action,
      attemptId: BigInt(request.attemptId),
      setupNonce: BigInt(request.setupNonce),
      purpose: request.purpose,
      ...(approval ? { handover } : {}),
      ...(approval && request.order ? { order: deserializeOrder(request.order) } : {}),
      validUntil: Number(request.validUntil),
      place: request.place,
      identityPublic,
      device: method && ctx ? method.describe(ctx) : { supported: false }
    }
  }

  async verify(request: ApproverRequest, place: number, proof: Hex): Promise<Verdict> {
    if (this.chain?.verdict) return this.chain.verdict
    if (!reads(request) || typeof proof !== 'string') return 'not-judged'
    const method = this.methodFor(request.method)
    const ctx = this.safeContext(request, place)
    if (!method || !ctx) return 'not-judged'
    return method.verify(ctx, proof)
  }

  signingInput(request: ApproverRequest, params?: unknown): unknown {
    this.chain?.guardRefusal('orchestrator.signingInput')
    if (!reads(request)) throw codedError('version-unread', { kind: request?.kind })
    const method = this.methodFor(request.method)
    if (!method) throw codedError('method-unsupported', { method: request.method })
    if (this.chain?.unmetBindings.has(method.deviceBinding)) {
      throw codedError('binding-unmet', { deviceBinding: method.deviceBinding })
    }
    const ctx = this.safeContext(request)
    if (!ctx) throw codedError('version-unread', { kind: request.kind })
    return method.signingInput(ctx, params)
  }

  async replyFrom(
    request: ApproverRequest,
    input: unknown,
    material: unknown
  ): Promise<ApproverReply | ReplyFailure> {
    if (!reads(request)) return { kind: 'reply-failure', cause: 'version-unread' }
    const method = this.methodFor(request.method)
    if (!method) return { kind: 'reply-failure', cause: 'method-unsupported' }
    if (this.chain?.replyFailure) return { kind: 'reply-failure', cause: this.chain.replyFailure }
    const ctx = this.safeContext(request)
    if (!ctx) return { kind: 'reply-failure', cause: 'version-unread' }
    const proof = await method.replyFrom(ctx, input, material)
    if (typeof proof !== 'string') return proof
    return {
      kind: 'recovery-proof-reply',
      version: RECORD_VERSION,
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
      digest: ctx.digest,
      proof
    }
  }

  enrollInput(method: Address, params: unknown): unknown {
    this.chain?.guardRefusal('orchestrator.enrollInput')
    const implementation = this.methodFor(method)
    if (!implementation) throw codedError('method-unsupported', { method })
    return implementation.enrollInput(params)
  }

  async configFrom(
    method: Address,
    input: unknown,
    material: unknown
  ): Promise<Hex | EnrollFailure> {
    const implementation = this.methodFor(method)
    if (!implementation) return { kind: 'enroll-failure', cause: 'method-unsupported' }
    if (this.chain?.enrollFailure)
      return { kind: 'enroll-failure', cause: this.chain.enrollFailure }
    return implementation.configFrom(input, material)
  }
}
