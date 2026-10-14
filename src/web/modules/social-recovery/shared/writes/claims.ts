/**
 * How a page reads a claim of a write it finds stored on this device and did
 * not write in its own live run: on arrival (a reload, a second page, a
 * reopen), at its own start, or where its own claim lost to it.
 *
 * A claim that holds a transaction hash is a send on its way to the chain:
 * the page follows that hash to its receipt, reads it dropped only where the
 * node forgets it, and never sends again for it. A claim with no hash is
 * judged by where the wallet holds the request it was queued under, with no
 * age: while the wallet's queue or its sign screen still holds it (a sign
 * window open on it), it is a send in flight and the page waits on it; once
 * the wallet broadcast it, the page writes that hash on the claim and follows
 * it; where the wallet holds it nowhere (a request queued and then dropped, a
 * window the browser closed), the send did not go out, never that it may
 * still land, so the page releases the claim, where it still holds no hash,
 * and offers the start again. The setup's save is the one exception: its page
 * reads the setup and the stored save between its claim and its send, so a
 * save held nowhere reads as in flight while the claim is younger than the
 * limit past which that page never sends, and is judged again once it is
 * older. A key's own send is queued under the claim's request id as the key's
 * listed basic account, so its claim reads exactly as an account's batch
 * does. A read of the queue that does not answer is read again, never taken
 * as an answer.
 *
 * The page whose live run wrote the claim is no arrival: it keeps its own
 * in-flight state while its send runs and follows its own hash to the
 * receipt, and writes the hash on the claim once the wallet answers one (the
 * submission and the execution write the claim back with it where an arrival
 * released it meanwhile). Right before its request is added, that page asks
 * whether the claim is still its own with no hash, and adds nothing where an
 * arrival released it. A second request of the same account, sent while the
 * first one still waits in the wallet, is refused by the request queue.
 */
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import { heldRequestStateOf, sendRequestStateOf } from '@web/modules/social-recovery/shared/client'
import type { SendRequestPort } from '@web/modules/social-recovery/shared/client'

import type { ClaimReading, RequestHold, StoredClaim } from './types'

/** The first reading of a stored claim: in flight under its hash, or one whose request the wallet's queue decides. */
export const claimReadingOf = ({ transactionHash }: StoredClaim): ClaimReading =>
  transactionHash ? { kind: 'inFlight', transactionHash } : { kind: 'noHash' }

/**
 * Where the wallet holds the request `requestId` that `account` queued. With
 * no account, the wallet no longer lists the key that queued it, but its
 * queue or its sign screen may still hold the request, which then reads
 * held; held nowhere, it reads free, since the wallet can neither follow that
 * request's activity nor send again for a key it does not list. Throws where
 * the wallet does not answer, so the caller reads again.
 */
export const requestHoldOf = async (
  requests: SendRequestPort,
  requestId: string,
  account: Address | undefined,
  chainId: number | bigint
): Promise<RequestHold> => {
  const state = account
    ? await sendRequestStateOf(requests, requestId, account, chainId)
    : await heldRequestStateOf(requests, requestId)
  switch (state.status) {
    case 'broadcast':
      return { status: 'broadcast', transactionHash: state.transactionHash }
    case 'gone':
      return { status: 'free' }
    case 'unread':
      throw new Error(`The wallet did not answer where it holds request ${requestId}.`)
    default:
      return { status: 'held' }
  }
}
