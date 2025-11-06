/**
 * Type Definitions for Note Selection Algorithm
 *
 * Core types, interfaces, and configuration for the Constrained Multi-Objective
 * Combinatorial Optimization (MOCO) problem of selecting private notes for withdrawals.
 */

import {
  type AccountCommitment,
  PoolAccount as SDKPoolAccount,
  type Hash,
  type RagequitEvent
} from '@0xbow/privacy-pools-core-sdk'

export enum ReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
  EXITED = 'exited',
  SPENT = 'spent'
}

type RagequitEventWithTimestamp = RagequitEvent & {
  timestamp: bigint
}

export type PoolAccount = SDKPoolAccount & {
  name: number
  balance: bigint // has spendable commitments, check with getSpendableCommitments()
  isValid: boolean // included in ASP leaves
  reviewStatus: ReviewStatus // ASP status
  lastCommitment: AccountCommitment
  chainId: number
  scope: Hash
  ragequit?: RagequitEventWithTimestamp
  depositorAddress?: string
  derivationMethod?: DerivationMethod
}

/**
 * Note derivation method.
 *
 * - LEGACY_MNEMONONIC: Derived from mnemonic phrase (potentially compromised)
 * - NATIVE_APPSECRET: Derived from app-specific secret (more secure)
 */
export type DerivationMethod = 'LEGACY_MNEMONONIC' | 'NATIVE_APPSECRET'

/**
 * Execution plan mapping pool accounts to their spend amounts in ETH.
 *
 * Represents a candidate solution to the note selection problem.
 * The map keys are the notes to spend, and values are the amounts to spend from each.
 */
export type ExecutionPlan = Map<PoolAccount, number>

/**
 * Pre-calculated anonymity set data from on-chain analysis.
 *
 * Maps deposit amounts (in ETH) to their anonymity set sizes.
 * The anonymity set size is the number of deposits at or below that amount that
 * are still active in the pool (deposits - ragequits).
 *
 * This data is derived from blockchain analytics (e.g., Dune Analytics) using a
 * cumulative distribution function (CDF) query.
 *
 * @example
 * { 0.1: 1600, 0.2: 800, 0.5: 300, 1.0: 200 }
 */
export type AnonymityData = Record<number, number>

/**
 * Weights for the 8 objective functions in the multi-objective optimization.
 *
 * Each weight determines the relative importance of an objective function in the
 * final privacy score calculation. Weights should sum to 1.0 for proper scaling.
 *
 * Default weights reflect the algorithm's core principles:
 * - 60% allocated to transaction privacy (f1 + f7)
 * - 25% allocated to long-term wallet strategy (f6 + f8)
 * - 15% allocated to secondary costs (f2 + f3 + f4 + f5)
 */
export type Weights = {
  f1_spend_pattern_anonymity?: number
  f2_time?: number
  f3_derivation?: number
  f4_gas?: number
  f5_random_noise?: number
  f6_wallet_health?: number
  f7_spend_anonymity_cost?: number
  f8_preserve_healthy_notes?: number
}

/**
 * Default weights tuned through adversarial testing.
 *
 * These weights represent the optimal balance found through testing against scenarios
 * designed to force trade-offs between privacy and cost.
 *
 * Weight Distribution:
 * - f1 (40%): Spend pattern anonymity - primary privacy directive
 * - f7 (20%): Total anonymity cost - cumulative privacy penalty
 * - f8 (15%): Preserve healthy notes - long-term strategy
 * - f6 (10%): Wallet health - avoid creating dust
 * - f4 (5%): Gas cost - minimize transaction fees
 * - f2 (5%): Time penalty - avoid temporal correlation
 * - f3 (4%): Derivation priority - favor legacy migration
 * - f5 (1%): Random noise - tie-breaker for unpredictability
 */
export const DEFAULT_WEIGHTS: Weights = {
  f1_spend_pattern_anonymity: 0.4,
  f7_spend_anonymity_cost: 0.2,
  f8_preserve_healthy_notes: 0.15,
  f6_wallet_health: 0.1,
  f4_gas: 0.05,
  f2_time: 0.05,
  f3_derivation: 0.04,
  f5_random_noise: 0.01
}

/**
 * Input options for the note selection algorithm.
 */
export type SelectNoteOptions = {
  poolAccounts: PoolAccount[]
  importedPoolAccounts?: PoolAccount[]
  withdrawalAmount: number
  anonymityData: AnonymityData
  weights?: Weights
  unhealthyPercentile?: number
  healthyPercentile?: number
}

/**
 * Result of the note selection algorithm for a single candidate strategy.
 *
 * Contains the execution plan, all scoring details, and human-readable note information.
 * Results are sorted by privacy score (lower is better).
 */
export type SelectionResult = {
  name: string
  plan: ExecutionPlan
  scores: Record<string, number>
  normalized: Record<string, number>
  privacyScore: number
  isChosen?: boolean
  totalSpent: number
  totalInput: number
  change: number
  notes: Array<{
    value: number
    blockNumber: string
    spent: number
    leftover: number
    label: string
  }>
}

// Internals

/**
 * Internal algorithm context passed through all scoring and generation functions.
 *
 * Contains all the data and configuration needed to evaluate execution plans.
 */
export type Ctx = {
  anonymitySet: AnonymityData
  wallet: PoolAccount[]
  currentBlock: number
  weights: Required<Weights>
  PENALTY_EXPONENT: number
  MAX_ANON_SET: number
  unhealthyThreshold: number
  healthyThreshold: number
}
