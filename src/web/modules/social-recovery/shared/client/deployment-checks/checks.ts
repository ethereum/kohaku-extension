/**
 * The construction checks of a deployment beyond the ones the SDK's builder
 * runs: the manager answers at the deployment's address, and the action is
 * bound to the deployment's manager and served implementation and holds the
 * kit slot and binding this build derives from its address. A contract that
 * is absent or of another kind, and any disagreement, refuse with a
 * `DeploymentRefusal` before any client is handed out.
 */
import { isProviderRevert, kitBinding, kitSlot } from '@kohaku-eth/social-recovery'
import type {
  Address,
  Domain,
  IPolicyManagerInteractor,
  IProvider
} from '@kohaku-eth/social-recovery'
import { isAddressEqual, size } from 'viem'

import type { DeploymentCheck, DeploymentRefusal } from '../types'
import type { ActionConstantsInput } from './types'

/**
 * What a deployment refusal names: the manager or the action answering as no
 * contract of its kind, or the action bound to another manager, another
 * served implementation, another kit slot or another binding.
 */
export const DEPLOYMENT_CHECKS = [
  'manager',
  'action',
  'action-manager',
  'served-implementation',
  'kit-slot',
  'binding'
] as const

export const deploymentRefusal = (check: DeploymentCheck, message: string): DeploymentRefusal => {
  const error = new Error(message) as DeploymentRefusal
  error.name = 'DeploymentRefusal'
  error.check = check
  return error
}

/**
 * One read of a deployment's contract. A revert, or an answer that does not
 * decode from an address with no code, is the deployment's refusal; a read
 * the provider could not make stays its failure.
 */
const readDeployed = async <T>(
  read: () => Promise<T>,
  address: Address,
  provider: Pick<IProvider, 'code'>,
  check: DeploymentCheck
): Promise<T> => {
  try {
    return await read()
  } catch (thrown: unknown) {
    if (isProviderRevert(thrown)) {
      throw deploymentRefusal(check, `The ${check} at ${address} reverts a read it must answer.`)
    }
    if (size(await provider.code(address, 'latest')) === 0) {
      throw deploymentRefusal(
        check,
        `No contract is deployed at the ${check}'s address ${address}.`
      )
    }
    throw thrown
  }
}

/** The manager's domain, where a contract at the manager's address answers it. */
export const readManagerDomain = (
  manager: Pick<IPolicyManagerInteractor, 'eip712Domain'>,
  address: Address,
  provider: Pick<IProvider, 'code'>
): Promise<Domain> => readDeployed(() => manager.eip712Domain(), address, provider, 'manager')

/** The action's four constants against the descriptor and this build's own derivations. */
export const checkActionConstants = async ({
  action,
  provider,
  descriptor
}: ActionConstantsInput): Promise<void> => {
  const read = <T>(view: (reads: ActionConstantsInput['action']) => Promise<T>) =>
    readDeployed(() => view(action), descriptor.action, provider, 'action')
  const manager = await read((reads) => reads.manager())
  if (!isAddressEqual(manager, descriptor.manager)) {
    throw deploymentRefusal(
      'action-manager',
      `The action answers manager ${manager}, the deployment ${descriptor.manager}.`
    )
  }
  const implementation = await read((reads) => reads.ambireImplementation())
  if (!isAddressEqual(implementation, descriptor.servedImplementation)) {
    throw deploymentRefusal(
      'served-implementation',
      `The action serves implementation ${implementation}, this build ${descriptor.servedImplementation}.`
    )
  }
  const slot = await read((reads) => reads.kitSlot())
  if (!isAddressEqual(slot, kitSlot(descriptor.action))) {
    throw deploymentRefusal(
      'kit-slot',
      `The action answers kit slot ${slot}, this build derives ${kitSlot(descriptor.action)}.`
    )
  }
  const binding = await read((reads) => reads.binding())
  if (binding.toLowerCase() !== kitBinding(descriptor.action).toLowerCase()) {
    throw deploymentRefusal(
      'binding',
      `The action answers binding ${binding}, this build derives ${kitBinding(descriptor.action)}.`
    )
  }
}
