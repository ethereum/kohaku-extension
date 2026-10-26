/**
 * The ceremony tab's resolver: it finds the ceremony a request id names in the
 * wallet's records and hands the tab the approving side and the method
 * implementation of the client built for the request's account and chain.
 */
import type { Network } from '@ambire-common/interfaces/network'
import type { Address } from '@kohaku-eth/social-recovery'
import type { CeremonyResolver, ChainVerdict } from '@web/modules/social-recovery/shared/ceremony'
import { isWithinExpiry } from '@web/modules/social-recovery/shared/ceremony'
import { IDENTITY_KINDS } from '@web/modules/social-recovery/shared/records/types'

import { addressBookOf, sameAddress } from './addresses'
import { buildRecoveryClient } from './build-client'
import { CHAIN_IDS, recoveryChainOf, WALLET_RECOVERY_CHAIN } from './chains'
import { deploymentOf } from './deployments'
import { extensionProviderFor, networkOf } from './extension-provider'
import { createProviderAdapter } from './provider-adapter'
import type { CeremonyClientFor, CeremonyResolverOptions, RecoveryKitClient } from './types'
import { createReplyCheck } from './wallet-reads/verify-reply'

/**
 * Resolves a ceremony from the request stored under its id.
 *
 * - Null, with nothing built, where no request is stored, where the request is
 *   past the expiry a report of it would have, where it is for another call or
 *   method than the tab's route names, or where it names a chain other than
 *   the one this build reads. So a reload or a second tab opened on an expired
 *   request runs no second prompt.
 * - Null where the module the request names is not one the method serves.
 * - The refusal where the client holds no implementation of the method, or,
 *   for an identity method, no parameters of it.
 * - A client that cannot be built rejects, and the tab reads it as unavailable
 *   with retry.
 *
 * No device is resolved: the tab runs the page's own device for the method's
 * binding, and a method whose material the caller already holds needs no
 * ceremony tab. An access test also receives the client's chain verdict.
 *
 * An identity method's parameters are the client's for the call, read from
 * this build's deployment, never the ones the request stored; the passkey's
 * are the stored ones, the relying party and the hand-off its caller chose.
 */
export const createCeremonyResolver =
  ({ records, clientFor, now = Date.now }: CeremonyResolverOptions): CeremonyResolver =>
  async (params) => {
    const read = await records.ceremonyRequest(params.id).read()
    if (read.status === 'absent' || !isWithinExpiry(read.savedAt, now())) {
      return null
    }
    const stored = read.value
    if (stored.call !== params.call || stored.method !== params.method) {
      return null
    }
    if (recoveryChainOf(stored.chainId) !== WALLET_RECOVERY_CHAIN) {
      return null
    }

    const client = await clientFor(stored.account, stored.chainId)
    const method = client.methodFor(stored.method)
    if (!method) {
      return { refused: 'no-implementation' }
    }
    const orchestrator = client.approving
    const serves = (module: Address) =>
      method.modules(client.descriptor).some((address) => sameAddress(address, module))
    const identity = IDENTITY_KINDS.some((kind) => kind === stored.method)
    const identityParams = identity ? client.methodParamsFor(stored.method, stored.call) : undefined
    if (identity && stored.call !== 'healthCheck' && !identityParams) {
      return { refused: 'no-implementation' }
    }

    switch (stored.call) {
      case 'enroll':
        if (!serves(stored.methodAddress)) {
          return null
        }
        return {
          orchestrator,
          method,
          methodAddress: stored.methodAddress,
          params: identity ? identityParams : stored.params
        }
      case 'testAccess':
        if (!serves(stored.request.method)) {
          return null
        }
        return {
          orchestrator,
          method,
          request: stored.request,
          params: identity ? identityParams : stored.params,
          ...(client.chainVerdict ? { chainVerdict: client.chainVerdict } : {})
        }
      case 'createClaim':
        if (!serves(stored.request.method)) {
          return null
        }
        return {
          orchestrator,
          method,
          request: stored.request,
          params: identity ? identityParams : stored.params
        }
      case 'healthCheck':
      default:
        return { orchestrator, method }
    }
  }

/**
 * Builds the client for an account on a recovery chain the way the hook does,
 * over the extension's own provider for that chain's network among
 * `networks()`. The approving side reads no chain, so the provider is
 * destroyed once the build settles. The chain verdict is the one read a
 * ceremony makes: on a deployed chain each verdict reads through a provider of
 * its own, destroyed once the read settles; on the stand-in chain it reads the
 * client's fake node. Rejects for a chain this build reads no recovery on, or
 * one the extension holds no network for.
 */
export const extensionClientFor =
  (networks: () => readonly Network[] | undefined): CeremonyClientFor =>
  async (account, chainId) => {
    const chain = recoveryChainOf(chainId)
    if (!chain) {
      throw new Error(`Chain ${String(chainId)} carries no recovery deployment.`)
    }
    const network = networkOf(networks(), chain)
    if (!network) {
      throw new Error(`The extension holds no network for chain ${CHAIN_IDS[chain]}.`)
    }
    const provider = extensionProviderFor(network)
    let client: RecoveryKitClient
    try {
      client = await buildRecoveryClient({
        chain,
        account,
        addressBook: addressBookOf(chain),
        provider: createProviderAdapter(provider)
      })
    } finally {
      provider.destroy()
    }
    const chainVerdict: ChainVerdict =
      deploymentOf(chain).kind === 'deployed'
        ? async (request, reply) => {
            const reading = extensionProviderFor(network)
            try {
              return await createReplyCheck(createProviderAdapter(reading))(request, reply)
            } finally {
              reading.destroy()
            }
          }
        : (request, reply) => client.walletReads.verifyReply(request, reply)
    return {
      approving: client.approving,
      methodFor: client.methodFor,
      methodParamsFor: client.methodParamsFor,
      descriptor: client.descriptor,
      chainVerdict
    }
  }
