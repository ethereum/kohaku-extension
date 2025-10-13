import { Address, encodeAbiParameters, isAddress, parseAbiParameters } from 'viem'
import {
  type Hash,
  type AccountCommitment,
  type WithdrawalProofInput,
  type Withdrawal,
  type Secret,
  type WithdrawalProof,
  generateMerkleProof
} from '@0xbow/privacy-pools-core-sdk'
import type { Hex } from 'viem'
import { type PoolAccount } from '@web/contexts/privacyPoolsControllerStateContext'

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
  userAddress: Address
  entrypointAddress: string
}

export type WithdrawalResult = {
  to: Address
  data: Hex
  value: bigint
}

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

export const prepareMultipleWithdrawRequest = (
  recipient: Address,
  processooor: Address,
  relayer: Address,
  feeBPS: string,
  batchSize: number,
  totalValue: bigint
): Withdrawal => {
  if (
    !isAddress(recipient) ||
    !isAddress(processooor) ||
    !isAddress(relayer) ||
    isNaN(Number(feeBPS)) ||
    isNaN(batchSize) ||
    batchSize <= 0
  ) {
    throw new Error('Invalid input for prepareMultipleWithdrawRequest')
  }

  const data = encodeAbiParameters(
    parseAbiParameters(
      'address recipient, address feeRecipient, uint256 relayFeeBPS, uint8 batchSize, uint256 totalValue'
    ),
    [recipient, relayer, BigInt(feeBPS), batchSize, totalValue]
  )

  return {
    processooor,
    data
  }
}

export const prepareWithdrawalProofInput = (
  commitment: AccountCommitment,
  amount: bigint,
  stateMerkleProof: Awaited<ReturnType<typeof generateMerkleProof>>,
  aspMerkleProof: Awaited<ReturnType<typeof generateMerkleProof>>,
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

export function transformProofForRelayerApi(proof: WithdrawalProof) {
  return {
    publicSignals: proof.publicSignals.map((signal) => BigInt(signal)) as [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint
    ],
    proof: {
      pi_a: [BigInt(proof.proof.pi_a[0]), BigInt(proof.proof.pi_a[1])] as [bigint, bigint],
      pi_b: [
        [BigInt(proof.proof.pi_b[0][0]), BigInt(proof.proof.pi_b[0][1])],
        [BigInt(proof.proof.pi_b[1][0]), BigInt(proof.proof.pi_b[1][1])]
      ] as [readonly [bigint, bigint], readonly [bigint, bigint]],
      pi_c: [BigInt(proof.proof.pi_c[0]), BigInt(proof.proof.pi_c[1])] as [bigint, bigint]
    }
  }
}

/**
 * DEPRECATED
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

export const validateWithdrawal = (
  selectedPA: PoolAccount,
  withdrawalAmount?: string,
  targetAddress?: string
): { isValid: boolean; error: { text: string; type: 'error' | 'success' } | null } => {
  if (!selectedPA) {
    return {
      isValid: false,
      error: {
        text: 'Please select a pool account to withdraw from.',
        type: 'error'
      }
    }
  }

  if (!withdrawalAmount || parseFloat(withdrawalAmount) <= 0) {
    return {
      isValid: false,
      error: {
        text: 'Please enter a valid amount greater than 0.',
        type: 'error'
      }
    }
  }

  if (!targetAddress) {
    return {
      isValid: false,
      error: {
        text: 'Please enter a target address for withdrawal.',
        type: 'error'
      }
    }
  }

  if (!isAddress(targetAddress)) {
    return {
      isValid: false,
      error: {
        text: 'Please enter a valid Ethereum address.',
        type: 'error'
      }
    }
  }

  try {
    const withdrawalAmountFloat = parseFloat(withdrawalAmount)
    const balanceFloat = parseFloat(selectedPA.balance.toString())

    if (withdrawalAmountFloat > balanceFloat) {
      return {
        isValid: false,
        error: {
          text: 'Amount exceeds available balance in selected pool account.',
          type: 'error'
        }
      }
    }
  } catch (error) {
    // If comparison fails, skip balance validation for now
    console.warn('Balance validation skipped due to conversion error:', error)
  }

  return {
    isValid: true,
    error: null
  }
}
