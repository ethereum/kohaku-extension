/**
 * The `IActionCodec` double for the shipped action: the payload is
 * `abi.encode(address newAuthority, address removedAuthority)`, the action's
 * real layout, and the decoder refuses bytes its encoder would not reproduce.
 */
import type {
  Address,
  Handover,
  Hex,
  IActionCodec
} from '@web/modules/social-recovery/sdk-interfaces'
import { decodeAbiParameters, encodeAbiParameters } from 'viem'

import { codedError } from './scripts'

const HANDOVER_LAYOUT = [
  { name: 'newAuthority', type: 'address' },
  { name: 'removedAuthority', type: 'address' }
] as const

export class ActionCodecDouble implements IActionCodec<Handover> {
  readonly actions: Address[]

  constructor(actions: Address[]) {
    this.actions = [...actions]
  }

  encode(handover: Handover): Hex {
    return encodeAbiParameters(HANDOVER_LAYOUT, [handover.newAuthority, handover.removedAuthority])
  }

  /** Throws a `MalformedHandover` coded error on bytes that do not decode or do not round-trip. */
  decode(payload: Hex): Handover {
    let handover: Handover
    try {
      const [newAuthority, removedAuthority] = decodeAbiParameters(HANDOVER_LAYOUT, payload)
      handover = { newAuthority, removedAuthority }
    } catch {
      throw codedError('MalformedHandover', { payload, cause: 'undecodable' })
    }
    if (this.encode(handover).toLowerCase() !== String(payload).toLowerCase()) {
      throw codedError('MalformedHandover', { payload, cause: 'not-canonical' })
    }
    return handover
  }
}
