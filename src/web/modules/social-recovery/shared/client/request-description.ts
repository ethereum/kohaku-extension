/**
 * The description of an approval request with no client built: the SDK's
 * describe utility over the action codec and the methods this build
 * constructs, keyed under the chain's deployment as the client keys them. It
 * reads nothing from the chain, so the page can draw the request's values
 * while the client is still being built.
 */
import { AmbireActionCodec, describeRequest } from '@kohaku-eth/social-recovery'
import type {
  ActionCodecRegistry,
  ApproverRequest,
  MethodRegistry,
  RequestDescription
} from '@kohaku-eth/social-recovery'

import { addressBookOf } from './addresses'
import { methodsOf } from './build-client'
import { WALLET_RECOVERY_CHAIN } from './chains'
import { descriptorOf } from './descriptors'

/**
 * Describes a request as the chain's client would; throws as the SDK does
 * for a request it cannot read.
 */
export const describeRequestOffline = (
  request: ApproverRequest,
  chain = WALLET_RECOVERY_CHAIN
): RequestDescription => {
  const descriptor = descriptorOf(chain, addressBookOf(chain))
  const codecs: ActionCodecRegistry = new Map([
    [descriptor.action, new AmbireActionCodec([descriptor.action])]
  ])
  const methods: MethodRegistry = new Map(
    methodsOf(chain, descriptor).flatMap((method) =>
      method.modules(descriptor).map((module) => [module, method] as const)
    )
  )
  return describeRequest(request, codecs, methods)
}
