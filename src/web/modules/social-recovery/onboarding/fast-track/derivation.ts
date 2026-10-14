import { isAddress } from 'viem'

import { DERIVATION_OPTIONS } from '@ambire-common/consts/derivation'
import { KeyIterator } from '@ambire-common/libs/keyIterator/keyIterator'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import { SLOT_INDEX } from './constants'
import type { TempSeed } from './types'

/**
 * The recovery phrase in a one-time message the keystore sent to the page;
 * null for any other message. The message crosses the event bus, so its shape
 * is checked here.
 */
export const tempSeedOf = (data: unknown): TempSeed | null => {
  if (typeof data !== 'object' || data === null) {
    return null
  }
  const { tempSeed } = data as { tempSeed?: unknown }
  if (typeof tempSeed !== 'object' || tempSeed === null) {
    return null
  }
  const { seed, seedPassphrase, hdPathTemplate } = tempSeed as Record<string, unknown>
  const template = DERIVATION_OPTIONS.find((option) => option.value === hdPathTemplate)
  if (typeof seed !== 'string' || !seed || !template) {
    return null
  }
  return {
    seed,
    seedPassphrase: typeof seedPassphrase === 'string' ? seedPassphrase : null,
    hdPathTemplate: template.value
  }
}

/**
 * The slot's key, derived from the recovery phrase through the library's key
 * iterator at the slot's index: the key of the slot's basic account, which
 * the recovery installs on the recovered account and which pays its gas.
 */
export const slotKeyOf = async (seed: TempSeed, index: number = SLOT_INDEX): Promise<Address> => {
  const iterator = new KeyIterator(seed.seed, seed.seedPassphrase)
  const [key] = await iterator.retrieve([{ from: index, to: index }], seed.hdPathTemplate)
  if (!key || !isAddress(key)) {
    throw new Error(`The key iterator derived no key for slot index ${index}.`)
  }
  return key
}
