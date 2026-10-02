import { BACKUP_PADDING_SIZE, PolicyManagerDouble } from '@web/modules/social-recovery/sdk-doubles'
import { backupPlaintextSize } from '@web/modules/social-recovery/sdk-doubles/encoding'
import {
  PRIVACY_LEVELS,
  RESTORE_CAUSES,
  type Address,
  type Configuration,
  type Credential,
  type Finding,
  type Hex,
  type ModuleInfo,
  type PreparedBatch,
  type PreparedCall,
  type ReadResult,
  type RestoreRefusal,
  type SetupDraft,
  type ValidationRefusal
} from '@web/modules/social-recovery/sdk-interfaces'

import {
  createWorld,
  eachIt,
  expectThrown,
  expectUnanswered,
  isAddress,
  isHex,
  passportAt,
  PASSWORD,
  type StandingRow,
  upperCased,
  walletAt,
  World
} from '@web/modules/social-recovery/sdk-doubles/__tests__/harness'

const expectCall = (value: PreparedCall) => {
  expect(value.kind).toBe('call')
  expect(isAddress(value.target)).toBe(true)
  expect(value.value).toBe(0n)
  expect(isHex(value.data)).toBe(true)
  expect(['account', 'anyone']).toContain(value.sender)
  expect(typeof value.block.number).toBe('number')
  expect(isHex(value.block.hash)).toBe(true)
}

const asBatch = (value: PreparedCall | PreparedBatch) => {
  expect(value.kind).toBe('batch')
  return value as PreparedBatch
}

const asCall = (value: PreparedCall | PreparedBatch) => {
  expect(value.kind).toBe('call')
  return value as PreparedCall
}

const codes = (findings: Finding[]) => findings.map((f) => f.code)

const draftOver = (world: World, clauses: SetupDraft['clauses']): SetupDraft => ({
  ...world.draft('private'),
  clauses
})

/** The world's own private draft with a zkPassport clause beside its wallet clauses. */
const withPassport = (world: World): SetupDraft => {
  const draft = world.draft('private')
  return draftOver(world, [
    ...draft.clauses,
    { threshold: 1, credentials: [passportAt(world, 'passport')] }
  ])
}

describe('setup client double', () => {
  it('reads the setup state record pinned to one block', async () => {
    const world = createWorld()
    world.script.setupNone()
    const state = await (await world.setupClient()).setupState()
    expect(state.hasSetup).toBe(false)
    expect(typeof state.isAuthorized).toBe('boolean')
    expect(isHex(state.setupCommitment)).toBe(true)
    expect(typeof state.setupNonce).toBe('bigint')
    expect(typeof state.setupCommittedAtBlock).toBe('number')
    expect(typeof state.attemptActive).toBe('boolean')
    expect(typeof state.block.number).toBe('number')
    expect(typeof state.block.timestamp).toBe('number')
    expect(isHex(state.block.hash)).toBe(true)
  })

  eachIt(PRIVACY_LEVELS)('reads a setup committed under the %s level', async (level) => {
    const world = createWorld()
    world.script.setupCommitted(level)
    const state = await (await world.setupClient()).setupState()
    const onChain = await world.manager.stateOf()
    expect(state.hasSetup).toBe(true)
    expect(state.setupCommitment).toBe(onChain.setupCommitment)
    expect(state.setupNonce).toBe(onChain.setupNonce)
    expect(state.setupCommittedAtBlock).toBe(onChain.setupCommittedAtBlock)
  })

  describe('prepareCommitSetup', () => {
    it('returns the atomic arming pair while the account does not authorize the action', async () => {
      const world = createWorld()
      world.script.setupNone()
      world.script.authorized(false)
      const batch = asBatch(
        await (await world.setupClient()).prepareCommitSetup(world.draft('private'), 'pw')
      )
      expect(batch.atomic).toBe(true)
      expect(batch.calls).toHaveLength(2)
      batch.calls.forEach(expectCall)
      batch.calls.forEach((c) => expect(c.sender).toBe('account'))
      batch.calls.forEach((c) => expect(c.block).toEqual(batch.block))
      expect(batch.calls[0]!.target.toLowerCase()).toBe(world.account.toLowerCase())
      expect(batch.calls[1]!.target.toLowerCase()).toBe(world.descriptor.manager.toLowerCase())
    })

    it('returns commitSetup alone once the account authorizes the action', async () => {
      const world = createWorld()
      world.script.setupCommitted('private')
      world.script.authorized(true)
      const call = asCall(
        await (await world.setupClient()).prepareCommitSetup(world.draft('private'), 'pw')
      )
      expectCall(call)
      expect(call.sender).toBe('account')
      expect(call.target.toLowerCase()).toBe(world.descriptor.manager.toLowerCase())
    })

    it('throws an ordinary error carrying the findings when scripted to refuse', async () => {
      const world = createWorld()
      world.script.refuse('setup.prepareCommitSetup', 'rule.empty')
      const setup = await world.setupClient()
      const error = (await expectThrown(() =>
        setup.prepareCommitSetup(world.draft('private'), 'pw')
      )) as ValidationRefusal
      expect(error.findings.errors.map((f) => f.code)).toContain('rule.empty')
      expect(Array.isArray(error.findings.warnings)).toBe(true)
    })
  })

  describe('prepareClearSetup', () => {
    it('pairs clearSetup and the disarming call while a setup stands on an armed account', async () => {
      const world = createWorld()
      world.script.setupCommitted('private')
      world.script.authorized(true)
      const batch = asBatch(await (await world.setupClient()).prepareClearSetup())
      expect(batch.atomic).toBe(true)
      expect(batch.calls).toHaveLength(2)
      const targets = batch.calls.map((c) => c.target.toLowerCase()).sort()
      expect(targets).toEqual(
        [world.account.toLowerCase(), world.descriptor.manager.toLowerCase()].sort()
      )
      batch.calls.forEach((c) => expect(c.sender).toBe('account'))
    })

    it('returns clearSetup alone on a dormant setup', async () => {
      const world = createWorld()
      world.script.setupCommitted('private')
      world.script.authorized(false)
      const call = asCall(await (await world.setupClient()).prepareClearSetup())
      expect(call.target.toLowerCase()).toBe(world.descriptor.manager.toLowerCase())
      expect(call.sender).toBe('account')
    })

    it('returns the disarming call alone where no setup stands', async () => {
      const world = createWorld()
      world.script.setupNone()
      world.script.authorized(true)
      const call = asCall(await (await world.setupClient()).prepareClearSetup())
      expect(call.target.toLowerCase()).toBe(world.account.toLowerCase())
      expect(call.sender).toBe('account')
    })

    it('throws when scripted to refuse', async () => {
      const world = createWorld()
      world.script.setupCommitted('private')
      world.script.refuse('setup.prepareClearSetup', 'action.unsupported')
      const setup = await world.setupClient()
      const error = (await expectThrown(() => setup.prepareClearSetup())) as ValidationRefusal
      expect(error.findings.errors.map((f) => f.code)).toContain('action.unsupported')
    })
  })

  describe('getSetup', () => {
    it('restores the configuration from the configuration itself', async () => {
      const world = createWorld()
      const committed = world.script.setupCommitted('public')
      const restored = await (await world.setupClient()).getSetup(committed.configuration)
      expect(restored).toEqual(committed.configuration)
    })

    it('restores the configuration from the recovery password', async () => {
      const world = createWorld()
      const committed = world.script.setupCommitted('private')
      expect(committed.password).toBeDefined()
      const restored = await (await world.setupClient()).getSetup({ password: committed.password! })
      expect(restored).toEqual(committed.configuration)
    })

    const restoreCause = async (run: () => Promise<unknown>) => {
      const error = (await expectThrown(run)) as RestoreRefusal
      expect(RESTORE_CAUSES).toContain(error.cause.code)
      return error.cause.code
    }

    it('throws restore.no-backup where no setup stands', async () => {
      const world = createWorld()
      world.script.setupNone()
      const setup = await world.setupClient()
      expect(await restoreCause(() => setup.getSetup({ password: 'pw' }))).toBe('restore.no-backup')
    })

    it('throws restore.backup-unopened on a wrong password', async () => {
      const world = createWorld()
      world.script.setupCommitted('private')
      const setup = await world.setupClient()
      expect(await restoreCause(() => setup.getSetup({ password: 'not the password' }))).toBe(
        'restore.backup-unopened'
      )
    })

    it('throws restore.commitment-mismatch on a configuration the chain did not commit', async () => {
      const world = createWorld()
      const committed = world.script.setupCommitted('private')
      const setup = await world.setupClient()
      const other = { ...committed.configuration, wait: committed.configuration.wait + 1n }
      expect(await restoreCause(() => setup.getSetup(other))).toBe('restore.commitment-mismatch')
    })
  })

  it('throws a scripted read failure, which a screen tells from an empty setup', async () => {
    const world = createWorld()
    world.script.setupNone()
    const setup = await world.setupClient()
    const empty = await setup.setupState()
    expect(empty.hasSetup).toBe(false)
    world.script.failRead('setup.setupState')
    await expectThrown(() => setup.setupState())
  })
})

describe('setup validation over a module read that goes unanswered', () => {
  const STANDING_READS = [
    ['manager.paused', 'paused'],
    ['manager.moduleInfo', 'moduleInfo']
  ] as const

  eachIt(STANDING_READS)(
    'refuses validateSetup and prepareCommitSetup while the %s read of a method goes unanswered',
    async ([read]) => {
      const world = createWorld()
      const module = world.descriptor.methodZkpassport
      const draft = withPassport(world)
      const setup = await world.setupClient()
      expect((await setup.validateSetup(draft)).errors).toEqual([])
      world.script.leaveUnanswered(read, module)
      expectUnanswered(await expectThrown(() => setup.validateSetup(draft)), { read, module })
      expectUnanswered(await expectThrown(() => setup.prepareCommitSetup(draft, PASSWORD)), {
        read,
        module
      })
    }
  )

  eachIt(STANDING_READS)(
    'still describes the draft while the %s read goes unanswered, showing that read unanswered',
    async ([read, member]) => {
      const world = createWorld()
      const module = world.descriptor.methodZkpassport
      world.script.leaveUnanswered(read, module)
      const described = await (await world.setupClient()).describeSetup(withPassport(world))
      const standing = described.methodStanding as StandingRow[]
      expect(standing.map((r) => r.method)).toEqual([world.descriptor.methodEcdsa, module])
      expect(standing[0]![member].answered).toBe(true)
      expect(standing[1]![member]).toEqual({ answered: false })
    }
  )

  it('names the stop read where both reads of one method go unanswered', async () => {
    const world = createWorld()
    const module = world.descriptor.methodZkpassport
    world.script.leaveUnanswered('manager.moduleInfo', module)
    world.script.leaveUnanswered('manager.paused', module)
    const setup = await world.setupClient()
    expectUnanswered(await expectThrown(() => setup.validateSetup(withPassport(world))), {
      read: 'manager.paused',
      module
    })
  })

  it('validates and prepares while only the trusted parties read of a method goes unanswered', async () => {
    const world = createWorld()
    const module = world.descriptor.methodZkpassport
    world.script.leaveUnanswered('manager.trustedParties', module)
    const setup = await world.setupClient()
    const draft = withPassport(world)
    expect((await setup.validateSetup(draft)).errors).toEqual([])
    expect(['call', 'batch']).toContain((await setup.prepareCommitSetup(draft, PASSWORD)).kind)
  })
})

/** A manager part that records every module its `moduleInfo` read is asked about. */
class RecordingManager extends PolicyManagerDouble {
  readonly asked: Address[] = []

  async moduleInfo(module: Address): Promise<ReadResult<ModuleInfo>> {
    this.asked.push(module)
    return super.moduleInfo(module)
  }
}

describe('a method a draft names in two letter cases', () => {
  it('is read and reported once, under its first spelling at its first position', async () => {
    const world = createWorld()
    const { methodEcdsa: ecdsa, methodZkpassport: zk } = world.descriptor
    const upper = upperCased(zk)
    expect(upper).not.toBe(zk)
    world.script.method(zk, { paused: true })
    const manager = new RecordingManager(world.chain)
    const setup = await world.builder().policyManager(manager).buildSetupClient()
    const draft = draftOver(world, [
      {
        threshold: 2,
        credentials: [
          passportAt(world, 'p1', upper),
          walletAt(world, 'ana'),
          passportAt(world, 'p2')
        ]
      },
      { threshold: 1, credentials: [passportAt(world, 'p3'), passportAt(world, 'p4', upper)] }
    ])
    manager.asked.length = 0
    const { warnings } = await setup.validateSetup(draft)
    expect(manager.asked).toEqual([upper, ecdsa])
    const stopped = warnings.filter((f) => f.code === 'method.stopped')
    expect(stopped.map((f) => f.values.method)).toEqual([upper])
    // A clause's own method list keeps the spelling that clause names first.
    const secondary = warnings.filter((f) => f.code === 'clause.secondary-only')
    expect(secondary.map((f) => f.values.methods)).toEqual([[zk]])
    const described = await setup.describeSetup(draft)
    expect((described.methodStanding as StandingRow[]).map((r) => r.method)).toEqual([upper, ecdsa])
    expect(described.failureDomains).toEqual([
      {
        clause: 0,
        methods: [
          { method: upper, count: 2 },
          { method: ecdsa, count: 1 }
        ]
      },
      { clause: 1, methods: [{ method: zk, count: 2 }] }
    ])
  })
})

describe('the backup plaintext size', () => {
  const hexOf = (digits: number): Hex => `0x${'a'.repeat(digits)}`
  const oneClause = (world: World, credentials: Credential[]): Configuration => ({
    ...world.configuration,
    clauses: [{ threshold: 1, credentials }]
  })
  const ecdsaWith = (world: World, config: Hex, salt?: Hex): Credential => ({
    method: world.descriptor.methodEcdsa,
    config,
    ...(salt ? { salt } : {})
  })
  /** The size of one clause of `count` credentials whose configs are empty. */
  const emptySize = (world: World, count: number) => {
    const empty = Array.from({ length: count }, () => ecdsaWith(world, '0x'))
    return backupPlaintextSize(oneClause(world, empty))
  }
  const tooWide = (findings: Finding[]) =>
    findings.filter((f) => f.code === 'backup.too-wide').map((f) => f.values)

  it('counts an even-length config and salt by their bytes', () => {
    const world = createWorld()
    const base = emptySize(world, 1)
    expect(backupPlaintextSize(oneClause(world, [ecdsaWith(world, hexOf(64))]))).toBe(base + 32)
    expect(backupPlaintextSize(oneClause(world, [ecdsaWith(world, hexOf(64), hexOf(64))]))).toBe(
      base + 64
    )
  })

  it('raises backup.too-wide one byte past the padding size, and not at it', async () => {
    const world = createWorld()
    const room = BACKUP_PADDING_SIZE - emptySize(world, 1)
    const setup = await world.setupClient()
    const at = await setup.validateSetup(
      draftOver(world, [{ threshold: 1, credentials: [ecdsaWith(world, hexOf(2 * room))] }])
    )
    expect(codes(at.errors)).not.toContain('backup.too-wide')
    const past = await setup.validateSetup(
      draftOver(world, [{ threshold: 1, credentials: [ecdsaWith(world, hexOf(2 * room + 2))] }])
    )
    expect(tooWide(past.errors)).toEqual([
      { plaintextSize: BACKUP_PADDING_SIZE + 1, paddingSize: BACKUP_PADDING_SIZE }
    ])
  })

  it('counts an odd-length config or salt as the whole bytes it spans, the half byte rounded up', () => {
    const world = createWorld()
    const base = emptySize(world, 1)
    expect(backupPlaintextSize(oneClause(world, [ecdsaWith(world, hexOf(3))]))).toBe(base + 2)
    expect(backupPlaintextSize(oneClause(world, [ecdsaWith(world, '0x', hexOf(3))]))).toBe(base + 2)
  })

  it('refuses where two odd-length configs, each rounded up, pass the padding size', async () => {
    const world = createWorld()
    const room = BACKUP_PADDING_SIZE - emptySize(world, 2)
    // The two configs' digits fill the room exactly; their two half bytes round up to two bytes.
    const first = 1000
    const draft = draftOver(world, [
      {
        threshold: 1,
        credentials: [
          ecdsaWith(world, hexOf(2 * first + 1)),
          ecdsaWith(world, hexOf(2 * (room - first - 1) + 1))
        ]
      }
    ])
    const { errors } = await (await world.setupClient()).validateSetup(draft)
    expect(tooWide(errors)).toEqual([
      { plaintextSize: BACKUP_PADDING_SIZE + 1, paddingSize: BACKUP_PADDING_SIZE }
    ])
  })
})
