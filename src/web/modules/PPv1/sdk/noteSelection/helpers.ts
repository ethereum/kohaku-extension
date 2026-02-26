import { parseEther } from 'viem'
import { Ctx, PoolAccount, SelectionResult } from './types'

/**
 * Returns a pool account's balance in wei.
 *
 * @param account - Pool account with balance in wei
 * @returns Account value in wei (bigint)
 */
export function getAccountValue(account: PoolAccount): bigint {
  return account.balance
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
 * @param result - Selection result containing the execution plan
 * @returns Array of pool accounts with their spend amounts in wei
 */
export function getPoolAccountsFromResult(result: SelectionResult): PoolAccountWithAmount[] {
  return Array.from(result.plan.entries()).map(([poolAccount, amount]) => ({
    poolAccount,
    amount
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
 * @param amount - Amount in wei (bigint) to look up
 * @returns Anonymity set size (number of deposits at or below this amount)
 *
 * @example
 * getAnonymitySetSize(ctx, 100000000000000000n)  // 0.1 ETH => ~1600 (high privacy)
 * getAnonymitySetSize(ctx, 0n)  // => MAX_ANON_SET (perfect privacy for zero)
 */
export function getAnonymitySetSize(ctx: Ctx, amount: bigint): number {
  if (amount <= 0n) return ctx.MAX_ANON_SET

  const keys = Object.keys(ctx.anonymitySet)
    .map((k) => parseEther(k))
    .filter((k) => k <= amount)

  if (keys.length === 0) return 1

  const maxKey = keys.reduce((max, k) => (k > max ? k : max), keys[0])

  return ctx.anonymitySet[maxKey.toString()] ?? 1
}
