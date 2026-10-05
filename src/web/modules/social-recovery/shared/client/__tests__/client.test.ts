/**
 * The extension builds one client from a configuration naming one chain, the
 * address book of the manager, the methods and the action, and a provider
 * adapter whose four reads route through the extension's own provider. It
 * hands the client no signer and no storage. With no sponsor rail configured,
 * every prepared call is sent from a key the signer holds.
 */
import {
  addressOf,
  DEFAULT_REQUEST_WINDOW,
  MANAGER_DOMAIN_FIELDS,
  PolicyManagerDouble,
  ProviderDouble,
  WalletMethodDouble
} from '@web/modules/social-recovery/sdk-doubles'
import type {
  Configuration,
  DeploymentDescriptor,
  Hex,
  IProvider,
  PreparedBatch,
  PreparedCall
} from '@web/modules/social-recovery/sdk-interfaces'

import {
  buildRecoveryClient,
  CHAIN_IDS,
  CLIENT_CONFIGURATION_KEYS,
  clientConfigurationOf,
  createWorld,
  deploymentDescriptor,
  descriptorOf,
  functionMembersOf,
  isDigestVersionRefusal,
  KeyHandle,
  keysUnder,
  lastArg,
  namesSignerOrStorage,
  providerDoubleReads,
  RECOVERY_CALLS,
  sendingKeyOf,
  spyOnBuilder,
  thrownBy,
  underlyingCalls
} from './harness'

const IPROVIDER_READS = ['block', 'call', 'chainId', 'logs']

afterEach(() => jest.restoreAllMocks())

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

  it('hands the builder double exactly the configuration, the adapter and the descriptor', async () => {
    const spies = spyOnBuilder()
    const world = createWorld()
    await buildRecoveryClient(world.config)

    // One builder, each setter called once.
    expect(spies.provider).toHaveBeenCalledTimes(1)
    expect(spies.descriptor).toHaveBeenCalledTimes(1)
    expect(spies.config).toHaveBeenCalledTimes(1)
    expect(spies.account).toHaveBeenCalledTimes(1)

    expect(lastArg(spies.provider)).toBe(world.config.provider)
    expect(lastArg(spies.descriptor)).toEqual(
      descriptorOf(world.config.chain, world.config.addressBook)
    )
    expect(lastArg(spies.descriptor)).toEqual(deploymentDescriptor(world.config.chain))
    expect(lastArg(spies.config)).toEqual(clientConfigurationOf(world.config))
    expect(lastArg(spies.account)).toBe(world.account)

    // The rest the builder receives is the stand-in SDK's own parts, never the extension's.
    spies.policyManager.mock.calls.forEach(([pm]) => expect(pm).toBeInstanceOf(PolicyManagerDouble))
    expect(spies.method).toHaveBeenCalledTimes(4)
    expect(spies.action).not.toHaveBeenCalled()
    expect(spies.eventManager).not.toHaveBeenCalled()
    expect(spies.codec).not.toHaveBeenCalled()
  })

  it('hands the builder the wallet request window of 24 hours and no token allowlist', async () => {
    const spies = spyOnBuilder()
    const world = createWorld()
    await buildRecoveryClient(world.config)
    const configuration = lastArg(spies.config) as {
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
    const configuration = lastArg(spies.config) as Record<string, unknown>
    Object.keys(configuration).forEach((key) =>
      expect(CLIENT_CONFIGURATION_KEYS as string[]).toContain(key)
    )
  })

  it('hands the client no signer and no storage', async () => {
    const spies = spyOnBuilder()
    const world = createWorld()
    await buildRecoveryClient(world.config)
    const fromTheExtension = [spies.provider, spies.descriptor, spies.account, spies.config]
      .flatMap((spy) => spy.mock.calls.flat())
      .flatMap((value) => keysUnder(value, 3, [world.ethers]))
    expect(fromTheExtension.filter(namesSignerOrStorage)).toEqual([])
  })

  it('routes the construction reads through the extension provider, never the provider double', async () => {
    const doubleReads = providerDoubleReads()
    const world = createWorld()
    await buildRecoveryClient(world.config)
    doubleReads.forEach((spy) => expect(spy).not.toHaveBeenCalled())
    const methods = underlyingCalls(world.ethers).map(([member, args]) =>
      member === 'send' ? args[0] : member
    )
    expect(methods).toContain('eth_chainId')
    expect(methods.every((m) => typeof m === 'string' && m.startsWith('eth_'))).toBe(true)
  })

  it('routes a prepare pin through the extension provider', async () => {
    const world = createWorld()
    const client = await buildRecoveryClient(world.config)
    world.chain.openAttempt()
    world.ethers.getBlock.mockClear()
    await client.recovery.prepareCancelByOwner()
    expect(world.ethers.getBlock).toHaveBeenCalled()
  })

  it('hands the client a provider of the four reads and no send, balance or estimate', async () => {
    const spies = spyOnBuilder()
    const world = createWorld()
    await buildRecoveryClient(world.config)
    const adapter = lastArg(spies.provider) as IProvider
    expect(adapter).not.toBeInstanceOf(ProviderDouble)
    expect(functionMembersOf(adapter).sort()).toEqual(IPROVIDER_READS)
  })

  it('binds the one chain the configuration names and refuses a provider on another', async () => {
    const world = createWorld()
    world.ethers.answeredChainId = 1
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(caught).toBeInstanceOf(Error)
    expect(isDigestVersionRefusal(caught)).toBe(false)
    expect((caught as { check?: string }).check).toBe('chain-id')
  })

  it('builds one set of shared parts: the setup and recovery clients read the same events', async () => {
    const world = createWorld()
    const client = await buildRecoveryClient(world.config)
    expect(client.setup.events).toBe(client.recovery.events)
  })
})

describe("the manager domain's members", () => {
  it('builds the client over the members the doubles serve, written in either case', async () => {
    const world = createWorld()
    await expect(buildRecoveryClient(world.config)).resolves.toBeDefined()

    const upper = createWorld()
    upper.chain.manager.domain.fields = MANAGER_DOMAIN_FIELDS.replace(/[a-f]/g, (c) =>
      c.toUpperCase()
    ) as Hex
    expect(upper.chain.manager.domain.fields).not.toBe(MANAGER_DOMAIN_FIELDS)
    await expect(buildRecoveryClient(upper.config)).resolves.toBeDefined()
  })

  const OTHER_FIELDS: Hex[] = ['0x0e', '0x1f', '0x07', '0x00']
  OTHER_FIELDS.forEach((fields) =>
    it(`refuses a domain carrying the members ${fields} before any client is built`, async () => {
      const builder = spyOnBuilder()
      const world = createWorld()
      world.chain.manager.domain.fields = fields
      const caught = await thrownBy(buildRecoveryClient(world.config))
      expect(isDigestVersionRefusal(caught)).toBe(false)
      expect((caught as { check?: string }).check).toBe('domain-fields')
      expect(builder.buildSetupClient).not.toHaveBeenCalled()
      expect(builder.buildRecoveryClient).not.toHaveBeenCalled()
    })
  )
})

describe('the request window the built client judges', () => {
  it("takes a request window at the SDK's default floor and flags one a second below it", async () => {
    const world = createWorld()
    const client = await buildRecoveryClient(world.config)
    const configuration: Configuration = {
      clauses: [
        {
          threshold: 1,
          credentials: [
            {
              method: world.descriptor.methodEcdsa,
              config: new WalletMethodDouble().codec.encodeConfig({
                address: addressOf('approver')
              })
            }
          ]
        }
      ],
      wait: 432_000n,
      ignoresPause: false
    }
    world.chain.commitSetup({ level: 'public', configuration })
    world.chain.openAttempt()
    const shortWindowFindings = async (window: number) => {
      const gathering = await client.recovery.initCancelGathering(configuration, { window })
      const now = Number(gathering.request.block.timestamp)
      return client.recovery
        .assess(gathering, now)
        .findings.filter((finding) => finding.code === 'request.window-short')
        .map((finding) => finding.values)
    }
    const { floor } = DEFAULT_REQUEST_WINDOW
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
    const descriptor = lastArg(spies.descriptor) as DeploymentDescriptor
    expect(descriptor.action).toBe(other)
    expect(descriptor.auditedActions).toEqual(
      deploymentDescriptor(world.config.chain).auditedActions
    )
    expect(descriptor.auditedActions).not.toContain(other)
  })
})
