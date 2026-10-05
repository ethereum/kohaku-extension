/**
 * The findings a draft decides alone. Over the drafts the scripted stand-in
 * judges, the deployed kit's findings equal the stand-in's, the reads' rows
 * and the backup's width aside; the backup's width is judged against the
 * sealed form's one padded size, for a sealed backup alone.
 */
import { encodeAbiParameters, keccak256, maxUint48, parseAbiParameters, stringToHex } from 'viem'

import { addressOf, defaultClientConfiguration } from '@web/modules/social-recovery/sdk-doubles'
import { createWorld, type World } from '@web/modules/social-recovery/sdk-doubles/__tests__/harness'
import type {
  Address,
  Credential,
  Finding,
  Hex,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  BACKUP_PADDED_SIZE,
  backupPlaintextSizeOf
} from '@web/modules/social-recovery/shared/client/kit/backup'
import {
  draftFindingsOf,
  verifyCostOf
} from '@web/modules/social-recovery/shared/client/kit/validation'

/** The rows a read decides, and the backup's width, which the two judge against different sizes. */
const NOT_PURE = new Set<string>([
  'method.unshipped',
  'method.no-declaration',
  'method.stopped',
  'action.unsupported',
  'action.fit-unchecked',
  'action.unaudited',
  'manager.already-armed',
  'backup.too-wide'
])

const pure = (findings: Finding[]) => findings.filter((f) => !NOT_PURE.has(f.code))
const codes = (findings: Finding[]) => findings.map((f) => f.code)

const wallet = (world: World, label: string, extra: Partial<Credential> = {}): Credential => ({
  method: world.descriptor.methodEcdsa,
  config: world.methods.wallet.codec.encodeConfig({ address: addressOf(label) }),
  ...extra
})

const passport = (world: World, id: string): Credential => ({
  method: world.descriptor.methodZkpassport,
  config: world.methods.zkPassport.codec.encodeConfig({
    uniqueIdentifier: keccak256(stringToHex(id))
  })
})

const passkey = (world: World, seed: number): Credential => ({
  method: world.descriptor.methodPasskey,
  config: encodeAbiParameters(parseAbiParameters('bytes32, bytes32, bytes32'), [
    keccak256(stringToHex(`x${seed}`)),
    keccak256(stringToHex(`y${seed}`)),
    keccak256(stringToHex('wallet.example'))
  ])
})

const withClauses = (world: World, clauses: SetupDraft['clauses']): SetupDraft => ({
  ...world.draft('private'),
  clauses
})

/** One draft of the stand-in's own tests, built over the stand-in's world. */
const DRAFTS: [string, (world: World, timestamp: number) => SetupDraft][] = [
  ['the private draft', (world) => world.draft('private')],
  ['the shape-visible draft', (world) => world.draft('shape-visible')],
  ['the public draft', (world) => world.draft('public')],
  ['a draft with no clause', (world) => withClauses(world, [])],
  [
    'a rule whose thresholds are all zero',
    (world) =>
      withClauses(world, [
        { threshold: 0, credentials: [wallet(world, 'a')] },
        { threshold: 0, credentials: [wallet(world, 'b')] }
      ])
  ],
  [
    'an empty clause beside a full one',
    (world) =>
      withClauses(world, [
        { threshold: 1, credentials: [] },
        { threshold: 1, credentials: [wallet(world, 'a'), wallet(world, 'b')] }
      ])
  ],
  [
    'a threshold above the count',
    (world) =>
      withClauses(world, [{ threshold: 3, credentials: [wallet(world, 'a'), wallet(world, 'b')] }])
  ],
  [
    'a negative threshold',
    (world) =>
      withClauses(world, [{ threshold: -1, credentials: [wallet(world, 'a'), wallet(world, 'b')] }])
  ],
  [
    'a fractional threshold',
    (world) =>
      withClauses(world, [
        { threshold: 1.5, credentials: [wallet(world, 'a'), wallet(world, 'b')] }
      ])
  ],
  [
    'a threshold wider than its field',
    (world) => withClauses(world, [{ threshold: 256, credentials: [wallet(world, 'a')] }])
  ],
  [
    'a zero threshold beside a met one',
    (world) =>
      withClauses(world, [
        { threshold: 0, credentials: [wallet(world, 'a')] },
        { threshold: 1, credentials: [wallet(world, 'b'), passkey(world, 1)] }
      ])
  ],
  [
    'a two-of-two and a one-of-one',
    (world) =>
      withClauses(world, [
        { threshold: 2, credentials: [wallet(world, 'a'), wallet(world, 'b')] },
        { threshold: 1, credentials: [wallet(world, 'c')] }
      ])
  ],
  [
    'a clause of identity methods alone',
    (world) =>
      withClauses(world, [
        { threshold: 2, credentials: [wallet(world, 'a'), wallet(world, 'b'), passkey(world, 1)] },
        { threshold: 1, credentials: [passport(world, 'p1'), passport(world, 'p2')] }
      ])
  ],
  [
    'a rule whose costliest satisfying set passes the bound',
    (world) =>
      withClauses(world, [
        {
          threshold: 6,
          credentials: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => passport(world, id))
        },
        { threshold: 1, credentials: [wallet(world, 'a'), passkey(world, 1)] }
      ])
  ],
  [
    'one credential at two places',
    (world) =>
      withClauses(world, [
        { threshold: 1, credentials: [wallet(world, 'a'), wallet(world, 'b')] },
        { threshold: 1, credentials: [wallet(world, 'a'), passkey(world, 1)] }
      ])
  ],
  [
    'one person at two places',
    (world) =>
      withClauses(world, [
        {
          threshold: 2,
          credentials: [
            wallet(world, 'ana-phone', { label: 'Ana' }),
            wallet(world, 'ana-laptop', { label: ' ana ' }),
            wallet(world, 'ben', { label: 'Ben' })
          ]
        }
      ])
  ],
  ['a negative wait', (world) => ({ ...world.draft('private'), wait: -1n })],
  ['a zero wait', (world) => ({ ...world.draft('private'), wait: 0n })],
  ['a short wait', (world) => ({ ...world.draft('private'), wait: 3600n })],
  ['a wait above the maximum', (world) => ({ ...world.draft('private'), wait: 31n * 24n * 3600n })],
  [
    'the widest wait the field holds at the block',
    (world, timestamp) => ({ ...world.draft('private'), wait: maxUint48 - BigInt(timestamp) })
  ],
  [
    'a wait one past the field at the block',
    (world, timestamp) => ({ ...world.draft('private'), wait: maxUint48 - BigInt(timestamp) + 1n })
  ],
  [
    'an empty backup',
    (world) => ({ ...world.draft('private'), privacy: { publicMetadata: '0x', backup: 'empty' } })
  ]
]

describe('the findings a draft decides alone', () => {
  DRAFTS.forEach(([name, draftOf]) =>
    it(`equal the stand-in's for ${name}`, async () => {
      const world = createWorld()
      const block = await world.provider.block('latest')
      const draft = draftOf(world, block.timestamp)
      const stand = await (await world.setupClient()).validateSetup(draft)
      const kit = draftFindingsOf(draft, {
        account: world.account,
        descriptor: world.descriptor,
        config: defaultClientConfiguration(),
        blockTimestamp: block.timestamp
      })
      expect(pure(kit.errors)).toEqual(pure(stand.errors))
      expect(pure(kit.warnings)).toEqual(pure(stand.warnings))
      expect(kit.errors.length + kit.warnings.length).toBeGreaterThan(0)
    })
  )

  it('takes the timing and cost numbers the configuration names over the shipped ones', () => {
    const world = createWorld()
    const draft = { ...world.draft('private'), wait: 7200n }
    const input = {
      account: world.account,
      descriptor: world.descriptor,
      blockTimestamp: 1_800_000_000
    }
    const shipped = draftFindingsOf(draft, { ...input, config: {} })
    expect(codes(shipped.warnings)).toContain('setup.wait-short')
    expect(codes(shipped.errors)).not.toContain('rule.too-wide')
    const named = draftFindingsOf(draft, {
      ...input,
      config: { shortWaitBelow: 3600, maximumWait: 3600, ruleCostBound: 10_000n }
    })
    expect(codes(named.warnings)).not.toContain('setup.wait-short')
    expect(named.errors.find((f) => f.code === 'wait.above-maximum')?.values).toEqual({
      wait: 7200n,
      maximum: 3600n
    })
    expect(named.errors.find((f) => f.code === 'rule.too-wide')?.values).toMatchObject({
      cost: 30_000n,
      bound: 10_000n
    })
  })
})

describe('the verify cost a method is priced at', () => {
  const methods = {
    methodEcdsa: '0x00000000000000000000000000000000000000e1' as Address,
    methodPasskey: '0x00000000000000000000000000000000000000e2' as Address,
    methodAadhaar: '0x00000000000000000000000000000000000000e3' as Address,
    methodZkpassport: '0x00000000000000000000000000000000000000e4' as Address
  }

  const COSTS = [
    ['the ECDSA method', methods.methodEcdsa, 10_000n],
    ['the passkey method', methods.methodPasskey, 400_000n],
    ['the Aadhaar method', methods.methodAadhaar, 2_000_000n],
    ['the zkPassport method', methods.methodZkpassport, 2_000_000n],
    [
      'a method the deployment does not name',
      '0x00000000000000000000000000000000000000e5',
      2_000_000n
    ]
  ] as const

  COSTS.forEach(([name, method, cost]) =>
    it(`prices ${name} at its stand-in cost`, () => {
      expect(verifyCostOf(method, methods)).toBe(cost)
      expect(verifyCostOf(`0x${method.slice(2).toUpperCase()}` as Address, methods)).toBe(cost)
    })
  )
})

describe("the backup's width", () => {
  const ACCOUNT: Address = '0x00000000000000000000000000000000000ac0de'
  const ECDSA: Address = '0x00000000000000000000000000000000000000e1'
  const descriptor = {
    methodEcdsa: ECDSA,
    methodPasskey: '0x00000000000000000000000000000000000000e2' as Address,
    methodAadhaar: '0x00000000000000000000000000000000000000e3' as Address,
    methodZkpassport: '0x00000000000000000000000000000000000000e4' as Address
  }
  const credential = (config: Hex, salt?: Hex): Credential => ({
    method: ECDSA,
    config,
    ...(salt ? { salt } : {})
  })
  const draftOf = (
    credentials: Credential[],
    backup: SetupDraft['privacy']['backup']
  ): SetupDraft => ({
    clauses: [{ threshold: 1, credentials }],
    wait: 432_000n,
    ignoresPause: false,
    privacy: { publicMetadata: '0x', backup }
  })
  const findingsOf = (draft: SetupDraft) =>
    draftFindingsOf(draft, {
      account: ACCOUNT,
      descriptor,
      config: {},
      blockTimestamp: 1_800_000_000
    })
  const tooWide = (draft: SetupDraft) =>
    findingsOf(draft)
      .errors.filter((f) => f.code === 'backup.too-wide')
      .map((f) => f.values)
  /** A config of `bytes` bytes. */
  const configOf = (bytes: number): Hex => `0x${'ab'.repeat(bytes)}`
  /** The config size that fills the sealed form's padded size exactly. */
  const room = () => {
    const base = backupPlaintextSizeOf({
      clauses: [{ threshold: 1, credentials: [credential('0x')] }],
      wait: 432_000n,
      ignoresPause: false
    })
    return BACKUP_PADDED_SIZE - base
  }

  it('fits a sealed backup whose plaintext fills the padded size exactly', () => {
    expect(tooWide(draftOf([credential(configOf(room()))], 'encrypted'))).toEqual([])
  })

  it('refuses a sealed backup one byte wider than the padded size', () => {
    expect(tooWide(draftOf([credential(configOf(room() + 1))], 'encrypted'))).toEqual([
      { plaintextSize: BACKUP_PADDED_SIZE + 1, paddingSize: BACKUP_PADDED_SIZE }
    ])
  })

  it('judges no width for a clear or an empty backup', () => {
    const wide = [credential(configOf(room() + 100))]
    expect(tooWide(draftOf(wide, 'clear'))).toEqual([])
    expect(tooWide(draftOf(wide, 'empty'))).toEqual([])
  })

  it('refuses a sealed backup with a value no field of the plaintext holds', () => {
    const salted = [credential(configOf(32), '0x1234')]
    expect(tooWide(draftOf(salted, 'encrypted'))).toEqual([
      { paddingSize: BACKUP_PADDED_SIZE, fieldWidth: true }
    ])
    expect(tooWide(draftOf(salted, 'clear'))).toEqual([])
  })

  it('leaves the width aside where the wait or a threshold is refused for its own field', () => {
    const wide = [credential(configOf(room() + 1))]
    const waitRefused = { ...draftOf(wide, 'encrypted'), wait: -1n }
    expect(codes(findingsOf(waitRefused).errors)).toEqual(['wait.field-width'])
    const thresholdRefused: SetupDraft = {
      ...draftOf(wide, 'encrypted'),
      clauses: [{ threshold: 0.5, credentials: wide }]
    }
    expect(codes(findingsOf(thresholdRefused).errors)).toEqual(['clause.threshold-too-wide'])
  })
})
