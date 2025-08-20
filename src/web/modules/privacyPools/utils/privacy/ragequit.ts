/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAddress } from 'viem'
import type {
  AccountCommitment,
  AccountService,
  CommitmentProof
} from '@0xbow/privacy-pools-core-sdk'
import type { PublicClient, WalletClient, Address } from 'viem'
import { privacyPoolAbi } from './abi'
import { generateRagequitProof } from './sdk'

export type RagequitParams = {
  poolAccount: {
    lastCommitment: AccountCommitment
    ragequit?: any
    balance: bigint
  }
  account: AccountService
  userAddress: Address
  poolAddress: string
  publicClient: PublicClient
  walletClient: WalletClient
}

export type RagequitResult = {
  success: boolean
  hash?: `0x${string}`
  error?: string
}

/**
 * Transforms ragequit proof for contract interaction
 */
export function transformRagequitProofForContract(proof: CommitmentProof) {
  return {
    pA: [BigInt(proof.proof.pi_a[0]), BigInt(proof.proof.pi_a[1])] as [bigint, bigint],
    pB: [
      [BigInt(proof.proof.pi_b[0][1]), BigInt(proof.proof.pi_b[0][0])],
      [BigInt(proof.proof.pi_b[1][1]), BigInt(proof.proof.pi_b[1][0])]
    ] as [readonly [bigint, bigint], readonly [bigint, bigint]],
    pC: [BigInt(proof.proof.pi_c[0]), BigInt(proof.proof.pi_c[1])] as [bigint, bigint],
    pubSignals: proof.publicSignals.map((signal) => BigInt(signal)) as [
      bigint,
      bigint,
      bigint,
      bigint
    ]
  }
}

/**
 * Validates if ragequit is allowed for a pool account
 */
export function canRagequit(
  poolAccount: RagequitParams['poolAccount'],
  account: AccountService
): {
  canRagequit: boolean
  reason?: string
} {
  if (!account) {
    return { canRagequit: false, reason: 'Account service not available' }
  }

  if (poolAccount.ragequit) {
    return { canRagequit: false, reason: 'Already ragequit' }
  }

  if (poolAccount.balance <= 0n) {
    return { canRagequit: false, reason: 'No balance to ragequit' }
  }

  return { canRagequit: true }
}

/**
 * Generates ragequit proof and prepares transaction data
 */
export async function generateRagequitData(commitment: AccountCommitment): Promise<{
  proof: CommitmentProof
  transformedArgs: ReturnType<typeof transformRagequitProofForContract>
  error?: string
}> {
  try {
    // Generate ragequit proof using the last commitment (current balance)
    const proof = await generateRagequitProof(commitment)

    // Transform proof for contract interaction
    const transformedArgs = transformRagequitProofForContract(proof)

    return { proof, transformedArgs }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to generate ragequit proof'
    return { proof: null as any, transformedArgs: null as any, error: errorMessage }
  }
}

/**
 * Executes ragequit transaction
 */
export async function executeRagequitTransaction({
  poolAccount,
  account,
  userAddress,
  poolAddress,
  publicClient,
  walletClient
}: RagequitParams): Promise<RagequitResult> {
  try {
    // Validate ragequit eligibility
    const validation = canRagequit(poolAccount, account)
    if (!validation.canRagequit) {
      return { success: false, error: validation.reason }
    }

    // Generate ragequit data
    const commitment = poolAccount.lastCommitment
    const { proof, transformedArgs, error } = await generateRagequitData(commitment)

    if (error || !proof || !transformedArgs) {
      return { success: false, error: error || 'Failed to generate ragequit data' }
    }

    // Simulate and execute contract call
    const { request } = await publicClient.simulateContract({
      account: userAddress,
      address: getAddress(poolAddress),
      abi: privacyPoolAbi,
      functionName: 'ragequit',
      args: [
        {
          pA: transformedArgs.pA,
          pB: transformedArgs.pB,
          pC: transformedArgs.pC,
          pubSignals: transformedArgs.pubSignals
        }
      ]
    })

    const hash = await walletClient.writeContract(request)
    return { success: true, hash }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to execute ragequit transaction'
    return { success: false, error: errorMessage }
  }
}
