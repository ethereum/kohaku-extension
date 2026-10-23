/**
 * The installed zkPassport stack: the app library's client for a domain, as
 * the SDK constructs it by default, with two changes. The request is opened in
 * the library's dev mode where the chain's parameters ask for the test
 * certificate tree, so the phone proves against the tree the test network's
 * verifier holds; a production chain never sets it. The verifier parameters
 * pass through unchanged: the SDK asks for them with dev mode off and checks
 * them itself.
 *
 * And each request the builder hands out carries `close`, which cancels the
 * request in the library: the library closes the request's connection to the
 * phone and drops its callbacks, so a request that ended stops reconnecting.
 */
import type {
  ZkPassportClient,
  ZkPassportQueryBuilder,
  ZkPassportStack
} from '@kohaku-eth/social-recovery'

import type { IdentityParams } from './types'

export const zkPassportStackFor =
  ({ testnetTree }: Pick<IdentityParams['zkPassport'], 'testnetTree'>): ZkPassportStack =>
  async (domain) => {
    const { ZKPassport } = await import('@zkpassport/sdk')
    const library = new ZKPassport(domain)
    const client: ZkPassportClient = library
    const closing = (builder: ZkPassportQueryBuilder): ZkPassportQueryBuilder => ({
      bind: (key, value) => closing(builder.bind(key, value)),
      done: () => {
        const request = builder.done()
        return Object.assign(request, { close: () => library.cancelRequest(request.requestId) })
      }
    })
    return {
      request: async (args) => closing(await library.request({ ...args, devMode: testnetTree })),
      getSolidityVerifierParameters: (args) => client.getSolidityVerifierParameters(args)
    }
  }
