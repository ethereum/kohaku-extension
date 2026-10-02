/**
 * `buildRecoveryClient`: the one recovery kit client the extension builds for
 * an account, with the digest-version check inside it.
 *
 * The client is built through the SDK's builder, today the builder double over
 * the stand-in's scripted chain. The builder receives the provider adapter, the
 * descriptor, the account and the client configuration, and nothing else of
 * the extension: no signer and no storage.
 *
 * The SDK's construction checks run before anything is built, in the SDK's
 * order: the provider's chain id, the manager domain's chain id and verifying
 * contract, its `fields` bitmap, then its digest version. A refused digest
 * version throws a `DigestVersionRefusal` before any client exists, so no
 * prepare can run; the account step draws it as the update-the-wallet state.
 * The builder runs the same checks again at construction, and its
 * digest-version refusal is surfaced as the same `DigestVersionRefusal`.
 */
import { PROXY_AMBIRE_ACCOUNT } from '@ambire-common/consts/deploy'
import type { ConstructionRefusal } from '@web/modules/social-recovery/sdk-doubles'
import {
  constructionRefusal,
  MANAGER_DOMAIN_FIELDS,
  PolicyManagerDouble,
  RecoveryKitBuilderDouble,
  shippedMethodDoubles,
  WalletReadsDouble
} from '@web/modules/social-recovery/sdk-doubles'
import type {
  DeploymentDescriptor,
  Domain,
  IRecoveryMethod
} from '@web/modules/social-recovery/sdk-interfaces'

import { sameAddress } from './addresses'
import { clientConfigurationOf } from './configuration'
import { descriptorOf } from './descriptors'
import { sdkStandIn } from './stand-in'
import type {
  DigestVersionRefusal,
  DomainVersion,
  RecoveryClientConfiguration,
  RecoveryKitClient,
  WalletReads
} from './types'

/** The name every kit manager's domain carries. */
export const MANAGER_DOMAIN_NAME = 'PolicyManager'

export const digestVersionRefusal = (
  carried: DomainVersion,
  published?: DomainVersion
): DigestVersionRefusal => {
  const error = new Error(
    published
      ? `The manager publishes digest version ${published.name} ${published.version}; this build carries ${carried.name} ${carried.version}.`
      : `The manager's digest version is not ${carried.name} ${carried.version}, the one this build carries.`
  ) as DigestVersionRefusal
  error.name = 'DigestVersionRefusal'
  error.state = 'update-the-wallet'
  error.carried = carried
  if (published) {
    error.published = published
  }
  return error
}

export const isDigestVersionRefusal = (value: unknown): value is DigestVersionRefusal =>
  value instanceof Error && value.name === 'DigestVersionRefusal'

/** The domain name and version this build derives under for a descriptor. */
export const carriedDomainVersion = (descriptor: DeploymentDescriptor): DomainVersion => ({
  name: MANAGER_DOMAIN_NAME,
  version: descriptor.digestVersion
})

/**
 * The digest-version check over the domain the manager published: its version
 * must be the descriptor's digest version and its name `PolicyManager`.
 * Throws a `DigestVersionRefusal` otherwise.
 */
export const checkDigestVersion = (domain: Domain, descriptor: DeploymentDescriptor): void => {
  const carried = carriedDomainVersion(descriptor)
  if (domain.version !== carried.version || domain.name !== carried.name) {
    throw digestVersionRefusal(carried, { name: domain.name, version: domain.version })
  }
}

const isConstructionRefusal = (value: unknown): value is ConstructionRefusal =>
  value instanceof Error && value.name === 'ConstructionRefusal'

/**
 * Builds the recovery kit client for one account from one configuration.
 *
 * Throws a `ConstructionRefusal` where the provider answers another chain
 * (`chain-id`), the manager's domain names another chain or address
 * (`domain`) or carries other members (`domain-fields`), and a
 * `DigestVersionRefusal` where it publishes another digest version, all
 * before any client is built. Every other failure propagates as it was
 * thrown: a read that failed, or a later construction refusal of the builder.
 */
export const buildRecoveryClient = async (
  config: RecoveryClientConfiguration
): Promise<RecoveryKitClient> => {
  const descriptor = descriptorOf(config.chain, config.addressBook)
  // The fit check judges the implementation the account library deploys behind
  // its proxy unless the configuration names another.
  const clientConfiguration = clientConfigurationOf({
    ...config,
    accountImplementation: config.accountImplementation ?? PROXY_AMBIRE_ACCOUNT
  })
  const chain = sdkStandIn.chainFor(descriptor, config.account)
  const manager = new PolicyManagerDouble(chain)

  // The provider's chain.
  const chainId = await config.provider.chainId()
  if (chainId !== descriptor.chainId) {
    throw constructionRefusal(
      'chain-id',
      `The provider answers chain ${chainId}, the descriptor ${descriptor.chainId}.`
    )
  }
  // The domain's chain and address, then its members. Until the SDK lands the
  // domain comes from the stand-in's manager part, the instance the builder is
  // handed; the SDK's own construction check reads it through the provider.
  const domain = await manager.eip712Domain()
  if (
    domain.chainId !== BigInt(descriptor.chainId) ||
    !sameAddress(domain.verifyingContract, descriptor.manager)
  ) {
    throw constructionRefusal('domain', 'The manager domain disagrees with the descriptor.')
  }
  if (domain.fields.toLowerCase() !== MANAGER_DOMAIN_FIELDS) {
    throw constructionRefusal(
      'domain-fields',
      'The manager domain carries members this build does not derive under.'
    )
  }
  // The digest version, before anything is built or prepared.
  checkDigestVersion(domain, descriptor)

  const builder = new RecoveryKitBuilderDouble(chain)
  builder
    .provider(config.provider)
    .descriptor(descriptor)
    .account(config.account)
    .config(clientConfiguration)
    .policyManager(manager)
  // The builder's method registry: the four shipped methods.
  const methods: IRecoveryMethod[] = shippedMethodDoubles(chain)
  methods.forEach((method) => builder.method(method))
  // The registered methods by module, keyed as the orchestrator's registry keys
  // them: where two claim one module, the later registration serves it, so a
  // slug hands out the method the orchestrator runs.
  const methodsByModule = new Map<string, IRecoveryMethod>()
  methods.forEach((method) =>
    method
      .modules(descriptor)
      .forEach((address) => methodsByModule.set(address.toLowerCase(), method))
  )
  // Each slug of the address book to the method serving its module.
  const methodsBySlug = new Map(
    Object.entries(config.addressBook.methods).flatMap(([slug, module]) => {
      const served = methodsByModule.get(module.toLowerCase())
      return served ? [[slug, served] as const] : []
    })
  )

  try {
    const setup = await builder.buildSetupClient()
    const recovery = await builder.buildRecoveryClient()
    const action = await builder.recoveryAction()
    const moduleReads = await builder.methodModuleReads()
    const approving = builder.buildMethodsOrchestrator()
    const walletReads: WalletReads = new WalletReadsDouble(chain, {
      creation: clientConfiguration.creation,
      accountImplementation: clientConfiguration.accountImplementation
    })
    return Object.freeze({
      chain: config.chain,
      account: config.account,
      descriptor,
      setup,
      recovery,
      action,
      moduleReads,
      approving,
      methodFor: (slug: string) => methodsBySlug.get(slug),
      walletReads
    })
  } catch (thrown) {
    if (isConstructionRefusal(thrown) && thrown.check === 'digest-version') {
      throw digestVersionRefusal(carriedDomainVersion(descriptor))
    }
    throw thrown
  }
}
