/* eslint-disable no-console */
import type { RailgunAccount } from '@kohaku-eth/railgun'
import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'
import type { RailgunBalance } from '../types'

export async function calculateBalances(
  account: RailgunAccount,
  weth: string
): Promise<RailgunBalance[]> {
  // NOTE: only works for one native token balancefor now
  const notes = account.getSerializedState().notebooks

  const tokens = Array.from(
    new Set(
      notes
        .flat()
        .map((note) => (note ? note.tokenData.tokenAddress.toLowerCase() : undefined))
        .filter((token) => token !== undefined)
    )
  )
  const balances = []
  for (const token of tokens) {
    const balance = await account.getBalance(token as `0x${string}`)
    balances.push({
      tokenAddress: token.toLowerCase() === weth.toLowerCase() ? ZERO_ADDRESS : token,
      amount: balance.toString()
    })
  }

  return balances
}

export function aggregateBalances(balancesForAggregation: RailgunBalance[][]): RailgunBalance[] {
  // Efficiently aggregate balances by tokenAddress across all accounts
  const aggregateMap: { [tokenAddress: string]: bigint } = {}

  for (const accountBalances of balancesForAggregation) {
    for (const bal of accountBalances) {
      const addr = bal.tokenAddress
      // parse as bigint for accurate sum
      const amountBig = BigInt(bal.amount)
      if (!aggregateMap[addr]) {
        aggregateMap[addr] = amountBig
      } else {
        aggregateMap[addr] += amountBig
      }
    }
  }

  const aggregatedBalances: RailgunBalance[] = Object.entries(aggregateMap).map(
    ([tokenAddress, amountBig]) => ({
      tokenAddress,
      amount: amountBig.toString()
    })
  )

  return aggregatedBalances
}
