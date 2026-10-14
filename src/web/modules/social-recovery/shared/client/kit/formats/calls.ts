/**
 * The calldata of the writes a setup and a recovery send: the manager's
 * `commitSetup`, the account's own `setAddrPrivilege` that arms or disarms
 * the kit, the manager's start and three cancels, and the action's execute
 * with the calls it runs (the manager's consume, the account's two privilege
 * writes and the payment's ERC-20 transfer). The kit
 * is armed while the account grants the action's kit slot the action's
 * binding: the slot is the address `keccak256(abi.encode("kit", action))`
 * ends with, and the binding is `keccak256(abi.encode(action, bytes("")))`.
 */
import {
  type Abi,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  keccak256,
  slice,
  zeroHash
} from 'viem'

import AmbireAccount from '@contracts/compiled/AmbireAccount.json'
import type {
  Address,
  AttemptRequest,
  CancelRequest,
  Hex
} from '@web/modules/social-recovery/sdk-interfaces'

import { POLICY_MANAGER_ABI, RECOVERY_ACTION_ABI } from '../abi'
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

/** The account's `setAddrPrivilege(key, value)`, sent by the account to itself. */
export const privilegeData = (key: Address, value: Hex): Hex =>
  encodeFunctionData({ abi: ACCOUNT_ABI, functionName: 'setAddrPrivilege', args: [key, value] })

/** The manager's `startAttempt(request)`, the request's members only. */
export const startAttemptData = (request: AttemptRequest): Hex =>
  encodeFunctionData({
    abi: POLICY_MANAGER_ABI,
    functionName: 'startAttempt',
    args: [
      {
        account: request.account,
        action: request.action,
        attemptId: request.attemptId,
        setupNonce: request.setupNonce,
        setupBody: request.setupBody,
        payload: request.payload,
        order: {
          token: request.order.token,
          amount: request.order.amount,
          payee: request.order.payee
        },
        validUntil: request.validUntil,
        proofs: request.proofs
      }
    ]
  })

/** The manager's `cancelByProofs(request)`, the request's members only. */
export const cancelByProofsData = (request: CancelRequest): Hex =>
  encodeFunctionData({
    abi: POLICY_MANAGER_ABI,
    functionName: 'cancelByProofs',
    args: [
      {
        account: request.account,
        action: request.action,
        attemptId: request.attemptId,
        setupNonce: request.setupNonce,
        setupBody: request.setupBody,
        validUntil: request.validUntil,
        proofs: request.proofs
      }
    ]
  })

/** The manager's `cancelByOwner(action)`, sent by the account. */
export const cancelByOwnerData = (action: Address): Hex =>
  encodeFunctionData({ abi: POLICY_MANAGER_ABI, functionName: 'cancelByOwner', args: [action] })

/** The manager's `cancelByVeto(account, action, attemptId, method)`. */
export const cancelByVetoData = (
  account: Address,
  action: Address,
  attemptId: bigint,
  method: Address
): Hex =>
  encodeFunctionData({
    abi: POLICY_MANAGER_ABI,
    functionName: 'cancelByVeto',
    args: [account, action, attemptId, method]
  })

/** The action's `executeHandover(account, payload)`. */
export const executeHandoverData = (account: Address, payload: Hex): Hex =>
  encodeFunctionData({
    abi: RECOVERY_ACTION_ABI,
    functionName: 'executeHandover',
    args: [account, payload]
  })

/** The manager's `consume(action, attemptId, payloadHash)`, which the action calls at the execute. */
export const consumeData = (action: Address, attemptId: bigint, payloadHash: Hex): Hex =>
  encodeFunctionData({
    abi: POLICY_MANAGER_ABI,
    functionName: 'consume',
    args: [action, attemptId, payloadHash]
  })

/** An ERC-20 `transfer(payee, amount)`. */
export const transferData = (payee: Address, amount: bigint): Hex =>
  encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [payee, amount] })
