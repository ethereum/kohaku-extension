import {
  Address,
  encodeAbiParameters,
  isAddress,
  parseAbiParameters,
  getAddress,
  parseUnits
} from 'viem'
import type {
  Hash,
  AccountCommitment,
  WithdrawalProofInput,
  Withdrawal,
  Secret,
  AccountService,
  WithdrawalProof
} from '@0xbow/privacy-pools-core-sdk'
import type { PublicClient, WalletClient } from 'viem'
import {
  getMerkleProof,
  generateWithdrawalProof,
  verifyWithdrawalProof,
  createWithdrawalSecrets,
  getContext
} from './sdk'
import { entrypointAbi } from './abi'

const isNaN = (value: number) => Number.isNaN(value)

export const prepareWithdrawRequest = (
  recipient: Address,
  processooor: Address,
  relayer: Address,
  feeBPS: string
): Withdrawal => {
  if (
    !isAddress(recipient) ||
    !isAddress(processooor) ||
    !isAddress(relayer) ||
    isNaN(Number(feeBPS))
  ) {
    throw new Error('Invalid input for prepareWithdrawRequest')
  }

  const data = encodeAbiParameters(
    parseAbiParameters('address recipient, address feeRecipient, uint256 relayFeeBPS'),
    [recipient, relayer, BigInt(feeBPS)]
  )

  return {
    processooor,
    data
  }
}

export const prepareWithdrawalProofInput = (
  commitment: AccountCommitment,
  amount: bigint,
  stateMerkleProof: Awaited<ReturnType<typeof getMerkleProof>>,
  aspMerkleProof: Awaited<ReturnType<typeof getMerkleProof>>,
  context: bigint,
  secret: Secret,
  nullifier: Secret
): WithdrawalProofInput => {
  const padArray = (arr: bigint[], length: number): bigint[] => {
    if (arr.length >= length) return arr
    return [...arr, ...Array(length - arr.length).fill(BigInt(0))]
  }

  return {
    withdrawalAmount: amount,
    stateMerkleProof: {
      root: stateMerkleProof.root as Hash,
      leaf: commitment.hash,
      index: stateMerkleProof.index,
      siblings: padArray(stateMerkleProof.siblings as bigint[], 32) // Pad to 32 length
    },
    aspMerkleProof: {
      root: aspMerkleProof.root as Hash,
      leaf: commitment.label,
      index: aspMerkleProof.index,
      siblings: padArray(aspMerkleProof.siblings as bigint[], 32) // Pad to 32 length
    },
    stateRoot: stateMerkleProof.root as Hash,
    aspRoot: aspMerkleProof.root as Hash,
    stateTreeDepth: BigInt(32), // Double check
    aspTreeDepth: BigInt(32), // Double check
    context,
    newSecret: secret,
    newNullifier: nullifier
  }
}

export type WithdrawalParams = {
  commitment: AccountCommitment
  amount: string
  decimals: number
  target: Address
  relayerAddress: Address
  feeBPSForWithdraw: number
  poolScope: Hash
  stateLeaves: string[]
  aspLeaves: string[]
  account: AccountService
  userAddress: Address
  entrypointAddress: string
  publicClient: PublicClient
  walletClient: WalletClient
}

export type WithdrawalResult = {
  success: boolean
  hash?: `0x${string}`
  error?: string
}

/**
 * Transforms proof for contract interaction
 */
export function transformProofForContract(proof: WithdrawalProof) {
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
      bigint,
      bigint,
      bigint,
      bigint,
      bigint
    ]
  }
}

/**
 * Generates withdrawal proof and prepares transaction data
 */
export async function generateWithdrawalData({
  commitment,
  amount,
  decimals,
  target,
  relayerAddress,
  feeBPSForWithdraw,
  poolScope,
  stateLeaves,
  aspLeaves,
  account,
  entrypointAddress
}: Omit<WithdrawalParams, 'poolAddress' | 'publicClient' | 'walletClient'>): Promise<{
  withdrawal: Withdrawal
  proof: WithdrawalProof
  transformedArgs: ReturnType<typeof transformProofForContract>
  error?: string
}> {
  try {
    // Prepare withdrawal request
    const withdrawal = prepareWithdrawRequest(
      getAddress(target),
      getAddress(entrypointAddress),
      getAddress(relayerAddress),
      feeBPSForWithdraw.toString()
    )

    // Generate merkle proofs
    const stateMerkleProof = await getMerkleProof(
      stateLeaves?.map(BigInt) as bigint[],
      commitment.hash
    )
    const aspMerkleProof = await getMerkleProof(aspLeaves?.map(BigInt), commitment.label)

    // Calculate context
    const context = await getContext(withdrawal, poolScope)

    // Create withdrawal secrets
    const { secret, nullifier } = createWithdrawalSecrets(account, commitment)

    // Workaround for NaN index, SDK issue
    aspMerkleProof.index = Object.is(aspMerkleProof.index, NaN) ? 0 : aspMerkleProof.index

    // Prepare withdrawal proof input
    const withdrawalProofInput = prepareWithdrawalProofInput(
      commitment,
      parseUnits(amount, decimals),
      stateMerkleProof,
      aspMerkleProof,
      BigInt(context),
      secret,
      nullifier
    )

    // Generate withdrawal proof
    const proof = await generateWithdrawalProof(commitment, withdrawalProofInput)

    // Verify the proof
    await verifyWithdrawalProof(proof)

    // Transform proof for contract interaction
    const transformedArgs = transformProofForContract(proof)

    return { withdrawal, proof, transformedArgs }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to generate withdrawal data'
    return {
      withdrawal: {} as Withdrawal,
      proof: {} as WithdrawalProof,
      transformedArgs: {} as ReturnType<typeof transformProofForContract>,
      error: errorMessage
    }
  }
}

/**
 * Executes withdrawal transaction
 */
export async function executeWithdrawalTransaction({
  commitment,
  amount,
  decimals,
  target,
  relayerAddress,
  feeBPSForWithdraw,
  poolScope,
  stateLeaves,
  aspLeaves,
  account,
  userAddress,
  entrypointAddress,
  publicClient,
  walletClient
}: WithdrawalParams): Promise<WithdrawalResult> {
  try {
    // Generate withdrawal data
    const { withdrawal, proof, transformedArgs, error } = await generateWithdrawalData({
      commitment,
      amount,
      decimals,
      target,
      relayerAddress,
      feeBPSForWithdraw,
      poolScope,
      stateLeaves,
      aspLeaves,
      account,
      userAddress,
      entrypointAddress
    })

    if (error || !withdrawal || !proof || !transformedArgs) {
      return { success: false, error: error || 'Failed to generate withdrawal data' }
    }

    // Simulate and execute contract call
    const { request } = await publicClient.simulateContract({
      account: getAddress(userAddress),
      address: getAddress(entrypointAddress),
      abi: entrypointAbi,
      functionName: 'relay',
      args: [
        {
          processooor: getAddress(entrypointAddress),
          data: withdrawal.data
        },
        {
          pA: transformedArgs.pA,
          pB: transformedArgs.pB,
          pC: transformedArgs.pC,
          pubSignals: transformedArgs.pubSignals
        },
        poolScope
      ]
    })

    const hash = await walletClient.writeContract(request)
    return { success: true, hash }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to execute withdrawal transaction'
    return { success: false, error: errorMessage }
  }
}
