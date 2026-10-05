/**
 * The calldata of a setup's writes and the kit's slot and binding. The slot
 * and the binding of the deployed recovery action are the values its own
 * `KIT_SLOT()` and `BINDING()` answer; the calldata is decoded here with a
 * one-function ABI written out by hand.
 */
import { decodeFunctionData, getAddress, parseAbi, slice, zeroHash } from 'viem'

import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import {
  armingData,
  commitSetupData,
  disarmingData,
  kitBindingOf,
  kitSlotOf
} from '@web/modules/social-recovery/shared/client/kit/formats'

const DEPLOYED_ACTION: Address = '0x1e612c81087aae64c31cb68953a480d06c5e4ac7'
const DEPLOYED_KIT_SLOT: Address = '0x744E5A757FF2B81e03a724Ec67d73E6f1C5834C8'
const DEPLOYED_BINDING: Hex = '0x345110f26cd4c68d2f4977283999ad1142fc3e35d8191dd48e9b93e89986c02f'

const OTHER_ACTION: Address = '0x6666666666666666666666666666666666666666'

const COMMIT_SETUP = parseAbi([
  'function commitSetup(address action, bytes32 setupCommitment, uint64 nonce, bytes publicMetadata, bytes privateMetadata)'
])
const SET_ADDR_PRIVILEGE = parseAbi(['function setAddrPrivilege(address addr, bytes32 priv)'])

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
