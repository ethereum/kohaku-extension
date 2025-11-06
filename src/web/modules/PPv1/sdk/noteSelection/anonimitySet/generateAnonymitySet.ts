import { DepositEvent } from '@0xbow/privacy-pools-core-sdk'

/**
 * Anonymity set entry representing deposit distribution data.
 */
type AnonymitySetEntry = {
  eth_Amount: string
  num_active_deposits_at_value: number
  anonymity_set_size: number
}

/**
 * Anonymity set data structure matching the format from blockchain analytics.
 */
type AnonymitySetData = {
  anonimitySet: AnonymitySetEntry[]
}

/**
 * Generates anonymity set data from deposit events.
 *
 * This function processes raw deposit events and computes a cumulative distribution
 * function (CDF) of deposit amounts, which is used by the note selection algorithm
 * to evaluate the privacy of different spending patterns.
 *
 * The algorithm:
 * 1. Groups deposits by their ETH value
 * 2. Counts the number of deposits at each value
 * 3. Sorts by value ascending
 * 4. Calculates the cumulative anonymity set size (CDF)
 *
 * The anonymity set size represents: "For a given amount X, how many deposits
 * of value X or greater exist in the pool?" This is calculated by summing from
 * the largest value down to X.
 *
 * Note: This is a simplified version that only considers deposits. The production
 * version should also account for ragequit events (withdrawals that burn notes)
 * to get the true "active" deposit count.
 *
 * @param deposits - Array of deposit events from the blockchain
 * @returns Anonymity set data in the format expected by the note selection algorithm
 *
 * @example
 * const deposits = await getDeposits();
 * const anonymitySet = generateAnonymitySet(deposits);
 * // => { anonimitySet: [{ eth_Amount: "0.1", num_active_deposits_at_value: 832, anonymity_set_size: 1601 }, ...] }
 */
export function generateAnonymitySet(deposits: DepositEvent[]): AnonymitySetData {
  // Group deposits by ETH value and count occurrences
  const valueMap = new Map<string, number>()

  // eslint-disable-next-line no-restricted-syntax
  for (const deposit of deposits) {
    // Convert wei to ETH
    const ethAmount = Number(deposit.value) / 1e18
    const ethAmountStr = ethAmount.toString()

    valueMap.set(ethAmountStr, (valueMap.get(ethAmountStr) || 0) + 1)
  }

  // Convert to array and sort by ETH amount (descending for CDF calculation)
  const sortedEntries = Array.from(valueMap.entries())
    .map(([ethAmount, count]) => ({
      ethAmount: parseFloat(ethAmount),
      ethAmountStr: ethAmount,
      count
    }))
    .sort((a, b) => b.ethAmount - a.ethAmount) // Sort descending

  // Calculate cumulative distribution function (CDF)
  // anonymity_set_size = sum of all deposits >= current amount
  let cumulativeSum = 0
  const entriesWithCDF = sortedEntries.map((entry) => {
    cumulativeSum += entry.count
    return {
      eth_Amount: entry.ethAmountStr,
      num_active_deposits_at_value: entry.count,
      anonymity_set_size: cumulativeSum
    }
  })

  // Reverse to get ascending order (smallest to largest)
  entriesWithCDF.reverse()

  return {
    anonimitySet: entriesWithCDF
  }
}

/**
 * Generates anonymity set data accounting for both deposits and ragequit events.
 *
 * This is a more accurate version that calculates the true "active" deposit count
 * by subtracting ragequit events (which burn notes) from deposit events.
 *
 * The algorithm:
 * 1. Groups deposits by ETH value and counts
 * 2. Groups ragequits by ETH value and counts
 * 3. Calculates active deposits = deposits - ragequits for each value
 * 4. Sorts by value ascending
 * 5. Calculates cumulative anonymity set size (CDF)
 *
 * @param deposits - Array of deposit events from the blockchain
 * @param ragequits - Array of ragequit events (withdrawals that burn notes)
 * @returns Anonymity set data showing only active (non-ragequit) deposits
 *
 * @example
 * const deposits = await getDeposits();
 * const ragequits = await getRagequits();
 * const anonymitySet = generateAnonymitySetWithRagequits(deposits, ragequits);
 */
export function generateAnonymitySetWithRagequits(
  deposits: DepositEvent[],
  ragequits: DepositEvent[]
): AnonymitySetData {
  // Count deposits by value
  const depositMap = new Map<string, number>()
  // eslint-disable-next-line no-restricted-syntax
  for (const deposit of deposits) {
    const ethAmount = Number(deposit.value) / 1e18
    const ethAmountStr = ethAmount.toString()
    depositMap.set(ethAmountStr, (depositMap.get(ethAmountStr) || 0) + 1)
  }

  // Count ragequits by value
  const ragequitMap = new Map<string, number>()
  // eslint-disable-next-line no-restricted-syntax
  for (const ragequit of ragequits) {
    const ethAmount = Number(ragequit.value) / 1e18
    const ethAmountStr = ethAmount.toString()
    ragequitMap.set(ethAmountStr, (ragequitMap.get(ethAmountStr) || 0) + 1)
  }

  // Calculate active deposits (deposits - ragequits) for all unique values
  const allValues = new Set([...Array.from(depositMap.keys()), ...Array.from(ragequitMap.keys())])
  const activeDeposits = Array.from(allValues)
    .map((ethAmountStr) => {
      const depositsCount = depositMap.get(ethAmountStr) || 0
      const ragequitsCount = ragequitMap.get(ethAmountStr) || 0
      const active = Math.max(0, depositsCount - ragequitsCount) // Ensure non-negative

      return {
        ethAmount: parseFloat(ethAmountStr),
        ethAmountStr,
        active
      }
    })
    .filter((entry) => entry.active > 0) // Only include values with active deposits
    .sort((a, b) => b.ethAmount - a.ethAmount) // Sort descending for CDF

  // Calculate cumulative distribution function (CDF)
  let cumulativeSum = 0
  const entriesWithCDF = activeDeposits.map((entry) => {
    cumulativeSum += entry.active
    return {
      eth_Amount: entry.ethAmountStr,
      num_active_deposits_at_value: entry.active,
      anonymity_set_size: cumulativeSum
    }
  })

  // Reverse to get ascending order (smallest to largest)
  entriesWithCDF.reverse()

  return {
    anonimitySet: entriesWithCDF
  }
}
