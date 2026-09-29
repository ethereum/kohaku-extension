/**
 * The empty slots of a path. A preset loads its shape with every member slot
 * empty: a credential with the zero address as its method, no config, and the
 * kind of method it waits for as its label. Enrolling a method fills the slot
 * with the real credential.
 */
import { zeroAddress } from 'viem'

import type { Credential } from '@web/modules/social-recovery/sdk-interfaces'

import { SLOT_KINDS } from './types'
import type { SlotKind } from './types'

/** An empty slot waiting for a method of `kind`. */
export const emptySlot = (kind: SlotKind): Credential => ({
  method: zeroAddress,
  config: '0x',
  label: kind
})

/**
 * A credential with the zero address as its method and no config is a slot,
 * not an enrolled method. A zero-address credential with any config is an
 * ordinary credential.
 */
export const isEmptySlot = (credential: Credential): boolean =>
  credential.method.toLowerCase() === zeroAddress && credential.config === '0x'

/** The kind an empty slot waits for; `undefined` for an enrolled method or a slot of no known kind. */
export const slotKindOf = (credential: Credential): SlotKind | undefined =>
  isEmptySlot(credential) ? SLOT_KINDS.find((kind) => kind === credential.label) : undefined
