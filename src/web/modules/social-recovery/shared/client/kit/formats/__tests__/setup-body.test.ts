/**
 * The setup body and the setup commitment, checked against bytes built here
 * with viem's ABI encoder: the body is three top-level values, the wait as a
 * uint48, the pause choice and the clauses, each a uint8 threshold over its
 * credentials' commitments.
 */
import { encodeAbiParameters, keccak256 } from 'viem'

import type {
  Address,
  Configuration,
  Credential,
  Hex,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  deadCommitmentOf,
  setupBodyOf,
  setupCommitmentOf
} from '@web/modules/social-recovery/shared/client/kit/formats'

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const ACTION: Address = '0x6666666666666666666666666666666666666666'
const ECDSA: Address = '0x3333333333333333333333333333333333333333'
const PASSKEY: Address = '0x4444444444444444444444444444444444444444'
const GUARDIAN: Address = '0x5555555555555555555555555555555555555555'
const SECOND_GUARDIAN: Address = '0x7777777777777777777777777777777777777777'
const SUPPLIED_SALT: Hex = `0x${'cd'.repeat(32)}`
const PASSKEY_CONFIG: Hex = `0x${'01'.repeat(32)}${'02'.repeat(32)}${'03'.repeat(32)}`

const CLAUSE_COMPONENTS = [
  { name: 'threshold', type: 'uint8' },
  { name: 'credentials', type: 'bytes32[]' }
] as const

const THREE_VALUES = [
  { type: 'uint48' },
  { type: 'bool' },
  { type: 'tuple[]', components: CLAUSE_COMPONENTS }
] as const

const ONE_TUPLE = [
  {
    type: 'tuple',
    components: [
      { name: 'wait', type: 'uint48' },
      { name: 'ignoresPause', type: 'bool' },
      { name: 'clauses', type: 'tuple[]', components: CLAUSE_COMPONENTS }
    ]
  }
] as const

const saltAt = (place: number): Hex =>
  keccak256(
    encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [ACCOUNT, BigInt(place)])
  )

const commitmentOf = (method: Address, config: Hex, salt: Hex): Hex =>
  keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes' }, { type: 'bytes32' }],
      [method, config, salt]
    )
  )

const guardianConfig = (guardian: Address): Hex =>
  encodeAbiParameters([{ type: 'address' }], [guardian])

const guardian: Credential = { method: ECDSA, config: guardianConfig(GUARDIAN) }
const passkey: Credential = { method: PASSKEY, config: PASSKEY_CONFIG, salt: SUPPLIED_SALT }
const secondGuardian: Credential = { method: ECDSA, config: guardianConfig(SECOND_GUARDIAN) }

const CONFIGURATION: Configuration = {
  wait: 259200n,
  ignoresPause: true,
  clauses: [
    { threshold: 2, credentials: [guardian, passkey] },
    { threshold: 1, credentials: [secondGuardian] }
  ]
}

const EXPECTED_CLAUSES = [
  {
    threshold: 2,
    credentials: [
      commitmentOf(ECDSA, guardianConfig(GUARDIAN), saltAt(0)),
      commitmentOf(PASSKEY, PASSKEY_CONFIG, SUPPLIED_SALT)
    ]
  },
  {
    threshold: 1,
    credentials: [commitmentOf(ECDSA, guardianConfig(SECOND_GUARDIAN), saltAt(2))]
  }
]

const MAX_UINT48 = 2n ** 48n - 1n

describe('the setup body', () => {
  it('is the wait, the pause choice and the clauses as three top-level values', () => {
    const expected = encodeAbiParameters(THREE_VALUES, [259200, true, EXPECTED_CLAUSES])
    expect(setupBodyOf(ACCOUNT, CONFIGURATION)).toBe(expected)
  })

  it('is never the same values wrapped in one tuple', () => {
    const wrapped = encodeAbiParameters(ONE_TUPLE, [
      { wait: 259200, ignoresPause: true, clauses: EXPECTED_CLAUSES }
    ])
    expect(setupBodyOf(ACCOUNT, CONFIGURATION)).not.toBe(wrapped)
  })

  it('carries the pause choice', () => {
    const expected = encodeAbiParameters(THREE_VALUES, [259200, false, EXPECTED_CLAUSES])
    expect(setupBodyOf(ACCOUNT, { ...CONFIGURATION, ignoresPause: false })).toBe(expected)
  })

  it('encodes a rule with no clause as an empty list', () => {
    const expected = encodeAbiParameters(THREE_VALUES, [60, false, []])
    expect(setupBodyOf(ACCOUNT, { wait: 60n, ignoresPause: false, clauses: [] })).toBe(expected)
  })

  it('does not change with the labels of the credentials', () => {
    const labelled: Configuration = {
      ...CONFIGURATION,
      clauses: CONFIGURATION.clauses.map((clause, index) => ({
        ...clause,
        credentials: clause.credentials.map((c) => ({ ...c, label: `holder ${index}` }))
      }))
    }
    expect(setupBodyOf(ACCOUNT, labelled)).toBe(setupBodyOf(ACCOUNT, CONFIGURATION))
  })

  it('does not change with the members of a draft a configuration does not hold', () => {
    const shown: SetupDraft = {
      ...CONFIGURATION,
      privacy: { publicMetadata: '0x1234', backup: 'clear' }
    }
    const hidden: SetupDraft = {
      ...CONFIGURATION,
      privacy: { publicMetadata: '0x', backup: 'encrypted' }
    }
    expect(setupBodyOf(ACCOUNT, shown)).toBe(setupBodyOf(ACCOUNT, CONFIGURATION))
    expect(setupBodyOf(ACCOUNT, hidden)).toBe(setupBodyOf(ACCOUNT, CONFIGURATION))
  })

  it('takes the widest wait a uint48 holds', () => {
    const expected = encodeAbiParameters(THREE_VALUES, [Number(MAX_UINT48), true, EXPECTED_CLAUSES])
    expect(setupBodyOf(ACCOUNT, { ...CONFIGURATION, wait: MAX_UINT48 })).toBe(expected)
  })

  it('throws for a wait above a uint48', () => {
    expect(() => setupBodyOf(ACCOUNT, { ...CONFIGURATION, wait: MAX_UINT48 + 1n })).toThrow()
  })

  it('takes the highest threshold a uint8 holds and throws above it', () => {
    const at = (threshold: number): Configuration => ({
      ...CONFIGURATION,
      clauses: [{ threshold, credentials: [guardian] }]
    })
    const expected = encodeAbiParameters(THREE_VALUES, [
      259200,
      true,
      [{ threshold: 255, credentials: [EXPECTED_CLAUSES[0].credentials[0]] }]
    ])
    expect(setupBodyOf(ACCOUNT, at(255))).toBe(expected)
    expect(() => setupBodyOf(ACCOUNT, at(256))).toThrow()
  })
})

describe('the setup commitment', () => {
  const body = setupBodyOf(ACCOUNT, CONFIGURATION)

  it('is the hash of the account, the action, the nonce as a uint64 and the body', () => {
    const expected = keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }, { type: 'uint64' }, { type: 'bytes' }],
        [ACCOUNT, ACTION, 3n, body]
      )
    )
    expect(setupCommitmentOf(ACCOUNT, ACTION, 3n, body)).toBe(expected)
  })

  it('is the same with the nonce encoded as a uint256', () => {
    const wide = keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'bytes' }],
        [ACCOUNT, ACTION, 3n, body]
      )
    )
    expect(setupCommitmentOf(ACCOUNT, ACTION, 3n, body)).toBe(wide)
  })

  it('changes with the nonce, the action and the body', () => {
    const base = setupCommitmentOf(ACCOUNT, ACTION, 1n, body)
    expect(setupCommitmentOf(ACCOUNT, ACTION, 2n, body)).not.toBe(base)
    expect(setupCommitmentOf(ACCOUNT, ECDSA, 1n, body)).not.toBe(base)
    expect(
      setupCommitmentOf(ACCOUNT, ACTION, 1n, setupBodyOf(ACCOUNT, { ...CONFIGURATION, wait: 1n }))
    ).not.toBe(base)
  })
})

describe('the dead commitment', () => {
  it('is the commitment over an empty body', () => {
    const expected = keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }, { type: 'uint64' }, { type: 'bytes' }],
        [ACCOUNT, ACTION, 1n, '0x']
      )
    )
    expect(deadCommitmentOf(ACCOUNT, ACTION, 1n)).toBe(expected)
  })

  it('differs from the commitment of a rule with no clause', () => {
    const emptyRule = setupBodyOf(ACCOUNT, { wait: 0n, ignoresPause: false, clauses: [] })
    expect(deadCommitmentOf(ACCOUNT, ACTION, 1n)).not.toBe(
      setupCommitmentOf(ACCOUNT, ACTION, 1n, emptyRule)
    )
  })
})
