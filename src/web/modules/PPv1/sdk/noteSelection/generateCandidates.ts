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

import { parseUnits } from 'viem'
import { getAccountValue, getAnonymitySetSize } from './helpers'
import { Ctx, ExecutionPlan, PoolAccount } from './types'

// Standard bite sizes in wei (0.1 ETH, 0.2 ETH, 0.4 ETH, 0.6 ETH)
const BITE_SIZE_01_ETH = parseUnits('0.1', 18)
const BITE_SIZE_02_ETH = parseUnits('0.2', 18)
const BITE_SIZE_04_ETH = parseUnits('0.4', 18)
const BITE_SIZE_06_ETH = parseUnits('0.6', 18)

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
 * @param wAmount - Withdrawal amount in wei (bigint)
 * @returns Array of execution plans using only unhealthy notes
 */
function generateSanitizationCandidates(ctx: Ctx, wAmount: bigint): ExecutionPlan[] {
  const plans: ExecutionPlan[] = []
  const unhealthy = ctx.wallet
    .filter((a) => getAnonymitySetSize(ctx, getAccountValue(a)) <= ctx.unhealthyThreshold)
    .sort(
      (a, b) =>
        getAnonymitySetSize(ctx, getAccountValue(a)) - getAnonymitySetSize(ctx, getAccountValue(b))
    )
  if (!unhealthy.length) return []

  const TARGETS: bigint[] = [BITE_SIZE_01_ETH, BITE_SIZE_02_ETH, BITE_SIZE_04_ETH, BITE_SIZE_06_ETH]

  TARGETS.forEach((targetBite) => {
    let remain = wAmount
    const bites = new Map<PoolAccount, bigint>()
    let iter = 0

    while (remain > 0n && iter < 10) {
      iter += 1
      const unhealthyCount = unhealthy.length

      // Use traditional for loop to avoid closure issues
      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < unhealthyCount; i++) {
        if (remain <= 0n) break

        const account = unhealthy[i]
        const accountValue = getAccountValue(account)
        const alreadyUsed = bites.get(account) ?? 0n
        const available = accountValue - alreadyUsed

        // Calculate bite size: min(remain, targetBite, available)
        let bite = targetBite
        if (remain < bite) bite = remain
        if (available < bite) bite = available

        if (bite > 0n) {
          bites.set(account, alreadyUsed + bite)
          remain -= bite
        }
      }
    }

    const totalBites = Array.from(bites.values()).reduce((sum, value) => sum + value, 0n)
    const valid = Array.from(bites.entries()).every(
      ([account, value]) => getAccountValue(account) >= value
    )

    if (totalBites === wAmount && valid) {
      plans.push(new Map(bites))
    }
  })

  return plans
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
 * @param wAmount - Withdrawal amount in wei (bigint)
 * @returns Array of execution plans using anchor + healthy notes strategy
 */
function generateAnchorSanitizerCandidates(ctx: Ctx, wAmount: bigint): ExecutionPlan[] {
  const plans: ExecutionPlan[] = []
  const unhealthy = ctx.wallet.filter(
    (a) => getAnonymitySetSize(ctx, getAccountValue(a)) <= ctx.unhealthyThreshold
  )
  const healthy = ctx.wallet
    .filter((a) => !unhealthy.includes(a))
    .sort((a, b) => {
      const aVal = getAccountValue(a)
      const bVal = getAccountValue(b)
      if (aVal > bVal) return 1
      if (aVal < bVal) return -1
      return 0
    })

  const ANCHOR = BITE_SIZE_01_ETH

  unhealthy.forEach((anchor) => {
    const anchorValue = getAccountValue(anchor)

    if (anchorValue < ANCHOR || wAmount < ANCHOR) return

    const plan = new Map<PoolAccount, bigint>([[anchor, ANCHOR]])
    let remain = wAmount - ANCHOR

    if (remain === 0n) {
      plans.push(plan)
      return
    }

    healthy.forEach((account) => {
      if (remain <= 0n) return

      const accountValue = getAccountValue(account)
      const spend = accountValue < remain ? accountValue : remain

      plan.set(account, spend)
      remain -= spend
    })

    if (remain === 0n) {
      plans.push(new Map(plan))
    }
  })

  return plans
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
 * @param amount - Withdrawal amount in wei (bigint)
 * @returns Array of named candidate plans, deduplicated
 *
 * @example
 * generateCandidates(ctx, parseUnits('0.5', 18)) // 0.5 ETH in wei
 * // => [
 * //   { name: 'Greedy Large', plan: Map(...) },
 * //   { name: 'Sanitizer', plan: Map(...) },
 * //   { name: 'Anchor Sanitizer', plan: Map(...) }
 * // ]
 */
export function generateCandidates(
  ctx: Ctx,
  amount: bigint
): Array<{ name: string; plan: ExecutionPlan }> {
  const out: Array<{ name: string; plan: ExecutionPlan }> = []
  const seen = new Set<string>()
  const keyOf = (plan: ExecutionPlan) =>
    Array.from(plan.entries())
      .map(([account, value]) => `${account.label}:${value.toString()}`)
      .sort()
      .join('|')

  // Greedy Large: Use single largest note that can cover the withdrawal
  const large = [...ctx.wallet]
    .sort((a, b) => {
      const aVal = getAccountValue(a)
      const bVal = getAccountValue(b)
      if (aVal > bVal) return -1
      if (aVal < bVal) return 1
      return 0
    })
    .find((a) => getAccountValue(a) >= amount)

  if (large) {
    const plan = new Map<PoolAccount, bigint>([[large, amount]])
    const k = keyOf(plan)
    if (!seen.has(k)) {
      seen.add(k)
      out.push({ name: 'Greedy Large', plan })
    }
  }

  // Sanitizer: Use only unhealthy notes in standard chunks
  generateSanitizationCandidates(ctx, amount).forEach((plan) => {
    const k = keyOf(plan)
    if (!seen.has(k)) {
      seen.add(k)
      out.push({ name: 'Sanitizer', plan })
    }
  })

  // Dust Aggregation: Combine smallest notes until amount is met
  const dust: PoolAccount[] = []
  let accumulatedValue = 0n

  ;[...ctx.wallet]
    .sort((a, b) => {
      const aVal = getAccountValue(a)
      const bVal = getAccountValue(b)
      if (aVal > bVal) return 1
      if (aVal < bVal) return -1
      return 0
    })
    .forEach((account) => {
      if (accumulatedValue < amount) {
        dust.push(account)
        accumulatedValue += getAccountValue(account)
      }
    })

  if (accumulatedValue >= amount) {
    const plan = new Map<PoolAccount, bigint>()
    let remaining = amount

    dust.forEach((account) => {
      if (remaining <= 0n) return

      const accountValue = getAccountValue(account)
      const spend = accountValue < remaining ? accountValue : remaining

      if (spend > 0n) {
        plan.set(account, spend)
        remaining -= spend
      }
    })

    const k = keyOf(plan)
    if (!seen.has(k)) {
      seen.add(k)
      out.push({ name: 'Dust Aggregation', plan })
    }
  }

  // Anchor Sanitizer: Hybrid strategy using unhealthy anchor + healthy remainder
  generateAnchorSanitizerCandidates(ctx, amount).forEach((plan) => {
    const k = keyOf(plan)
    if (!seen.has(k)) {
      seen.add(k)
      out.push({ name: 'Anchor Sanitizer', plan })
    }
  })

  return out
}
