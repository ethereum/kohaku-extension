/* eslint-disable @typescript-eslint/no-explicit-any */
import { encodeFunctionData } from 'viem'
import type {
  AccountCommitment,
  AccountService,
  CommitmentProof
} from '@0xbow/privacy-pools-core-sdk'
import { privacyPoolAbi } from './abi'
import { generateRagequitProof } from './sdk'

export type RagequitParams = {
  poolAccount: {
    lastCommitment: AccountCommitment
    ragequit?: any
    balance: bigint
  }
  poolAddress: string
}

export type RagequitResult = {
  to: string
  data: string
  value: bigint
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
  poolAddress
}: RagequitParams): Promise<RagequitResult> {
  try {
    // Generate ragequit data
    const commitment = poolAccount.lastCommitment
    const { transformedArgs } = await generateRagequitData(commitment)

    const data = encodeFunctionData({
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

    return {
      to: poolAddress,
      data,
      value: 0n
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to execute ragequit transaction'
    // eslint-disable-next-line no-console
    console.error(errorMessage)
    return { to: '', data: '', value: 0n }
  }
}
