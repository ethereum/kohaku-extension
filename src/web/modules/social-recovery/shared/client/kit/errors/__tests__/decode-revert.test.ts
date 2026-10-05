/**
 * The revert data of the manager and the action read as the kit's named
 * errors: every prefixed error of the two contracts, encoded here with its
 * arguments, decodes to its source, its kit name, its selector and its
 * arguments by name; anything else is no kit error and never throws.
 */
import {
  type Abi,
  type AbiParameter,
  encodeAbiParameters,
  encodeErrorResult,
  type Hex,
  pad,
  parseAbi,
  toFunctionSelector
} from 'viem'

import { KIT_ERROR_NAMES } from '@web/modules/social-recovery/sdk-interfaces'
import {
  POLICY_MANAGER_ABI,
  RECOVERY_ACTION_ABI
} from '@web/modules/social-recovery/shared/client/kit/abi'
import { decodeRevert } from '@web/modules/social-recovery/shared/client/kit/errors'

const errorsOf = (abi: Abi, prefix: string): Extract<Abi[number], { type: 'error' }>[] =>
  abi.flatMap((item) => (item.type === 'error' && item.name.startsWith(prefix) ? [item] : []))

const MANAGER_ERRORS = errorsOf(POLICY_MANAGER_ABI, 'PolicyManager_')
const ACTION_ERRORS = errorsOf(RECOVERY_ACTION_ABI, 'RecoveryAction_')

// A distinct made-up value per argument, of the argument's type, as viem decodes it back.
const valueOf = (input: AbiParameter, index: number): unknown => {
  const seed = index + 1
  if (input.type === 'address') {
    return `0x${`${seed}`.repeat(40)}`
  }
  if (input.type === 'bytes32') {
    return pad(`0x${`${seed}`.repeat(2)}`, { dir: 'right' })
  }
  if (input.type === 'bytes') {
    return `0xabcd${`${seed}`.repeat(2)}`
  }
  const bits = /^uint(\d+)$/.exec(input.type)
  if (bits) {
    if (Number(bits[1]) <= 48) {
      return 40 + seed
    }
    return Number(bits[1]) <= 64 ? 2n ** 60n + BigInt(seed) : 10n ** 30n + BigInt(seed)
  }
  throw new Error(`no made-up value for ${input.type}`)
}

const selectorOf = (item: Extract<Abi[number], { type: 'error' }>): Hex =>
  toFunctionSelector(`${item.name}(${item.inputs.map((input) => input.type).join(',')})`)

const kitNameOf = (errorName: string): string => {
  const stripped = errorName.replace(/^(PolicyManager|RecoveryAction)_/, '')
  return stripped === 'AlreadyPrivileged' || stripped === 'NotAKey' ? 'ReservedAuthority' : stripped
}

const CASES = [
  ...MANAGER_ERRORS.map((item) => ['manager', item] as const),
  ...ACTION_ERRORS.map((item) => ['action', item] as const)
]

describe('the revert names', () => {
  it('cover the manager’s 21 errors and the action’s 5', () => {
    expect(MANAGER_ERRORS).toHaveLength(21)
    expect(ACTION_ERRORS).toHaveLength(5)
  })

  CASES.forEach(([source, item]) =>
    it(`decodes ${item.name} from the ${source} with its arguments`, () => {
      const values = item.inputs.map(valueOf)
      const data = encodeErrorResult({ abi: [item], errorName: item.name, args: values })
      expect(decodeRevert(data)).toEqual({
        kind: 'known',
        source,
        name: kitNameOf(item.name),
        selector: selectorOf(item),
        args: Object.fromEntries(
          item.inputs.map((input, index) => [input.name?.replace(/^_/, ''), values[index]])
        )
      })
    })
  )

  it('names every kit error of the interfaces from some revert', () => {
    const named = new Set(
      CASES.map(([, item]) => {
        const data = encodeErrorResult({
          abi: [item],
          errorName: item.name,
          args: item.inputs.map(valueOf)
        })
        return decodeRevert(data)
      }).map((error) => (error?.kind === 'known' ? error.name : undefined))
    )
    expect([...named].sort()).toEqual([...KIT_ERROR_NAMES].sort())
  })

  it('names both refusals of a reserved authority ReservedAuthority, with their own selectors', () => {
    const REFUSALS = parseAbi([
      'error RecoveryAction_AlreadyPrivileged(address _authority)',
      'error RecoveryAction_NotAKey(address _authority)'
    ])
    const authority = '0x1111111111111111111111111111111111111111'
    const privileged = decodeRevert(
      encodeErrorResult({
        abi: REFUSALS,
        errorName: 'RecoveryAction_AlreadyPrivileged',
        args: [authority]
      })
    )
    const notAKey = decodeRevert(
      encodeErrorResult({ abi: REFUSALS, errorName: 'RecoveryAction_NotAKey', args: [authority] })
    )
    expect(privileged).toMatchObject({
      source: 'action',
      name: 'ReservedAuthority',
      selector: toFunctionSelector('RecoveryAction_AlreadyPrivileged(address)'),
      args: { authority }
    })
    expect(notAKey).toMatchObject({
      source: 'action',
      name: 'ReservedAuthority',
      selector: toFunctionSelector('RecoveryAction_NotAKey(address)'),
      args: { authority }
    })
  })

  it('decodes a manager refusal written by hand', () => {
    const data = `${toFunctionSelector(
      'PolicyManager_WrongSetupNonce(uint64,uint64)'
    )}${encodeAbiParameters([{ type: 'uint64' }, { type: 'uint64' }], [2n, 1n]).slice(2)}` as Hex
    expect(decodeRevert(data)).toMatchObject({
      kind: 'known',
      source: 'manager',
      name: 'WrongSetupNonce'
    })
  })
})

describe('data that is no kit error', () => {
  const OTHER = parseAbi([
    'error SafeCastOverflowedUintDowncast(uint8 bits, uint256 value)',
    'error SomeoneElses(uint256 value)'
  ])

  const notKitErrors: [string, Hex][] = [
    ['empty data', '0x'],
    ['a selector alone of no known error', '0xdeadbeef'],
    [
      'an unknown selector with arguments',
      encodeErrorResult({ abi: OTHER, errorName: 'SomeoneElses', args: [1n] })
    ],
    [
      'Error(string)',
      encodeErrorResult({
        abi: parseAbi(['error Error(string message)']),
        errorName: 'Error',
        args: ['no']
      })
    ],
    [
      'Panic(uint256)',
      encodeErrorResult({
        abi: parseAbi(['error Panic(uint256 code)']),
        errorName: 'Panic',
        args: [0x41n]
      })
    ],
    [
      'SafeCastOverflowedUintDowncast',
      encodeErrorResult({
        abi: OTHER,
        errorName: 'SafeCastOverflowedUintDowncast',
        args: [48, 2n ** 60n]
      })
    ],
    [
      'a known selector whose arguments do not decode',
      toFunctionSelector('PolicyManager_WrongSetupNonce(uint64,uint64)')
    ],
    ['fewer than four bytes', '0x0102']
  ]
  notKitErrors.forEach(([label, data]) =>
    it(`answers undefined for ${label}, never throwing`, () => {
      expect(() => decodeRevert(data)).not.toThrow()
      expect(decodeRevert(data)).toBeUndefined()
    })
  )
})
