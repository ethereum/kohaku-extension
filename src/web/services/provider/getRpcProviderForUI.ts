import { MinNetworkConfig } from '@ambire-common/services/provider/getRpcProvider'

import { UIProxyProvider } from './UIProxyProvider'

export function getRpcProviderForUI(
  config: MinNetworkConfig,
  dispatch: (action: any) => void
): UIProxyProvider {
  const rpcUrl = config.selectedRpcUrl || config.rpcUrls[0]
  const chainId = config.chainId!
  return new UIProxyProvider(chainId, rpcUrl, dispatch)
}
