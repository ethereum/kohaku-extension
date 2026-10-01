/**
 * The guardian row's two chain reads over the extension's own provider: the
 * code at an address, and a contract's EIP-1271 answer for a signature.
 */
import { Interface } from 'ethers'
import { isHex } from 'viem'

import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import type { GuardianChain, GuardianProvider } from './types'

/** The magic value `isValidSignature` answers for a signature the contract accepts. */
export const EIP1271_MAGIC_VALUE = '0x1626ba7e'

const EIP1271 = new Interface([
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'
])

export const guardianChainOf = (provider: GuardianProvider): GuardianChain => ({
  async readCode(address: Address): Promise<Hex> {
    const code = await provider.send('eth_getCode', [address, 'latest'])
    if (!isHex(code)) {
      throw new Error('The node answered no code.')
    }
    return code
  },
  async isValidSignature(address: Address, digest: Hex, signature: Hex): Promise<boolean> {
    const data = EIP1271.encodeFunctionData('isValidSignature', [digest, signature]) as Hex
    let answer: string
    try {
      answer = await provider.call({ to: address, data })
    } catch (error: unknown) {
      // A contract that reverts refuses the signature; any other failure is the node's.
      if ((error as { code?: unknown } | null)?.code === 'CALL_EXCEPTION') {
        return false
      }
      throw error
    }
    try {
      const [magic] = EIP1271.decodeFunctionResult('isValidSignature', answer)
      return String(magic).toLowerCase() === EIP1271_MAGIC_VALUE
    } catch {
      return false
    }
  }
})
