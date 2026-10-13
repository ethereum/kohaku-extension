/**
 * The verify of a pasted reply against the request of its own place, judged
 * by the credential's own method module through its `verify` view, the static
 * call the manager makes at submission, so a reply reads as verified before
 * any gas is spent.
 *
 * A reply or a request without the record's shape, a reply whose place, method
 * or config differ from the request's, or whose digest is not the request's,
 * answers `rejected` with no read. An answer of exactly one 32-byte word that
 * holds the module's magic value left-aligned, zeros after it, is `satisfied`,
 * as the manager reads it; any other answer, or a revert of the call, is
 * `rejected`, since the manager refuses the proof. A read the provider could not make rejects, so the
 * caller reads a failed check and tries again. One read per verify; nothing
 * is cached.
 */
import { pad, size } from 'viem'

import {
  digestOfRequest,
  replyReadable,
  requestReadable
} from '@web/modules/social-recovery/sdk-doubles'
import type {
  ApproverReply,
  ApproverRequest,
  Hex,
  Verdict
} from '@web/modules/social-recovery/sdk-interfaces'

import { sameAddress } from '../../addresses'
import { isRevertedCall } from '../../provider-adapter'
import { VERIFY_MAGIC_VALUE } from '../reads'
import type { KitWalletReads, ReplyVerifyReads } from './types'

const sameBytes = (a: Hex, b: Hex): boolean => a.toLowerCase() === b.toLowerCase()

const MAGIC_WORD = pad(VERIFY_MAGIC_VALUE, { dir: 'right', size: 32 })

// A request whose values do not encode makes no digest.
const digestOf = (request: ApproverRequest): Hex | null => {
  try {
    return digestOfRequest(request)
  } catch {
    return null
  }
}

export const createReplyVerify =
  (moduleReads: ReplyVerifyReads): KitWalletReads['verifyReply'] =>
  async (request: ApproverRequest, reply: ApproverReply): Promise<Verdict> => {
    if (!replyReadable(reply) || !requestReadable(request)) {
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
      const answer = await moduleReads.verify(reply.method, reply.config, digest, reply.proof)
      return size(answer) === 32 && sameBytes(answer, MAGIC_WORD) ? 'satisfied' : 'rejected'
    } catch (thrown: unknown) {
      if (isRevertedCall(thrown)) {
        return 'rejected'
      }
      throw thrown
    }
  }
