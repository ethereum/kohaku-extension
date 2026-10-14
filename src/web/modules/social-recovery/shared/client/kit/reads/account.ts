import { decodeFunctionResult, encodeFunctionData } from 'viem'

import type { Address, BlockTag, Hex, IProvider } from '@web/modules/social-recovery/sdk-interfaces'

import { AMBIRE_ACCOUNT_ABI } from '../abi'
import type { AccountReads } from './types'
import { viewOf } from './view'

/** The Ambire account's own views over the provider adapter. */
export const createAccountReads = (provider: IProvider): AccountReads => ({
  privileges(account: Address, key: Address, block: BlockTag = 'latest'): Promise<Hex> {
    return viewOf(
      provider,
      account,
      encodeFunctionData({ abi: AMBIRE_ACCOUNT_ABI, functionName: 'privileges', args: [key] }),
      (answer) =>
        decodeFunctionResult({ abi: AMBIRE_ACCOUNT_ABI, functionName: 'privileges', data: answer }),
      block
    )
  }
})
