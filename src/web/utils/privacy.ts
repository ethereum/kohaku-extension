import type { PublicClient } from 'viem'

export const getTimestampFromBlockNumber = async (
  blockNumber: bigint,
  publicClient?: PublicClient
) => {
  if (!publicClient) throw new Error('Public client not found')

  const block = await publicClient.getBlock({
    blockNumber
  })

  if (!block) throw new Error('Block required to get timestamp')

  return block.timestamp
}
