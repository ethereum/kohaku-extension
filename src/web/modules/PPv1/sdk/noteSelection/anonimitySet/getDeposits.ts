import { DepositEvent, Hash } from '@0xbow/privacy-pools-core-sdk'
import { chainData as PPv1ChainData } from '@ambire-common/controllers/privacyPools/config'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { sepolia } from 'viem/chains'

const chainDataConfig = PPv1ChainData[sepolia.id]

/**
 * Get deposit events for a specific chain
 *
 * @param chainId - Chain ID to fetch events from
 * @param options - Event filter options including fromBlock, toBlock, and other filters
 * @returns Array of deposit events with properly typed fields (bigint for numbers, Hash for commitments)
 * @throws {DataError} If client is not configured, network error occurs, or event data is invalid
 */
export async function getDeposits(
  // eslint-disable-next-line @typescript-eslint/no-shadow
  chainData: typeof chainDataConfig = chainDataConfig
): Promise<DepositEvent[]> {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(chainData.sdkRpcUrl)
  })

  const DEPOSIT_EVENT = parseAbiItem(
    'event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _merkleRoot)'
  )

  const logs = await client.getLogs({
    address: chainData.poolInfo[0].address,
    event: DEPOSIT_EVENT,
    fromBlock: chainData.poolInfo[0].deploymentBlock ?? 0
  })

  return logs.map((log) => {
    const {
      _depositor: depositor,
      _commitment: commitment,
      _label: label,
      _value: value,
      _merkleRoot: precommitment
    } = log.args

    if (
      !depositor ||
      !commitment ||
      !label ||
      !precommitment ||
      !log.blockNumber ||
      !log.transactionHash
    ) {
      throw new Error('Invalid deposit event')
    }

    return {
      depositor: depositor.toLowerCase(),
      commitment: commitment as Hash,
      label: label as Hash,
      value: value || BigInt(0),
      precommitment: precommitment as Hash,
      blockNumber: BigInt(log.blockNumber),
      transactionHash: log.transactionHash
    }
  })
}
