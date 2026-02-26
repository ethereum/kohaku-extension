import { DataService, type ChainConfig } from '@0xbow/privacy-pools-core-sdk'
import { createPublicClient, custom, http, type PublicClient } from 'viem'
import type { RPCProvider } from '@ambire-common/interfaces/provider'

/**
 * Extended ChainConfig that supports both rpcUrl and provider
 */
export type ExtendedChainConfig = ChainConfig & {
  provider?: RPCProvider
}

/**
 * Creates a DataService that can accept either rpcUrl or provider instances
 *
 * This function wraps the SDK's DataService constructor to support custom providers
 * like UIProxyProvider, while maintaining backward compatibility with rpcUrl strings.
 *
 * @param chainConfigs - Array of chain configurations with optional provider instances
 * @returns A DataService instance with custom transport configuration
 */
export function createDataServiceWithProviders(chainConfigs: ExtendedChainConfig[]): DataService {
  // Create viem PublicClient instances for each chain with custom transports
  const clients = new Map<number, PublicClient>()

  chainConfigs.forEach((config) => {
    const { chainId, provider, rpcUrl } = config

    if (!provider && !rpcUrl) {
      throw new Error(`Chain ${chainId} must have either a provider or rpcUrl`)
    }

    let client: PublicClient

    if (provider) {
      // Create a custom transport from the provider
      // The provider should implement the EIP-1193 interface
      client = createPublicClient({
        transport: custom({
          async request({ method, params }) {
            // Use the provider's request method if available, otherwise fall back to send
            if (provider.request) {
              return provider.request({ method, params: params || [] })
            }
            return provider.send(method, params || [])
          }
        })
      })
    } else {
      // Fall back to HTTP transport with rpcUrl
      client = createPublicClient({
        transport: http(rpcUrl)
      })
    }

    clients.set(chainId, client)
  })

  // Create the DataService instance with the original chainConfigs
  // We need to ensure all configs have rpcUrl for the SDK's validation
  const normalizedConfigs: ChainConfig[] = chainConfigs.map((config) => ({
    chainId: config.chainId,
    privacyPoolAddress: config.privacyPoolAddress,
    startBlock: config.startBlock,
    // If provider is used, provide a placeholder rpcUrl for SDK validation
    rpcUrl: config.rpcUrl
  }))

  const dataService = new DataService(normalizedConfigs)

  // Override the internal clients Map with our custom clients
  // This is a bit of a hack, but necessary since DataService creates its own clients
  // @ts-expect-error - Accessing private field to inject custom clients
  dataService.clients = clients

  return dataService
}
