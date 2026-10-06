import { decodeFunctionResult, encodeFunctionData, type Hex, hexToBigInt, size } from 'viem'

import type {
  Address,
  IProvider,
  ModuleInfo,
  TrustedParties
} from '@web/modules/social-recovery/sdk-interfaces'

import { isRevertedCall } from '../../provider-adapter'
import { ECDSA_METHOD_ABI } from '../abi'
import { PAUSABLE_ABI } from '../abi/pausable'
import { METHOD_INTERFACE_ID } from './interface-ids'
import type { MethodReads } from './types'
import { viewOf } from './view'

// Every method module declares the same views; the ECDSA method's ABI reads any of them.
const METHOD_ABI = ECDSA_METHOD_ABI

/** The method modules' views over the provider adapter, for any module address. */
export const createMethodReads = (provider: IProvider): MethodReads => {
  const reads: MethodReads = {
    name(module: Address): Promise<string> {
      return viewOf(
        provider,
        module,
        encodeFunctionData({ abi: METHOD_ABI, functionName: 'name' }),
        (answer) => decodeFunctionResult({ abi: METHOD_ABI, functionName: 'name', data: answer })
      )
    },

    version(module: Address): Promise<string> {
      return viewOf(
        provider,
        module,
        encodeFunctionData({ abi: METHOD_ABI, functionName: 'version' }),
        (answer) => decodeFunctionResult({ abi: METHOD_ABI, functionName: 'version', data: answer })
      )
    },

    supportsInterface(module: Address, interfaceId: Hex): Promise<boolean> {
      return viewOf(
        provider,
        module,
        encodeFunctionData({
          abi: METHOD_ABI,
          functionName: 'supportsInterface',
          args: [interfaceId]
        }),
        (answer) =>
          decodeFunctionResult({ abi: METHOD_ABI, functionName: 'supportsInterface', data: answer })
      )
    },

    async moduleInfo(module: Address): Promise<ModuleInfo> {
      const [name, version, supportsInterface] = await Promise.all([
        reads.name(module),
        reads.version(module),
        reads.supportsInterface(module, METHOD_INTERFACE_ID)
      ])
      return { name, version, supportsInterface }
    },

    trustedParties(module: Address): Promise<TrustedParties> {
      return viewOf(
        provider,
        module,
        encodeFunctionData({ abi: METHOD_ABI, functionName: 'trustedParties' }),
        (answer) => {
          const [admin, pendingAdmin, trustedKeys, pauseHolder, pendingPauseHolder] =
            decodeFunctionResult({ abi: METHOD_ABI, functionName: 'trustedParties', data: answer })
          return {
            admin,
            pendingAdmin,
            trustedKeys: [...trustedKeys],
            pauseHolder,
            pendingPauseHolder
          }
        }
      )
    },

    verify(module: Address, config: Hex, digest: Hex, proof: Hex): Promise<Hex> {
      return viewOf(
        provider,
        module,
        encodeFunctionData({
          abi: METHOD_ABI,
          functionName: 'verify',
          args: [config, digest, proof]
        }),
        (answer) => decodeFunctionResult({ abi: METHOD_ABI, functionName: 'verify', data: answer })
      )
    },

    async paused(module: Address): Promise<boolean> {
      let answer: Hex
      try {
        answer = await provider.call(
          module,
          encodeFunctionData({ abi: PAUSABLE_ABI, functionName: 'paused' }),
          undefined,
          'latest'
        )
      } catch (thrown) {
        if (isRevertedCall(thrown)) {
          return false
        }
        throw thrown
      }
      // The raw word, as the manager reads it: a bool decoder would refuse
      // other words instead of answering false.
      return size(answer) === 32 && hexToBigInt(answer) === 1n
    }
  }
  return reads
}
