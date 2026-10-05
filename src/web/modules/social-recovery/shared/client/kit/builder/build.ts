/**
 * The client of a deployed kit for one account, once its construction checks
 * passed: the setup client over the chain's reads, the action and the module
 * reads bound to the account, the wallet's removed-key and fit reads, and the
 * approving side. The approving side reads no chain: it is the shipped method
 * implementations and the orchestrator over them, keyed by the deployment's
 * method addresses, and it serves only the methods the deployment names. The
 * recovery side, the clear, the events feed and the verify of a pasted reply
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
import { createSetupEvents } from '../events'
import { disarmingData } from '../formats'
import { createMethodReads } from '../reads'
import {
  accountCallOf,
  createKitSetupClient,
  moduleReadsOf,
  notServedRecoveryClient,
  notServedRefusal,
  pinnedBlockOf
} from '../setup-client'
import { createKitWalletReads } from '../wallet-reads'
import type { KitClientInput } from './types'

export const buildKitClient = (input: KitClientInput): RecoveryKitClient => {
  const { account, addressBook, codeRead, config, descriptor, facts, provider } = input
  const moduleReads = moduleReadsOf(createMethodReads(provider))
  const kitWalletReads = createKitWalletReads({
    account: input.privilegeAccount,
    accountImplementation: config.accountImplementation,
    action: input.action,
    codeRead
  })
  const walletReads: WalletReads = {
    removedKey: () => kitWalletReads.removedKey(),
    fitCheck: (implementation) => kitWalletReads.fitCheck(implementation),
    verifyReply: () => Promise.reject(notServedRefusal('walletReads.verifyReply'))
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
    events: createSetupEvents(provider, descriptor.manager),
    walletReads,
    initialPrivileges: input.privilegeAccount.initialPrivileges
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
  const implementations = new Map<string, IRecoveryMethod>()
  shippedMethodDoubles().forEach((method) =>
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
    recovery: notServedRecoveryClient(),
    action,
    moduleReads,
    approving: new MethodsOrchestratorDouble(registry, [
      new ActionCodecDouble([descriptor.action])
    ]),
    methodFor: (slug: string) => methodsBySlug.get(slug),
    walletReads
  })
}
