import { decodeFunctionResult, encodeFunctionData } from 'viem'

import {
  type ActionState,
  type Address,
  ATTEMPT_STATES,
  type AttemptState,
  type BlockTag,
  type Domain,
  type Hex,
  type IProvider
} from '@web/modules/social-recovery/sdk-interfaces'

import { POLICY_MANAGER_ABI } from '../abi'
import type { ManagerReads } from './types'
import { viewOf } from './view'

const attemptStateOf = (index: number): AttemptState => {
  const state = ATTEMPT_STATES[index]
  if (state === undefined) {
    throw new Error(`The manager answered an attempt state outside its enum: ${index}.`)
  }
  return state
}

/** The manager's views over the provider adapter. */
export const createManagerReads = (provider: IProvider, manager: Address): ManagerReads => ({
  stateOf(account: Address, action: Address, block: BlockTag = 'latest'): Promise<ActionState> {
    return viewOf(
      provider,
      manager,
      encodeFunctionData({
        abi: POLICY_MANAGER_ABI,
        functionName: 'stateOf',
        args: [account, action]
      }),
      (answer) => {
        const state = decodeFunctionResult({
          abi: POLICY_MANAGER_ABI,
          functionName: 'stateOf',
          data: answer
        })
        return {
          setupCommitment: state.setupCommitment,
          setupNonce: state.setupNonce,
          nextAttemptId: state.nextAttemptId,
          setupCommittedAtBlock: state.setupCommittedAtBlock,
          attempt: {
            state: attemptStateOf(state.attempt.state),
            attemptId: state.attempt.attemptId,
            setupNonce: state.attempt.setupNonce,
            consumableAfter: state.attempt.consumableAfter,
            payloadHash: state.attempt.payloadHash,
            order: {
              token: state.attempt.order.token,
              amount: state.attempt.order.amount,
              payee: state.attempt.order.payee
            },
            usedMethods: [...state.attempt.usedMethods],
            ignoresPause: state.attempt.ignoresPause
          }
        }
      },
      block
    )
  },

  eip712Domain(): Promise<Domain> {
    return viewOf(
      provider,
      manager,
      encodeFunctionData({ abi: POLICY_MANAGER_ABI, functionName: 'eip712Domain' }),
      (answer) => {
        const [fields, name, version, chainId, verifyingContract, salt, extensions] =
          decodeFunctionResult({
            abi: POLICY_MANAGER_ABI,
            functionName: 'eip712Domain',
            data: answer
          })
        return {
          fields,
          name,
          version,
          chainId,
          verifyingContract,
          salt,
          extensions: [...extensions]
        }
      }
    )
  },

  name(): Promise<string> {
    return viewOf(
      provider,
      manager,
      encodeFunctionData({ abi: POLICY_MANAGER_ABI, functionName: 'name' }),
      (answer) =>
        decodeFunctionResult({ abi: POLICY_MANAGER_ABI, functionName: 'name', data: answer })
    )
  },

  version(): Promise<string> {
    return viewOf(
      provider,
      manager,
      encodeFunctionData({ abi: POLICY_MANAGER_ABI, functionName: 'version' }),
      (answer) =>
        decodeFunctionResult({ abi: POLICY_MANAGER_ABI, functionName: 'version', data: answer })
    )
  },

  supportsInterface(interfaceId: Hex): Promise<boolean> {
    return viewOf(
      provider,
      manager,
      encodeFunctionData({
        abi: POLICY_MANAGER_ABI,
        functionName: 'supportsInterface',
        args: [interfaceId]
      }),
      (answer) =>
        decodeFunctionResult({
          abi: POLICY_MANAGER_ABI,
          functionName: 'supportsInterface',
          data: answer
        })
    )
  }
})
