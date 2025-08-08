import { parseEther, getAddress } from 'viem'
import type { Hash, Secret } from '@0xbow/privacy-pools-core-sdk'
import type { PublicClient, WalletClient, Address } from 'viem'
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
  userAddress: Address
  publicClient: PublicClient
  walletClient: WalletClient
}

type DepositResult = {
  success: boolean
  hash?: `0x${string}`
  error?: string
}

/**
 * Prepares and simulates a deposit transaction
 */
export async function prepareDepositTransaction({
  amount,
  depositSecrets,
  entryPointAddress,
  userAddress,
  publicClient
}: Omit<DepositTransactionParams, 'walletClient'>): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: any
  error?: string
}> {
  try {
    const { request } = await publicClient
      .simulateContract({
        account: userAddress,
        address: getAddress(entryPointAddress),
        abi: entrypointAbi,
        functionName: 'deposit',
        args: [depositSecrets.precommitment],
        value: parseEther(amount)
      })
      .catch((err) => {
        if (err?.metaMessages[0] === 'Error: PrecommitmentAlreadyUsed()') {
          throw new Error('Precommitment already used')
        }
        throw err
      })

    return { request }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to prepare deposit transaction'
    return { request: null, error: errorMessage }
  }
}

/**
 * Executes a deposit transaction
 */
export async function executeDepositTransaction({
  amount,
  depositSecrets,
  entryPointAddress,
  userAddress,
  publicClient,
  walletClient
}: DepositTransactionParams): Promise<DepositResult> {
  try {
    const { request, error } = await prepareDepositTransaction({
      amount,
      depositSecrets,
      entryPointAddress,
      userAddress,
      publicClient
    })

    if (error || !request) {
      return { success: false, error: error || 'Failed to prepare transaction' }
    }

    const hash = await walletClient.writeContract(request)
    return { success: true, hash }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to execute deposit transaction'
    return { success: false, error: errorMessage }
  }
}
