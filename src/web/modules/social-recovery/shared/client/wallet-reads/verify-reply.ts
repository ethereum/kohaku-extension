/**
 * The verify of a pasted reply against the request of its own place, judged
 * by the credential's own method module through its `verify` view, the static
 * call the manager makes at submission, so a reply reads as verified before
 * any gas is spent.
 *
 * A reply or a request this build does not read, a reply whose place, method
 * or config differ from the request's, or whose digest is not the request's,
 * answers `rejected` with no read. An answer of exactly the module's verdict
 * word is `satisfied`, as the manager reads it; any other answer is
 * `rejected`, since the manager refuses the proof. A revert of the call is
 * `reverted` in the check, so a ceremony can tell a module that refused to
 * judge the proof from one that judged it wrong; the verify of a pasted reply
 * folds it into `rejected`. An empty answer, as an address with no code
 * gives, and a read the provider could not make, reject with the provider's
 * read failure, so the caller reads a failed check and tries again. One read
 * per verify; nothing is cached.
 */
import {
  approvalDigest,
  cancellationDigest,
  GATHERING_REPLY_KIND,
  GATHERING_REPLY_VERSION,
  GATHERING_REQUEST_KIND,
  GATHERING_REQUEST_VERSION,
  isProviderRevert,
  POLICY_METHOD_VERIFY_ABI,
  RECOVERY_ACTION_READ_FROM,
  VERDICT_MAGIC_VALUE
} from '@kohaku-eth/social-recovery'
import type { ApproverRequest, Hex, Reply, Verdict } from '@kohaku-eth/social-recovery'
import { encodeFunctionData, size } from 'viem'

import type { ChainVerdict } from '@web/modules/social-recovery/shared/ceremony'

import { sameAddress } from '../addresses'
import { providerReadFailure } from '../provider-adapter'
import type { WalletReads } from '../types'
import type { ReplyVerifyProvider } from './types'

const sameBytes = (a: Hex, b: Hex): boolean => a.toLowerCase() === b.toLowerCase()

// A request whose values do not encode makes no digest.
const digestOf = (request: ApproverRequest): Hex | null => {
  try {
    const members = {
      chainId: Number(request.chainId),
      manager: request.manager,
      account: request.account,
      action: request.action,
      attemptId: BigInt(request.attemptId),
      setupNonce: BigInt(request.setupNonce),
      setupBodyHash: request.setupBodyHash,
      validUntil: Number(request.validUntil),
      digestVersion: request.digestVersion
    }
    if (request.purpose === 'cancellation') {
      return cancellationDigest(members, request.place)
    }
    return approvalDigest(
      {
        ...members,
        payload: request.payload,
        order: { ...request.order, amount: BigInt(request.order.amount) }
      },
      request.place
    )
  } catch {
    return null
  }
}

export const createReplyCheck =
  (provider: ReplyVerifyProvider): ChainVerdict =>
  async (request: ApproverRequest, reply: Reply) => {
    if (
      reply.kind !== GATHERING_REPLY_KIND ||
      reply.version !== GATHERING_REPLY_VERSION ||
      request.kind !== GATHERING_REQUEST_KIND ||
      request.version !== GATHERING_REQUEST_VERSION
    ) {
      return 'rejected'
    }
    if (
      reply.place !== request.place ||
      !sameAddress(reply.method, request.method) ||
      !sameBytes(reply.config, request.config)
    ) {
      return 'rejected'
    }
    const digest = digestOf(request)
    if (digest === null || !sameBytes(reply.digest, digest)) {
      return 'rejected'
    }
    try {
      const answer = await provider.call(
        reply.method,
        encodeFunctionData({
          abi: POLICY_METHOD_VERIFY_ABI,
          functionName: 'verify',
          args: [reply.config, digest, reply.proof]
        }),
        RECOVERY_ACTION_READ_FROM,
        'latest'
      )
      if (size(answer) === 0) {
        throw providerReadFailure('call', new Error('the method module answered no bytes'))
      }
      return sameBytes(answer, VERDICT_MAGIC_VALUE) ? 'satisfied' : 'rejected'
    } catch (thrown: unknown) {
      if (isProviderRevert(thrown)) {
        return 'reverted'
      }
      throw thrown
    }
  }

export const createReplyVerify = (provider: ReplyVerifyProvider): WalletReads['verifyReply'] => {
  const check = createReplyCheck(provider)
  return async (request: ApproverRequest, reply: Reply): Promise<Verdict> => {
    const answer = await check(request, reply)
    return answer === 'reverted' ? 'rejected' : answer
  }
}
