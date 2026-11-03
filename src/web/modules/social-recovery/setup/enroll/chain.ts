/**
 * The guardian row's two chain reads over the extension's own provider: the
 * code at an address, and a contract's EIP-1271 answer for a signature.
 */
import { isHex } from 'viem'

import type { Address, Hex } from '@kohaku-eth/social-recovery'
import { isValidAccountSignature } from '@web/modules/social-recovery/shared/client'

import type { GuardianChain, GuardianProvider } from './types'

export const guardianChainOf = (provider: GuardianProvider): GuardianChain => ({
  async readCode(address: Address): Promise<Hex> {
    const code = await provider.send('eth_getCode', [address, 'latest'])
    if (!isHex(code)) {
      throw new Error('The node answered no code.')
    }
    return code
  },
  isValidSignature: (address: Address, digest: Hex, signature: Hex): Promise<boolean> =>
    isValidAccountSignature(provider, address, digest, signature)
})
