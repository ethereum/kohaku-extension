/**
 * The doubles' prepared-call composer. The calldata is the doubles' own bytes, a
 * four-byte tag of the function name followed by its arguments as JSON, unique
 * per prepare, so the scripted chain can land what it prepared.
 */
import type {
  Address,
  BlockHeader,
  Hex,
  KitError,
  PreparedBatch,
  PreparedCall,
  PrepareOptions,
  Sender
} from '@web/modules/social-recovery/sdk-interfaces'
import { concat, keccak256, stringToHex } from 'viem'

import type { ScriptedChain } from './chain'
import { DEFAULT_SIMULATE } from './context'
import { addressOf, toJson } from './encoding'
import type { ComposeInput } from './types'

let serial = 0

/** The doubles' calldata: `name`'s four-byte tag, then the arguments as JSON bytes. */
export const calldataOf = (name: string, args: unknown): Hex =>
  concat([
    keccak256(stringToHex(name)).slice(0, 10) as Hex,
    stringToHex(toJson({ args, serial: ++serial }))
  ])

/** The address a permissionless call's simulation runs from where no `from` was given. */
export const ARBITRARY_SENDER: Address = addressOf('arbitrary-simulation-sender')

/** A prepared call with no simulation, as the manager part's own prepares return it. */
export const composeCall = (chain: ScriptedChain, input: ComposeInput): PreparedCall => {
  const data = calldataOf(input.name, input.args)
  if (input.effect) chain.registerEffect(data, input.effect)
  const call: PreparedCall = {
    kind: 'call',
    target: input.target,
    value: 0n,
    data,
    sender: input.sender,
    block: { number: input.block.number, hash: input.block.hash }
  }
  if (input.describes) call.describes = input.describes
  return call
}

/** Whether a prepare simulates: its own option first, the configuration's default second. */
export const shouldSimulate = (
  options: PrepareOptions | undefined,
  fallback: boolean | undefined
) => options?.simulate ?? fallback ?? DEFAULT_SIMULATE

/**
 * The address a simulation runs from: the account for a call the account sends,
 * otherwise the caller's `from` or an arbitrary sender.
 */
export const simulationFrom = (
  chain: ScriptedChain,
  sender: Sender,
  options: PrepareOptions | undefined
): Address => (sender === 'account' ? chain.account : options?.from ?? ARBITRARY_SENDER)

/** Attaches a simulation outcome to a call. */
export const withSimulation = (
  call: PreparedCall,
  from: Address,
  error: KitError | undefined
): PreparedCall => ({
  ...call,
  simulation: error ? { ok: false, from, error } : { ok: true, from }
})

/** One atomic batch pinned at one block. */
export const composeBatch = (calls: PreparedCall[], block: BlockHeader): PreparedBatch => ({
  kind: 'batch',
  calls,
  atomic: true,
  block: { number: block.number, hash: block.hash }
})
