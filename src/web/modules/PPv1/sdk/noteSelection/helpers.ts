import { Ctx, PoolAccount, SelectionResult } from './types'

export const EPS = 1e-12
export const SCALE = 1e12
export function roundAmount(n: number): number {
  if (Math.abs(n) < EPS) return 0
  return Math.round(n * SCALE) / SCALE
}

/**
 * Converts a pool account's balance from wei to ETH.
 *
 * @param account - Pool account with balance in wei
 * @returns Account value in ETH (floating point)
 */
export function getAccountValue(account: PoolAccount): number {
  return Number(account.balance) / 1e18
}

/**
 * Extracts the block number of a pool account's last commitment.
 *
 * Used by f2_time to calculate note age and temporal correlation penalties.
 *
 * @param account - Pool account with commitment history
 * @returns Block number of the last commitment
 */
export function getAccountBlockNumber(account: PoolAccount): number {
  return Number(account.lastCommitment.blockNumber)
}

/**
 * Type representing a pool account with its associated spend amount in wei.
 */
export type PoolAccountWithAmount = {
  poolAccount: PoolAccount
  amount: bigint
}

/**
 * Converts a SelectionResult's execution plan to a list of pool accounts with bigint amounts.
 *
 * Transforms the internal representation (ETH as floats) to the format required for
 * on-chain transactions (wei as bigints).
 *
 * @param result - Selection result containing the execution plan
 * @returns Array of pool accounts with their spend amounts in wei
 */
export function getPoolAccountsFromResult(result: SelectionResult): PoolAccountWithAmount[] {
  return Array.from(result.plan.entries()).map(([poolAccount, ethAmount]) => ({
    poolAccount,
    amount: BigInt(Math.round(ethAmount * 1e18))
  }))
}

/**
 * Looks up the anonymity set size for a given amount using the pre-calculated distribution.
 *
 * The anonymity set represents the number of deposits at or below a given value that are
 * still active in the pool. This is derived from on-chain data using a SQL query that
 * computes a cumulative distribution function (CDF) of all deposits.
 *
 * Key insight: The distribution is highly non-linear, with a peak at standard deposit
 * amounts like 0.1 ETH (anonymity set ~1600). Non-standard amounts have much smaller
 * anonymity sets, making them easier to link.
 *
 * @param ctx - Algorithm context with pre-calculated anonymity set data
 * @param amount - Amount in ETH to look up
 * @returns Anonymity set size (number of deposits at or below this amount)
 *
 * @example
 * getAnonymitySetSize(ctx, 0.1)  // => ~1600 (high privacy)
 * getAnonymitySetSize(ctx, 1.5)  // => ~50 (low privacy)
 * getAnonymitySetSize(ctx, 0.0)  // => MAX_ANON_SET (perfect privacy for zero)
 */
export function getAnonymitySetSize(ctx: Ctx, amount: number): number {
  if (amount <= 1e-9) return ctx.MAX_ANON_SET
  const keys = Object.keys(ctx.anonymitySet)
    .map(parseFloat)
    .filter((k) => k <= amount)
  if (keys.length === 0) return 1
  const maxKey = Math.max(...keys)
  return ctx.anonymitySet[maxKey] ?? 1
}
