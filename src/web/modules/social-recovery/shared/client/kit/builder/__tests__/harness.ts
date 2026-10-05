/**
 * A deployed kit's manager and action scripted on the fake node: the
 * manager's domain and the action's four constants, ABI-encoded here from
 * hand-written signatures. The action is the deployed one, so its kit slot
 * and binding are the values the deployed contract answers; every other
 * address is made up.
 */
import {
  encodeFunctionData,
  encodeFunctionResult,
  getAddress,
  type Hex,
  parseAbi,
  zeroHash
} from 'viem'

import { PROXY_AMBIRE_ACCOUNT } from '@ambire-common/consts/deploy'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import {
  ACTION_ABI,
  CONTRACT_CODE,
  DEPLOYED_AT,
  fakeNode,
  MANAGER,
  METHOD_ECDSA,
  METHOD_PASSKEY
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__tests__/harness'
import type { FakeNode } from '@web/modules/social-recovery/shared/client/kit/setup-client/__fixtures__/types'
import type { ScriptedDeployment } from '@web/modules/social-recovery/shared/client/kit/builder/__fixtures__/types'
import type { DeploymentFacts } from '@web/modules/social-recovery/shared/client/types'

export const DEPLOYED_ACTION: Address = '0x1e612c81087aae64c31cb68953a480d06c5e4ac7'
export const DEPLOYED_KIT_SLOT: Address = '0x744E5A757FF2B81e03a724Ec67d73E6f1C5834C8'
export const DEPLOYED_BINDING: Hex =
  '0x345110f26cd4c68d2f4977283999ad1142fc3e35d8191dd48e9b93e89986c02f'

export const DOMAIN_ABI = parseAbi([
  'function eip712Domain() view returns (bytes1, string, string, uint256, address, bytes32, uint256[])'
])

export const DOMAIN_CALL = encodeFunctionData({ abi: DOMAIN_ABI, functionName: 'eip712Domain' })

export const CONSTANT_CALLS = {
  manager: encodeFunctionData({ abi: ACTION_ABI, functionName: 'MANAGER' }),
  implementation: encodeFunctionData({ abi: ACTION_ABI, functionName: 'AMBIRE_IMPLEMENTATION' }),
  kitSlot: encodeFunctionData({ abi: ACTION_ABI, functionName: 'KIT_SLOT' }),
  binding: encodeFunctionData({ abi: ACTION_ABI, functionName: 'BINDING' })
}

/** The deployment's facts as the build-time variable carries them. */
export const FACTS: DeploymentFacts = {
  manager: getAddress(MANAGER),
  methodEcdsa: getAddress(METHOD_ECDSA),
  methodPasskey: getAddress(METHOD_PASSKEY),
  action: getAddress(DEPLOYED_ACTION),
  deployedAt: DEPLOYED_AT,
  digestVersion: '1',
  managerVersion: '1.0.0',
  auditedActions: [{ action: getAddress(DEPLOYED_ACTION), publisher: 'ethereumFoundation' }]
}

const addressOf = (
  functionName: 'MANAGER' | 'AMBIRE_IMPLEMENTATION' | 'KIT_SLOT',
  value: Address
) => encodeFunctionResult({ abi: ACTION_ABI, functionName, result: value })

/** Scripts the deployed manager and action as the deployment answers them, with each override. */
export const scriptDeployment = (node: FakeNode, script: ScriptedDeployment = {}): void => {
  if (script.managerCode !== false) {
    node.setCode(MANAGER, CONTRACT_CODE)
  }
  if (script.actionCode !== false) {
    node.setCode(DEPLOYED_ACTION, CONTRACT_CODE)
  }
  node.provider.chainId.mockImplementation(async () => script.chainId ?? 11155111)
  const { domain } = script
  node.answer(
    MANAGER,
    DOMAIN_CALL,
    domain instanceof Error
      ? domain
      : encodeFunctionResult({
          abi: DOMAIN_ABI,
          functionName: 'eip712Domain',
          result: [
            domain?.fields ?? '0x0f',
            domain?.name ?? 'PolicyManager',
            domain?.version ?? '1',
            domain?.chainId ?? 11155111n,
            domain?.verifyingContract ?? MANAGER,
            zeroHash,
            []
          ]
        })
  )
  const valueOr = <T>(value: T | Error, encode: (v: T) => Hex): Hex | Error =>
    value instanceof Error ? value : encode(value)
  node.answer(
    DEPLOYED_ACTION,
    CONSTANT_CALLS.manager,
    valueOr(script.manager ?? MANAGER, (v) => addressOf('MANAGER', v))
  )
  node.answer(
    DEPLOYED_ACTION,
    CONSTANT_CALLS.implementation,
    valueOr(script.implementation ?? PROXY_AMBIRE_ACCOUNT, (v) =>
      addressOf('AMBIRE_IMPLEMENTATION', v)
    )
  )
  node.answer(
    DEPLOYED_ACTION,
    CONSTANT_CALLS.kitSlot,
    valueOr(script.kitSlot ?? DEPLOYED_KIT_SLOT, (v) => addressOf('KIT_SLOT', v))
  )
  node.answer(
    DEPLOYED_ACTION,
    CONSTANT_CALLS.binding,
    valueOr(script.binding ?? DEPLOYED_BINDING, (v) =>
      encodeFunctionResult({ abi: ACTION_ABI, functionName: 'BINDING', result: v })
    )
  )
}

// Jest runs every file under __tests__, this one included; its own check runs
// only when Jest runs this file, never from a file that imports the harness.
if (expect.getState().testPath === __filename) {
  describe('harness', () => {
    it('scripts the deployment answering as deployed, and an override in its place', async () => {
      const node = fakeNode()
      scriptDeployment(node, { kitSlot: MANAGER })
      await expect(
        node.provider.call(DEPLOYED_ACTION, CONSTANT_CALLS.binding, undefined, 'latest')
      ).resolves.toBe(DEPLOYED_BINDING)
      await expect(
        node.provider.call(DEPLOYED_ACTION, CONSTANT_CALLS.kitSlot, undefined, 'latest')
      ).resolves.toBe(addressOf('KIT_SLOT', MANAGER))
    })
  })
}
