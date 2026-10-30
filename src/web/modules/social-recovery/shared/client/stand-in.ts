/**
 * The fake nodes the client is built over on a chain with no deployment: one
 * per deployment and account for the life of the page, so a setup client and
 * a recovery client built for one account read the same world, and a reload
 * starts it afresh. Tests and the development build seed that world through
 * `nodeFor`. The identity methods run over scripted stacks kept the same way,
 * one per deployment, which tests and the development build script through
 * `zkPassportStackFor` and `aadhaarStackFor`.
 */
import type { Address, DeploymentDescriptor, IProvider } from '@kohaku-eth/social-recovery'

import { createScriptedAadhaarStack, createScriptedZkPassportStack, ScriptedNode } from './scripted'
import type { ScriptedAadhaarStack, ScriptedNodeSeed, ScriptedZkPassportStack } from './scripted'

const nodes = new Map<string, ScriptedNode>()
const zkPassportStacks = new Map<string, ScriptedZkPassportStack>()
const aadhaarStacks = new Map<string, ScriptedAadhaarStack>()

const deploymentKeyOf = (descriptor: DeploymentDescriptor): string =>
  [descriptor.chainId, descriptor.manager, descriptor.action].join(':').toLowerCase()

const kept = <T>(map: Map<string, T>, key: string, create: () => T): T => {
  const found = map.get(key)
  if (found) {
    return found
  }
  const created = create()
  map.set(key, created)
  return created
}

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

  /** The scripted zkPassport stack of one deployment, created on first use. */
  zkPassportStackFor(descriptor: DeploymentDescriptor): ScriptedZkPassportStack {
    return kept(zkPassportStacks, deploymentKeyOf(descriptor), () =>
      createScriptedZkPassportStack()
    )
  },

  /** The scripted Aadhaar stack of one deployment, created on first use. */
  aadhaarStackFor(descriptor: DeploymentDescriptor): ScriptedAadhaarStack {
    return kept(aadhaarStacks, deploymentKeyOf(descriptor), () => createScriptedAadhaarStack())
  },

  /** Forgets every fake node and every scripted stack. */
  reset(): void {
    nodes.clear()
    zkPassportStacks.clear()
    aadhaarStacks.clear()
  }
}
