/**
 * The SDK stand-in: the doubles the client is built against until the SDK
 * lands. This folder is the only one outside `sdk-doubles/` that imports the
 * doubles, so the swap to the real SDK touches this folder alone. This file
 * goes with the swap.
 *
 * The doubles serve one scripted chain record per account. The stand-in keeps
 * one record per deployment and account for the life of the page, so a setup
 * client and a recovery client built for one account read the same world.
 * Tests and the development build script that world through `chainFor`.
 *
 * The doubles pin blocks and read logs through the configured provider, while
 * the manager, action and method state comes from the scripted record. A
 * client built over a real node therefore reads the record's state at the
 * node's blocks; a coherent development world passes `providerFor(chain)` as
 * the provider.
 */
import type { ChainSeed } from '@web/modules/social-recovery/sdk-doubles'
import { ProviderDouble, ScriptedChain } from '@web/modules/social-recovery/sdk-doubles'
import type {
  Address,
  DeploymentDescriptor,
  IProvider
} from '@web/modules/social-recovery/sdk-interfaces'

const chains = new Map<string, ScriptedChain>()

const keyOf = (descriptor: DeploymentDescriptor, account: Address): string =>
  [descriptor.chainId, descriptor.manager, descriptor.action, account].join(':').toLowerCase()

export const sdkStandIn = {
  /**
   * The scripted chain record for one deployment and one account, created on
   * first use from the descriptor and the account, with the doubles' defaults
   * for the rest of the world (or the seed given at that first use).
   */
  chainFor(
    descriptor: DeploymentDescriptor,
    account: Address,
    seed: Omit<ChainSeed, 'descriptor' | 'account'> = {}
  ): ScriptedChain {
    const key = keyOf(descriptor, account)
    let chain = chains.get(key)
    if (!chain) {
      chain = new ScriptedChain({ ...seed, descriptor, account })
      chains.set(key, chain)
    }
    return chain
  },

  /** An `IProvider` answered from a scripted chain, for a test or a development run with no node. */
  providerFor(chain: ScriptedChain): IProvider {
    return new ProviderDouble(chain)
  },

  /** Forgets every scripted chain record. */
  reset(): void {
    chains.clear()
  }
}
