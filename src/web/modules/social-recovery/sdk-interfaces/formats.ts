/**
 * The formatter: the two codec types and the manager's calldata structs the
 * formats encode. Imported from no SDK package; types only. Field names are the
 * contracts' own; uint64 and uint256 travel as bigint, uint48 timestamps as
 * number.
 */
import type { Address, Hex } from './common'

/**
 * What the account pays and to whom. A zero amount pays nobody; a zero payee
 * leaves the order open for whoever executes.
 */
export interface PaymentOrder {
  token: Address
  amount: bigint
  payee: Address
}

/**
 * The Ambire recovery action's payload layout: the new authority and the
 * removed authority, nothing else.
 */
export interface Handover {
  newAuthority: Address
  removedAuthority: Address
}

/** One filled place: place, method, config, salt and proof. */
export interface ProofPlace {
  place: bigint
  method: Address
  config: Hex
  salt: Hex
  proof: Hex
}

/** The opening submission `complete` yields under the approval purpose. */
export interface AttemptRequest {
  account: Address
  action: Address
  attemptId: bigint
  setupNonce: bigint
  setupBody: Hex
  payload: Hex
  order: PaymentOrder
  validUntil: number
  proofs: ProofPlace[]
}

/** The cancellation `complete` yields under the cancellation purpose: no payload, no order. */
export interface CancelRequest {
  account: Address
  action: Address
  attemptId: bigint
  setupNonce: bigint
  setupBody: Hex
  validUntil: number
  proofs: ProofPlace[]
}

/**
 * The action payload codec: the action addresses it serves, one per chain for
 * the kit's own, and two pure functions over the action's layout. The decoder
 * refuses bytes its encoder would not reproduce. `H` is the action's own
 * layout; the shipped action's is `Handover`.
 */
export interface IActionCodec<H = Handover> {
  actions: Address[]
  encode(handover: H): Hex
  decode(payload: Hex): H
}

/**
 * The method codec type, the `codec` member of `IRecoveryMethod`: four pure
 * functions over the method's config and proof layouts, each decode refusing
 * bytes its encode would not reproduce. The field records are the method's own.
 */
export interface IMethodCodec<ConfigFields = unknown, ProofFields = unknown> {
  encodeConfig(fields: ConfigFields): Hex
  decodeConfig(config: Hex): ConfigFields
  encodeProof(fields: ProofFields): Hex
  decodeProof(proof: Hex): ProofFields
}
