/**
 * The construction checks of a deployed kit beyond the manager's domain: the
 * contracts answer at the deployment's addresses, and the action is bound to
 * the deployment's manager and served implementation and holds the kit slot
 * and binding this build derives from its address. A contract that is absent
 * or of another kind, and any disagreement, refuse with a
 * `DeploymentRefusal` before any client is built.
 */
import { isAddressEqual, size } from 'viem'

import type { Address, Domain } from '@web/modules/social-recovery/sdk-interfaces'

import { isProviderReadFailure, isRevertedCall } from '../../provider-adapter'
import type { CodeRead, DeploymentCheck, DeploymentRefusal } from '../../types'
import { kitBindingOf, kitSlotOf } from '../formats'
import type { ManagerReads } from '../reads'
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
  codeRead: CodeRead,
  check: DeploymentCheck
): Promise<T> => {
  try {
    return await read()
  } catch (thrown: unknown) {
    if (isRevertedCall(thrown)) {
      throw deploymentRefusal(check, `The ${check} at ${address} reverts a read it must answer.`)
    }
    if (
      isProviderReadFailure(thrown) &&
      thrown.read === 'call' &&
      size(await codeRead.code(address)) === 0
    ) {
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
  manager: Pick<ManagerReads, 'eip712Domain'>,
  address: Address,
  codeRead: CodeRead
): Promise<Domain> => readDeployed(() => manager.eip712Domain(), address, codeRead, 'manager')

/** The action's four constants against the descriptor and this build's own derivations. */
export const checkActionConstants = async ({
  action,
  codeRead,
  descriptor
}: ActionConstantsInput): Promise<void> => {
  const read = <T>(view: (reads: ActionConstantsInput['action']) => Promise<T>) =>
    readDeployed(() => view(action), descriptor.action, codeRead, 'action')
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
  const kitSlot = await read((reads) => reads.kitSlot())
  if (!isAddressEqual(kitSlot, kitSlotOf(descriptor.action))) {
    throw deploymentRefusal(
      'kit-slot',
      `The action answers kit slot ${kitSlot}, this build derives ${kitSlotOf(descriptor.action)}.`
    )
  }
  const binding = await read((reads) => reads.binding())
  if (binding.toLowerCase() !== kitBindingOf(descriptor.action).toLowerCase()) {
    throw deploymentRefusal(
      'binding',
      `The action answers binding ${binding}, this build derives ${kitBindingOf(
        descriptor.action
      )}.`
    )
  }
}
