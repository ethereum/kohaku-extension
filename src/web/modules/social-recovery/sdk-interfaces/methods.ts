/**
 * The methods orchestrator: `IMethodsOrchestrator` and `IRecoveryMethod`, the
 * ctx the orchestrator builds, the verdict, the two typed failures and the
 * closed device-binding set. Imported from no SDK package; types only.
 *
 * The approving side reads no chain and holds no provider. `signingInput` and
 * `enrollInput` throw when they refuse; `replyFrom` and `configFrom` return the
 * typed failures below; a verdict is an answer, never a refusal.
 */
import type { Address, Hex } from './common'
import type { IMethodCodec } from './formats'
import type { DeploymentDescriptor } from './builder'
import type { ApproverReply, ApproverRequest } from './gathering'
import type { RequestDescription } from './utilities'

/** Where the approver's device has to be, one of four values and no other. */
export const DEVICE_BINDINGS = [
  'none',
  'browser-authenticator',
  'external-app',
  'in-browser-prover'
] as const
export type DeviceBinding = typeof DEVICE_BINDINGS[number]

/**
 * The three answers of a local verdict: satisfied, rejected, and not judged
 * where the verdict needs a contract's own word. The slugs are the extension's
 * own.
 */
export const VERDICTS = ['satisfied', 'rejected', 'not-judged'] as const
export type Verdict = typeof VERDICTS[number]

/**
 * The five causes a reply failure names, and the enrollment failure the same
 * shape serves: the device refused, the device was unavailable, the material was
 * the wrong shape for this method, no implementation serves the method, or the
 * record's kind or version is one this build does not read. `device-refused`
 * follows the SDK's examples; the others are the extension's.
 */
export const METHOD_FAILURE_CAUSES = [
  'device-refused',
  'device-unavailable',
  'material-rejected',
  'method-unsupported',
  'version-unread'
] as const
export type MethodFailureCause = typeof METHOD_FAILURE_CAUSES[number]

/** The typed failure `replyFrom` returns instead of throwing. */
export interface ReplyFailure {
  kind: 'reply-failure'
  cause: MethodFailureCause
}

/** The typed failure `configFrom` returns, the same shape as the reply failure. */
export interface EnrollFailure {
  // The SDK names no enrollment kind; `enroll-failure` is the extension's own.
  kind: 'enroll-failure'
  cause: MethodFailureCause
}

/**
 * The device kinds a method implementation's `describe` states: a wallet
 * signing typed data, a WebAuthn authenticator, an external proving app or a
 * prover inside the page. The slugs are the extension's own.
 */
export const DEVICE_KINDS = [
  'wallet-typed-data',
  'webauthn-authenticator',
  'external-proving-app',
  'in-page-prover'
] as const
export type DeviceKind = typeof DEVICE_KINDS[number]

/**
 * Facts about the approver's device, values a page may read and never a
 * judgment. Every implementation states its device kind; the rest is the
 * implementation's own.
 */
export interface DeviceFacts {
  kind: DeviceKind
  [fact: string]: unknown
}

/**
 * The one record four implementation members take, built by the orchestrator
 * and nothing else: the request's own members, the place this call fills, the
 * digest the formatter derives for that place and the typed data the domain and
 * the purpose give it.
 */
export interface MethodContext {
  request: ApproverRequest
  place: number
  digest: Hex
  typedData: unknown
}

/**
 * The client-side half of one method module, ten members. The input, params and
 * material records are the implementation's own.
 */
export interface IRecoveryMethod {
  modules(descriptor: DeploymentDescriptor): Address[]
  enrollInput(params: unknown): unknown
  configFrom(input: unknown, material: unknown): Promise<Hex | EnrollFailure>
  signingInput(ctx: MethodContext, params?: unknown): unknown
  replyFrom(ctx: MethodContext, input: unknown, material: unknown): Promise<Hex | ReplyFailure>
  verify(ctx: MethodContext, proof: Hex): Promise<Verdict>
  codec: IMethodCodec
  deviceBinding: DeviceBinding
  describe(ctx: MethodContext): DeviceFacts
  vector: string[]
}

/**
 * The entry of both sides that hold a credential rather than an account, its six
 * calls, `verify` being its own verdict member that builds the ctx for one
 * place. It works from the request alone and binds nothing about a deployment.
 */
export interface IMethodsOrchestrator {
  describeRequest(request: ApproverRequest): RequestDescription
  verify(request: ApproverRequest, place: number, proof: Hex): Promise<Verdict>
  signingInput(request: ApproverRequest, params?: unknown): unknown
  replyFrom(
    request: ApproverRequest,
    input: unknown,
    material: unknown
  ): Promise<ApproverReply | ReplyFailure>
  enrollInput(method: Address, params: unknown): unknown
  configFrom(method: Address, input: unknown, material: unknown): Promise<Hex | EnrollFailure>
}
