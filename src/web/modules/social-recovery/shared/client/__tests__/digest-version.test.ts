/**
 * The digest version the manager publishes through its domain is checked when
 * the client is built. A disagreement refuses the client before anything is
 * prepared, as the "update the wallet" state of the account step.
 */
import { PolicyManagerDouble, ScriptedReadFailure } from '@web/modules/social-recovery/sdk-doubles'
import * as descriptors from '@web/modules/social-recovery/shared/client/descriptors'

import {
  buildRecoveryClient,
  createWorld,
  DigestVersionRefusal,
  isDigestVersionRefusal,
  MANAGER_DOMAIN_NAME,
  RecoveryClientConfiguration,
  sdkStandIn,
  spyOnBuilder,
  spyOnPrepares,
  thrownBy
} from './harness'

afterEach(() => jest.restoreAllMocks())

describe('the digest-version check', () => {
  it('builds the client when the manager domain carries the descriptor digest version', async () => {
    const world = createWorld()
    expect(world.chain.manager.domain.version).toBe(world.descriptor.digestVersion)
    expect(world.chain.manager.domain.name).toBe(MANAGER_DOMAIN_NAME)
    const client = await buildRecoveryClient(world.config)
    expect(typeof client.recovery.prepareStartAttempt).toBe('function')
  })

  it('refuses the client with the typed refusal the account step draws as update the wallet', async () => {
    const world = createWorld()
    world.chain.manager.domain.version = `${world.descriptor.digestVersion}-other`
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(isDigestVersionRefusal(caught)).toBe(true)
    const refusal = caught as DigestVersionRefusal
    expect(refusal).toBeInstanceOf(Error)
    expect(refusal.name).toBe('DigestVersionRefusal')
    expect(refusal.state).toBe('update-the-wallet')
    expect(refusal.carried).toEqual({
      name: MANAGER_DOMAIN_NAME,
      version: world.descriptor.digestVersion
    })
    expect(refusal.published).toEqual({
      name: MANAGER_DOMAIN_NAME,
      version: `${world.descriptor.digestVersion}-other`
    })
  })

  it('refuses a domain whose name is not PolicyManager the same way', async () => {
    const world = createWorld()
    world.chain.manager.domain.name = 'SomeOtherManager'
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(isDigestVersionRefusal(caught)).toBe(true)
  })

  it('refuses before any prepare is possible: no build ran and no prepare member was called', async () => {
    const prepares = spyOnPrepares()
    const builder = spyOnBuilder()
    const world = createWorld()
    world.chain.manager.domain.version = '999'
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(isDigestVersionRefusal(caught)).toBe(true)
    expect(prepares.length).toBeGreaterThan(0)
    prepares.forEach((spy) => expect(spy).not.toHaveBeenCalled())
    expect(builder.buildSetupClient).not.toHaveBeenCalled()
    expect(builder.buildRecoveryClient).not.toHaveBeenCalled()
    expect(builder.recoveryAction).not.toHaveBeenCalled()
    expect(builder.methodModuleReads).not.toHaveBeenCalled()
  })

  it("surfaces a disagreement the builder's own construction check finds as the same typed refusal", async () => {
    const prepares = spyOnPrepares()
    const world = createWorld()
    const original = PolicyManagerDouble.prototype.eip712Domain
    // The client's own read sees the carried version; the builder's read, the next one, sees another.
    jest
      .spyOn(PolicyManagerDouble.prototype, 'eip712Domain')
      .mockImplementationOnce(function first(this: PolicyManagerDouble) {
        return original.call(this)
      })
      .mockImplementation(async function later(this: PolicyManagerDouble) {
        const domain = await original.call(this)
        return { ...domain, version: 'moved' }
      })
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(isDigestVersionRefusal(caught)).toBe(true)
    expect((caught as DigestVersionRefusal).state).toBe('update-the-wallet')
    prepares.forEach((spy) => expect(spy).not.toHaveBeenCalled())
  })

  it('does not read a failed domain read as a version disagreement', async () => {
    const world = createWorld()
    world.chain.failRead('manager.eip712Domain')
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(caught).toBeInstanceOf(ScriptedReadFailure)
    expect(isDigestVersionRefusal(caught)).toBe(false)
  })

  describe('runs after the provider chain check and the domain check', () => {
    it('reads a provider on another chain as the chain-id refusal, even where the version also differs', async () => {
      const world = createWorld()
      world.ethers.answeredChainId = 1
      world.chain.manager.domain.version = 'other'
      const caught = await thrownBy(buildRecoveryClient(world.config))
      expect(caught).toBeInstanceOf(Error)
      expect(isDigestVersionRefusal(caught)).toBe(false)
      expect((caught as { check?: string }).check).toBe('chain-id')
    })

    it('reads a manager on another chain as a construction refusal, not as update the wallet', async () => {
      const world = createWorld()
      world.chain.manager.domain.chainId = 1n
      world.chain.manager.domain.version = 'other'
      const caught = await thrownBy(buildRecoveryClient(world.config))
      expect(caught).toBeInstanceOf(Error)
      expect(isDigestVersionRefusal(caught)).toBe(false)
      expect((caught as { check?: string }).check).toBe('domain')
    })

    it('reads a domain whose verifying contract is another manager as a construction refusal', async () => {
      const world = createWorld()
      world.chain.manager.domain.verifyingContract = '0x0000000000000000000000000000000000c7ffff'
      world.chain.manager.domain.version = 'other'
      const caught = await thrownBy(buildRecoveryClient(world.config))
      expect(isDigestVersionRefusal(caught)).toBe(false)
      expect((caught as { check?: string }).check).toBe('domain')
    })
  })

  it('does not read another construction refusal as a version disagreement', async () => {
    const world = createWorld()
    world.chain.manager.domain.fields = '0x1f'
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(caught).toBeInstanceOf(Error)
    expect(isDigestVersionRefusal(caught)).toBe(false)
    expect((caught as { check?: string }).check).toBe('domain-fields')
  })
})

describe('a chain id beyond 2^53, where a number can no longer tell two ids apart', () => {
  const LARGE = 2 ** 53

  /** A configuration whose descriptor names chain 2^53, over a manager whose domain names `domainChainId`. */
  const onLargeChain = (domainChainId: bigint): RecoveryClientConfiguration => {
    const world = createWorld()
    const { descriptorOf } = descriptors
    jest
      .spyOn(descriptors, 'descriptorOf')
      .mockImplementation((chain, book) => ({ ...descriptorOf(chain, book), chainId: LARGE }))
    const descriptor = descriptors.descriptorOf(world.config.chain, world.config.addressBook)
    const chain = sdkStandIn.chainFor(descriptor, world.account)
    chain.manager.domain.chainId = domainChainId
    return { ...world.config, provider: sdkStandIn.providerFor(chain) }
  }

  it("refuses a domain chain id one above the descriptor's with the client's own check, before any build", async () => {
    const config = onLargeChain(2n ** 53n + 1n)
    const builder = spyOnBuilder()
    const caught = await thrownBy(buildRecoveryClient(config))
    expect(isDigestVersionRefusal(caught)).toBe(false)
    expect((caught as { check?: string }).check).toBe('domain')
    expect(builder.buildSetupClient).not.toHaveBeenCalled()
    expect(builder.buildRecoveryClient).not.toHaveBeenCalled()
  })

  it('builds the client when the domain carries the exact chain id', async () => {
    const config = onLargeChain(2n ** 53n)
    const client = await buildRecoveryClient(config)
    expect(client.descriptor.chainId).toBe(LARGE)
  })
})
