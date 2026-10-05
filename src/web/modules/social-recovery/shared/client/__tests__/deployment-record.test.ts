/**
 * What each recovery chain runs. With no deployment variable, both chains run
 * the stand-in and every address, fact and audited row is the committed
 * placeholder. With a Sepolia variable, Sepolia's address book, descriptor
 * and audited set come from it and mainnet stays as it was. A malformed
 * variable throws, naming the field. The variable is read through its one
 * module, mocked here; every address in it is made up.
 */
import { getAddress, zeroAddress } from 'viem'

import { PROXY_AMBIRE_ACCOUNT } from '@ambire-common/consts/deploy'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
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

const json = (value: unknown): string => JSON.stringify(value)

/** A checksummed address with the case of its first letter flipped, so its checksum is wrong. */
const badChecksum = (address: Address): string => {
  const checksummed = getAddress(address)
  const at = checksummed.slice(2).search(/[a-fA-F]/) + 2
  const letter = checksummed[at]
  const flipped = letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase()
  return `${checksummed.slice(0, at)}${flipped}${checksummed.slice(at + 1)}`
}

const SEPOLIA_STAND_IN_DESCRIPTOR = {
  chainId: 11155111,
  ...SEPOLIA_PLACEHOLDERS,
  servedImplementation: PROXY_AMBIRE_ACCOUNT,
  deployedAt: 0,
  digestVersion: '1',
  managerVersion: '1.0.0',
  shippedMethods: [
    SEPOLIA_PLACEHOLDERS.methodEcdsa,
    SEPOLIA_PLACEHOLDERS.methodPasskey,
    SEPOLIA_PLACEHOLDERS.methodAadhaar,
    SEPOLIA_PLACEHOLDERS.methodZkpassport
  ],
  auditedActions: [SEPOLIA_PLACEHOLDERS.action]
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
  it('runs the stand-in on both chains', () => {
    expect(DEPLOYMENTS).toEqual({ sepolia: { kind: 'stand-in' }, mainnet: { kind: 'stand-in' } })
    expect(deploymentOf('sepolia')).toEqual({ kind: 'stand-in' })
    expect(deploymentOf('mainnet')).toEqual({ kind: 'stand-in' })
  })

  it('names the placeholder addresses on both chains', () => {
    expect(deploymentAddressesOf('sepolia')).toEqual({
      ...SEPOLIA_PLACEHOLDERS,
      servedImplementation: PROXY_AMBIRE_ACCOUNT
    })
    expect(deploymentAddressesOf('mainnet')).toEqual({
      ...MAINNET_PLACEHOLDERS,
      servedImplementation: PROXY_AMBIRE_ACCOUNT
    })
    expect(addressBookOf('sepolia')).toEqual(bookOf(SEPOLIA_PLACEHOLDERS))
    expect(addressBookOf('mainnet')).toEqual(bookOf(MAINNET_PLACEHOLDERS))
  })

  it('describes both chains with the placeholder facts', () => {
    expect(deploymentDescriptor('sepolia')).toEqual(SEPOLIA_STAND_IN_DESCRIPTOR)
    expect(deploymentDescriptor('mainnet')).toEqual(MAINNET_STAND_IN_DESCRIPTOR)
  })

  it('lists the committed audited row of each chain', () => {
    expect(auditedActionsOn('sepolia')).toEqual([
      {
        kind: 'audited',
        chain: 'sepolia',
        action: SEPOLIA_PLACEHOLDERS.action,
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
    expect(auditedActionsOn('sepolia')).toEqual(
      AUDITED_ACTIONS.filter((row) => row.chain === 'sepolia')
    )
  })

  it('looks the committed rows up by address and chain', () => {
    expect(auditedActionOf(SEPOLIA_PLACEHOLDERS.action)).toEqual(auditedActionsOn('sepolia')[0])
    expect(auditedActionOf(MAINNET_PLACEHOLDERS.action, 'mainnet')).toEqual(
      auditedActionsOn('mainnet')[0]
    )
    expect(auditedActionOf(SEPOLIA_PLACEHOLDERS.action, 'mainnet')).toBe(UNKNOWN_ACTION)
    expect(auditedActionOf(ACTION)).toBe(UNKNOWN_ACTION)
    expect(isAuditedAction(SEPOLIA_PLACEHOLDERS.action, 'sepolia')).toBe(true)
    expect(isAuditedAction(ACTION, 'sepolia')).toBe(false)
  })
})

describe('a build with a Sepolia deployment variable', () => {
  beforeEach(() => {
    variable.mockReturnValue(json(FACTS))
  })

  it('runs the deployed kit on Sepolia with the variable facts', () => {
    expect(deploymentOf('sepolia')).toEqual({ kind: 'deployed', facts: FACTS })
  })

  it('names the deployed addresses and keeps the placeholder of each identity method it lacks', () => {
    expect(deploymentAddressesOf('sepolia')).toEqual({
      manager: MANAGER,
      methodEcdsa: METHOD_ECDSA,
      methodPasskey: METHOD_PASSKEY,
      methodAadhaar: SEPOLIA_PLACEHOLDERS.methodAadhaar,
      methodZkpassport: SEPOLIA_PLACEHOLDERS.methodZkpassport,
      action: ACTION,
      servedImplementation: PROXY_AMBIRE_ACCOUNT
    })
    expect(addressBookOf('sepolia')).toEqual({
      manager: MANAGER,
      methods: {
        ecdsa: METHOD_ECDSA,
        passkey: METHOD_PASSKEY,
        aadhaar: SEPOLIA_PLACEHOLDERS.methodAadhaar,
        zkpassport: SEPOLIA_PLACEHOLDERS.methodZkpassport
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
      zkpassport: SEPOLIA_PLACEHOLDERS.methodZkpassport
    })
    expect(deploymentDescriptor('sepolia').methodAadhaar).toBe(METHOD_AADHAAR)
  })

  it('describes Sepolia with the deployed addresses and facts', () => {
    expect(deploymentDescriptor('sepolia')).toEqual({
      chainId: 11155111,
      manager: MANAGER,
      methodEcdsa: METHOD_ECDSA,
      methodPasskey: METHOD_PASSKEY,
      methodAadhaar: SEPOLIA_PLACEHOLDERS.methodAadhaar,
      methodZkpassport: SEPOLIA_PLACEHOLDERS.methodZkpassport,
      action: ACTION,
      servedImplementation: PROXY_AMBIRE_ACCOUNT,
      deployedAt: 4242,
      digestVersion: '2',
      managerVersion: '1.4.0',
      shippedMethods: [
        METHOD_ECDSA,
        METHOD_PASSKEY,
        SEPOLIA_PLACEHOLDERS.methodAadhaar,
        SEPOLIA_PLACEHOLDERS.methodZkpassport
      ],
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

  it('takes a new value of the variable at the next call', () => {
    expect(addressBookOf('sepolia').manager).toBe(MANAGER)
    variable.mockReturnValue(json({ ...FACTS, manager: SECOND_ACTION, deployedAt: 7 }))
    expect(addressBookOf('sepolia').manager).toBe(SECOND_ACTION)
    expect(deploymentDescriptor('sepolia').deployedAt).toBe(7)
    variable.mockReturnValue(undefined)
    expect(deploymentOf('sepolia')).toEqual({ kind: 'stand-in' })
    expect(addressBookOf('sepolia')).toEqual(bookOf(SEPOLIA_PLACEHOLDERS))
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
    descriptor.auditedActions.push(MANAGER)
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
  const MALFORMED: [string, string, RegExp][] = [
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

  it('never falls back to the stand-in on Sepolia', () => {
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
      explorerUrl: 'http://localhost:4000/tx/'
    }
    expect(deploymentFactsFrom(json(full))).toEqual(full)
  })
})
