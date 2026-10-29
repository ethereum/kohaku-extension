/**
 * The digest version the manager publishes through its domain is checked when
 * the client is built. A disagreement refuses the client before anything is
 * prepared, as the "update the wallet" state of the account step.
 */
import {
  BUILDER_CHAIN_MISMATCH_MESSAGE,
  BUILDER_DOMAIN_CHAIN_MESSAGE,
  BUILDER_DOMAIN_FIELDS_MESSAGE,
  BUILDER_VERIFYING_CONTRACT_MESSAGE,
  FORMATS_DIGEST_DOMAIN_NAME,
  PolicyManager
} from '@kohaku-eth/social-recovery'
import * as descriptors from '@web/modules/social-recovery/shared/client/descriptors'

import {
  buildRecoveryClient,
  createWorld,
  DigestVersionRefusal,
  isDigestVersionRefusal,
  isProviderReadFailure,
  RecoveryClientConfiguration,
  sdkStandIn,
  SEPOLIA,
  spyOnBuilder,
  spyOnPrepares,
  thrownBy
} from '@web/modules/social-recovery/shared/client/__tests__/harness'

afterEach(() => jest.restoreAllMocks())

describe('the digest-version check', () => {
  it('builds the client when the manager domain carries the descriptor digest version', async () => {
    const world = createWorld()
    const client = await buildRecoveryClient(world.config)
    expect(typeof client.recovery.prepareStartAttempt).toBe('function')
  })

  it('refuses the client with the typed refusal the account step draws as update the wallet', async () => {
    const world = createWorld()
    world.chain.setDomain({ version: `${world.descriptor.digestVersion}-other` })
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(isDigestVersionRefusal(caught)).toBe(true)
    const refusal = caught as DigestVersionRefusal
    expect(refusal).toBeInstanceOf(Error)
    expect(refusal.name).toBe('DigestVersionRefusal')
    expect(refusal.state).toBe('update-the-wallet')
    expect(refusal.carried).toEqual({
      name: FORMATS_DIGEST_DOMAIN_NAME,
      version: world.descriptor.digestVersion
    })
    expect(refusal.published).toEqual({
      name: FORMATS_DIGEST_DOMAIN_NAME,
      version: `${world.descriptor.digestVersion}-other`
    })
  })

  it('refuses a domain whose name is not PolicyManager the same way, before any client is built', async () => {
    const builder = spyOnBuilder()
    const world = createWorld()
    world.chain.setDomain({ name: 'SomeOtherManager' })
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(isDigestVersionRefusal(caught)).toBe(true)
    expect((caught as DigestVersionRefusal).state).toBe('update-the-wallet')
    expect((caught as DigestVersionRefusal).published).toEqual({
      name: 'SomeOtherManager',
      version: world.descriptor.digestVersion
    })
    expect(builder.buildRecoveryClient).not.toHaveBeenCalled()
  })

  it('refuses before any prepare is possible: no build ran and no prepare member was called', async () => {
    const prepares = spyOnPrepares()
    const builder = spyOnBuilder()
    const world = createWorld()
    world.chain.setDomain({ version: '999' })
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(isDigestVersionRefusal(caught)).toBe(true)
    expect(prepares.length).toBeGreaterThan(0)
    prepares.forEach((spy) => expect(spy).not.toHaveBeenCalled())
    expect(builder.buildRecoveryClient).not.toHaveBeenCalled()
    expect(builder.recoveryAction).not.toHaveBeenCalled()
    expect(builder.methodModuleReads).not.toHaveBeenCalled()
  })

  it("surfaces a disagreement the builder's own construction check finds as the same typed refusal", async () => {
    const prepares = spyOnPrepares()
    const world = createWorld()
    const original = PolicyManager.prototype.eip712Domain
    // The client's own read sees the carried version; every later read sees another.
    jest
      .spyOn(PolicyManager.prototype, 'eip712Domain')
      .mockImplementationOnce(async function first(this: PolicyManager, ...args) {
        const domain = await original.apply(this, args)
        world.chain.setDomain({ version: 'moved' })
        return domain
      })
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(isDigestVersionRefusal(caught)).toBe(true)
    expect((caught as DigestVersionRefusal).state).toBe('update-the-wallet')
    prepares.forEach((spy) => expect(spy).not.toHaveBeenCalled())
  })

  it('does not read a failed domain read as a version disagreement', async () => {
    const world = createWorld()
    world.chain.failRead('eip712Domain')
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(isProviderReadFailure(caught)).toBe(true)
    expect(isDigestVersionRefusal(caught)).toBe(false)
  })

  describe('runs after the provider chain check and the domain check', () => {
    it('reads a provider on another chain as the chain-id refusal, even where the version also differs', async () => {
      const world = createWorld()
      world.chain.setChainId(SEPOLIA)
      world.chain.setDomain({ version: 'other' })
      const caught = await thrownBy(buildRecoveryClient(world.config))
      expect(isDigestVersionRefusal(caught)).toBe(false)
      expect(caught).toMatchObject({ message: BUILDER_CHAIN_MISMATCH_MESSAGE })
    })

    it('reads a manager on another chain as a construction refusal, not as update the wallet', async () => {
      const world = createWorld()
      world.chain.setDomain({ chainId: BigInt(SEPOLIA), version: 'other' })
      const caught = await thrownBy(buildRecoveryClient(world.config))
      expect(isDigestVersionRefusal(caught)).toBe(false)
      expect(caught).toMatchObject({ message: BUILDER_DOMAIN_CHAIN_MESSAGE })
    })

    it('reads a domain whose verifying contract is another manager as a construction refusal', async () => {
      const world = createWorld()
      world.chain.setDomain({
        verifyingContract: '0x0000000000000000000000000000000000c7ffff',
        version: 'other'
      })
      const caught = await thrownBy(buildRecoveryClient(world.config))
      expect(isDigestVersionRefusal(caught)).toBe(false)
      expect(caught).toMatchObject({ message: BUILDER_VERIFYING_CONTRACT_MESSAGE })
    })
  })

  it('does not read another construction refusal as a version disagreement', async () => {
    const world = createWorld()
    world.chain.setDomain({ fields: '0x1f' })
    const caught = await thrownBy(buildRecoveryClient(world.config))
    expect(isDigestVersionRefusal(caught)).toBe(false)
    expect(caught).toMatchObject({ message: BUILDER_DOMAIN_FIELDS_MESSAGE })
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
    sdkStandIn.nodeFor(descriptor, world.account).setDomain({ chainId: domainChainId })
    return world.config
  }

  // The SDK takes no chain id past a safe integer, so neither domain builds a client.
  ;[9_007_199_254_740_992n + 1n, 9_007_199_254_740_992n].forEach((domainChainId) =>
    it(`refuses the descriptor before any client is built, whatever the domain names (${domainChainId})`, async () => {
      const config = onLargeChain(domainChainId)
      const builder = spyOnBuilder()
      const caught = await thrownBy(buildRecoveryClient(config))
      expect(caught).toBeInstanceOf(Error)
      expect(isDigestVersionRefusal(caught)).toBe(false)
      expect(builder.buildSetupClient).not.toHaveBeenCalled()
      expect(builder.buildRecoveryClient).not.toHaveBeenCalled()
    })
  )
})
