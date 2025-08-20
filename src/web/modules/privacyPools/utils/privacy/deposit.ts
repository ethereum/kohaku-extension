import { parseEther, getAddress, encodeFunctionData } from 'viem'
import type { Hash, Secret } from '@0xbow/privacy-pools-core-sdk'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { chainData } from '@ambire-common/controllers/privacyPools/config'
import { entrypointAbi } from './abi'

export type DepositSecrets = {
  nullifier: Secret
  secret: Secret
  precommitment: Hash
}

type DepositTransactionParams = {
  amount: string
  depositSecrets: DepositSecrets
  entryPointAddress: string
}

type DepositResult = {
  to: Address
  data: `0x${string}`
  value: bigint
}

/**
 * Executes a deposit transaction
 */
export async function prepareDepositTransaction({
  amount,
  depositSecrets
}: DepositTransactionParams): Promise<DepositResult> {
  const entryPointAddress = chainData[sepolia.id].poolInfo[0].entryPointAddress

  const data = encodeFunctionData({
    abi: entrypointAbi,
    functionName: 'deposit',
    args: [depositSecrets.precommitment]
  })

  return { to: getAddress(entryPointAddress), data, value: parseEther(amount) }
}
