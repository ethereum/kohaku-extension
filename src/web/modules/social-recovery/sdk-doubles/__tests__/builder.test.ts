import {
  addressOf,
  defaultClientConfiguration,
  type CodedError,
  type RecoveryKitBuilderDouble
} from '@web/modules/social-recovery/sdk-doubles'
import type {
  BlockRange,
  ClientConfiguration,
  DeploymentDescriptor,
  Hex,
  IMethodModuleReads,
  IProvider,
  IRecoveryActionInteractor,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'

import {
  BUILD_PATHS,
  type BuildPath,
  createWorld,
  eachIt,
  membersOf,
  momentOf,
  NO_PAYMENT,
  WINDOW,
  World
} from '@web/modules/social-recovery/sdk-doubles/__tests__/harness'

/** The code a build path refuses with, thrown or rejected; undefined where it builds. */
const refusalCode = async (
  builder: RecoveryKitBuilderDouble,
  path: BuildPath
): Promise<string | undefined> => {
  try {
    await BUILD_PATHS[path](builder)
    return undefined
  } catch (e) {
    return (e as CodedError).code
  }
}

const PATHS = Object.keys(BUILD_PATHS) as BuildPath[]

const MANAGER_ONLY = [
  'stateOf',
  'hashApproval',
  'hashCancel',
  'eip712Domain',
  'prepareCommitSetup',
  'prepareClearSetup',
  'prepareStartAttempt',
  'prepareCancelByProofs',
  'prepareCancelByOwner',
  'prepareCancelByVeto'
]

describe('builder double', () => {
  it('builds the two clients and the orchestrator', async () => {
    const world = createWorld()
    const builder = world.builder()
    const setup = await builder.buildSetupClient()
    const recovery = await builder.buildRecoveryClient()
    expect(typeof setup.setupState).toBe('function')
    expect(typeof recovery.recoveryState).toBe('function')
    expect(setup.events).toBe(recovery.events)
    expect(typeof builder.buildMethodsOrchestrator().describeRequest).toBe('function')
  })

  it('hands out the module reads alone, never the manager’s prepares', async () => {
    const reads: IMethodModuleReads = await createWorld().builder().methodModuleReads()
    expect(typeof reads.moduleInfo).toBe('function')
    expect(typeof reads.paused).toBe('function')
    expect(typeof reads.trustedParties).toBe('function')
    const members = membersOf(reads)
    MANAGER_ONLY.forEach((name) => expect(members).not.toContain(name))
    expect(members.filter((m) => m.startsWith('prepare'))).toEqual([])
    expect(members).not.toContain('armingCall')
  })

  it('hands out the action interactor alone, never the arming seam', async () => {
    const action: IRecoveryActionInteractor = await createWorld().builder().recoveryAction()
    ;['supportsAccount', 'isAuthority', 'isAuthorized', 'holdsAnyPrivilege', 'actionInfo'].forEach(
      (name) => expect(typeof (action as unknown as Record<string, unknown>)[name]).toBe('function')
    )
    const members = membersOf(action)
    expect(members).not.toContain('armingCall')
    expect(members.filter((m) => m.startsWith('prepare'))).toEqual([])
    expect((action as unknown as Record<string, unknown>).armingCall).toBeUndefined()
  })

  it('supplies the shipped codec for the chain’s own action when none is registered', async () => {
    const world = createWorld()
    const committed = world.script.setupCommitted('private')
    world.script.authorized(true)
    const recovery = await world
      .builder()
      .action(world.descriptor.action, world.actionPart)
      .buildRecoveryClient()
    const gathering = await recovery.initRecoveryGathering(
      committed.configuration,
      { newAuthority: world.keys.fresh, removedAuthority: world.keys.held },
      NO_PAYMENT,
      { window: WINDOW }
    )
    expect(gathering.request.payload).toBe(
      world.codec.encode({ newAuthority: world.keys.fresh, removedAuthority: world.keys.held })
    )
    world.chain.openAttempt({ ready: true, payload: gathering.request.payload })
    const { attempt } = await recovery.recoveryState()
    const execute = await recovery.prepareExecuteHandover(attempt, gathering.request.payload!)
    // The consume, the grant and the revoke: the payload decoded under the action's codec.
    expect(execute.describes).toHaveLength(3)
    expect(execute.simulation?.ok).toBe(true)
  })

  it('refuses a domain whose chain id differs from the descriptor’s only beyond 2^53', async () => {
    const world = createWorld({ descriptor: { chainId: 2 ** 53 } })
    expect(await refusalCode(world.builder(), 'buildSetupClient')).toBeUndefined()
    const { domain } = world.chain.manager
    world.chain.manager.domain = { ...domain, chainId: 2n ** 53n + 1n }
    expect(Number(world.chain.manager.domain.chainId)).toBe(world.descriptor.chainId)
    expect(await refusalCode(world.builder(), 'buildSetupClient')).toBe('construction.domain')
  })

  describe('a manager domain whose fields bitmap is not the one the chain serves', () => {
    const CHAIN_PATHS = PATHS.filter((path) => path !== 'buildMethodsOrchestrator')

    eachIt([
      ['a bitmap that adds the salt', '0x1f'],
      ['a bitmap that drops the name', '0x0e']
    ] as const)(
      'refuses %s as domain-fields on every path that reads the chain',
      async ([, fields]) => {
        const world = createWorld()
        world.chain.manager.domain = { ...world.chain.manager.domain, fields }
        const codes = await Promise.all(
          CHAIN_PATHS.map((path) => refusalCode(world.builder(), path))
        )
        expect(codes).toEqual(CHAIN_PATHS.map(() => 'construction.domain-fields'))
      }
    )

    it('builds where the served bitmap differs in letter case alone', async () => {
      const world = createWorld()
      const { domain } = world.chain.manager
      const fields = `0x${domain.fields.slice(2).toUpperCase()}` as Hex
      expect(fields).not.toBe(domain.fields)
      world.chain.manager.domain = { ...domain, fields }
      expect(await refusalCode(world.builder(), 'buildSetupClient')).toBeUndefined()
    })
  })

  eachIt(PATHS)('refuses a foreign account on %s', async (path) => {
    const world = createWorld()
    const builder = world.builder()
    builder.account(world.keys.fresh)
    expect(await refusalCode(builder, path)).toBe('construction.account')
  })

  describe('a descriptor the scripted chain does not serve', () => {
    // The client paths run the provider and domain checks first, so a wrong
    // network reads as chain-id or domain there; the orchestrator reads no
    // chain, so it refuses the descriptor as unserved.
    const mismatches: [string, (d: DeploymentDescriptor) => DeploymentDescriptor, string][] = [
      ['chain id', (d) => ({ ...d, chainId: d.chainId + 1 }), 'construction.chain-id'],
      ['manager', (d) => ({ ...d, manager: addressOf('another-manager') }), 'construction.domain'],
      ['action', (d) => ({ ...d, action: addressOf('another-action') }), 'construction.unserved']
    ]
    mismatches.forEach(([field, mismatch, clientCode]) =>
      eachIt(PATHS)(`is refused on %s for its ${field}`, async (path) => {
        const world = createWorld()
        const builder = world.builder()
        builder.descriptor(mismatch(world.descriptor))
        const expected = path === 'buildMethodsOrchestrator' ? 'construction.unserved' : clientCode
        expect(await refusalCode(builder, path)).toBe(expected)
      })
    )
  })

  eachIt(PATHS)(
    'refuses an action address the scripted chain does not serve on %s',
    async (path) => {
      const world = createWorld()
      const builder = world.builder()
      builder.action(addressOf('another-action'), world.actionPart)
      expect(await refusalCode(builder, path)).toBe('construction.unserved')
    }
  )

  describe('a provider on another network', () => {
    const answering = (world: World, chainId: number): IProvider => ({
      chainId: async () => chainId,
      call: (to, data, from, tag) => world.provider.call(to, data, from, tag),
      logs: (filter, range) => world.provider.logs(filter, range),
      block: (tag) => world.provider.block(tag)
    })

    it('is refused as chain-id when it answers another chain than the descriptor', async () => {
      const world = createWorld()
      const builder = world.builder()
      builder.provider(answering(world, world.descriptor.chainId + 1))
      expect(await refusalCode(builder, 'buildSetupClient')).toBe('construction.chain-id')
      expect(await refusalCode(world.builder(), 'buildSetupClient')).toBeUndefined()
    })

    it('is refused as domain when it and the descriptor agree on a chain the manager is not on', async () => {
      const world = createWorld()
      const foreign = world.descriptor.chainId + 1
      const builder = world.builder()
      builder.provider(answering(world, foreign))
      builder.descriptor({ ...world.descriptor, chainId: foreign })
      expect(await refusalCode(builder, 'buildRecoveryClient')).toBe('construction.domain')
    })
  })

  it('builds on every path for the chain’s own deployment, account and action', async () => {
    const world = createWorld()
    const codes = await Promise.all(
      PATHS.map((path) =>
        refusalCode(
          world
            .builder()
            .account(world.account)
            .action(world.descriptor.action, world.actionPart) as RecoveryKitBuilderDouble,
          path
        )
      )
    )
    expect(codes).toEqual(PATHS.map(() => undefined))
  })

  it('refuses a setter after the first build, recoveryAction and methodModuleReads counting as builds', async () => {
    const world = createWorld()
    const afterAction = world.builder()
    await afterAction.recoveryAction()
    expect(() => afterAction.account(world.keys.fresh)).toThrow()
    const afterReads = world.builder()
    await afterReads.methodModuleReads()
    expect(() => afterReads.method(world.methods.wallet)).toThrow()
    const afterSetup = world.builder()
    await afterSetup.buildSetupClient()
    expect(() =>
      afterSetup.config({
        tokens: [],
        candidateKeys: [],
        blockTags: { read: 'latest', watch: 'finalized' }
      })
    ).toThrow()
  })
})

describe('a client over a configuration that names no timing, cost or chunk numbers', () => {
  const defaults = defaultClientConfiguration()
  const BARE: ClientConfiguration = { tokens: [], candidateKeys: [] }
  const bareSetup = (world: World) => world.builder().config(BARE).buildSetupClient()
  const waiting = (world: World, wait: bigint): SetupDraft => ({ ...world.draft('private'), wait })
  const valuesOf = (findings: { code: string; values: Record<string, unknown> }[], code: string) =>
    findings.filter((f) => f.code === code).map((f) => f.values)

  it('warns a wait below the default short-wait bound, and not a wait at it', async () => {
    const world = createWorld()
    const setup = await bareSetup(world)
    const bound = BigInt(defaults.shortWaitBelow!)
    const below = await setup.validateSetup(waiting(world, bound - 1n))
    expect(valuesOf(below.warnings, 'setup.wait-short')).toEqual([
      { wait: bound - 1n, minimum: bound }
    ])
    const at = await setup.validateSetup(waiting(world, bound))
    expect(valuesOf(at.warnings, 'setup.wait-short')).toEqual([])
  })

  it('refuses a wait above the default maximum, and not a wait at it', async () => {
    const world = createWorld()
    const setup = await bareSetup(world)
    const maximum = BigInt(defaults.maximumWait!)
    const above = await setup.validateSetup(waiting(world, maximum + 1n))
    expect(valuesOf(above.errors, 'wait.above-maximum')).toEqual([{ wait: maximum + 1n, maximum }])
    const at = await setup.validateSetup(waiting(world, maximum))
    expect(valuesOf(at.errors, 'wait.above-maximum')).toEqual([])
  })

  it('refuses a rule whose costliest set passes the default cost bound, and not one at it', async () => {
    const world = createWorld()
    const setup = await bareSetup(world)
    const bound = defaults.ruleCostBound!
    const single = world.configuration.clauses[1]!
    const draft: SetupDraft = { ...world.draft('private'), clauses: [single] }
    const ecdsa = world.descriptor.methodEcdsa.toLowerCase()
    world.chain.verifyCosts.set(ecdsa, bound)
    expect(valuesOf((await setup.validateSetup(draft)).errors, 'rule.too-wide')).toEqual([])
    world.chain.verifyCosts.set(ecdsa, bound + 1n)
    const wide = valuesOf((await setup.validateSetup(draft)).errors, 'rule.too-wide')
    expect(wide.map((v) => [v.cost, v.bound])).toEqual([[bound + 1n, bound]])
  })

  it('describes the default wait', async () => {
    const world = createWorld()
    const described = await (await bareSetup(world)).describeSetup(world.draft('private'))
    expect(described.wait.defaultSeconds).toBe(BigInt(defaults.defaultWait!))
  })

  it('judges a request window against the default floor', async () => {
    const world = createWorld()
    const committed = world.script.setupCommitted('private')
    world.script.authorized(true)
    const recovery = await world.builder().config(BARE).buildRecoveryClient()
    const floor = defaults.requestWindow!.floor
    const open = (window: number) =>
      recovery.initRecoveryGathering(
        committed.configuration,
        { newAuthority: world.keys.fresh, removedAuthority: world.keys.held },
        NO_PAYMENT,
        { window }
      )
    const short = await open(floor - 1)
    expect(
      valuesOf(recovery.assess(short, momentOf(short)).findings, 'request.window-short')
    ).toEqual([{ window: floor - 1, floor }])
    const enough = await open(floor)
    expect(
      valuesOf(recovery.assess(enough, momentOf(enough)).findings, 'request.window-short')
    ).toEqual([])
  })

  it('reads logs in chunks of the default width', async () => {
    const world = createWorld()
    const ranges: BlockRange[] = []
    const recording: IProvider = {
      chainId: () => world.provider.chainId(),
      call: (to, data, from, tag) => world.provider.call(to, data, from, tag),
      logs: (filter, range) => {
        ranges.push(range)
        return world.provider.logs(filter, range)
      },
      block: (tag) => world.provider.block(tag)
    }
    const setup = await world.builder().provider(recording).config(BARE).buildSetupClient()
    const width = defaults.logChunkWidth!
    ranges.length = 0
    await setup.events.fetch(setup.events.accountFilter(), { from: 0, to: 2 * width })
    expect(ranges).toEqual([
      { from: 0, to: width - 1 },
      { from: width, to: 2 * width - 1 },
      { from: 2 * width, to: 2 * width }
    ])
  })
})
