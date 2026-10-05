import { decodeFunctionResult, encodeFunctionData, size } from 'viem'

import type {
  ActionInfo,
  Address,
  BlockTag,
  Hex
} from '@web/modules/social-recovery/sdk-interfaces'

import { RECOVERY_ACTION_ABI } from '../abi'
import { ACTION_INTERFACE_ID } from './interface-ids'
import type { ActionReads, ActionReadsChain } from './types'
import { viewOf } from './view'

/**
 * The action's views over the provider adapter. The action reverts
 * `isAuthorized`, `isAuthority` and `holdsAnyPrivilege` for an address with no
 * code, so those three read the account's code first, at the same block, and
 * answer false for an account with none without calling the action.
 * `supportsAccount` answers for any address and is called as it is.
 */
export const createActionReads = (
  { provider, codeRead }: ActionReadsChain,
  action: Address
): ActionReads => {
  const hasCode = async (account: Address, block: BlockTag): Promise<boolean> =>
    size(await codeRead.code(account, block)) > 0

  const reads: ActionReads = {
    manager(): Promise<Address> {
      return viewOf(
        provider,
        action,
        encodeFunctionData({ abi: RECOVERY_ACTION_ABI, functionName: 'MANAGER' }),
        (answer) =>
          decodeFunctionResult({ abi: RECOVERY_ACTION_ABI, functionName: 'MANAGER', data: answer })
      )
    },

    ambireImplementation(): Promise<Address> {
      return viewOf(
        provider,
        action,
        encodeFunctionData({ abi: RECOVERY_ACTION_ABI, functionName: 'AMBIRE_IMPLEMENTATION' }),
        (answer) =>
          decodeFunctionResult({
            abi: RECOVERY_ACTION_ABI,
            functionName: 'AMBIRE_IMPLEMENTATION',
            data: answer
          })
      )
    },

    kitSlot(): Promise<Address> {
      return viewOf(
        provider,
        action,
        encodeFunctionData({ abi: RECOVERY_ACTION_ABI, functionName: 'KIT_SLOT' }),
        (answer) =>
          decodeFunctionResult({ abi: RECOVERY_ACTION_ABI, functionName: 'KIT_SLOT', data: answer })
      )
    },

    binding(): Promise<Hex> {
      return viewOf(
        provider,
        action,
        encodeFunctionData({ abi: RECOVERY_ACTION_ABI, functionName: 'BINDING' }),
        (answer) =>
          decodeFunctionResult({ abi: RECOVERY_ACTION_ABI, functionName: 'BINDING', data: answer })
      )
    },

    keyValue(): Promise<Hex> {
      return viewOf(
        provider,
        action,
        encodeFunctionData({ abi: RECOVERY_ACTION_ABI, functionName: 'KEY_VALUE' }),
        (answer) =>
          decodeFunctionResult({
            abi: RECOVERY_ACTION_ABI,
            functionName: 'KEY_VALUE',
            data: answer
          })
      )
    },

    async isAuthorized(account: Address, block: BlockTag = 'latest'): Promise<boolean> {
      if (!(await hasCode(account, block))) {
        return false
      }
      return viewOf(
        provider,
        action,
        encodeFunctionData({
          abi: RECOVERY_ACTION_ABI,
          functionName: 'isAuthorized',
          args: [account]
        }),
        (answer) =>
          decodeFunctionResult({
            abi: RECOVERY_ACTION_ABI,
            functionName: 'isAuthorized',
            data: answer
          }),
        block
      )
    },

    async isAuthority(
      account: Address,
      key: Address,
      block: BlockTag = 'latest'
    ): Promise<boolean> {
      if (!(await hasCode(account, block))) {
        return false
      }
      return viewOf(
        provider,
        action,
        encodeFunctionData({
          abi: RECOVERY_ACTION_ABI,
          functionName: 'isAuthority',
          args: [account, key]
        }),
        (answer) =>
          decodeFunctionResult({
            abi: RECOVERY_ACTION_ABI,
            functionName: 'isAuthority',
            data: answer
          }),
        block
      )
    },

    async holdsAnyPrivilege(
      account: Address,
      candidate: Address,
      block: BlockTag = 'latest'
    ): Promise<boolean> {
      if (!(await hasCode(account, block))) {
        return false
      }
      return viewOf(
        provider,
        action,
        encodeFunctionData({
          abi: RECOVERY_ACTION_ABI,
          functionName: 'holdsAnyPrivilege',
          args: [account, candidate]
        }),
        (answer) =>
          decodeFunctionResult({
            abi: RECOVERY_ACTION_ABI,
            functionName: 'holdsAnyPrivilege',
            data: answer
          }),
        block
      )
    },

    supportsAccount(account: Address, block: BlockTag = 'latest'): Promise<boolean> {
      return viewOf(
        provider,
        action,
        encodeFunctionData({
          abi: RECOVERY_ACTION_ABI,
          functionName: 'supportsAccount',
          args: [account]
        }),
        (answer) =>
          decodeFunctionResult({
            abi: RECOVERY_ACTION_ABI,
            functionName: 'supportsAccount',
            data: answer
          }),
        block
      )
    },

    name(): Promise<string> {
      return viewOf(
        provider,
        action,
        encodeFunctionData({ abi: RECOVERY_ACTION_ABI, functionName: 'name' }),
        (answer) =>
          decodeFunctionResult({ abi: RECOVERY_ACTION_ABI, functionName: 'name', data: answer })
      )
    },

    version(): Promise<string> {
      return viewOf(
        provider,
        action,
        encodeFunctionData({ abi: RECOVERY_ACTION_ABI, functionName: 'version' }),
        (answer) =>
          decodeFunctionResult({ abi: RECOVERY_ACTION_ABI, functionName: 'version', data: answer })
      )
    },

    supportsInterface(interfaceId: Hex): Promise<boolean> {
      return viewOf(
        provider,
        action,
        encodeFunctionData({
          abi: RECOVERY_ACTION_ABI,
          functionName: 'supportsInterface',
          args: [interfaceId]
        }),
        (answer) =>
          decodeFunctionResult({
            abi: RECOVERY_ACTION_ABI,
            functionName: 'supportsInterface',
            data: answer
          })
      )
    },

    async actionInfo(): Promise<ActionInfo> {
      const [name, version, supportsInterface] = await Promise.all([
        reads.name(),
        reads.version(),
        reads.supportsInterface(ACTION_INTERFACE_ID)
      ])
      return { name, version, supportsInterface }
    }
  }
  return reads
}
