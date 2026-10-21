/**
 * The fake nodes the client is built over on a chain with no deployment: one
 * per deployment and account for the life of the page, so a setup client and
 * a recovery client built for one account read the same world, and a reload
 * starts it afresh. Tests and the development build seed that world through
 * `nodeFor`.
 */
import type { Address, DeploymentDescriptor, IProvider } from '@kohaku-eth/social-recovery'

import { ScriptedNode } from './scripted'
import type { ScriptedNodeSeed } from './scripted'

const nodes = new Map<string, ScriptedNode>()

const keyOf = (descriptor: DeploymentDescriptor, account: Address): string =>
  [descriptor.chainId, descriptor.manager, descriptor.action, account].join(':').toLowerCase()

export const sdkStandIn = {
  /**
   * The fake node for one deployment and one account, created on first use
   * from the descriptor and the account, with the node's defaults for the
   * rest of the world (or the seed given at that first use).
   */
  nodeFor(
    descriptor: DeploymentDescriptor,
    account: Address,
    seed: Omit<ScriptedNodeSeed, 'descriptor' | 'account'> = {}
  ): ScriptedNode {
    const key = keyOf(descriptor, account)
    let node = nodes.get(key)
    if (!node) {
      node = new ScriptedNode({ ...seed, descriptor, account })
      nodes.set(key, node)
    }
    return node
  },

  /** The `IProvider` a fake node answers as. */
  providerFor(node: ScriptedNode): IProvider {
    return node
  },

  /** Forgets every fake node. */
  reset(): void {
    nodes.clear()
  }
}
