/**
 * The calldata of a setup's and a recovery's writes and the kit's slot and
 * binding. The slot
 * and the binding of the deployed recovery action are the values its own
 * `KIT_SLOT()` and `BINDING()` answer; the calldata is decoded here with a
 * one-function ABI written out by hand.
 */
import { decodeFunctionData, getAddress, parseAbi, slice, zeroHash } from 'viem'

import type {
  Address,
  AttemptRequest,
  CancelRequest,
  Hex
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  armingData,
  cancelByOwnerData,
  cancelByProofsData,
  cancelByVetoData,
  commitSetupData,
  consumeData,
  disarmingData,
  executeHandoverData,
  kitBindingOf,
  kitSlotOf,
  privilegeData,
  startAttemptData,
  transferData
} from '@web/modules/social-recovery/shared/client/kit/formats'

const DEPLOYED_ACTION: Address = '0x1e612c81087aae64c31cb68953a480d06c5e4ac7'
const DEPLOYED_KIT_SLOT: Address = '0x744E5A757FF2B81e03a724Ec67d73E6f1C5834C8'
const DEPLOYED_BINDING: Hex = '0x345110f26cd4c68d2f4977283999ad1142fc3e35d8191dd48e9b93e89986c02f'

const OTHER_ACTION: Address = '0x6666666666666666666666666666666666666666'

const COMMIT_SETUP = parseAbi([
  'function commitSetup(address action, bytes32 setupCommitment, uint64 nonce, bytes publicMetadata, bytes privateMetadata)'
])
const SET_ADDR_PRIVILEGE = parseAbi(['function setAddrPrivilege(address addr, bytes32 priv)'])
const RECOVERY_WRITES = parseAbi([
  'function startAttempt((address account, address action, uint64 attemptId, uint64 setupNonce, bytes setupBody, bytes payload, (address token, uint256 amount, address payee) order, uint48 validUntil, (uint256 place, address method, bytes config, bytes32 salt, bytes proof)[] proofs) request)',
  'function cancelByProofs((address account, address action, uint64 attemptId, uint64 setupNonce, bytes setupBody, uint48 validUntil, (uint256 place, address method, bytes config, bytes32 salt, bytes proof)[] proofs) request)',
  'function cancelByOwner(address action)',
  'function cancelByVeto(address account, address action, uint64 attemptId, address method)',
  'function consume(address action, uint64 attemptId, bytes32 payloadHash)',
  'function executeHandover(address account, bytes payload)',
  'function transfer(address to, uint256 amount) returns (bool)'
])

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const METHOD: Address = '0x2222222222222222222222222222222222222222'
const KEY: Address = '0x3333333333333333333333333333333333333333'
const TOKEN: Address = '0x4444444444444444444444444444444444444444'
const PAYEE: Address = '0x5555555555555555555555555555555555555555'

describe('the kit slot and the binding', () => {
  it('equal what the deployed action answers for itself', () => {
    expect(kitSlotOf(DEPLOYED_ACTION)).toBe(DEPLOYED_KIT_SLOT)
    expect(kitBindingOf(DEPLOYED_ACTION)).toBe(DEPLOYED_BINDING)
  })

  it('do not depend on the case the action is written in', () => {
    const checksummed = getAddress(DEPLOYED_ACTION)
    expect(kitSlotOf(checksummed)).toBe(DEPLOYED_KIT_SLOT)
    expect(kitBindingOf(checksummed)).toBe(DEPLOYED_BINDING)
  })

  it('differ for another action', () => {
    expect(kitSlotOf(OTHER_ACTION)).not.toBe(DEPLOYED_KIT_SLOT)
    expect(kitBindingOf(OTHER_ACTION)).not.toBe(DEPLOYED_BINDING)
  })
})

describe('the commitSetup calldata', () => {
  const call = {
    action: DEPLOYED_ACTION,
    setupCommitment: `0x${'5a'.repeat(32)}` as Hex,
    nonce: 4n,
    publicMetadata: '0xc0ffee' as Hex,
    privateMetadata: `0x${'be'.repeat(70)}` as Hex
  }

  it('starts with the five-argument selector', () => {
    expect(slice(commitSetupData(call), 0, 4)).toBe('0x11d78064')
  })

  it('decodes to the five arguments it was given, in order', () => {
    const { functionName, args } = decodeFunctionData({
      abi: COMMIT_SETUP,
      data: commitSetupData(call)
    })
    expect(functionName).toBe('commitSetup')
    expect(args).toEqual([
      getAddress(call.action),
      call.setupCommitment,
      call.nonce,
      call.publicMetadata,
      call.privateMetadata
    ])
  })

  it('carries empty metadata as empty bytes', () => {
    const { args } = decodeFunctionData({
      abi: COMMIT_SETUP,
      data: commitSetupData({ ...call, publicMetadata: '0x', privateMetadata: '0x' })
    })
    expect(args[3]).toBe('0x')
    expect(args[4]).toBe('0x')
  })
})

describe('the arming and the disarming calldata', () => {
  it('arms by granting the kit slot the binding on the account', () => {
    const data = armingData(DEPLOYED_ACTION)
    expect(slice(data, 0, 4)).toBe('0x0d5828d4')
    const { functionName, args } = decodeFunctionData({ abi: SET_ADDR_PRIVILEGE, data })
    expect(functionName).toBe('setAddrPrivilege')
    expect(args).toEqual([DEPLOYED_KIT_SLOT, DEPLOYED_BINDING])
  })

  it('disarms by setting the kit slot to zero on the account', () => {
    const data = disarmingData(DEPLOYED_ACTION)
    expect(slice(data, 0, 4)).toBe('0x0d5828d4')
    const { args } = decodeFunctionData({ abi: SET_ADDR_PRIVILEGE, data })
    expect(args).toEqual([DEPLOYED_KIT_SLOT, zeroHash])
  })
})

describe('the recovery calldata', () => {
  const proofs = [
    {
      place: 0n,
      method: getAddress(METHOD),
      config: '0xaa' as Hex,
      salt: `0x${'01'.repeat(32)}` as Hex,
      proof: '0xbeef' as Hex
    },
    {
      place: 2n,
      method: getAddress(METHOD),
      config: '0xbb' as Hex,
      salt: `0x${'02'.repeat(32)}` as Hex,
      proof: '0xcafe' as Hex
    }
  ]
  const cancel: CancelRequest = {
    account: getAddress(ACCOUNT),
    action: getAddress(OTHER_ACTION),
    attemptId: 7n,
    setupNonce: 3n,
    setupBody: '0x1234',
    validUntil: 1_800_007_200,
    proofs
  }
  const attempt: AttemptRequest = {
    ...cancel,
    payload: '0xabcd',
    order: { token: getAddress(TOKEN), amount: 5n, payee: getAddress(PAYEE) }
  }
  const decoded = (data: Hex) => decodeFunctionData({ abi: RECOVERY_WRITES, data })

  it('starts an attempt with the whole request, its proofs in the order given', () => {
    expect(decoded(startAttemptData(attempt))).toEqual({
      functionName: 'startAttempt',
      args: [attempt]
    })
  })

  it('starts an attempt with the request members only', () => {
    const carried = { ...attempt, extra: 'not encoded' } as AttemptRequest
    expect(startAttemptData(carried)).toBe(startAttemptData(attempt))
  })

  it('cancels by proofs with the cancellation request, a payload and an order left out', () => {
    expect(decoded(cancelByProofsData(cancel))).toEqual({
      functionName: 'cancelByProofs',
      args: [cancel]
    })
    expect(cancelByProofsData(attempt)).toBe(cancelByProofsData(cancel))
  })

  it("cancels by the owner for the action, and by a veto for the account's attempt and method", () => {
    expect(decoded(cancelByOwnerData(OTHER_ACTION))).toEqual({
      functionName: 'cancelByOwner',
      args: [getAddress(OTHER_ACTION)]
    })
    expect(decoded(cancelByVetoData(ACCOUNT, OTHER_ACTION, 7n, METHOD))).toEqual({
      functionName: 'cancelByVeto',
      args: [getAddress(ACCOUNT), getAddress(OTHER_ACTION), 7n, getAddress(METHOD)]
    })
  })

  it('executes the handover for the account with the payload', () => {
    expect(decoded(executeHandoverData(ACCOUNT, '0xabcd'))).toEqual({
      functionName: 'executeHandover',
      args: [getAddress(ACCOUNT), '0xabcd']
    })
  })

  it("consumes the action's attempt under the payload's hash", () => {
    const payloadHash: Hex = `0x${'7c'.repeat(32)}`
    expect(decoded(consumeData(OTHER_ACTION, 7n, payloadHash))).toEqual({
      functionName: 'consume',
      args: [getAddress(OTHER_ACTION), 7n, payloadHash]
    })
  })

  it('writes a privilege value for a key on the account', () => {
    const value: Hex = `0x${'00'.repeat(31)}01`
    expect(
      decodeFunctionData({ abi: SET_ADDR_PRIVILEGE, data: privilegeData(KEY, value) })
    ).toEqual({ functionName: 'setAddrPrivilege', args: [getAddress(KEY), value] })
    expect(
      decodeFunctionData({ abi: SET_ADDR_PRIVILEGE, data: privilegeData(KEY, zeroHash) }).args
    ).toEqual([getAddress(KEY), zeroHash])
  })

  it('transfers the amount to the payee', () => {
    const data = transferData(PAYEE, 5n)
    expect(slice(data, 0, 4)).toBe('0xa9059cbb')
    expect(decoded(data)).toEqual({ functionName: 'transfer', args: [getAddress(PAYEE), 5n] })
  })
})
