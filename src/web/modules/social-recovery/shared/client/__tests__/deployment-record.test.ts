/**
 * What each recovery chain runs. With no deployment variable, Sepolia runs
 * the committed deployment and mainnet the stand-in, whose every address,
 * fact and audited row is the committed placeholder. With a Sepolia variable, Sepolia's address book, descriptor
 * and audited set come from it and mainnet stays as it was. A malformed
 * variable throws, naming the field. The variable is read through its one
 * module, mocked here; every address in it is made up.
 */
import { getAddress, zeroAddress } from 'viem'

import { PROXY_AMBIRE_ACCOUNT } from '@ambire-common/consts/deploy'
import type { Address } from '@kohaku-eth/social-recovery'
import {
  addressBookOf,
  AUDITED_ACTIONS,
  auditedActionOf,
  auditedActionsOn,
  DEPLOYMENTS,
  deploymentAddressesOf,
  deploymentDescriptor,
  deploymentFactsFrom,
  deploymentOf,
  isAuditedAction,
  UNKNOWN_ACTION
} from '@web/modules/social-recovery/shared/client'
import { sepoliaDeploymentVariable } from '@web/modules/social-recovery/shared/client/deployment-env'
import { SEPOLIA_DEPLOYMENT } from '@web/modules/social-recovery/shared/client/deployments-sepolia'
import type { MalformedCase } from '@web/modules/social-recovery/shared/client/__fixtures__/types'

jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client/deployment-env'),
  sepoliaDeploymentVariable: jest.fn()
}))

const variable = sepoliaDeploymentVariable as jest.MockedFunction<typeof sepoliaDeploymentVariable>

const SEPOLIA_PLACEHOLDERS = {
  manager: '0x0000000000000000000000000000000000c70101',
  methodEcdsa: '0x0000000000000000000000000000000000c70102',
  methodPasskey: '0x0000000000000000000000000000000000c70103',
  methodAadhaar: '0x0000000000000000000000000000000000c70104',
  methodZkpassport: '0x0000000000000000000000000000000000c70105',
  action: '0x0000000000000000000000000000000000c70106'
} as const

const MAINNET_PLACEHOLDERS = {
  manager: '0x0000000000000000000000000000000000c70201',
  methodEcdsa: '0x0000000000000000000000000000000000c70202',
  methodPasskey: '0x0000000000000000000000000000000000c70203',
  methodAadhaar: '0x0000000000000000000000000000000000c70204',
  methodZkpassport: '0x0000000000000000000000000000000000c70205',
  action: '0x0000000000000000000000000000000000c70206'
} as const

const MANAGER: Address = '0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1'
const METHOD_ECDSA: Address = '0xa2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2'
const METHOD_PASSKEY: Address = '0xa3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3'
const METHOD_AADHAAR: Address = '0xa4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4'
const ACTION: Address = '0xa5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5'
const SECOND_ACTION: Address = '0xa6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6'

const FACTS = {
  manager: MANAGER,
  methodEcdsa: METHOD_ECDSA,
  methodPasskey: METHOD_PASSKEY,
  action: ACTION,
  deployedAt: 4242,
  digestVersion: '2',
  managerVersion: '1.4.0',
  auditedActions: [
    { action: ACTION, publisher: 'ethereumFoundation' },
    { action: SECOND_ACTION, publisher: 'ethereumFoundation' }
  ]
}

/** A throwaway self-signed certificate made for this test; it holds no secret. */
const CERTIFICATE = [
  '-----BEGIN CERTIFICATE-----',
  'MIIBnTCCAQYCCQDiAomKfafhkDANBgkqhkiG9w0BAQsFADATMREwDwYDVQQDDAhz',
  'dGFuZC1pbjAeFw0yNjEwMjEyMTI5MDVaFw0yNjEwMjIyMTI5MDVaMBMxETAPBgNV',
  'BAMMCHN0YW5kLWluMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDf1ajsyhTb',
  'wDBA+BeWq15hB9CQin6fR5NADbiwA4h5aiUpbHTTh2Swx6fiu3bVjmtLkTGZvMLB',
  'Hw0JeWry2BNYH1WLKGI5OZXB/rBzXBmcPfZ41C4UrC8qZ0CrgI/w58hZXl+g3um6',
  'Hd5Rljdkr07Jz9KOh0xpzQ2Y5b8sfDT4HwIDAQABMA0GCSqGSIb3DQEBCwUAA4GB',
  'AKW5PABs4ZLTCXK6LfCYsbVnCMbIbUbRJk25v5/APqcMZsuHM3Q9POGC+nH07VTn',
  '4s3HHqJEL8/1gfeF3DDV3lm4e3ybTKL2IXyT1ILhYa/rNE8NBMn6fwfgoj8hg8os',
  'SSa1V1qyaYYIhxPdgPdWIfwhclYaX/kAyi/1Cl2va0kP',
  '-----END CERTIFICATE-----',
  ''
].join('\n')

const FIELD_MODULUS =
  '21888242871839275222246405745257275088548364400416034343698204186575808495617'
const FIELD_MAXIMUM =
  '21888242871839275222246405745257275088548364400416034343698204186575808495616'

const IDENTITY_FIELDS = {
  zkPassportDomain: 'wallet.example',
  zkPassportScope: 'social-recovery',
  zkPassportTestnetTree: true,
  aadhaarNullifierSeed: '1234567890',
  aadhaarCertificate: CERTIFICATE,
  aadhaarTestMode: true
}

const json = (value: unknown): string => JSON.stringify(value)

/** A checksummed address with the case of its first letter flipped, so its checksum is wrong. */
const badChecksum = (address: Address): string => {
  const checksummed = getAddress(address)
  const at = checksummed.slice(2).search(/[a-fA-F]/) + 2
  const letter = checksummed[at]
  const flipped = letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase()
  return `${checksummed.slice(0, at)}${flipped}${checksummed.slice(at + 1)}`
}

const SEPOLIA_ADDRESSES = {
  manager: '0xF7Fd795C47025abda8dC4264Bf4Cdec22aC56A62',
  methodEcdsa: '0x87AcC5584c2aAd5Ede60c2a4730765C0d015b907',
  methodPasskey: '0x342B1e6CeB3f6ADD8122862FA3095D127DDecAc9',
  methodAadhaar: '0x12982d4764ecc891c846088Dc6e9ce5fDb81e7b3',
  methodZkpassport: '0x7eFbe568CAc60CDa42E3e2B978e13aeA66cEca1D',
  action: '0x445C094570362885dE43aD8FeDE2bA25C04B8A7a'
} as const

const SEPOLIA_COMMITTED_DESCRIPTOR = {
  chainId: 11155111,
  ...SEPOLIA_ADDRESSES,
  servedImplementation: PROXY_AMBIRE_ACCOUNT,
  deployedAt: 12019037,
  digestVersion: '1',
  managerVersion: '1.0.0',
  shippedMethods: [
    SEPOLIA_ADDRESSES.methodEcdsa,
    SEPOLIA_ADDRESSES.methodPasskey,
    SEPOLIA_ADDRESSES.methodAadhaar,
    SEPOLIA_ADDRESSES.methodZkpassport
  ],
  auditedActions: [SEPOLIA_ADDRESSES.action]
}

const MAINNET_STAND_IN_DESCRIPTOR = {
  chainId: 1,
  ...MAINNET_PLACEHOLDERS,
  servedImplementation: PROXY_AMBIRE_ACCOUNT,
  deployedAt: 0,
  digestVersion: '1',
  managerVersion: '1.0.0',
  shippedMethods: [
    MAINNET_PLACEHOLDERS.methodEcdsa,
    MAINNET_PLACEHOLDERS.methodPasskey,
    MAINNET_PLACEHOLDERS.methodAadhaar,
    MAINNET_PLACEHOLDERS.methodZkpassport
  ],
  auditedActions: [MAINNET_PLACEHOLDERS.action]
}

const bookOf = (a: Record<string, string>) => ({
  manager: a.manager,
  methods: {
    ecdsa: a.methodEcdsa,
    passkey: a.methodPasskey,
    aadhaar: a.methodAadhaar,
    zkpassport: a.methodZkpassport
  },
  action: a.action
})

beforeEach(() => {
  variable.mockReset()
  variable.mockReturnValue(undefined)
})

describe('a build with no deployment variable', () => {
  it('runs the committed deployment on Sepolia and the stand-in on mainnet', () => {
    expect(DEPLOYMENTS).toEqual({
      sepolia: { kind: 'deployed', facts: SEPOLIA_DEPLOYMENT },
      mainnet: { kind: 'stand-in' }
    })
    expect(deploymentOf('sepolia')).toEqual({ kind: 'deployed', facts: SEPOLIA_DEPLOYMENT })
    expect(deploymentOf('mainnet')).toEqual({ kind: 'stand-in' })
  })

  it('names the committed addresses on Sepolia and the placeholders on mainnet', () => {
    expect(deploymentAddressesOf('sepolia')).toEqual({
      ...SEPOLIA_ADDRESSES,
      servedImplementation: PROXY_AMBIRE_ACCOUNT
    })
    expect(deploymentAddressesOf('mainnet')).toEqual({
      ...MAINNET_PLACEHOLDERS,
      servedImplementation: PROXY_AMBIRE_ACCOUNT
    })
    expect(addressBookOf('sepolia')).toEqual(bookOf(SEPOLIA_ADDRESSES))
    expect(addressBookOf('mainnet')).toEqual(bookOf(MAINNET_PLACEHOLDERS))
  })

  it('describes Sepolia with the committed facts and mainnet with the placeholder facts', () => {
    expect(deploymentDescriptor('sepolia')).toEqual(SEPOLIA_COMMITTED_DESCRIPTOR)
    expect(deploymentDescriptor('mainnet')).toEqual(MAINNET_STAND_IN_DESCRIPTOR)
  })

  it('lists the committed audited action of each chain', () => {
    expect(auditedActionsOn('sepolia')).toEqual([
      {
        kind: 'audited',
        chain: 'sepolia',
        action: SEPOLIA_ADDRESSES.action,
        publisher: 'ethereumFoundation'
      }
    ])
    expect(auditedActionsOn('mainnet')).toEqual([
      {
        kind: 'audited',
        chain: 'mainnet',
        action: MAINNET_PLACEHOLDERS.action,
        publisher: 'ethereumFoundation'
      }
    ])
    expect(auditedActionsOn('mainnet')).toEqual(
      AUDITED_ACTIONS.filter((row) => row.chain === 'mainnet')
    )
  })

  it('looks the committed rows up by address and chain', () => {
    expect(auditedActionOf(SEPOLIA_ADDRESSES.action)).toEqual(auditedActionsOn('sepolia')[0])
    expect(auditedActionOf(MAINNET_PLACEHOLDERS.action, 'mainnet')).toEqual(
      auditedActionsOn('mainnet')[0]
    )
    expect(auditedActionOf(SEPOLIA_ADDRESSES.action, 'mainnet')).toBe(UNKNOWN_ACTION)
    expect(auditedActionOf(SEPOLIA_PLACEHOLDERS.action, 'sepolia')).toBe(UNKNOWN_ACTION)
    expect(auditedActionOf(ACTION)).toBe(UNKNOWN_ACTION)
    expect(isAuditedAction(SEPOLIA_ADDRESSES.action, 'sepolia')).toBe(true)
    expect(isAuditedAction(ACTION, 'sepolia')).toBe(false)
  })

  it('commits Sepolia facts that the variable parser takes as they are', () => {
    expect(deploymentFactsFrom(JSON.stringify(SEPOLIA_DEPLOYMENT))).toEqual(SEPOLIA_DEPLOYMENT)
  })
})

describe('a build with a Sepolia deployment variable', () => {
  beforeEach(() => {
    variable.mockReturnValue(json(FACTS))
  })

  it('runs the deployed kit on Sepolia with the variable facts', () => {
    expect(deploymentOf('sepolia')).toEqual({ kind: 'deployed', facts: FACTS })
  })

  it('names the deployed addresses and the zero address for each identity method it lacks', () => {
    expect(deploymentAddressesOf('sepolia')).toEqual({
      manager: MANAGER,
      methodEcdsa: METHOD_ECDSA,
      methodPasskey: METHOD_PASSKEY,
      methodAadhaar: zeroAddress,
      methodZkpassport: zeroAddress,
      action: ACTION,
      servedImplementation: PROXY_AMBIRE_ACCOUNT
    })
    expect(addressBookOf('sepolia')).toEqual({
      manager: MANAGER,
      methods: {
        ecdsa: METHOD_ECDSA,
        passkey: METHOD_PASSKEY,
        aadhaar: zeroAddress,
        zkpassport: zeroAddress
      },
      action: ACTION
    })
  })

  it('names an identity method the variable lists', () => {
    variable.mockReturnValue(json({ ...FACTS, methodAadhaar: METHOD_AADHAAR }))
    expect(addressBookOf('sepolia').methods).toEqual({
      ecdsa: METHOD_ECDSA,
      passkey: METHOD_PASSKEY,
      aadhaar: METHOD_AADHAAR,
      zkpassport: zeroAddress
    })
    expect(deploymentDescriptor('sepolia')).toMatchObject({
      methodAadhaar: METHOD_AADHAAR,
      methodZkpassport: zeroAddress,
      shippedMethods: [METHOD_ECDSA, METHOD_PASSKEY, METHOD_AADHAAR]
    })
  })

  it('describes Sepolia with the deployed addresses and facts', () => {
    expect(deploymentDescriptor('sepolia')).toEqual({
      chainId: 11155111,
      manager: MANAGER,
      methodEcdsa: METHOD_ECDSA,
      methodPasskey: METHOD_PASSKEY,
      methodAadhaar: zeroAddress,
      methodZkpassport: zeroAddress,
      action: ACTION,
      servedImplementation: PROXY_AMBIRE_ACCOUNT,
      deployedAt: 4242,
      digestVersion: '2',
      managerVersion: '1.4.0',
      shippedMethods: [METHOD_ECDSA, METHOD_PASSKEY],
      auditedActions: [ACTION, SECOND_ACTION]
    })
  })

  it('lists the variable audited actions on Sepolia in place of the committed row', () => {
    expect(auditedActionsOn('sepolia')).toEqual([
      { kind: 'audited', chain: 'sepolia', action: ACTION, publisher: 'ethereumFoundation' },
      { kind: 'audited', chain: 'sepolia', action: SECOND_ACTION, publisher: 'ethereumFoundation' }
    ])
  })

  it('looks the variable audited actions up whatever their case, and on Sepolia only', () => {
    expect(auditedActionOf(getAddress(SECOND_ACTION))).toEqual({
      kind: 'audited',
      chain: 'sepolia',
      action: SECOND_ACTION,
      publisher: 'ethereumFoundation'
    })
    expect(isAuditedAction(ACTION, 'sepolia')).toBe(true)
    expect(isAuditedAction(ACTION, 'mainnet')).toBe(false)
    expect(auditedActionOf(SEPOLIA_PLACEHOLDERS.action)).toBe(UNKNOWN_ACTION)
    expect(isAuditedAction(SEPOLIA_PLACEHOLDERS.action, 'sepolia')).toBe(false)
  })

  it('leaves mainnet as it was', () => {
    expect(deploymentOf('mainnet')).toEqual({ kind: 'stand-in' })
    expect(addressBookOf('mainnet')).toEqual(bookOf(MAINNET_PLACEHOLDERS))
    expect(deploymentDescriptor('mainnet')).toEqual(MAINNET_STAND_IN_DESCRIPTOR)
    expect(auditedActionsOn('mainnet')).toEqual([
      {
        kind: 'audited',
        chain: 'mainnet',
        action: MAINNET_PLACEHOLDERS.action,
        publisher: 'ethereumFoundation'
      }
    ])
    expect(isAuditedAction(MAINNET_PLACEHOLDERS.action, 'mainnet')).toBe(true)
  })

  it('keeps the explorer address the variable gives', () => {
    variable.mockReturnValue(json({ ...FACTS, explorerUrl: 'https://explorer.example/tx/' }))
    const deployment = deploymentOf('sepolia')
    expect(deployment.kind === 'deployed' && deployment.facts.explorerUrl).toBe(
      'https://explorer.example/tx/'
    )
  })

  it('keeps the identity method fields the variable gives', () => {
    variable.mockReturnValue(json({ ...FACTS, ...IDENTITY_FIELDS }))
    const deployment = deploymentOf('sepolia')
    expect(deployment.kind === 'deployed' && deployment.facts).toMatchObject(IDENTITY_FIELDS)
  })

  it('leaves each identity method field it lacks undefined', () => {
    const deployment = deploymentOf('sepolia')
    const facts = deployment.kind === 'deployed' ? deployment.facts : undefined
    expect(facts).toBeDefined()
    expect(facts?.zkPassportDomain).toBeUndefined()
    expect(facts?.zkPassportScope).toBeUndefined()
    expect(facts?.zkPassportTestnetTree).toBeUndefined()
    expect(facts?.aadhaarNullifierSeed).toBeUndefined()
    expect(facts?.aadhaarCertificate).toBeUndefined()
    expect(facts?.aadhaarTestMode).toBeUndefined()
  })

  it('takes a testnet tree flag of false', () => {
    const deployment = deploymentFactsFrom(json({ ...FACTS, zkPassportTestnetTree: false }))
    expect(deployment.zkPassportTestnetTree).toBe(false)
  })

  it('takes an Aadhaar test mode flag of false', () => {
    const deployment = deploymentFactsFrom(json({ ...FACTS, aadhaarTestMode: false }))
    expect(deployment.aadhaarTestMode).toBe(false)
  })

  it('takes the largest nullifier seed below the proving field', () => {
    const seed = FIELD_MAXIMUM
    expect(
      deploymentFactsFrom(
        json({ ...FACTS, aadhaarNullifierSeed: seed, aadhaarCertificate: CERTIFICATE })
      ).aadhaarNullifierSeed
    ).toBe(seed)
  })

  it('takes both identity method pairs together without the testnet flag', () => {
    const pairs = {
      zkPassportDomain: IDENTITY_FIELDS.zkPassportDomain,
      zkPassportScope: IDENTITY_FIELDS.zkPassportScope,
      aadhaarNullifierSeed: IDENTITY_FIELDS.aadhaarNullifierSeed,
      aadhaarCertificate: IDENTITY_FIELDS.aadhaarCertificate
    }
    const facts = deploymentFactsFrom(json({ ...FACTS, ...pairs }))
    expect(facts).toMatchObject(pairs)
    expect(facts.zkPassportTestnetTree).toBeUndefined()
  })

  it('takes a new value of the variable at the next call', () => {
    expect(addressBookOf('sepolia').manager).toBe(MANAGER)
    variable.mockReturnValue(json({ ...FACTS, manager: SECOND_ACTION, deployedAt: 7 }))
    expect(addressBookOf('sepolia').manager).toBe(SECOND_ACTION)
    expect(deploymentDescriptor('sepolia').deployedAt).toBe(7)
    variable.mockReturnValue(undefined)
    expect(deploymentOf('sepolia')).toEqual({ kind: 'deployed', facts: SEPOLIA_DEPLOYMENT })
    expect(addressBookOf('sepolia')).toEqual(bookOf(SEPOLIA_ADDRESSES))
  })
})

describe('a fresh record at every call', () => {
  beforeEach(() => {
    variable.mockReturnValue(json(FACTS))
  })

  it('does not let a change to one deployment answer reach the next', () => {
    const first = deploymentOf('sepolia')
    if (first.kind !== 'deployed') {
      throw new Error('expected the deployed kit')
    }
    first.facts.manager = SECOND_ACTION
    first.facts.auditedActions[0].action = SECOND_ACTION
    first.facts.auditedActions.push({ action: MANAGER, publisher: 'ethereumFoundation' })
    expect(deploymentOf('sepolia')).toEqual({ kind: 'deployed', facts: FACTS })
  })

  it('does not let a change to the stand-in answer reach the table', () => {
    variable.mockReturnValue(undefined)
    const first = deploymentOf('mainnet') as { kind: string }
    first.kind = 'deployed'
    expect(deploymentOf('mainnet')).toEqual({ kind: 'stand-in' })
    expect(DEPLOYMENTS.mainnet).toEqual({ kind: 'stand-in' })
  })

  it('does not let a change to an address book, a descriptor or an audited list reach the next', () => {
    const book = addressBookOf('sepolia')
    book.manager = SECOND_ACTION
    book.methods.ecdsa = SECOND_ACTION
    const descriptor = deploymentDescriptor('sepolia')
    ;(descriptor.auditedActions as string[]).push(MANAGER)
    const rows = auditedActionsOn('sepolia')
    rows[0].action = MANAGER
    rows.pop()
    expect(addressBookOf('sepolia').manager).toBe(MANAGER)
    expect(addressBookOf('sepolia').methods.ecdsa).toBe(METHOD_ECDSA)
    expect(deploymentDescriptor('sepolia').auditedActions).toEqual([ACTION, SECOND_ACTION])
    expect(auditedActionsOn('sepolia').map((row) => row.action)).toEqual([ACTION, SECOND_ACTION])
  })
})

describe('a malformed deployment variable', () => {
  const MALFORMED: MalformedCase[] = [
    ['a value that is not JSON', '{"manager":', /not JSON/],
    ['a JSON list', json([FACTS]), /JSON object/],
    ['a JSON string', json('deployed'), /JSON object/],
    ['an unknown field', json({ ...FACTS, relay: MANAGER }), /unknown field "relay"/],
    ['a missing manager', json({ ...FACTS, manager: undefined }), /manager/],
    ['a malformed manager address', json({ ...FACTS, manager: '0x1234' }), /manager/],
    [
      'a passkey method address with a bad checksum',
      json({ ...FACTS, methodPasskey: badChecksum(METHOD_PASSKEY) }),
      /methodPasskey/
    ],
    ['the zero address as the action', json({ ...FACTS, action: zeroAddress }), /action/],
    [
      'the zero address as an identity method',
      json({ ...FACTS, methodZkpassport: zeroAddress }),
      /methodZkpassport/
    ],
    ['a negative deployment block', json({ ...FACTS, deployedAt: -1 }), /deployedAt/],
    ['a fractional deployment block', json({ ...FACTS, deployedAt: 1.5 }), /deployedAt/],
    ['a deployment block as text', json({ ...FACTS, deployedAt: '4242' }), /deployedAt/],
    ['an empty digest version', json({ ...FACTS, digestVersion: '' }), /digestVersion/],
    ['a blank manager version', json({ ...FACTS, managerVersion: '   ' }), /managerVersion/],
    [
      'audited actions that are not a list',
      json({ ...FACTS, auditedActions: {} }),
      /auditedActions/
    ],
    [
      'an unknown publisher',
      json({ ...FACTS, auditedActions: [{ action: ACTION, publisher: 'someoneElse' }] }),
      /auditedActions\[0\]\.publisher/
    ],
    [
      'an audited action with an extra field',
      json({
        ...FACTS,
        auditedActions: [
          { action: ACTION, publisher: 'ethereumFoundation' },
          { action: SECOND_ACTION, publisher: 'ethereumFoundation', note: 'x' }
        ]
      }),
      /auditedActions\[1\].*"note"/
    ],
    [
      'an audited action with a malformed address',
      json({ ...FACTS, auditedActions: [{ action: 'nope', publisher: 'ethereumFoundation' }] }),
      /auditedActions\[0\]\.action/
    ],
    [
      'an explorer address that is not a URL',
      json({ ...FACTS, explorerUrl: 'nope' }),
      /explorerUrl/
    ],
    [
      'an ftp explorer address',
      json({ ...FACTS, explorerUrl: 'ftp://explorer.example/' }),
      /explorerUrl/
    ],
    [
      'a data explorer address',
      json({ ...FACTS, explorerUrl: 'data:text/html,explorer' }),
      /explorerUrl/
    ],
    [
      'an empty zkPassport domain',
      json({ ...FACTS, zkPassportDomain: '' }),
      /zkPassportDomain must be a non-empty string/
    ],
    [
      'a zkPassport domain that is not text',
      json({ ...FACTS, zkPassportDomain: 7 }),
      /zkPassportDomain must be a non-empty string/
    ],
    [
      'a blank zkPassport scope',
      json({ ...FACTS, zkPassportScope: '  ' }),
      /zkPassportScope must be a non-empty string/
    ],
    [
      'a testnet tree flag as text',
      json({ ...FACTS, zkPassportTestnetTree: 'true' }),
      /zkPassportTestnetTree must be true or false/
    ],
    [
      'an Aadhaar test mode flag as text',
      json({ ...FACTS, aadhaarTestMode: 'true' }),
      /aadhaarTestMode must be true or false/
    ],
    [
      'a nullifier seed as a number',
      json({ ...FACTS, aadhaarNullifierSeed: 1234 }),
      /aadhaarNullifierSeed must be a decimal number/
    ],
    [
      'a hexadecimal nullifier seed',
      json({ ...FACTS, aadhaarNullifierSeed: '0x1234' }),
      /aadhaarNullifierSeed must be a decimal number/
    ],
    [
      'a negative nullifier seed',
      json({ ...FACTS, aadhaarNullifierSeed: '-1' }),
      /aadhaarNullifierSeed must be a decimal number/
    ],
    [
      'an empty nullifier seed',
      json({ ...FACTS, aadhaarNullifierSeed: '' }),
      /aadhaarNullifierSeed must be a decimal number/
    ],
    [
      'a nullifier seed of 78 digits',
      json({ ...FACTS, aadhaarNullifierSeed: '1'.repeat(78) }),
      /aadhaarNullifierSeed must be a decimal number below the proving field/
    ],
    [
      'a nullifier seed equal to the proving field modulus',
      json({ ...FACTS, aadhaarNullifierSeed: FIELD_MODULUS }),
      /aadhaarNullifierSeed must be a decimal number below the proving field/
    ],
    [
      'a nullifier seed of 77 nines',
      json({ ...FACTS, aadhaarNullifierSeed: '9'.repeat(77) }),
      /aadhaarNullifierSeed must be a decimal number below the proving field/
    ],
    [
      'an empty Aadhaar certificate',
      json({ ...FACTS, aadhaarCertificate: '' }),
      /aadhaarCertificate must be a non-empty string/
    ],
    [
      'an Aadhaar certificate that is not PEM',
      json({ ...FACTS, aadhaarCertificate: 'MIIBmade+up' }),
      /aadhaarCertificate must be a PEM certificate/
    ],
    [
      'an Aadhaar certificate of the markers alone',
      json({
        ...FACTS,
        aadhaarCertificate: '-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----\n'
      }),
      /aadhaarCertificate must be a complete PEM certificate/
    ],
    [
      'an Aadhaar certificate whose body is not base64',
      json({
        ...FACTS,
        aadhaarCertificate: '-----BEGIN CERTIFICATE-----\nnot base64!\n-----END CERTIFICATE-----\n'
      }),
      /aadhaarCertificate must be a complete PEM certificate/
    ],
    [
      'an Aadhaar certificate with no end line',
      json({ ...FACTS, aadhaarCertificate: CERTIFICATE.replace('-----END CERTIFICATE-----', '') }),
      /aadhaarCertificate must be a complete PEM certificate/
    ],
    [
      'a zkPassport domain without its scope',
      json({ ...FACTS, zkPassportDomain: IDENTITY_FIELDS.zkPassportDomain }),
      /zkPassportDomain and zkPassportScope must be given together/
    ],
    [
      'a zkPassport scope without its domain',
      json({ ...FACTS, zkPassportScope: IDENTITY_FIELDS.zkPassportScope }),
      /zkPassportDomain and zkPassportScope must be given together/
    ],
    [
      'an Aadhaar nullifier seed without its certificate',
      json({ ...FACTS, aadhaarNullifierSeed: IDENTITY_FIELDS.aadhaarNullifierSeed }),
      /aadhaarNullifierSeed and aadhaarCertificate must be given together/
    ],
    [
      'an Aadhaar certificate without its nullifier seed',
      json({ ...FACTS, aadhaarCertificate: CERTIFICATE }),
      /aadhaarNullifierSeed and aadhaarCertificate must be given together/
    ]
  ]

  MALFORMED.forEach(([label, raw, field]) =>
    it(`throws for ${label}, naming the variable and the field`, () => {
      variable.mockReturnValue(raw)
      expect(() => deploymentOf('sepolia')).toThrow(
        /^SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT is malformed: /
      )
      expect(() => deploymentOf('sepolia')).toThrow(field)
      expect(() => addressBookOf('sepolia')).toThrow(field)
      expect(() => deploymentFactsFrom(raw)).toThrow(field)
    })
  )

  it('never falls back to the committed row on Sepolia', () => {
    variable.mockReturnValue(json({ ...FACTS, action: zeroAddress }))
    expect(() => deploymentDescriptor('sepolia')).toThrow(/action/)
    expect(() => auditedActionsOn('sepolia')).toThrow(/action/)
  })

  it('leaves the mainnet record readable', () => {
    variable.mockReturnValue('{')
    expect(deploymentOf('mainnet')).toEqual({ kind: 'stand-in' })
    expect(addressBookOf('mainnet')).toEqual(bookOf(MAINNET_PLACEHOLDERS))
  })

  it('leaves the mainnet audited lookups readable', () => {
    variable.mockReturnValue('{')
    expect(auditedActionsOn('mainnet')).toEqual([
      {
        kind: 'audited',
        chain: 'mainnet',
        action: MAINNET_PLACEHOLDERS.action,
        publisher: 'ethereumFoundation'
      }
    ])
    expect(auditedActionOf(MAINNET_PLACEHOLDERS.action, 'mainnet')).toEqual(
      auditedActionsOn('mainnet')[0]
    )
    expect(auditedActionOf(ACTION, 'mainnet')).toBe(UNKNOWN_ACTION)
    expect(isAuditedAction(MAINNET_PLACEHOLDERS.action, 'mainnet')).toBe(true)
    expect(() => auditedActionOf(MAINNET_PLACEHOLDERS.action)).toThrow(/not JSON/)
  })

  it('takes a valid value of every field it knows', () => {
    const full = {
      ...FACTS,
      methodAadhaar: METHOD_AADHAAR,
      methodZkpassport: getAddress(SECOND_ACTION),
      deployedAt: 0,
      explorerUrl: 'http://localhost:4000/tx/',
      ...IDENTITY_FIELDS
    }
    expect(deploymentFactsFrom(json(full))).toEqual(full)
  })
})
