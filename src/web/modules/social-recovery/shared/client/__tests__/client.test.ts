/**
 * The extension builds one client from a configuration naming one chain and
 * the address book of the manager, the methods and the action, through the
 * SDK's builder. On a chain with no deployment the builder reads the
 * stand-in's fake node, never the extension's provider. It hands the client
 * no signer and no storage. With no sponsor rail configured, every prepared
 * call is sent from a key the signer holds.
 */
import { PROXY_AMBIRE_ACCOUNT } from '@ambire-common/consts/deploy'
import {
  AmbireActionCodec,
  BUILDER_DOMAIN_FIELDS,
  BUILDER_REQUEST_WINDOW,
  PolicyManager,
  walletMethod
} from '@kohaku-eth/social-recovery'
import type {
  Clause,
  Configuration,
  DeploymentDescriptor,
  Hex,
  PreparedBatch,
  PreparedCall
} from '@kohaku-eth/social-recovery'

import {
  addressOf,
  buildRecoveryClient,
  CHAIN_IDS,
  CLIENT_CONFIGURATION_KEYS,
  clientConfigurationOf,
  createWorld,
  deploymentDescriptor,
  descriptorOf,
  isDigestVersionRefusal,
  KeyHandle,
  keysUnder,
  lastArg,
  namesSignerOrStorage,
  RECOVERY_CALLS,
  sendingKeyOf,
  spyOnBuilder,
  thrownBy
} from '@web/modules/social-recovery/shared/client/__tests__/harness'

afterEach(() => jest.restoreAllMocks())

/** What the builder was built from: the provider, the account, the descriptor and the configuration. */
const inputsOf = (spies: ReturnType<typeof spyOnBuilder>) =>
  lastArg(spies.from) as {
    provider: unknown
    account: unknown
    descriptor: DeploymentDescriptor
    configuration: Record<string, unknown>
  }

const guardianConfig = (): Hex =>
  walletMethod().codec.encodeConfig({ signer: addressOf('approver') })

describe('buildRecoveryClient', () => {
  it('builds one client from a configuration naming one chain and the address book', async () => {
    const world = createWorld()
    const client = await buildRecoveryClient(world.config)
    expect(client.chain).toBe(world.config.chain)
    expect(client.account).toBe(world.account)
    expect(client.descriptor.chainId).toBe(CHAIN_IDS[world.config.chain])
    expect(client.descriptor.manager).toBe(world.config.addressBook.manager)
    expect(client.descriptor.action).toBe(world.config.addressBook.action)
    expect(typeof client.recovery.recoveryState).toBe('function')
    expect(typeof client.recovery.prepareStartAttempt).toBe('function')
    expect(typeof client.setup.prepareCommitSetup).toBe('function')
  })

  it("hands the builder the stand-in's node, the descriptor, the account and the configuration, once", async () => {
    const spies = spyOnBuilder()
    const world = createWorld()
    await buildRecoveryClient(world.config)

    expect(spies.from).toHaveBeenCalledTimes(1)
    const inputs = inputsOf(spies)
    expect(inputs.provider).toBe(world.chain)
    expect(inputs.descriptor).toEqual(descriptorOf(world.config.chain, world.config.addressBook))
    expect(inputs.descriptor).toEqual(deploymentDescriptor(world.config.chain))
    expect(inputs.configuration).toEqual({
      ...clientConfigurationOf(world.config),
      accountImplementation: PROXY_AMBIRE_ACCOUNT
    })
    expect(inputs.account).toBe(world.account)
  })

  it("hands the builder the SDK's own parts: its policy manager, the action codec and the two shipped methods", async () => {
    const spies = spyOnBuilder()
    const world = createWorld()
    await buildRecoveryClient(world.config)

    expect(spies.withPolicyManager).toHaveBeenCalledTimes(1)
    expect(lastArg(spies.withPolicyManager)).toBeInstanceOf(PolicyManager)
    expect(spies.withCodec).toHaveBeenCalledTimes(1)
    expect(lastArg(spies.withCodec)).toBeInstanceOf(AmbireActionCodec)
    expect(spies.withMethod).toHaveBeenCalledTimes(2)
    expect(spies.withEventManager).toHaveBeenCalledWith({
      logChunkSize: clientConfigurationOf(world.config).logChunkSize
    })
    expect(spies.withSignerRecovery).toHaveBeenCalledTimes(1)
    expect(spies.withRecoveryAction).not.toHaveBeenCalled()
  })

  it('keeps an account implementation the configuration names', async () => {
    const spies = spyOnBuilder()
    const implementation = addressOf('other-implementation')
    const world = createWorld({ accountImplementation: implementation })
    await buildRecoveryClient(world.config)
    const { configuration } = inputsOf(spies)
    expect(configuration.accountImplementation).toBe(implementation)
    expect(configuration.accountImplementation).not.toBe(PROXY_AMBIRE_ACCOUNT)
  })

  it('hands the builder the wallet request window of 24 hours and no token allowlist', async () => {
    const spies = spyOnBuilder()
    const world = createWorld()
    await buildRecoveryClient(world.config)
    const configuration = inputsOf(spies).configuration as {
      requestWindow?: { default: number }
      tokens?: unknown[]
    }
    expect(configuration.requestWindow?.default).toBe(86400)
    expect(configuration.tokens).toEqual([])
  })

  it('hands the builder a client configuration of the ClientConfiguration members alone', async () => {
    const spies = spyOnBuilder()
    const world = createWorld()
    await buildRecoveryClient(world.config)
    Object.keys(inputsOf(spies).configuration).forEach((key) =>
      expect(CLIENT_CONFIGURATION_KEYS as string[]).toContain(key)
    )
  })

  it('hands the client no signer and no storage', async () => {
    const spies = spyOnBuilder()
    const world = createWorld()
    await buildRecoveryClient(world.config)
    const { account, descriptor, configuration } = inputsOf(spies)
    const fromTheExtension = [account, descriptor, configuration].flatMap((value) =>
      keysUnder(value, 3, [world.ethers])
    )
    expect(fromTheExtension.filter(namesSignerOrStorage)).toEqual([])
  })

  it("reads the construction over the stand-in's node, never the extension provider", async () => {
    const world = createWorld()
    const chainId = jest.spyOn(world.chain, 'chainId')
    await buildRecoveryClient(world.config)
    expect(chainId).toHaveBeenCalled()
    expect(world.ethers.send).not.toHaveBeenCalled()
    expect(world.ethers.call).not.toHaveBeenCalled()
  })

  it("pins a prepare over the stand-in's node", async () => {
    const world = createWorld()
    const client = await buildRecoveryClient(world.config)
    await world.chain.commitSetup(
      { clauses: [{ threshold: 1, credentials: [] }], wait: 432_000, ignoresPause: false },
      { publicMetadata: '0x', backup: 'empty' }
    )
    world.chain.openAttempt()
    const block = jest.spyOn(world.chain, 'block')
    await client.recovery.prepareCancelByOwner()
    expect(block).toHaveBeenCalled()
    expect(world.ethers.getBlock).not.toHaveBeenCalled()
  })

  it("reads a block's time over the stand-in's node, never the extension provider, and fails where the node cannot answer", async () => {
    const world = createWorld()
    const client = await buildRecoveryClient(world.config)
    const earlier = world.chain.mine()
    world.chain.mine()
    expect(await client.walletReads.blockTime(earlier.number)).toBe(earlier.timestamp)
    expect(world.ethers.getBlock).not.toHaveBeenCalled()

    world.chain.failRead('block')
    expect(await thrownBy(client.walletReads.blockTime(earlier.number))).toBeInstanceOf(Error)
  })

  it('binds the one chain the configuration names and refuses a node on another', async () => {
    const world = createWorld()
    world.chain.setChainId(1)
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(caught).toBeInstanceOf(Error)
    expect(isDigestVersionRefusal(caught)).toBe(false)
  })

  it('builds one set of shared parts: the setup and recovery clients read the same events', async () => {
    const world = createWorld()
    const client = await buildRecoveryClient(world.config)
    expect(client.setup.events).toBe(client.recovery.events)
  })
})

describe("the manager domain's members", () => {
  it('builds the client over the members the SDK serves, written in either case', async () => {
    const world = createWorld()
    await expect(buildRecoveryClient(world.config)).resolves.toBeDefined()

    const upper = createWorld()
    const fields = BUILDER_DOMAIN_FIELDS.replace(/[a-f]/g, (c) => c.toUpperCase()) as Hex
    expect(fields).not.toBe(BUILDER_DOMAIN_FIELDS)
    upper.chain.setDomain({ fields })
    await expect(buildRecoveryClient(upper.config)).resolves.toBeDefined()
  })

  const OTHER_FIELDS: Hex[] = ['0x0e', '0x1f', '0x07', '0x00']
  OTHER_FIELDS.forEach((fields) =>
    it(`refuses a domain carrying the members ${fields} before any client is built`, async () => {
      const builder = spyOnBuilder()
      const world = createWorld()
      world.chain.setDomain({ fields })
      const caught = await thrownBy(buildRecoveryClient(world.config))
      expect(caught).toBeInstanceOf(Error)
      expect(isDigestVersionRefusal(caught)).toBe(false)
      expect(builder.buildRecoveryClient).not.toHaveBeenCalled()
    })
  )
})

describe('the fit check the built client runs against the account implementation', () => {
  const draftOf = (world: ReturnType<typeof createWorld>, extraClauses: Clause[] = []) => ({
    wait: 432_000,
    clauses: [
      {
        threshold: 1,
        credentials: [{ method: world.descriptor.methodEcdsa, config: guardianConfig() }]
      },
      ...extraClauses
    ],
    ignoresPause: false,
    privacy: { publicMetadata: '0x', backup: 'encrypted' } as const
  })

  const fitFindings = async (world: ReturnType<typeof createWorld>, hasCode = false) => {
    const client = await buildRecoveryClient(world.config)
    world.chain.setHasCode(hasCode)
    const result = await client.setup.validateSetup(draftOf(world))
    const codes = (findings: readonly { code: string }[]) =>
      findings.map((finding) => finding.code).filter((code) => code.startsWith('action.'))
    return { errors: codes(result.errors), warnings: codes(result.warnings) }
  }

  it('finds the default configuration fits an account with no code yet', async () => {
    await expect(fitFindings(createWorld())).resolves.toEqual({ errors: [], warnings: [] })
  })

  it('refuses an account implementation the action does not serve', async () => {
    const world = createWorld({ accountImplementation: addressOf('other-implementation') })
    await expect(fitFindings(world)).resolves.toEqual({
      errors: ['action.unsupported'],
      warnings: []
    })
  })

  it('rejects the validation, with no result, where the fit check cannot read the implementation the action serves', async () => {
    const world = createWorld()
    const client = await buildRecoveryClient(world.config)
    world.chain.setHasCode(false)
    world.chain.failRead('AMBIRE_IMPLEMENTATION')
    expect(await thrownBy(client.setup.validateSetup(draftOf(world)))).toBeInstanceOf(Error)

    world.chain.restoreRead('AMBIRE_IMPLEMENTATION')
    const result = await client.setup.validateSetup(draftOf(world))
    expect(result.errors.map(({ code }) => code)).not.toContain('action.unsupported')
  })

  it('keeps every other error of the draft while it drops the unsupported account of an account with no code yet', async () => {
    const world = createWorld()
    const client = await buildRecoveryClient(world.config)
    world.chain.setHasCode(false)
    const result = await client.setup.validateSetup(
      draftOf(world, [{ threshold: 1, credentials: [] }])
    )
    const codes = result.errors.map(({ code }) => code)
    expect(codes).toContain('clause.empty')
    expect(codes).not.toContain('action.unsupported')
  })

  it('refuses a deployed account the action answers it does not serve, whatever the implementation named', async () => {
    const world = createWorld()
    world.chain.supportsAccount = false
    await expect(fitFindings(world, true)).resolves.toEqual({
      errors: ['action.unsupported'],
      warnings: []
    })
  })
})

describe('the request window the built client judges', () => {
  it("takes a request window at the SDK's default floor and flags one a second below it", async () => {
    const world = createWorld()
    const client = await buildRecoveryClient(world.config)
    const configuration: Configuration = {
      clauses: [
        {
          threshold: 1,
          credentials: [{ method: world.descriptor.methodEcdsa, config: guardianConfig() }]
        }
      ],
      wait: 432_000,
      ignoresPause: false
    }
    await world.chain.commitSetup(configuration, { publicMetadata: '0x', backup: 'clear' })
    world.chain.openAttempt()
    const shortWindowFindings = async (window: number) => {
      const gathering = await client.recovery.initCancelGathering(configuration, { window })
      const now = Number(gathering.request.block.timestamp)
      return client.recovery
        .assess(gathering, now)
        .findings.filter((finding) => finding.code === 'request.window-short')
        .map((finding) => finding.values)
    }
    const { floor } = BUILDER_REQUEST_WINDOW
    await expect(shortWindowFindings(floor)).resolves.toEqual([])
    await expect(shortWindowFindings(floor - 1)).resolves.toEqual([{ window: floor - 1, floor }])
  })
})

describe('with no rail configured, every prepared call is sent from a key the signer holds', () => {
  const accountKey: KeyHandle = { addr: addressOf('controlling-key'), type: 'internal' }
  const recovererKey: KeyHandle = { addr: addressOf('recoverer-key'), type: 'internal' }
  const block = { number: 1, hash: `0x${'00'.repeat(32)}` as const }
  const call = (sender: 'account' | 'anyone'): PreparedCall => ({
    kind: 'call',
    target: addressOf('manager'),
    value: 0n,
    data: '0x',
    sender,
    block
  })

  it("sends the account's own operations from its controlling key", async () => {
    const world = createWorld()
    const client = await buildRecoveryClient(world.config)
    world.chain.openAttempt()
    const cancel = await client.recovery.prepareCancelByOwner()
    expect(cancel.sender).toBe('account')
    expect(sendingKeyOf(cancel, { accountKey, recovererKey })).toEqual(accountKey)
  })

  it("sends the two recovery calls, the submission and the execution, from the recoverer's own key", () => {
    expect(RECOVERY_CALLS).toEqual(['submission', 'execution'])
    RECOVERY_CALLS.forEach((recoveryCall) =>
      expect(sendingKeyOf(call('anyone'), { accountKey, recovererKey }, recoveryCall)).toEqual(
        recovererKey
      )
    )
  })

  it('names no key for a call anyone may send that is not a recovery call, such as the cancel by proofs', () => {
    expect(() => sendingKeyOf(call('anyone'), { accountKey, recovererKey })).toThrow()
  })

  it('sends a prepared batch of account calls, one account transaction, from the controlling key', () => {
    const batch: PreparedBatch = {
      kind: 'batch',
      calls: [call('account'), call('account')],
      atomic: true,
      block
    }
    expect(sendingKeyOf(batch, { accountKey, recovererKey })).toEqual(accountKey)
  })

  it('refuses a batch that carries a call whose sender is not the account', () => {
    const keys = { accountKey, recovererKey }
    const mixed: PreparedBatch = {
      kind: 'batch',
      calls: [call('account'), call('anyone')],
      atomic: true,
      block
    }
    const foreign: PreparedBatch = { kind: 'batch', calls: [call('anyone')], atomic: true, block }
    expect(() => sendingKeyOf(mixed, keys)).toThrow()
    expect(() => sendingKeyOf(foreign, keys)).toThrow()
  })

  it('names no sender where the role key is missing, rather than another key', () => {
    expect(() => sendingKeyOf(call('anyone'), { accountKey }, 'submission')).toThrow()
    expect(() => sendingKeyOf(call('account'), { recovererKey })).toThrow()
  })

  it('never answers a sender outside the keys it was given', () => {
    const keys = { accountKey, recovererKey }
    expect([accountKey, recovererKey]).toContainEqual(sendingKeyOf(call('account'), keys))
    expect([accountKey, recovererKey]).toContainEqual(
      sendingKeyOf(call('anyone'), keys, 'execution')
    )
  })
})

describe('an address book naming another action', () => {
  it('keeps the shipped audited sets rather than widening them', async () => {
    const other = addressOf('another-action')
    const base = createWorld()
    const book = { ...base.config.addressBook, action: other }
    const world = createWorld({ addressBook: book })
    const spies = spyOnBuilder()
    await buildRecoveryClient(world.config)
    const { descriptor } = inputsOf(spies)
    expect(descriptor.action).toBe(other)
    expect(descriptor.auditedActions).toEqual(
      deploymentDescriptor(world.config.chain).auditedActions
    )
    expect(descriptor.auditedActions).not.toContain(other)
  })
})
