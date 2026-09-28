/**
 * The recovery proof gathering: the three gathering records, the add result and
 * the assessment. Imported from no SDK package; types only.
 *
 * The three records are versioned rather than frozen. Every field whose value can
 * exceed a JavaScript number travels as a decimal string (the attempt id, the
 * setup nonce, the payment amount, `validUntil`, the chain id and the digest
 * version); the place travels as a number.
 */
import type { Address, Hex } from './common'
import type { Finding, RequestErrorCode, RequestWarningCode } from './utilities'

/** The two purposes a gathering runs under. */
export const GATHERING_PURPOSES = ['approval', 'cancellation'] as const
export type GatheringPurpose = typeof GATHERING_PURPOSES[number]

/**
 * A place's stop standing. Its method is stopped only when the method's pause
 * read returns exactly `true`; a revert, an empty return or any other value
 * reads as not stopped.
 */
export const PLACE_STANDINGS = ['stopped', 'not-stopped'] as const
export type PlaceStanding = typeof PLACE_STANDINGS[number]

/** The three record kinds. */
export const GATHERING_RECORD_KINDS = [
  'recovery-proof-request',
  'recovery-proof-reply',
  'gathering'
] as const
export type GatheringRecordKind = typeof GATHERING_RECORD_KINDS[number]

/** The payment order as the records carry it, the amount as a decimal string. */
export interface SerializedPaymentOrder {
  token: Address
  amount: string
  payee: Address
}

/**
 * The request one approver receives: one place's method, config and salt and no
 * other place's, the body as its hash, no label. A cancellation request carries
 * no payload and no order.
 */
export interface ApproverRequest {
  kind: 'recovery-proof-request'
  version: number
  purpose: GatheringPurpose
  chainId: string
  manager: Address
  digestVersion: string
  account: Address
  action: Address
  attemptId: string
  setupNonce: string
  setupBodyHash: Hex
  payload?: Hex
  order?: SerializedPaymentOrder
  validUntil: string
  place: number
  method: Address
  config: Hex
  salt: Hex
}

/**
 * The reply one approver sends back: six binding fields, the place's identity,
 * the digest the proof was made against and the proof.
 */
export interface ApproverReply {
  kind: 'recovery-proof-reply'
  version: number
  chainId: string
  manager: Address
  account: Address
  action: Address
  attemptId: string
  purpose: GatheringPurpose
  place: number
  method: Address
  config: Hex
  salt: Hex
  digest: Hex
  proof: Hex
}

/** One place of the place map, always whole, in body order. */
export interface GatheringPlace {
  place: number
  method: Address
  config: Hex
  salt: Hex
  label?: string
  standing: PlaceStanding
  stoppable: boolean
}

/**
 * The gathering the assembling wallet holds. It stores only what cannot be
 * recomputed and carries no satisfied, filled or verified field.
 * `consumableAfter` is present on a cancellation alone.
 */
export interface Gathering {
  kind: 'gathering'
  version: number
  purpose: GatheringPurpose
  request: {
    chainId: string
    manager: Address
    digestVersion: string
    account: Address
    action: Address
    attemptId: string
    setupNonce: string
    setupBody: Hex
    payload?: Hex
    order?: SerializedPaymentOrder
    validUntil: string
    consumableAfter?: string
    block: { number: number; timestamp: string; hash: Hex }
  }
  places: GatheringPlace[]
  replies: ApproverReply[]
}

/**
 * The five refusals of `addApproverReply`: a kind or version it does not read,
 * binding fields that do not match, a digest this gathering does not produce for
 * that place, a place the map does not name, and a method, config or salt that
 * is not the place's. The slugs are the extension's own.
 */
export const ADD_REFUSAL_REASONS = [
  'version-unread',
  'binding-mismatch',
  'digest-mismatch',
  'place-unknown',
  'credential-mismatch'
] as const
export type AddRefusalReason = typeof ADD_REFUSAL_REASONS[number]

/**
 * What `addApproverReply` returns, never a thrown error: a new record, the
 * reply it displaced where the place was filled, and on a refusal the reason in
 * the reply failure's shape with the record passed in unchanged.
 */
export interface AddResult {
  gathering: Gathering
  displaced?: ApproverReply
  reason?: { kind: 'add-refusal'; cause: AddRefusalReason }
}

/**
 * What `assess(gathering, now)` returns: the filled and missing places in
 * ascending order, each clause's threshold beside its filled count, whether the
 * rule is satisfied, and the findings its own arithmetic reaches. No verdict on
 * any proof.
 */
export interface Assessment {
  filled: number[]
  missing: number[]
  clauses: { clause: number; threshold: number; filled: number }[]
  ruleSatisfied: boolean
  findings: Finding<RequestErrorCode | RequestWarningCode>[]
}

/** The window an init takes, in seconds. */
export interface GatheringWindow {
  window: number
}
