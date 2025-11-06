/**
 * Note Selection Algorithm - Main Entry Point
 *
 * This is the primary API for solving the Constrained Multi-Objective Combinatorial Optimization (MOCO)
 * problem of selecting private notes to fund a withdrawal while maximizing privacy.
 *
 * The algorithm uses a multi-strategy greedy heuristic approach:
 * 1. Generate diverse candidate solutions (Greedy Large, Sanitizer, Dust Aggregation, Anchor Sanitizer)
 * 2. Score each candidate against 8 objective functions (f1-f8)
 * 3. Normalize scores using min-max normalization
 * 4. Compute weighted privacy score and select the optimal candidate
 *
 * @see https://colab.research.google.com/drive/165lczftG4KheasyGs7jMDk486PcBMlJM
 */

import { computeThresholds, normalizeScores, scorePlan, toResult } from './features'
import { generateCandidates } from './generateCandidates'
import { getAccountBlockNumber } from './helpers'
import {
  DEFAULT_WEIGHTS,
  ReviewStatus,
  SelectNoteOptions,
  SelectionResult,
  Weights,
  Ctx
} from './types'

/**
 * Selects the optimal set of notes to fund a withdrawal, balancing privacy and cost.
 *
 * This function implements the complete note selection pipeline:
 * - Computes health thresholds for notes based on anonymity set percentiles
 * - Generates multiple candidate execution plans using different strategies
 * - Scores each candidate against 8 objective functions
 * - Normalizes and weights scores to produce a final privacy score
 * - Returns all candidates sorted by privacy score (best first)
 *
 * @param options - Configuration for note selection
 * @param options.poolAccounts - User's native (app-secret based) notes
 * @param options.importedPoolAccounts - User's imported legacy (mnemonic-based) notes
 * @param options.withdrawalAmount - Desired withdrawal amount in ETH
 * @param options.anonymityData - Pre-calculated anonymity set sizes (from blockchain analysis)
 * @param options.weights - Optional custom weights for objective functions (defaults to DEFAULT_WEIGHTS)
 * @param options.unhealthyPercentile - Percentile threshold for unhealthy notes (default: 0.6)
 * @param options.healthyPercentile - Percentile threshold for healthy notes (default: 0.8)
 *
 * @returns Array of selection results sorted by privacy score (lowest = best). First result has isChosen=true.
 *          Returns empty array if no valid solution exists.
 *
 * @example
 * const results = selectNotesForWithdrawal({
 *   poolAccounts: myNativeWallet,
 *   importedPoolAccounts: myLegacyWallet,
 *   withdrawalAmount: 0.5,
 *   anonymityData: { 0.1: 1600, 0.2: 400, ... },
 *   weights: DEFAULT_WEIGHTS
 * });
 * const bestPlan = results[0]; // Lowest privacy score = best privacy
 */
export function selectNotesForWithdrawal({
  poolAccounts: nativeAccounts,
  importedPoolAccounts: legacyAccounts = [],
  withdrawalAmount,
  anonymityData,
  weights = DEFAULT_WEIGHTS,
  unhealthyPercentile = 0.6,
  healthyPercentile = 0.8
}: SelectNoteOptions): SelectionResult[] {
  // Tag accounts with their derivation method (preserving references)
  nativeAccounts.forEach((acc) => {
    if (!acc.derivationMethod) {
      acc.derivationMethod = 'NATIVE_APPSECRET'
    }
  })
  legacyAccounts.forEach((acc) => {
    if (!acc.derivationMethod) {
      acc.derivationMethod = 'LEGACY_MNEMONONIC'
    }
  })

  // Merge both account types into single wallet
  const wallet = [...nativeAccounts, ...legacyAccounts].filter(
    (acc) => acc.reviewStatus === ReviewStatus.APPROVED
  )

  const filteredWeights = Object.fromEntries(
    Object.entries(weights).filter(([k]) => k.startsWith('f'))
  ) as Weights
  const requiredWeights = {
    f1_spend_pattern_anonymity: filteredWeights.f1_spend_pattern_anonymity ?? 0,
    f2_time: filteredWeights.f2_time ?? 0,
    f3_derivation: filteredWeights.f3_derivation ?? 0,
    f4_gas: filteredWeights.f4_gas ?? 0,
    f5_random_noise: filteredWeights.f5_random_noise ?? 0,
    f6_wallet_health: filteredWeights.f6_wallet_health ?? 0,
    f7_spend_anonymity_cost: filteredWeights.f7_spend_anonymity_cost ?? 0,
    f8_preserve_healthy_notes: filteredWeights.f8_preserve_healthy_notes ?? 0
  }

  const maxAnon = Math.max(1, ...Object.values(anonymityData))
  const { unhealthy, healthy } = computeThresholds(
    anonymityData,
    unhealthyPercentile,
    healthyPercentile
  )
  const currentBlock =
    wallet.length > 0 ? Math.max(...wallet.map((a) => getAccountBlockNumber(a))) : 0
  const ctx: Ctx = {
    anonymitySet: anonymityData,
    wallet,
    currentBlock,
    weights: requiredWeights,
    PENALTY_EXPONENT: 3.0,
    MAX_ANON_SET: maxAnon,
    unhealthyThreshold: unhealthy,
    healthyThreshold: healthy
  }

  const cands = generateCandidates(ctx, withdrawalAmount)
  if (!cands.length) return []

  const scored = cands.map(({ name, plan }) => ({
    name,
    plan,
    scores: scorePlan(ctx, plan, withdrawalAmount)
  }))

  const ranges = normalizeScores(scored)
  type ScoreKey = keyof Required<Weights>
  const results = scored.map((c) => {
    let privacy = 0
    const normalized: Record<string, number> = {}
    // eslint-disable-next-line no-restricted-syntax
    for (const [k, raw] of Object.entries(c.scores) as Array<[ScoreKey, number]>) {
      const r = ranges[k]
      let norm = 0
      if (r && r.max - r.min > 1e-9) norm = (raw - r.min) / (r.max - r.min)
      normalized[k] = norm
      privacy += norm * (ctx.weights[k] ?? 0)
    }
    return toResult(c.name, c.plan, c.scores, normalized, privacy)
  })

  results.sort((a, b) => a.privacyScore - b.privacyScore)
  if (results.length) results[0].isChosen = true
  return results
}
