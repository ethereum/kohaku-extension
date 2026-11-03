/**
 * The extension's own provider for the one recovery chain.
 *
 * It is built through `getRpcProvider` of ambire-common from the network record
 * the UI reads through `useNetworksControllerState`, so it honours the
 * network's selected RPC URL and its provider kind: a plain JSON-RPC provider,
 * the Helios light client or Colibri with its prover. The provider adapter and
 * the chain reads both run on it.
 */
import type { Network } from '@ambire-common/interfaces/network'
import { getRpcProvider } from '@ambire-common/services/provider/getRpcProvider'

import { CHAIN_IDS } from './chains'
import type { ExtensionProvider, RecoveryChain } from './types'

/** The network record of a recovery chain among the networks the extension holds. */
export const networkOf = (
  networks: readonly Network[] | undefined,
  chain: RecoveryChain
): Network | undefined =>
  (networks ?? []).find((network) => Number(network.chainId) === CHAIN_IDS[chain])

/**
 * A key that changes whenever a field `getRpcProvider` builds the provider
 * from changes: the chain, the RPC URLs and the selected one, the provider
 * kind, the batch size, the light client's consensus RPC URL and network kind,
 * and Colibri's prover URL.
 *
 * The light client's checkpoint is left out. The background's own light client
 * writes each new checkpoint it reaches into the network record, so keying on
 * it would restart this provider, and its sync, each time. The checkpoint only
 * seeds a light client's first sync, and a provider built later reads the
 * latest one.
 */
export const providerKeyOf = (network: Network): string =>
  JSON.stringify([
    network.chainId.toString(),
    network.rpcUrls,
    network.selectedRpcUrl,
    network.rpcProvider ?? 'rpc',
    network.batchMaxCount ?? null,
    network.consensusRpcUrl ?? null,
    !!network.isOptimistic,
    !!network.isLinea,
    network.proverRpcUrl ?? null
  ])

/**
 * Builds the extension's provider for one network record. The caller destroys
 * it: `destroy()` shuts a Helios light client down, a pending one included,
 * and stops a JSON-RPC provider. Colibri's own client has a `destroy()` that
 * only stops its `startLightClient` poll, which `ColibriRpcProvider` never
 * starts, so the provider's inherited `destroy()` leaves no timer behind for
 * the reads this folder makes.
 */
export const extensionProviderFor = (network: Network): ExtensionProvider => getRpcProvider(network)
