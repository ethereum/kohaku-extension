/**
 * A contract's revert met by a read or a landing, named as the kit's error:
 * the SDK's `decodeRevert` over the manager's, the action's and the
 * language's errors, and the one error its tables leave out, decoded here
 * under its deployed name. Any other data is the unknown result with its
 * selector and raw bytes.
 */
import { decodeRevert, isProviderRevert } from '@kohaku-eth/social-recovery'
import type { Hex, KitError, KitErrorSource, KitErrorValue } from '@kohaku-eth/social-recovery'
import { decodeErrorResult, isHex, slice } from 'viem'

import { UNTABLED_ERRORS_ABI } from '../abi'
import type { LandingRevert } from '../types'

const SOURCE_PREFIXES: readonly (readonly [string, KitErrorSource])[] = [
  ['PolicyManager_', 'manager'],
  ['RecoveryAction_', 'action']
]

const untabledErrorOf = (data: Hex): KitError | undefined => {
  try {
    const { abiItem, args, errorName } = decodeErrorResult({ abi: UNTABLED_ERRORS_ABI, data })
    const source =
      SOURCE_PREFIXES.find(([prefix]) => errorName.startsWith(prefix))?.[1] ?? 'language'
    const values: readonly unknown[] = args ?? []
    return {
      known: true,
      source,
      name: errorName,
      selector: slice(data, 0, 4),
      args: Object.fromEntries(
        abiItem.inputs.map((input, index) => [
          input.name.replace(/^_/, ''),
          values[index] as KitErrorValue
        ])
      )
    }
  } catch {
    return undefined
  }
}

export const kitErrorOf = (data: Hex): KitError => {
  const decoded = decodeRevert(data)
  if (decoded.known) {
    return decoded
  }
  return untabledErrorOf(data) ?? decoded
}

export const landingRevert = (error: KitError): LandingRevert => {
  const name = error.known ? error.name : 'unknown'
  const thrown = new Error(`The chain reverts the call: ${name}`) as LandingRevert
  thrown.name = 'LandingRevert'
  thrown.code = name
  thrown.values = { error }
  thrown.error = error
  return thrown
}

/** Runs a member, and rethrows a revert it met as the kit's error, named. */
export const withNamedRevert = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run()
  } catch (thrown: unknown) {
    if (isProviderRevert(thrown) && isHex(thrown.data)) {
      throw landingRevert(kitErrorOf(thrown.data))
    }
    throw thrown
  }
}
