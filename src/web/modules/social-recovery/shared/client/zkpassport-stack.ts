/**
 * The installed zkPassport stack: the app library's client for a domain, as
 * the SDK constructs it by default, with one change. The request is opened in
 * the library's dev mode where the chain's parameters ask for the test
 * certificate tree, so the phone proves against the tree the test network's
 * verifier holds; a production chain never sets it. The verifier parameters
 * pass through unchanged: the SDK asks for them with dev mode off and checks
 * them itself.
 */
import type { ZkPassportClient, ZkPassportStack } from '@kohaku-eth/social-recovery'

import type { IdentityParams } from './types'

export const zkPassportStackFor =
  ({ testnetTree }: Pick<IdentityParams['zkPassport'], 'testnetTree'>): ZkPassportStack =>
  async (domain) => {
    const { ZKPassport } = await import('@zkpassport/sdk')
    const library = new ZKPassport(domain)
    const client: ZkPassportClient = library
    return {
      request: (args) => library.request({ ...args, devMode: testnetTree }),
      getSolidityVerifierParameters: (args) => client.getSolidityVerifierParameters(args)
    }
  }
