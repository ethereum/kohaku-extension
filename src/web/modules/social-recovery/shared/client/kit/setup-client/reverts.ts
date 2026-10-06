/**
 * A contract's revert met by a setup read, named as the kit's error: the
 * decoded error where the data is one of the manager's or the action's, the
 * unknown result with its selector and raw bytes otherwise.
 */
import { isHex, size, slice } from 'viem'

import { landingRevert } from '@web/modules/social-recovery/sdk-doubles'
import type { Hex, KitError } from '@web/modules/social-recovery/sdk-interfaces'

import { isRevertedCall } from '../../provider-adapter'
import { decodeRevert } from '../errors'

const SELECTOR_SIZE = 4

export const kitErrorOf = (data: Hex): KitError => {
  const known = decodeRevert(data)
  if (known) {
    return known
  }
  return size(data) >= SELECTOR_SIZE
    ? { kind: 'unknown', selector: slice(data, 0, SELECTOR_SIZE), data }
    : { kind: 'unknown', data }
}

/** Runs a member, and rethrows a revert it met as the kit's error, named. */
export const withNamedRevert = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run()
  } catch (thrown: unknown) {
    if (isRevertedCall(thrown) && isHex(thrown.data)) {
      throw landingRevert(kitErrorOf(thrown.data))
    }
    throw thrown
  }
}
