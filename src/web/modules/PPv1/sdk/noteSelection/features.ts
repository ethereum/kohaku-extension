/**
 * Objective Functions & Scoring Features
 *
 * This module implements the 8 objective functions (f1-f8) that form the multi-objective
 * optimization framework for note selection. Each function quantifies a different aspect
 * of privacy or cost trade-offs.
 *
 * Objective Functions:
 * - f1: Spend Pattern Anonymity (40% weight) - Penalizes weak-link outputs
 * - f2: Temporal Linkability (5% weight) - Penalizes using new notes
 * - f3: Derivation Type (4% weight) - Prioritizes legacy notes
 * - f4: Gas Cost (5% weight) - Minimizes number of inputs
 * - f5: Random Noise (1% weight) - Adds non-determinism
 * - f6: Wallet Health (10% weight) - Penalizes creating dust change
 * - f7: Spend Anonymity Cost (20% weight) - Penalizes total anonymity cost
 * - f8: Preserve Healthy Notes (15% weight) - Penalizes spending high-anonymity notes
 */

import { getAccountBlockNumber, getAccountValue, getAnonymitySetSize, roundAmount } from './helpers'
import { AnonymityData, ExecutionPlan, SelectionResult, Ctx } from './types'

/**
 * Computes anonymity set health thresholds based on percentiles.
 *
 * Analyzes the distribution of anonymity set sizes to determine what constitutes
 * "unhealthy" (low anonymity) and "healthy" (high anonymity) notes.
 *
 * @param anonymitySet - Map of deposit amounts to their anonymity set sizes
 * @param unhealthyPercentile - Percentile for unhealthy threshold (e.g., 0.6 = 60th percentile)
 * @param healthyPercentile - Percentile for healthy threshold (e.g., 0.8 = 80th percentile)
 * @returns Object with unhealthy and healthy thresholds
 *
 * @example
 * computeThresholds({ 0.1: 1600, 0.2: 400 }, 0.6, 0.8)
 * // => { unhealthy: 500, healthy: 1200 }
 */
export function computeThresholds(
  anonymitySet: AnonymityData,
  unhealthyPercentile: number,
  healthyPercentile: number
) {
  const allSizes = Object.values(anonymitySet)
    .slice()
    .sort((a, b) => a - b)
  if (allSizes.length === 0) return { unhealthy: 500, healthy: 10000 }
  const u = allSizes[Math.floor(allSizes.length * unhealthyPercentile)]
  const h = allSizes[Math.floor(allSizes.length * healthyPercentile)]
  return { unhealthy: u, healthy: h }
}

/**
 * f1: Spend Pattern Anonymity (Weight: 0.40)
 *
 * Objective: Maximize the anonymity of the smallest output chunk (weakest link principle).
 *
 * Privacy is only as strong as the weakest link. This function penalizes plans that create
 * any single, easily identifiable output amount. It uses logarithmic scaling with an exponent
 * to heavily penalize low-anonymity outputs.
 *
 * Formula: (log(MAX_ANON_SET) - log(min_anonymity))^PENALTY_EXPONENT
 *
 * @param ctx - Algorithm context with anonymity data and configuration
 * @param plan - Execution plan mapping notes to spend amounts
 * @returns Penalty score (lower is better). Returns 0 if no chunks exist.
 */
function f1SpendPatternAnonymity(ctx: Ctx, plan: ExecutionPlan): number {
  const chunks = Array.from(plan.values()).filter((v) => v > 1e-9)
  if (chunks.length === 0) return 0
  const minAnon = Math.min(...chunks.map((v) => getAnonymitySetSize(ctx, v)))
  const logDiff = Math.log(ctx.MAX_ANON_SET) - Math.log(Math.max(1, minAnon))
  return logDiff ** ctx.PENALTY_EXPONENT
}

/**
 * f2: Temporal Linkability / Time Penalty (Weight: 0.05)
 *
 * Objective: Mitigate the risk of linking deposits to near-immediate withdrawals.
 *
 * Penalizes plans that use very recently deposited notes, as this creates a temporal
 * correlation that could be used to link deposits to withdrawals. Favors older notes.
 *
 * Formula: 1 / (currentBlock - oldestNoteBlock + 1)
 *
 * @param ctx - Algorithm context with current block number
 * @param plan - Execution plan mapping notes to spend amounts
 * @returns Penalty score (lower is better). Returns 1 if no accounts.
 */
function f2Time(ctx: Ctx, plan: ExecutionPlan): number {
  const accounts = Array.from(plan.keys())
  if (!accounts.length) return 1
  const minBlock = Math.min(...accounts.map((a) => getAccountBlockNumber(a)))
  return 1 / (ctx.currentBlock - minBlock + 1)
}

/**
 * f3: Derivation Type Priority (Weight: 0.04)
 *
 * Objective: Prioritize spending notes derived from legacy mnemonic-based accounts.
 *
 * Encourages migrating funds away from potentially compromised mnemonic-based accounts
 * to safer appSecret-based notes. This reduces the risk of fund loss if the mnemonic
 * is compromised elsewhere.
 *
 * Formula: Count of legacy mnemonic notes in the plan
 *
 * @param _ctx - Algorithm context (unused)
 * @param plan - Execution plan mapping notes to spend amounts
 * @returns Penalty score (lower is better). Count of legacy mnemonic notes spent.
 */
function f3Derivation(_ctx: Ctx, plan: ExecutionPlan): number {
  return Array.from(plan.keys()).filter((n) => n.derivationMethod === 'LEGACY_MNEMONONIC').length
}

/**
 * f4: Gas Cost Proxy (Weight: 0.05)
 *
 * Objective: Minimize on-chain transaction costs.
 *
 * Uses the number of input notes as a proxy for gas cost. Each input requires
 * an on-chain ZK proof verification (expensive), and each output requires a new
 * commitment to be added to the contract state. Fewer inputs = cheaper transaction.
 *
 * Formula: Number of notes used in the plan
 *
 * @param _ctx - Algorithm context (unused)
 * @param plan - Execution plan mapping notes to spend amounts
 * @returns Gas cost proxy (lower is better).
 */
function f4Gas(_ctx: Ctx, plan: ExecutionPlan): number {
  return plan.size
}

/**
 * f5: Random Noise (Weight: 0.01)
 *
 * Objective: Introduce non-determinism to prevent predictable behavior.
 *
 * Acts as a small tie-breaker to ensure that identical scenarios don't always
 * produce the exact same plan. This adds unpredictability to the selection process,
 * making it harder for adversaries to predict user behavior.
 *
 * Formula: Random value between 0 and 1
 *
 * @returns Random penalty score between 0 and 1.
 */
function f5RandomNoise(): number {
  return Math.random()
}

/**
 * f6: Wallet Health (Weight: 0.10)
 *
 * Objective: Avoid creating problematic "dust" change outputs.
 *
 * Penalizes strategies that would leave the user with a new, low-value, low-anonymity
 * change note in their wallet. These "dust" notes are hard to spend privately in the
 * future and degrade overall wallet health.
 *
 * Formula: (log(MAX_ANON_SET) - log(change_anonymity))^PENALTY_EXPONENT
 *
 * @param ctx - Algorithm context with anonymity data and configuration
 * @param plan - Execution plan mapping notes to spend amounts
 * @param withdrawalAmount - Desired withdrawal amount in ETH
 * @returns Penalty score (lower is better). Returns 0 if no change is created.
 */
function f6WalletHealth(ctx: Ctx, plan: ExecutionPlan, withdrawalAmount: number): number {
  const totalInput = Array.from(plan.keys()).reduce((s, a) => s + getAccountValue(a), 0)
  const change = totalInput - withdrawalAmount
  if (change < 1e-9) return 0
  const changeAnon = getAnonymitySetSize(ctx, change)
  const logDiff = Math.log(ctx.MAX_ANON_SET) - Math.log(Math.max(1, changeAnon))
  return logDiff ** ctx.PENALTY_EXPONENT
}

/**
 * f7: Spend Anonymity Cost (Weight: 0.20)
 *
 * Objective: Minimize the total anonymity cost of all output chunks.
 *
 * Complements f1 (which focuses on the worst-case output) by considering the cumulative
 * privacy cost of the entire spending pattern. A plan that creates multiple low-anonymity
 * outputs will be heavily penalized.
 *
 * Formula: Sum of (log(MAX_ANON_SET) - log(chunk_anonymity))^PENALTY_EXPONENT for all chunks
 *
 * @param ctx - Algorithm context with anonymity data and configuration
 * @param plan - Execution plan mapping notes to spend amounts
 * @returns Total anonymity cost penalty (lower is better). Returns 0 if no chunks exist.
 */
function f7SpendAnonymityCost(ctx: Ctx, plan: ExecutionPlan): number {
  const chunks = Array.from(plan.values()).filter((v) => v > 1e-9)
  if (!chunks.length) return 0
  return chunks.reduce((sum, v) => {
    const logDiff = Math.log(ctx.MAX_ANON_SET) - Math.log(Math.max(1, getAnonymitySetSize(ctx, v)))
    return sum + logDiff ** ctx.PENALTY_EXPONENT
  }, 0)
}

/**
 * f8: Preserve Healthy Notes (Weight: 0.15)
 *
 * Objective: Avoid spending notes with very high anonymity sets.
 *
 * Discourages "burning" the user's best, most private notes on routine transactions
 * when less private alternatives exist. High-anonymity notes are a valuable resource
 * that should be preserved for future use. This promotes a long-term wallet health strategy.
 *
 * Formula: Count of healthy (high-anonymity) notes used in the plan
 *
 * @param ctx - Algorithm context with health thresholds
 * @param plan - Execution plan mapping notes to spend amounts
 * @returns Penalty score (lower is better). Count of healthy notes spent.
 */
function f8PreserveHealthyNotes(ctx: Ctx, plan: ExecutionPlan): number {
  let healthySpent = 0
  // eslint-disable-next-line no-restricted-syntax
  for (const a of plan.keys())
    if (getAnonymitySetSize(ctx, getAccountValue(a)) >= ctx.healthyThreshold) healthySpent++
  return healthySpent
}

/**
 * Evaluates an execution plan against all 8 objective functions.
 *
 * Computes raw scores for each objective function. These scores will later be
 * normalized and weighted to produce a final privacy score.
 *
 * @param ctx - Algorithm context with anonymity data, thresholds, and configuration
 * @param plan - Execution plan to evaluate
 * @param withdrawalAmount - Desired withdrawal amount in ETH
 * @returns Map of objective function names to raw scores
 */
export function scorePlan(ctx: Ctx, plan: ExecutionPlan, withdrawalAmount: number) {
  const scores: Record<string, number> = {}
  scores.f1_spend_pattern_anonymity = f1SpendPatternAnonymity(ctx, plan)
  scores.f2_time = f2Time(ctx, plan)
  scores.f3_derivation = f3Derivation(ctx, plan)
  scores.f4_gas = f4Gas(ctx, plan)
  scores.f5_random_noise = f5RandomNoise()
  scores.f6_wallet_health = f6WalletHealth(ctx, plan, withdrawalAmount)
  scores.f7_spend_anonymity_cost = f7SpendAnonymityCost(ctx, plan)
  scores.f8_preserve_healthy_notes = f8PreserveHealthyNotes(ctx, plan)
  return scores
}

/**
 * Computes min-max normalization ranges for all objective functions across candidates.
 *
 * Since raw scores have wildly different scales (e.g., gas cost is a small integer while
 * anonymity penalties can be large floats), we use min-max normalization to scale all
 * scores to [0, 1] range. This makes them comparable and allows for weighted combination.
 *
 * The normalization is dynamic and relative to the actual achievable options for a given
 * withdrawal request, making the comparison robust across different scenarios.
 *
 * Formula: normalized = (raw - min) / (max - min)
 *
 * @param candidates - Array of candidate plans with their raw scores
 * @returns Map of objective function names to their min/max ranges
 */
export function normalizeScores(candidates: Array<{ scores: Record<string, number> }>) {
  const keys = new Set<string>()
  candidates.forEach((c) => Object.keys(c.scores).forEach((k) => keys.add(k)))
  const ranges: Record<string, { min: number; max: number }> = {}
  keys.forEach((k) => {
    const vals = candidates.map((c) => c.scores[k]).filter((v) => typeof v === 'number') as number[]
    if (vals.length) ranges[k] = { min: Math.min(...vals), max: Math.max(...vals) }
  })
  return ranges
}

/**
 * Converts an execution plan and its scores into a structured SelectionResult.
 *
 * Transforms the internal representation (ExecutionPlan) into a user-friendly result
 * object with human-readable note details, computed totals, and all scoring information.
 *
 * @param name - Name of the strategy that generated this plan (e.g., "Greedy Large")
 * @param plan - Execution plan mapping notes to spend amounts
 * @param scores - Raw objective function scores
 * @param normalized - Normalized objective function scores (0-1 range)
 * @param privacyScore - Final weighted privacy score (lower is better)
 * @returns Structured result object with all plan details and scores
 */
export function toResult(
  name: string,
  plan: ExecutionPlan,
  scores: Record<string, number>,
  normalized: Record<string, number>,
  privacyScore: number
): SelectionResult {
  const totalSpent = roundAmount(Array.from(plan.values()).reduce((s, v) => s + v, 0))
  const totalInput = roundAmount(
    Array.from(plan.keys()).reduce((s, a) => s + getAccountValue(a), 0)
  )
  const change = roundAmount(totalInput - totalSpent)
  const notes = Array.from(plan.keys())
    .sort((a, b) => getAccountValue(b) - getAccountValue(a))
    .map((a) => ({
      value: roundAmount(getAccountValue(a)),
      blockNumber: a.lastCommitment.blockNumber.toString(),
      spent: roundAmount(plan.get(a) ?? 0),
      leftover: roundAmount(getAccountValue(a) - (plan.get(a) ?? 0)),
      label: a.label.toString()
    }))
  return { name, plan, scores, normalized, privacyScore, totalSpent, totalInput, change, notes }
}
