/**
 * The `commitSetup` call a prepared save carries. A prepared save comes back
 * from storage, so its calls are read as bytes that may not decode: the call
 * to this manager whose data decodes as `commitSetup` for this action is the
 * one, and any other call is skipped.
 */
import { decodeFunctionData, isAddress, isAddressEqual, isHex } from 'viem'

import type {
  Address,
  PreparedBatch,
  PreparedCall
} from '@web/modules/social-recovery/sdk-interfaces'

import { POLICY_MANAGER_ABI } from '../abi'
import type { StoredCommitCall } from './types'

const commitOfCall = (
  call: PreparedCall,
  manager: Address,
  action: Address
): StoredCommitCall | undefined => {
  if (
    typeof call !== 'object' ||
    call === null ||
    !isAddress(call.target, { strict: false }) ||
    !isAddressEqual(call.target, manager) ||
    !isHex(call.data)
  ) {
    return undefined
  }
  try {
    const decoded = decodeFunctionData({ abi: POLICY_MANAGER_ABI, data: call.data })
    if (decoded.functionName !== 'commitSetup') {
      return undefined
    }
    const [callAction, setupCommitment, nonce] = decoded.args
    return isAddressEqual(callAction, action) ? { setupCommitment, nonce } : undefined
  } catch {
    return undefined
  }
}

export const storedCommitCallOf = (
  prepared: PreparedCall | PreparedBatch,
  manager: Address,
  action: Address
): StoredCommitCall | undefined => {
  const calls: readonly PreparedCall[] =
    prepared.kind === 'batch' ? (Array.isArray(prepared.calls) ? prepared.calls : []) : [prepared]
  return calls
    .map((call) => commitOfCall(call, manager, action))
    .find((commit): commit is StoredCommitCall => commit !== undefined)
}
