/**
 * The verify again before the confirmation: every approval the submission
 * carries goes through the same static call the registry runs at submission,
 * against the request of its own place. One rejected names its row; a read
 * that throws, or a verdict that judges nothing, is a check that failed and
 * is tried again.
 */
import type {
  ApproverReply,
  ApproverRequest,
  Gathering
} from '@web/modules/social-recovery/sdk-interfaces'

import type { SubmitKitClient, VerifyReading, VerifyStepResult } from './types'

const verifyOne = async (
  client: Pick<SubmitKitClient, 'walletReads'>,
  request: ApproverRequest | undefined,
  reply: ApproverReply | undefined
): Promise<VerifyStepResult> => {
  if (!request || !reply) {
    return 'rejected'
  }
  try {
    const verdict = await client.walletReads.verifyReply(request, reply)
    if (verdict === 'satisfied') {
      return 'satisfied'
    }
    return verdict === 'rejected' ? 'rejected' : 'failed'
  } catch {
    return 'failed'
  }
}

/**
 * The verify of the places of `chosen`, in place order. A place whose request
 * or reply the gathering does not hold reads rejected, since its approval
 * cannot be the one the submission carries.
 */
export const verifyAgain = async (
  client: Pick<SubmitKitClient, 'recovery' | 'walletReads'>,
  gathering: Gathering,
  chosen: ReadonlySet<number>
): Promise<VerifyReading> => {
  const requests = client.recovery.getApproverRequests(gathering)
  const places = [...chosen].sort((a, b) => a - b)
  const results = await Promise.all(
    places.map((place) =>
      verifyOne(
        client,
        requests.find((request) => request.place === place),
        gathering.replies.find((reply) => reply.place === place)
      )
    )
  )
  const rejected = places.find((_, index) => results[index] === 'rejected')
  if (rejected !== undefined) {
    return { status: 'rejected', place: rejected }
  }
  if (results.includes('failed')) {
    return { status: 'failed' }
  }
  return { status: 'verified' }
}
