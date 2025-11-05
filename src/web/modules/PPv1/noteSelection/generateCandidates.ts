/**
 * Candidate Generation Strategies
 *
 * Implements multiple greedy heuristics to generate diverse candidate solutions for the
 * note selection problem. Each strategy prioritizes different objectives, allowing the
 * scoring system to find the best overall balance.
 *
 * Strategies:
 * 1. Greedy Large - Uses single largest note (minimizes gas, may sacrifice privacy)
 * 2. Sanitizer - Consumes only unhealthy notes in standard chunks (wallet cleanup)
 * 3. Dust Aggregation - Combines smallest notes (cleanup, but may use healthy notes)
 * 4. Anchor Sanitizer - Hybrid: takes one bite from unhealthy note + fills with healthy notes
 */

import { EPS, getAccountValue, getAnonymitySetSize, roundAmount } from './helpers';
import { Ctx, ExecutionPlan, PoolAccount } from './types';

/**
 * Generates "Sanitizer" candidate plans that only use unhealthy notes.
 *
 * Strategy: Attempts to fund the withdrawal by taking multiple "bites" of standard sizes
 * (0.1, 0.2, 0.4, 0.6 ETH) from ONLY the user's unhealthy notes (low anonymity set).
 * This is excellent for wallet cleanup, as it converts bad assets into clean spending
 * patterns without touching healthy notes.
 *
 * The algorithm tries multiple target bite sizes to create diverse candidates. It iterates
 * through unhealthy notes repeatedly, taking bites until the withdrawal amount is met.
 *
 * @param ctx - Algorithm context with wallet and anonymity thresholds
 * @param wAmount - Withdrawal amount in ETH
 * @returns Array of execution plans using only unhealthy notes
 */
function generateSanitizationCandidates(ctx: Ctx, wAmount: number): ExecutionPlan[] {
  const plans: ExecutionPlan[] = [];
  const unhealthy = ctx.wallet
    .filter((a) => getAnonymitySetSize(ctx, getAccountValue(a)) <= ctx.unhealthyThreshold)
    .sort((a, b) => getAnonymitySetSize(ctx, getAccountValue(a)) - getAnonymitySetSize(ctx, getAccountValue(b)));
  if (!unhealthy.length) return [];
  const TARGETS = [0.1, 0.2, 0.4, 0.6];
  for (const t of TARGETS) {
    let remain = roundAmount(wAmount);
    const bites = new Map<PoolAccount, number>();
    let iter = 0;
    while (remain > 1e-9 && iter < 10) {
      iter++;
      for (const a of unhealthy) {
        if (remain <= 1e-9) break;
        const available = roundAmount(getAccountValue(a) - (bites.get(a) ?? 0));
        const bite = roundAmount(Math.min(remain, t, available));
        if (bite > 1e-9) {
          bites.set(a, roundAmount((bites.get(a) ?? 0) + bite));
          remain = roundAmount(remain - bite);
        }
      }
    }
    const totalBites = roundAmount(Array.from(bites.values()).reduce((s, v) => s + v, 0));
    const valid = Array.from(bites.entries()).every(([a, v]) => getAccountValue(a) >= v);
    if (Math.abs(totalBites - wAmount) < EPS && valid) plans.push(new Map(bites));
  }
  return plans;
}

/**
 * Generates "Anchor Sanitizer" (Consolidator) candidate plans.
 *
 * Strategy: A powerful hybrid approach that takes one small, standard-sized "bite"
 * (0.1 ETH) from an unhealthy note (the "anchor") and then combines it with healthy
 * notes to complete the payment.
 *
 * This simultaneously achieves two goals:
 * 1. Sanitizes a bad note by converting it to a standard withdrawal amount
 * 2. Preserves the bulk of healthy notes by only using them for the remainder
 *
 * The algorithm tries each unhealthy note as a potential anchor, creating diverse candidates.
 *
 * @param ctx - Algorithm context with wallet and anonymity thresholds
 * @param wAmount - Withdrawal amount in ETH
 * @returns Array of execution plans using anchor + healthy notes strategy
 */
function generateAnchorSanitizerCandidates(ctx: Ctx, wAmount: number): ExecutionPlan[] {
  const plans: ExecutionPlan[] = [];
  const unhealthy = ctx.wallet.filter((a) => getAnonymitySetSize(ctx, getAccountValue(a)) <= ctx.unhealthyThreshold);
  const healthy = ctx.wallet
    .filter((a) => !unhealthy.includes(a))
    .sort((a, b) => getAccountValue(a) - getAccountValue(b));
  const ANCHOR = 0.1;
  for (const anchor of unhealthy) {
    if (getAccountValue(anchor) < ANCHOR || wAmount < ANCHOR) continue;
    const plan = new Map<PoolAccount, number>([[anchor, ANCHOR]]);
    let remain = roundAmount(wAmount - ANCHOR);
    if (Math.abs(remain) < EPS) {
      plans.push(plan);
      continue;
    }
    for (const a of healthy) {
      if (remain <= 1e-9) break;
      const spend = roundAmount(Math.min(getAccountValue(a), remain));
      plan.set(a, spend);
      remain = roundAmount(remain - spend);
    }
    if (Math.abs(remain) < EPS) plans.push(new Map(plan));
  }
  return plans;
}

/**
 * Generates all candidate execution plans using multiple greedy strategies.
 *
 * This is the core heuristic engine that creates a diverse set of potential solutions.
 * Since finding the optimal solution is NP-hard, we generate multiple candidates using
 * different prioritization strategies and let the scoring system select the best one.
 *
 * Strategies executed:
 * 1. **Greedy Large**: Find single smallest note ≥ withdrawal amount (low gas, may sacrifice privacy)
 * 2. **Sanitizer**: Use only unhealthy notes in standard chunks (wallet cleanup, good privacy)
 * 3. **Dust Aggregation**: Combine smallest notes until amount is met (cleanup, gas-heavy)
 * 4. **Anchor Sanitizer**: Hybrid strategy using unhealthy anchor + healthy remainder
 *
 * Deduplication is performed to ensure each unique plan appears only once.
 *
 * @param ctx - Algorithm context with wallet, anonymity data, and thresholds
 * @param amount - Withdrawal amount in ETH
 * @returns Array of named candidate plans, deduplicated
 *
 * @example
 * generateCandidates(ctx, 0.5)
 * // => [
 * //   { name: 'Greedy Large', plan: Map(...) },
 * //   { name: 'Sanitizer', plan: Map(...) },
 * //   { name: 'Anchor Sanitizer', plan: Map(...) }
 * // ]
 */
export function generateCandidates(ctx: Ctx, amount: number): Array<{ name: string; plan: ExecutionPlan }> {
  const out: Array<{ name: string; plan: ExecutionPlan }> = [];
  const seen = new Set<string>();
  const keyOf = (plan: ExecutionPlan) =>
    Array.from(plan.entries())
      .map(([a, v]) => `${a.label}:${v}`)
      .sort()
      .join('|');

  // Greedy Large
  const large = [...ctx.wallet]
    .sort((a, b) => getAccountValue(b) - getAccountValue(a))
    .find((a) => getAccountValue(a) >= amount);
  if (large) {
    const plan = new Map<PoolAccount, number>([[large, amount]]);
    const k = keyOf(plan);
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ name: 'Greedy Large', plan });
    }
  }

  // Sanitizer
  for (const plan of generateSanitizationCandidates(ctx, amount)) {
    const k = keyOf(plan);
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ name: 'Sanitizer', plan });
    }
  }

  // Dust Aggregation
  const dust: PoolAccount[] = [];
  let s = 0;
  for (const a of [...ctx.wallet].sort((a, b) => getAccountValue(a) - getAccountValue(b))) {
    if (s < amount) {
      dust.push(a);
      s += getAccountValue(a);
    }
  }
  if (s >= amount) {
    const plan = new Map<PoolAccount, number>();
    let left = roundAmount(amount);
    for (const a of dust) {
      const spend = roundAmount(Math.min(getAccountValue(a), left));
      if (spend > 1e-9) {
        plan.set(a, spend);
        left = roundAmount(left - spend);
      }
    }
    const k = keyOf(plan);
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ name: 'Dust Aggregation', plan });
    }
  }

  // Anchor Sanitizer
  for (const plan of generateAnchorSanitizerCandidates(ctx, amount)) {
    const k = keyOf(plan);
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ name: 'Anchor Sanitizer', plan });
    }
  }

  return out;
}
