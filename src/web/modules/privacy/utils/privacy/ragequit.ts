import type {
  AccountCommitment,
  AccountService,
  CommitmentProof,
  RagequitEvent
} from '@0xbow/privacy-pools-core-sdk'

type PoolAccount = {
  lastCommitment: AccountCommitment
  ragequit?: RagequitEvent
  balance: bigint
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
  poolAccount: PoolAccount,
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
