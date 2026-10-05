/**
 * The four ABIs carry the calls, the events and the errors a setup's save and
 * its reads need: each is encoded or decoded through the ABI and checked
 * against bytes built here by hand, and the interface ids the deployed
 * contracts report are the XOR of the selectors the ABIs hold.
 */
import {
  type Abi,
  concat,
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionData,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  encodeFunctionData,
  getAbiItem,
  type Hex,
  pad,
  parseAbiParameters,
  toFunctionSelector
} from 'viem'

import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import {
  ECDSA_METHOD_ABI,
  PASSKEY_METHOD_ABI,
  POLICY_MANAGER_ABI,
  RECOVERY_ACTION_ABI
} from '@web/modules/social-recovery/shared/client/kit/abi'

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const ACTION: Address = '0x6666666666666666666666666666666666666666'
const TOKEN: Address = '0x8888888888888888888888888888888888888888'
const METHOD: Address = '0x3333333333333333333333333333333333333333'
const COMMITMENT: Hex = `0x${'5a'.repeat(32)}`

const selectorIn = (abi: Abi, name: string): Hex => {
  const item = getAbiItem({ abi, name })
  if (!item || item.type !== 'function') {
    throw new Error(`no function ${name}`)
  }
  return toFunctionSelector(item)
}

const xorOf = (selectors: Hex[]): Hex =>
  `0x${selectors
    // eslint-disable-next-line no-bitwise
    .reduce((acc, selector) => (acc ^ parseInt(selector.slice(2), 16)) >>> 0, 0)
    .toString(16)
    .padStart(8, '0')}` as Hex

const functionSelectors = (abi: Abi): Hex[] =>
  abi.flatMap((item) => (item.type === 'function' ? [toFunctionSelector(item)] : []))

describe('the policy manager ABI', () => {
  const SIGNATURES = [
    'commitSetup(address,bytes32,uint64,bytes,bytes)',
    'clearSetup(address)',
    'stateOf(address,address)',
    'eip712Domain()',
    'supportsInterface(bytes4)',
    'name()',
    'version()'
  ]
  SIGNATURES.forEach((signature) =>
    it(`holds ${signature}`, () => {
      expect(selectorIn(POLICY_MANAGER_ABI, signature.split('(')[0])).toBe(
        toFunctionSelector(signature)
      )
    })
  )

  it('holds commitSetup under the five-argument selector', () => {
    const data = encodeFunctionData({
      abi: POLICY_MANAGER_ABI,
      functionName: 'commitSetup',
      args: [ACTION, COMMITMENT, 1n, '0x', '0xabcd']
    })
    expect(data).toBe(
      concat([
        '0x11d78064',
        encodeAbiParameters(parseAbiParameters('address, bytes32, uint64, bytes, bytes'), [
          ACTION,
          COMMITMENT,
          1n,
          '0x',
          '0xabcd'
        ])
      ])
    )
  })

  it('reads stateOf as the account and action state, its attempt and the attempt order', () => {
    const encoded = encodeAbiParameters(
      parseAbiParameters(
        '(bytes32, uint64, uint64, uint48, (uint64, uint64, uint48, uint8, bool, bytes32, (address, uint256, address), address[]))'
      ),
      [
        [
          COMMITMENT,
          3n,
          5n,
          11829364,
          [4n, 3n, 900, 1, true, `0x${'0e'.repeat(32)}`, [TOKEN, 7n, ACCOUNT], [METHOD]]
        ]
      ]
    )
    const state = decodeFunctionResult({
      abi: POLICY_MANAGER_ABI,
      functionName: 'stateOf',
      data: encoded
    })
    expect(state).toEqual({
      setupCommitment: COMMITMENT,
      setupNonce: 3n,
      nextAttemptId: 5n,
      setupCommittedAtBlock: 11829364,
      attempt: {
        attemptId: 4n,
        setupNonce: 3n,
        consumableAfter: 900,
        state: 1,
        ignoresPause: true,
        payloadHash: `0x${'0e'.repeat(32)}`,
        order: { token: TOKEN, amount: 7n, payee: ACCOUNT },
        usedMethods: [METHOD]
      }
    })
  })

  it('reads the EIP-712 domain the manager publishes', () => {
    const encoded = encodeAbiParameters(
      parseAbiParameters('bytes1, string, string, uint256, address, bytes32, uint256[]'),
      ['0x0f', 'PolicyManager', '1', 11155111n, ACTION, pad('0x0'), []]
    )
    expect(
      decodeFunctionResult({ abi: POLICY_MANAGER_ABI, functionName: 'eip712Domain', data: encoded })
    ).toEqual(['0x0f', 'PolicyManager', '1', 11155111n, ACTION, pad('0x0'), []])
  })

  it('holds SetupCommitted with the account and the action as topics and the rest as data', () => {
    const topics = encodeEventTopics({
      abi: POLICY_MANAGER_ABI,
      eventName: 'SetupCommitted',
      args: { _account: ACCOUNT, _action: ACTION }
    })
    expect(topics).toEqual([
      '0xaeb15cc9c82c4d7d6df3ced95db4e99bbacbed41b3ce443a54ce68b99ac114fe',
      pad(ACCOUNT),
      pad(ACTION)
    ])
    const data = encodeAbiParameters(parseAbiParameters('uint64, bytes32, bytes, bytes'), [
      2n,
      COMMITMENT,
      '0x01',
      '0x0203'
    ])
    const log = decodeEventLog({
      abi: POLICY_MANAGER_ABI,
      topics: topics as [Hex, ...Hex[]],
      data
    })
    expect(log.eventName).toBe('SetupCommitted')
    expect(log.args).toEqual({
      _account: ACCOUNT,
      _action: ACTION,
      _nonce: 2n,
      _setupCommitment: COMMITMENT,
      _publicMetadata: '0x01',
      _privateMetadata: '0x0203'
    })
  })

  it('holds SetupCleared with the account and the action as topics and the nonce as data', () => {
    const topics = encodeEventTopics({
      abi: POLICY_MANAGER_ABI,
      eventName: 'SetupCleared',
      args: { _account: ACCOUNT, _action: ACTION }
    })
    expect(topics[0]?.startsWith('0xb8d8dfdb')).toBe(true)
    expect(topics[0]?.endsWith('bea7')).toBe(true)
    const log = decodeEventLog({
      abi: POLICY_MANAGER_ABI,
      topics: topics as [Hex, ...Hex[]],
      data: encodeAbiParameters(parseAbiParameters('uint64'), [3n])
    })
    expect(log.eventName).toBe('SetupCleared')
    expect(log.args).toEqual({ _account: ACCOUNT, _action: ACTION, _nonce: 3n })
  })

  it('decodes the wrong-nonce refusal a save can meet', () => {
    const data = concat([
      toFunctionSelector('PolicyManager_WrongSetupNonce(uint64,uint64)'),
      encodeAbiParameters(parseAbiParameters('uint64, uint64'), [2n, 1n])
    ])
    expect(decodeErrorResult({ abi: POLICY_MANAGER_ABI, data })).toEqual(
      expect.objectContaining({ errorName: 'PolicyManager_WrongSetupNonce', args: [2n, 1n] })
    )
    expect(
      encodeErrorResult({
        abi: POLICY_MANAGER_ABI,
        errorName: 'PolicyManager_WrongSetupNonce',
        args: [2n, 1n]
      })
    ).toBe(data)
  })

  it('decodes the refused-commitment error a save can meet', () => {
    const data = concat([
      toFunctionSelector('PolicyManager_InvalidCommitment(bytes32)'),
      COMMITMENT
    ])
    expect(decodeErrorResult({ abi: POLICY_MANAGER_ABI, data })).toEqual(
      expect.objectContaining({ errorName: 'PolicyManager_InvalidCommitment', args: [COMMITMENT] })
    )
  })

  it('reports the manager interface id as the XOR of every function it holds', () => {
    expect(xorOf(functionSelectors(POLICY_MANAGER_ABI))).toBe('0x675e6a4a')
  })
})

describe('the two method ABIs', () => {
  const METHOD_ABIS = [
    ['guardian', ECDSA_METHOD_ABI],
    ['passkey', PASSKEY_METHOD_ABI]
  ] as const

  METHOD_ABIS.forEach(([label, abi]) => {
    describe(`the ${label} method`, () => {
      const SIGNATURES = [
        'verify(bytes,bytes32,bytes)',
        'trustedParties()',
        'supportsInterface(bytes4)',
        'name()',
        'version()'
      ]
      SIGNATURES.forEach((signature) =>
        it(`holds ${signature}`, () => {
          expect(selectorIn(abi, signature.split('(')[0])).toBe(toFunctionSelector(signature))
        })
      )

      it('reports the method interface id as the XOR of the functions it holds', () => {
        expect(xorOf(functionSelectors(abi))).toBe('0xf057a368')
      })

      it('answers verify with the magic value as four bytes', () => {
        const answer = decodeFunctionResult({
          abi,
          functionName: 'verify',
          data: pad('0x024ad318', { dir: 'right', size: 32 })
        })
        expect(answer).toBe('0x024ad318')
      })

      it('reads the trusted parties as the admins, the keys and the pause holders', () => {
        const data = encodeAbiParameters(
          parseAbiParameters('address, address, bytes32[], address, address'),
          [ACCOUNT, ACTION, [COMMITMENT], TOKEN, METHOD]
        )
        expect(decodeFunctionResult({ abi, functionName: 'trustedParties', data })).toEqual([
          ACCOUNT,
          ACTION,
          [COMMITMENT],
          TOKEN,
          METHOD
        ])
      })
    })
  })
})

describe('the recovery action ABI', () => {
  const SIGNATURES = [
    'supportsAccount(address)',
    'isAuthority(address,address)',
    'isAuthorized(address)',
    'holdsAnyPrivilege(address,address)',
    'MANAGER()',
    'AMBIRE_IMPLEMENTATION()',
    'KIT_SLOT()',
    'BINDING()',
    'supportsInterface(bytes4)',
    'name()',
    'version()'
  ]
  SIGNATURES.forEach((signature) =>
    it(`holds ${signature}`, () => {
      expect(selectorIn(RECOVERY_ACTION_ABI, signature.split('(')[0])).toBe(
        toFunctionSelector(signature)
      )
    })
  )

  it('reports the policy action interface id as the XOR of its six shared functions', () => {
    const shared = [
      'supportsAccount',
      'isAuthority',
      'isAuthorized',
      'supportsInterface',
      'name',
      'version'
    ].map((name) => selectorIn(RECOVERY_ACTION_ABI, name))
    expect(xorOf(shared)).toBe('0x59cd148e')
  })

  it('encodes isAuthority over the account and the key', () => {
    const data = encodeFunctionData({
      abi: RECOVERY_ACTION_ABI,
      functionName: 'isAuthority',
      args: [ACCOUNT, TOKEN]
    })
    expect(decodeFunctionData({ abi: RECOVERY_ACTION_ABI, data }).args).toEqual([ACCOUNT, TOKEN])
  })

  it('reads the kit slot as an address and the binding as a word', () => {
    expect(
      decodeFunctionResult({
        abi: RECOVERY_ACTION_ABI,
        functionName: 'KIT_SLOT',
        data: pad(ACCOUNT)
      })
    ).toBe(ACCOUNT)
    expect(
      decodeFunctionResult({
        abi: RECOVERY_ACTION_ABI,
        functionName: 'BINDING',
        data: COMMITMENT
      })
    ).toBe(COMMITMENT)
  })
})
