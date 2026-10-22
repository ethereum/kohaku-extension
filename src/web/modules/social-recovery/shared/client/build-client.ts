/**
 * `buildRecoveryClient`: the one recovery kit client the extension builds for
 * an account, through the SDK's builder.
 *
 * What the client reads follows the chain's deployment record: with a
 * deployed kit, the extension's provider adapter; with none, the fake node
 * the stand-in keeps for the account, which answers as the deployed
 * contracts would. Either way the builder receives the provider, the
 * descriptor, the account and the client configuration, the policy manager,
 * the action codec and the two shipped methods this build constructs, the
 * event manager's chunk width from the wallet's configuration and the signer
 * recovery its removed-key inference reads, and nothing else of the
 * extension: no signer and no storage.
 *
 * The SDK's construction checks run at the first build, in the SDK's order:
 * the provider's chain id, the manager domain's chain id and verifying
 * contract, its `fields` bitmap, its digest version and its name. A refused
 * digest version or domain name throws a `DigestVersionRefusal`, so no
 * prepare can run; the account step draws it as the update-the-wallet state. A deployment is
 * checked further: its manager answers at its address, and the action is
 * bound to the deployment's manager, the served implementation and the kit
 * slot and binding this build derives, or the build refuses with a
 * `DeploymentRefusal`.
 */
import {
  AmbireActionCodec,
  BUILDER_DIGEST_VERSION_MESSAGE,
  BUILDER_DOMAIN_NAME_MESSAGE,
  FORMATS_DIGEST_DOMAIN_NAME,
  KitRefusalError,
  passkeyMethod,
  PolicyManager,
  SocialRecoveryBuilder,
  walletMethod
} from '@kohaku-eth/social-recovery'
import type {
  DeploymentDescriptor,
  IProvider,
  IRecoveryMethod,
  ISignerRecovery
} from '@kohaku-eth/social-recovery'

import { PROXY_AMBIRE_ACCOUNT } from '@ambire-common/consts/deploy'

import { clientConfigurationOf } from './configuration'
import { checkActionConstants, createActionViews, readManagerDomain } from './deployment-checks'
import { deploymentOf } from './deployments'
import { descriptorOf } from './descriptors'
import { createRecoverySetupClient } from './setup-client'
import { sdkStandIn } from './stand-in'
import type {
  DigestVersionRefusal,
  DomainVersion,
  RecoveryClientConfiguration,
  RecoveryKitClient
} from './types'
import { createWalletReads } from './wallet-reads'

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

/** The key that sent an account's own transaction: the account's keys send it themselves. */
const SIGNER_RECOVERY: ISignerRecovery = {
  recoverSigner: async (transaction) => transaction.from
}

/** The provider a chain's client reads: the extension's for a deployment, the fake node's otherwise. */
const providerOf = (
  config: RecoveryClientConfiguration,
  descriptor: DeploymentDescriptor
): IProvider => {
  if (deploymentOf(config.chain).kind === 'deployed') {
    return config.provider
  }
  return sdkStandIn.providerFor(
    sdkStandIn.nodeFor(descriptor, config.account, { authorities: config.candidateKeys ?? [] })
  )
}

/** The refusal of a digest version, with the version the manager publishes where it answers one. */
const refusedDigestVersion = async (
  policyManager: PolicyManager,
  descriptor: DeploymentDescriptor
): Promise<DigestVersionRefusal> => {
  const carried = { name: FORMATS_DIGEST_DOMAIN_NAME, version: descriptor.digestVersion }
  const domain = await policyManager.eip712Domain().catch(() => undefined)
  return digestVersionRefusal(
    carried,
    domain ? { name: domain.name, version: domain.version } : undefined
  )
}

/**
 * Builds the recovery kit client for one account from one configuration.
 *
 * Throws the SDK's `KitRefusalError` where a construction check refuses, a
 * `DigestVersionRefusal` where the manager publishes another digest version
 * or domain name, and a `DeploymentRefusal` where the deployment's manager or
 * action disagrees with it, all before any client is handed out. Every other
 * failure propagates as it was thrown.
 */
export const buildRecoveryClient = async (
  config: RecoveryClientConfiguration
): Promise<RecoveryKitClient> => {
  const descriptor = descriptorOf(config.chain, config.addressBook)
  // The fit check judges the implementation the account library deploys behind
  // its proxy unless the configuration names another.
  const accountImplementation = config.accountImplementation ?? PROXY_AMBIRE_ACCOUNT
  const configuration = clientConfigurationOf({ ...config, accountImplementation })
  const { account } = config
  const provider = providerOf(config, descriptor)
  const policyManager = new PolicyManager(
    provider,
    descriptor,
    account,
    descriptor.action,
    configuration.blockTags
  )
  const codec = new AmbireActionCodec([descriptor.action])
  const methods: IRecoveryMethod[] = [walletMethod(), passkeyMethod()]
  const builder = SocialRecoveryBuilder.from({ provider, account, descriptor, configuration })
    .withPolicyManager(policyManager)
    .withCodec(codec)
    .withEventManager({ logChunkSize: configuration.logChunkSize })
    .withSignerRecovery(SIGNER_RECOVERY)
  methods.forEach((method) => builder.withMethod(method))

  await readManagerDomain(policyManager, descriptor.manager, provider)
  const kit = await (async () => {
    try {
      return {
        setup: await builder.buildSetupClient(),
        recovery: await builder.buildRecoveryClient(),
        action: await builder.recoveryAction(),
        moduleReads: await builder.methodModuleReads(),
        approving: builder.buildMethodsOrchestrator()
      }
    } catch (thrown) {
      if (
        thrown instanceof KitRefusalError &&
        (thrown.message === BUILDER_DIGEST_VERSION_MESSAGE ||
          thrown.message === BUILDER_DOMAIN_NAME_MESSAGE)
      ) {
        throw await refusedDigestVersion(policyManager, descriptor)
      }
      throw thrown
    }
  })()
  const actionViews = createActionViews(provider, descriptor.action)
  await checkActionConstants({ action: actionViews, provider, descriptor })

  // Each slug of the address book to the method serving its module.
  const methodsBySlug = new Map(
    Object.entries(config.addressBook.methods).flatMap(([slug, module]) => {
      const served = methods.find((method) =>
        method.modules(descriptor).some((address) => address.toLowerCase() === module.toLowerCase())
      )
      return served ? [[slug, served] as const] : []
    })
  )
  const walletReads = createWalletReads({
    account: {
      addr: account,
      associatedKeys: [...(config.candidateKeys ?? [])],
      initialPrivileges: [...(config.initialPrivileges ?? [])],
      creation: config.creation
        ? {
            factoryAddr: config.creation.factory,
            bytecode: config.creation.bytecode,
            salt: config.creation.salt
          }
        : null
    },
    accountImplementation,
    provider,
    descriptor,
    blockTags: configuration.blockTags,
    logChunkSize: configuration.logChunkSize,
    policyManager,
    action: kit.action,
    actionViews,
    events: kit.setup.events,
    codec
  })
  const setup = createRecoverySetupClient({
    setup: kit.setup,
    policyManager,
    action: kit.action,
    provider,
    account,
    descriptor,
    blockTags: configuration.blockTags,
    logChunkSize: configuration.logChunkSize,
    fitCheck: () => walletReads.fitCheck()
  })
  return Object.freeze({
    chain: config.chain,
    account,
    descriptor,
    setup,
    recovery: kit.recovery,
    action: kit.action,
    moduleReads: kit.moduleReads,
    approving: kit.approving,
    methodFor: (slug: string) => methodsBySlug.get(slug),
    walletReads
  })
}
