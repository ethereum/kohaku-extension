import { generateAnonymitySet } from './generateAnonymitySet'
import { getDeposits } from './getDeposits'

/**
 * Convert anonymity set data to the format used by the algorithm.
 *
 * The note selection algorithm expects a Record<number, number> mapping
 * deposit amounts (ETH) to their anonymity set sizes.
 */
export function convertToAlgorithmFormat(
  anonymitySetData: ReturnType<typeof generateAnonymitySet>
) {
  return Object.fromEntries(
    anonymitySetData.anonimitySet.map((entry) => [
      parseFloat(entry.eth_Amount),
      entry.anonymity_set_size
    ])
  )
}

export async function generateAnonymitySetFromChain() {
  const deposits = await getDeposits()
  const anonymitySetData = generateAnonymitySet(deposits)

  // Log statistics
  console.log(`Processed ${deposits.length} deposits`)
  console.log(`Found ${anonymitySetData.anonimitySet.length} unique deposit amounts`)
  console.log(
    `Anonymity set range: ${anonymitySetData.anonimitySet[0]?.anonymity_set_size} to ${
      anonymitySetData.anonimitySet[anonymitySetData.anonimitySet.length - 1]?.anonymity_set_size
    }`
  )

  return anonymitySetData
}
