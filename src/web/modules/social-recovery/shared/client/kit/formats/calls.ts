/**
 * The calldata of the writes a setup sends: the manager's `commitSetup`, and
 * the account's own `setAddrPrivilege` that arms or disarms the kit. The kit
 * is armed while the account grants the action's kit slot the action's
 * binding: the slot is the address `keccak256(abi.encode("kit", action))`
 * ends with, and the binding is `keccak256(abi.encode(action, bytes("")))`.
 */
import {
  type Abi,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  slice,
  zeroHash
} from 'viem'

import AmbireAccount from '@contracts/compiled/AmbireAccount.json'
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import { POLICY_MANAGER_ABI } from '../abi'
import type { CommitSetupCall } from './types'

const ACCOUNT_ABI = AmbireAccount.abi as Abi

/** The address an action's kit privilege is held under on the account. */
export const kitSlotOf = (action: Address): Address =>
  getAddress(
    slice(
      keccak256(encodeAbiParameters([{ type: 'string' }, { type: 'address' }], ['kit', action])),
      12
    )
  )

/** The privilege value that arms the kit for an action. */
export const kitBindingOf = (action: Address): Hex =>
  keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes' }], [action, '0x']))

/** The manager's `commitSetup(action, setupCommitment, nonce, publicMetadata, privateMetadata)`. */
export const commitSetupData = ({
  action,
  setupCommitment,
  nonce,
  publicMetadata,
  privateMetadata
}: CommitSetupCall): Hex =>
  encodeFunctionData({
    abi: POLICY_MANAGER_ABI,
    functionName: 'commitSetup',
    args: [action, setupCommitment, nonce, publicMetadata, privateMetadata]
  })

/** The account's `setAddrPrivilege(kitSlot, binding)`, sent by the account to itself. */
export const armingData = (action: Address): Hex =>
  encodeFunctionData({
    abi: ACCOUNT_ABI,
    functionName: 'setAddrPrivilege',
    args: [kitSlotOf(action), kitBindingOf(action)]
  })

/** The account's `setAddrPrivilege(kitSlot, 0)`, sent by the account to itself. */
export const disarmingData = (action: Address): Hex =>
  encodeFunctionData({
    abi: ACCOUNT_ABI,
    functionName: 'setAddrPrivilege',
    args: [kitSlotOf(action), zeroHash]
  })
