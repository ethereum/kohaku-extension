/**
 * The client of a deployed kit for one account, once its construction checks
 * passed: the setup client over the chain's reads, the recovery client's
 * gathering and prepares over the same reads and the setup client's restore,
 * the action and the module reads bound to the account, the wallet's
 * removed-key and fit reads over the same events feed and the transaction
 * read, its attempt-state read over the manager, the commitment of a
 * configuration in the commit's own encoding, its verify of a pasted reply
 * through the method module's own `verify` view, and the approving side. The
 * approving side reads no chain: it is the kit's ECDSA method and the shipped
 * doubles for the rest, with the orchestrator over them, keyed by the
 * deployment's method addresses, and it serves only the methods the
 * deployment names. Both clients serve one events feed over the provider's
 * logs of the manager and the account. The clear and the feed's method filter
 * are not served yet and refuse.
 */
import {
  ActionCodecDouble,
  MethodsOrchestratorDouble,
  shippedMethodDoubles
} from '@web/modules/social-recovery/sdk-doubles'
import type {
  Address,
  IRecoveryActionInteractor,
  IRecoveryMethod
} from '@web/modules/social-recovery/sdk-interfaces'
import type { SlotKind } from '@web/modules/social-recovery/shared/records'

import type { RecoveryKitClient, WalletReads } from '../../types'
import { createKitEventManager, createSetupEvents } from '../events'
import { disarmingData, setupBodyOf, setupCommitmentOf } from '../formats'
import { createEcdsaMethod } from '../methods'
import { createMethodReads } from '../reads'
import { createKitRecoveryClient } from '../recovery-client'
import { accountCallOf, createKitSetupClient, moduleReadsOf, pinnedBlockOf } from '../setup-client'
import { createKitWalletReads } from '../wallet-reads'
import type { KitClientInput } from './types'

export const buildKitClient = (input: KitClientInput): RecoveryKitClient => {
  const { account, addressBook, codeRead, config, descriptor, facts, provider } = input
  const methodReads = createMethodReads(provider)
  const moduleReads = moduleReadsOf(methodReads)
  const setupEvents = createSetupEvents(provider, descriptor.manager, config.logChunkWidth)
  const eventManager = createKitEventManager({
    provider,
    descriptor,
    account,
    chunkWidth: config.logChunkWidth
  })
  const kitWalletReads = createKitWalletReads({
    account: input.privilegeAccount,
    accountImplementation: config.accountImplementation,
    action: input.action,
    manager: input.manager,
    moduleReads: methodReads,
    codeRead,
    provider,
    blockTags: config.blockTags,
    logChunkWidth: config.logChunkWidth,
    descriptor,
    events: eventManager,
    transactionRead: input.transactionRead
  })
  const walletReads: WalletReads = {
    removedKey: () => kitWalletReads.removedKey(),
    attemptState: () => kitWalletReads.attemptState(),
    fitCheck: (implementation) => kitWalletReads.fitCheck(implementation),
    verifyReply: (request, reply) => kitWalletReads.verifyReply(request, reply),
    commitmentOf: (nonce, configuration) =>
      setupCommitmentOf(account, descriptor.action, nonce, setupBodyOf(account, configuration))
  }
  const setup = createKitSetupClient({
    account,
    descriptor,
    config,
    provider,
    codeRead,
    manager: input.manager,
    action: input.action,
    moduleReads,
    events: setupEvents,
    eventManager,
    walletReads,
    initialPrivileges: input.privilegeAccount.initialPrivileges
  })
  const recovery = createKitRecoveryClient({
    account,
    descriptor,
    config,
    provider,
    manager: input.manager,
    action: input.action,
    moduleReads,
    setup,
    walletReads,
    eventManager
  })
  const action: IRecoveryActionInteractor = {
    supportsAccount: () => input.action.supportsAccount(account),
    isAuthority: (key) => input.action.isAuthority(account, key),
    isAuthorized: () => input.action.isAuthorized(account),
    holdsAnyPrivilege: (candidate) => input.action.holdsAnyPrivilege(account, candidate),
    actionInfo: () => input.action.actionInfo(),
    disarmingCall: async () =>
      accountCallOf(
        account,
        disarmingData(descriptor.action),
        await pinnedBlockOf(provider, config)
      )
  }

  // The slugs the deployment serves: the two primary methods always, an
  // identity method only where the deployment names its module.
  const served: [SlotKind, Address][] = (
    [
      ['ecdsa', true],
      ['passkey', true],
      ['aadhaar', facts.methodAadhaar !== undefined],
      ['zkpassport', facts.methodZkpassport !== undefined]
    ] as const
  )
    .filter(([, isServed]) => isServed)
    .map(([slug]) => [slug, addressBook.methods[slug]])
  const shipped: IRecoveryMethod[] = [
    createEcdsaMethod(),
    ...shippedMethodDoubles().filter((method) => method.kind !== 'wallet')
  ]
  const implementations = new Map<string, IRecoveryMethod>()
  shipped.forEach((method) =>
    method
      .modules(descriptor)
      .forEach((module) => implementations.set(module.toLowerCase(), method))
  )
  const methodsBySlug = new Map<string, IRecoveryMethod>()
  const registry = new Map<string, IRecoveryMethod>()
  served.forEach(([slug, module]) => {
    const method = implementations.get(module.toLowerCase())
    if (method) {
      methodsBySlug.set(slug, method)
      registry.set(module.toLowerCase(), method)
    }
  })

  return Object.freeze({
    chain: input.chain,
    account,
    descriptor,
    setup,
    recovery,
    action,
    moduleReads,
    approving: new MethodsOrchestratorDouble(registry, [
      new ActionCodecDouble([descriptor.action])
    ]),
    methodFor: (slug: string) => methodsBySlug.get(slug),
    walletReads
  })
}
