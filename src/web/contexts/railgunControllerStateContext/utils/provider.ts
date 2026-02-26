import { testnetNetworks } from '@ambire-common/consts/testnetNetworks'
import { RAILGUN_CONFIG_BY_CHAIN_ID } from '@kohaku-eth/railgun'
import { JsonRpcProvider, Network } from 'ethers'

export const getProvider = (chainId: number) => {
  const name =
    RAILGUN_CONFIG_BY_CHAIN_ID[chainId.toString() as keyof typeof RAILGUN_CONFIG_BY_CHAIN_ID].NAME
  const networkConfig = testnetNetworks.find((n) => n.chainId === BigInt(chainId))
  if (!name || !networkConfig) {
    throw new Error(`Unsupported chainId for Railgun: ${chainId}`)
  }
  return new JsonRpcProvider(networkConfig.selectedRpcUrl, Network.from({ name, chainId }), {
    staticNetwork: true,
    batchMaxCount: 1,
    batchMaxSize: 0,
    batchStallTime: 0
  })
}
