/**
 * The recovery action's views the SDK does not read: its four immutables and
 * the key value a handover grants, and `supportsAccount` for any account,
 * not only the one a client is bound to. Each reads at the block tag given,
 * `latest` by default. A revert rejects as the provider's, and an answer that
 * does not decode rejects with a `ProviderReadFailure` of the call.
 */
import { RECOVERY_ACTION_READ_FROM, RECOVERY_ACTION_VIEWS_ABI } from '@kohaku-eth/social-recovery'
import type { Address, BlockTag, Hex, IProvider } from '@kohaku-eth/social-recovery'
import { decodeAbiParameters, decodeFunctionResult, encodeFunctionData } from 'viem'

import { ACTION_IMMUTABLES_ABI } from '../abi'
import { providerReadFailure } from '../provider-adapter'
import type { ActionViews } from './types'

const decodedOr = <T>(decode: () => T): T => {
  try {
    return decode()
  } catch (thrown) {
    throw providerReadFailure('call', thrown)
  }
}

export const createActionViews = (
  provider: Pick<IProvider, 'call'>,
  action: Address
): ActionViews => {
  const call = (data: Hex, block: BlockTag): Promise<Hex> =>
    provider.call(action, data, RECOVERY_ACTION_READ_FROM, block)

  const immutable = async (
    functionName: 'MANAGER' | 'AMBIRE_IMPLEMENTATION' | 'KIT_SLOT',
    block: BlockTag
  ): Promise<Address> => {
    const answer = await call(
      encodeFunctionData({ abi: ACTION_IMMUTABLES_ABI, functionName }),
      block
    )
    return decodedOr(() => decodeAbiParameters([{ type: 'address' }], answer)[0])
  }

  const word = async (functionName: 'BINDING' | 'KEY_VALUE', block: BlockTag): Promise<Hex> => {
    const answer = await call(
      encodeFunctionData({ abi: ACTION_IMMUTABLES_ABI, functionName }),
      block
    )
    return decodedOr(() => decodeAbiParameters([{ type: 'bytes32' }], answer)[0])
  }

  return {
    manager: (block = 'latest') => immutable('MANAGER', block),
    ambireImplementation: (block = 'latest') => immutable('AMBIRE_IMPLEMENTATION', block),
    kitSlot: (block = 'latest') => immutable('KIT_SLOT', block),
    binding: (block = 'latest') => word('BINDING', block),
    keyValue: (block = 'latest') => word('KEY_VALUE', block),
    async supportsAccount(account: Address, block: BlockTag = 'latest'): Promise<boolean> {
      const answer = await call(
        encodeFunctionData({
          abi: RECOVERY_ACTION_VIEWS_ABI,
          functionName: 'supportsAccount',
          args: [account]
        }),
        block
      )
      return decodedOr(() =>
        decodeFunctionResult({
          abi: RECOVERY_ACTION_VIEWS_ABI,
          functionName: 'supportsAccount',
          data: answer
        })
      )
    }
  }
}
