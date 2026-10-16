/**
 * The cancel's steps over the wallet's own seams: the owner's cancel prepared
 * through the client as one call the account sends, the shared gas check of
 * that call as the account's own operation from its key, the send through the
 * request queue, the receipt wait and the owner's cancel its logs carry, the
 * wallet's reading of a queued request (an operation it cannot follow to a
 * hash read apart from a held one) and its withdrawal, and the cancel in
 * flight stored on this device.
 */
import {
  accountBatchTransactionOf,
  newSendRequestId,
  sendRequestStateOf
} from '@web/modules/social-recovery/shared/client'
import {
  assertWriteDoor,
  checkGas,
  driveAccountBatch,
  walletAccountRefOf
} from '@web/modules/social-recovery/shared/writes'

import { cancelClaimsOf } from './claim'
import { ownerCancelOf } from './reads'
import type { CancelHold, CancelSteps, CancelStepsInput } from './types'

export const cancelStepsOf = (input: CancelStepsInput): CancelSteps => {
  const { account, chainId, client, facts, key, receipts, port } = input
  return {
    readAttempt: input.readAttempt,
    readLanding: input.readLanding,
    async prepare() {
      const prepared = await client.recovery.prepareCancelByOwner()
      assertWriteDoor('cancel', prepared)
      return prepared
    },
    checkGas: (prepared) =>
      checkGas({
        write: 'cancel',
        prepared,
        key,
        reads: input.chainReads,
        network: facts.network,
        transaction: accountBatchTransactionOf(facts, key, [prepared]),
        operates: walletAccountRefOf(facts)
      }),
    newRequestId: newSendRequestId,
    blockNumber: () => receipts.blockNumber(),
    claims: cancelClaimsOf(input.storage, chainId, account),
    send: ({ prepared, dispatch, run, requestId, startBlock, canAdd }) =>
      driveAccountBatch({
        dispatch,
        run,
        // The drive starts from the block the run already holds, so it reads
        // nothing from the network before it hands the request to the wallet.
        receipts: {
          blockNumber: () => Promise.resolve(startBlock),
          wait: (transactionHash, from) => receipts.wait(transactionHash, from)
        },
        port,
        account,
        calls: [prepared],
        requestId,
        canAdd
      }),
    wait: (transactionHash, startBlock) => receipts.wait(transactionHash, startBlock),
    async receiptCancel(transactionHash, startBlock) {
      // The transaction is mined, so the wait answers its receipt at once.
      const receipt = await receipts.wait(transactionHash, startBlock)
      return ownerCancelOf({
        logs: receipt.logs,
        transactionHash,
        events: client.recovery.events,
        account,
        action: client.descriptor.action
      })
    },
    async requestHold(requestId): Promise<CancelHold> {
      const state = await sendRequestStateOf(input.requests, requestId, account, chainId)
      switch (state.status) {
        case 'broadcast':
          return { status: 'broadcast', transactionHash: state.transactionHash }
        case 'gone':
          return { status: 'free' }
        // An operation the wallet cannot follow to a hash is never read as still held.
        case 'untracked':
          return { status: 'untracked' }
        case 'unread':
          throw new Error(`The wallet did not answer where it holds request ${requestId}.`)
        default:
          return { status: 'held' }
      }
    },
    withdrawRequest: (requestId) =>
      input.requests.dispatch({
        type: 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST',
        params: { id: requestId }
      })
  }
}
