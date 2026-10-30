/**
 * The installed zkPassport stack: the app library's client for a domain, as
 * the SDK constructs it by default. The request and the verifier parameters
 * pass through with the dev mode the method asks for. A cancel closes the
 * request's connection to the phone in the library and drops its callbacks,
 * so a request that ended stops reconnecting.
 */
import type { ZkPassportClient, ZkPassportStack } from '@kohaku-eth/social-recovery'

export const zkPassportStackFor = (): ZkPassportStack => async (domain) => {
  const { ZKPassport } = await import('@zkpassport/sdk')
  const library = new ZKPassport(domain)
  const client: ZkPassportClient = library
  return {
    request: (args) => client.request(args),
    getSolidityVerifierParameters: (args) => client.getSolidityVerifierParameters(args),
    cancelRequest: (requestId) => client.cancelRequest(requestId)
  }
}
