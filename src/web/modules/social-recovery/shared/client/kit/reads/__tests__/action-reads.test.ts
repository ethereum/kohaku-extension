/**
 * The action's views decode the action's ABI-encoded answers. The three
 * reads the action refuses for an address with no code read the code first,
 * at the same block, and answer false with no call; `supportsAccount` calls
 * for any address.
 */
import {
  encodeErrorResult,
  encodeFunctionData,
  encodeFunctionResult,
  type Hex,
  parseAbi
} from 'viem'

import type { Address, BlockTag, IProvider } from '@web/modules/social-recovery/sdk-interfaces'
import {
  isProviderReadFailure,
  isRevertedCall,
  providerReadFailure,
  revertedCall
} from '@web/modules/social-recovery/shared/client/provider-adapter'
import { createActionReads } from '@web/modules/social-recovery/shared/client/kit/reads'

const ACTION: Address = '0x6666666666666666666666666666666666666666'
const MANAGER: Address = '0x734B9Aa580d4A184Ea129E791C4C9Fb8734B3aC6'
const IMPLEMENTATION: Address = '0x0F2AA7bcda3d9D210dF69a394b6965CB2566c828'
const KIT_SLOT: Address = '0x7777777777777777777777777777777777777777'
const DEPLOYED: Address = '0x1111111111111111111111111111111111111111'
const FRESH: Address = '0x2222222222222222222222222222222222222222'
const KEY: Address = '0x3333333333333333333333333333333333333333'
const BINDING: Hex = `0x${'34'.repeat(32)}`
const KEY_VALUE: Hex = `0x${'00'.repeat(31)}01`
const ACCOUNT_CODE: Hex = '0x6080604052'

const ACTION_VIEWS = parseAbi([
  'function MANAGER() view returns (address)',
  'function AMBIRE_IMPLEMENTATION() view returns (address)',
  'function KIT_SLOT() view returns (address)',
  'function BINDING() view returns (bytes32)',
  'function KEY_VALUE() view returns (bytes32)',
  'function isAuthorized(address account) view returns (bool)',
  'function isAuthority(address account, address key) view returns (bool)',
  'function holdsAnyPrivilege(address account, address candidate) view returns (bool)',
  'function supportsAccount(address account) view returns (bool)',
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function supportsInterface(bytes4 id) view returns (bool)',
  'error RecoveryAction_NotAKey(address authority)'
])

const answerOf = (data: Hex, answer: Hex | Error): [Hex, Hex | Error] => [data, answer]

const chainAnswering = (answers: [Hex, Hex | Error][], codes: [Address, Hex][] = []) => {
  const routes = new Map(answers)
  const codeOf = new Map(codes.map(([address, code]) => [address.toLowerCase(), code]))
  const call = jest.fn(
    async (to: Address, data: Hex, from: Address | undefined, block: BlockTag): Promise<Hex> => {
      const answer = routes.get(data)
      if (answer === undefined) {
        throw new Error(`no answer scripted for ${data} to ${to} from ${from} at ${block}`)
      }
      if (answer instanceof Error) {
        throw answer
      }
      return answer
    }
  )
  // The same code at every block; the tests check the block each read asks for.
  const code = jest.fn<Promise<Hex>, [Address, BlockTag?]>(
    async (address) => codeOf.get(address.toLowerCase()) ?? '0x'
  )
  const provider: IProvider = { chainId: jest.fn(), call, logs: jest.fn(), block: jest.fn() }
  return { reads: createActionReads({ provider, codeRead: { code } }, ACTION), call, code }
}

const boolAnswer = (
  functionName:
    | 'isAuthorized'
    | 'isAuthority'
    | 'holdsAnyPrivilege'
    | 'supportsAccount'
    | 'supportsInterface',
  result: boolean
): Hex => encodeFunctionResult({ abi: ACTION_VIEWS, functionName, result })

describe('the action reads its constants', () => {
  const managerCall = encodeFunctionData({ abi: ACTION_VIEWS, functionName: 'MANAGER' })
  const implementationCall = encodeFunctionData({
    abi: ACTION_VIEWS,
    functionName: 'AMBIRE_IMPLEMENTATION'
  })
  const slotCall = encodeFunctionData({ abi: ACTION_VIEWS, functionName: 'KIT_SLOT' })
  const bindingCall = encodeFunctionData({ abi: ACTION_VIEWS, functionName: 'BINDING' })
  const keyValueCall = encodeFunctionData({ abi: ACTION_VIEWS, functionName: 'KEY_VALUE' })

  it('decodes the manager, the implementation, the kit slot, the binding and the key value', async () => {
    const { reads, call } = chainAnswering([
      answerOf(
        managerCall,
        encodeFunctionResult({ abi: ACTION_VIEWS, functionName: 'MANAGER', result: MANAGER })
      ),
      answerOf(
        implementationCall,
        encodeFunctionResult({
          abi: ACTION_VIEWS,
          functionName: 'AMBIRE_IMPLEMENTATION',
          result: IMPLEMENTATION
        })
      ),
      answerOf(
        slotCall,
        encodeFunctionResult({ abi: ACTION_VIEWS, functionName: 'KIT_SLOT', result: KIT_SLOT })
      ),
      answerOf(
        bindingCall,
        encodeFunctionResult({ abi: ACTION_VIEWS, functionName: 'BINDING', result: BINDING })
      ),
      answerOf(
        keyValueCall,
        encodeFunctionResult({ abi: ACTION_VIEWS, functionName: 'KEY_VALUE', result: KEY_VALUE })
      )
    ])
    await expect(reads.manager()).resolves.toBe(MANAGER)
    await expect(reads.ambireImplementation()).resolves.toBe(IMPLEMENTATION)
    await expect(reads.kitSlot()).resolves.toBe(KIT_SLOT)
    await expect(reads.binding()).resolves.toBe(BINDING)
    await expect(reads.keyValue()).resolves.toBe(KEY_VALUE)
    expect(call.mock.calls.every(([to]) => to === ACTION)).toBe(true)
  })

  it('refuses an empty answer as a failed call read', async () => {
    const { reads } = chainAnswering([answerOf(managerCall, '0x')])
    const thrown = await reads.manager().catch((error: unknown) => error)
    expect(isProviderReadFailure(thrown)).toBe(true)
    expect(thrown).toMatchObject({ read: 'call' })
  })

  it('passes a failed read through as it is', async () => {
    const failure = providerReadFailure('call', new Error('timeout'))
    const { reads } = chainAnswering([answerOf(bindingCall, failure)])
    await expect(reads.binding()).rejects.toBe(failure)
  })
})

describe('the action reads an account with code', () => {
  const authorizedCall = encodeFunctionData({
    abi: ACTION_VIEWS,
    functionName: 'isAuthorized',
    args: [DEPLOYED]
  })
  const authorityCall = encodeFunctionData({
    abi: ACTION_VIEWS,
    functionName: 'isAuthority',
    args: [DEPLOYED, KEY]
  })
  const privilegeCall = encodeFunctionData({
    abi: ACTION_VIEWS,
    functionName: 'holdsAnyPrivilege',
    args: [DEPLOYED, KEY]
  })

  it('decodes isAuthorized, isAuthority and holdsAnyPrivilege', async () => {
    const { reads } = chainAnswering(
      [
        answerOf(authorizedCall, boolAnswer('isAuthorized', true)),
        answerOf(authorityCall, boolAnswer('isAuthority', true)),
        answerOf(privilegeCall, boolAnswer('holdsAnyPrivilege', true))
      ],
      [[DEPLOYED, ACCOUNT_CODE]]
    )
    await expect(reads.isAuthorized(DEPLOYED)).resolves.toBe(true)
    await expect(reads.isAuthority(DEPLOYED, KEY)).resolves.toBe(true)
    await expect(reads.holdsAnyPrivilege(DEPLOYED, KEY)).resolves.toBe(true)
  })

  it('decodes a false answer as false', async () => {
    const { reads } = chainAnswering(
      [answerOf(authorityCall, boolAnswer('isAuthority', false))],
      [[DEPLOYED, ACCOUNT_CODE]]
    )
    await expect(reads.isAuthority(DEPLOYED, KEY)).resolves.toBe(false)
  })
  ;(
    [
      ['isAuthorized', authorizedCall],
      ['isAuthority', authorityCall],
      ['holdsAnyPrivilege', privilegeCall]
    ] as const
  ).forEach(([functionName, data]) =>
    it(`${functionName} reads the code and calls at the block it is given`, async () => {
      const { reads, call, code } = chainAnswering(
        [answerOf(data, boolAnswer(functionName, true))],
        [[DEPLOYED, ACCOUNT_CODE]]
      )
      const read = {
        isAuthorized: () => reads.isAuthorized(DEPLOYED, 11829500),
        isAuthority: () => reads.isAuthority(DEPLOYED, KEY, 11829500),
        holdsAnyPrivilege: () => reads.holdsAnyPrivilege(DEPLOYED, KEY, 11829500)
      }[functionName]
      await expect(read()).resolves.toBe(true)
      expect(code).toHaveBeenCalledWith(DEPLOYED, 11829500)
      expect(call).toHaveBeenCalledWith(ACTION, data, undefined, 11829500)
    })
  )

  it('reads the latest block where none is given', async () => {
    const { reads, call, code } = chainAnswering(
      [answerOf(authorizedCall, boolAnswer('isAuthorized', false))],
      [[DEPLOYED, ACCOUNT_CODE]]
    )
    await reads.isAuthorized(DEPLOYED)
    expect(code).toHaveBeenCalledWith(DEPLOYED, 'latest')
    expect(call).toHaveBeenCalledWith(ACTION, authorizedCall, undefined, 'latest')
  })

  it('keeps the data of a revert', async () => {
    const data = encodeErrorResult({
      abi: ACTION_VIEWS,
      errorName: 'RecoveryAction_NotAKey',
      args: [KEY]
    })
    const { reads } = chainAnswering(
      [answerOf(authorityCall, revertedCall('call', data))],
      [[DEPLOYED, ACCOUNT_CODE]]
    )
    const thrown = await reads.isAuthority(DEPLOYED, KEY).catch((error: unknown) => error)
    expect(isRevertedCall(thrown)).toBe(true)
    expect(thrown).toMatchObject({ data })
  })
})

describe('the action reads an account with no code', () => {
  it('answers isAuthorized, isAuthority and holdsAnyPrivilege false with no call', async () => {
    const { reads, call, code } = chainAnswering([])
    await expect(reads.isAuthorized(FRESH, 11829500)).resolves.toBe(false)
    await expect(reads.isAuthority(FRESH, KEY, 11829500)).resolves.toBe(false)
    await expect(reads.holdsAnyPrivilege(FRESH, KEY, 11829500)).resolves.toBe(false)
    expect(call).not.toHaveBeenCalled()
    expect(code.mock.calls).toEqual([
      [FRESH, 11829500],
      [FRESH, 11829500],
      [FRESH, 11829500]
    ])
  })

  it('still calls supportsAccount, at the block it is given', async () => {
    const data = encodeFunctionData({
      abi: ACTION_VIEWS,
      functionName: 'supportsAccount',
      args: [FRESH]
    })
    const { reads, call } = chainAnswering([answerOf(data, boolAnswer('supportsAccount', false))])
    await expect(reads.supportsAccount(FRESH, 11829500)).resolves.toBe(false)
    expect(call).toHaveBeenCalledWith(ACTION, data, undefined, 11829500)
  })

  it('rejects where the code read fails, with no call', async () => {
    const failure = providerReadFailure('code', new Error('timeout'))
    const { reads, call, code } = chainAnswering([])
    code.mockRejectedValueOnce(failure)
    await expect(reads.isAuthorized(FRESH)).rejects.toBe(failure)
    expect(call).not.toHaveBeenCalled()
  })
})

describe('the action reads its identity', () => {
  it('reads the name, the version and the policy-action probe', async () => {
    const probe = encodeFunctionData({
      abi: ACTION_VIEWS,
      functionName: 'supportsInterface',
      args: ['0x59cd148e']
    })
    const { reads } = chainAnswering([
      answerOf(
        encodeFunctionData({ abi: ACTION_VIEWS, functionName: 'name' }),
        encodeFunctionResult({
          abi: ACTION_VIEWS,
          functionName: 'name',
          result: 'AmbireRecoveryAction'
        })
      ),
      answerOf(
        encodeFunctionData({ abi: ACTION_VIEWS, functionName: 'version' }),
        encodeFunctionResult({ abi: ACTION_VIEWS, functionName: 'version', result: '1.0.0' })
      ),
      answerOf(probe, boolAnswer('supportsInterface', true))
    ])
    await expect(reads.actionInfo()).resolves.toEqual({
      name: 'AmbireRecoveryAction',
      version: '1.0.0',
      supportsInterface: true
    })
  })
})
