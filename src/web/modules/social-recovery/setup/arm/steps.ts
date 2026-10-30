/**
 * The save's steps over the wallet's own seams: the setup read and the prepare
 * through the client, the shared gas check of the batch the controlling key sends, the
 * send through the request queue with the recovery kit's mark, the check after
 * the landing with its wait for a new block, a second wait for a receipt, the
 * wipe of the six setup records, and the save in flight stored on this device
 * with the wallet's reading of its request.
 *
 * The batch is the prepared calls in order and nothing else: for an account
 * with no code the account library deploys it in the same transaction.
 */
import type { PreparedBatch, PreparedCall } from '@kohaku-eth/social-recovery'
import {
  accountBatchTransactionOf,
  newSendRequestId,
  privacyLevelOf,
  recoveryKitMarkOf,
  sendRequestStateOf,
  shapeNoteOf
} from '@web/modules/social-recovery/shared/client'
import {
  assertWriteDoor,
  checkGas,
  driveAccountBatch,
  receiptOf,
  walletAccountRefOf
} from '@web/modules/social-recovery/shared/writes'

import { sdkDraftOf } from '@web/modules/social-recovery/shared/records'
import type { SetupDraftRecord } from '@web/modules/social-recovery/shared/records'

import { blockOrNone, waitForNewBlock } from './block'
import type { PastCountdownInput, PreparedSave, SaveSteps, SaveStepsInput } from './types'

/** The calls of a prepared write, in order: a batch's own, or the one call. */
export const callsOf = (prepared: PreparedCall | PreparedBatch): readonly PreparedCall[] =>
  prepared.kind === 'batch' ? prepared.calls : [prepared]

/**
 * The draft the save commits. At Shape visible the public note is rebuilt from
 * the draft's path and wait as they stand now, since the path may have changed
 * after the privacy step wrote the note. Any other level commits the draft as
 * it is. The editor's threshold flags never reach the SDK.
 */
export const committedDraftOf = (draft: SetupDraftRecord): SetupDraftRecord => {
  if (privacyLevelOf(draft.privacy) !== 'shape-visible') {
    return draft
  }
  const { clauses, wait, ignoresPause } = draft
  const publicMetadata = shapeNoteOf({ clauses, wait, ignoresPause })
  return publicMetadata === draft.privacy.publicMetadata
    ? draft
    : { ...draft, privacy: { ...draft.privacy, publicMetadata } }
}

/**
 * Ends this device's countdown of an attempt the chain shows over, once a
 * setup write on the account landed: the recovery that brought the account
 * here is done. A waiting or due attempt's countdown stays, and a read that
 * fails ends nothing.
 */
export const endPastCountdown = async ({
  client,
  records,
  chainId,
  account
}: PastCountdownInput): Promise<void> => {
  const last = await client.walletReads.attemptState().then(
    (state) => state.attempt,
    () => undefined
  )
  if (last) {
    await records.endPastCountdown(chainId, account, last).catch(() => false)
  }
}

export const saveStepsOf = (input: SaveStepsInput): SaveSteps => {
  const { client, facts, key } = input
  const inFlight = input.records.saveInFlight(input.chainId, input.account)
  // A block number that is not a safe integer of zero or more reads as a failed read.
  const blockNumber = async (): Promise<number> => {
    const answered = await input.receipts.blockNumber()
    const block = blockOrNone(answered)
    if (block === undefined) {
      throw new Error(`The chain answered no usable block number: ${String(answered)}`)
    }
    return block
  }
  return {
    account: input.account,
    followedSave: ({ draft, prepared }) => ({ draft, prepared, calls: callsOf(prepared) }),
    async hasSetup(): Promise<boolean> {
      const state = await client.setup.setupState()
      return state.hasSetup
    },
    async prepare(): Promise<PreparedSave> {
      const draft = committedDraftOf(input.draft)
      if (draft !== input.draft) {
        await input.setup.writeDraftAndPath(draft)
      }
      const password = draft.privacy.backup === 'encrypted' ? input.password : undefined
      const prepared = await client.setup.prepareCommitSetup(sdkDraftOf(draft), password)
      assertWriteDoor('save', prepared)
      return { draft, prepared, calls: callsOf(prepared) }
    },
    checkGas: ({ prepared, calls }, passBar) =>
      checkGas({
        write: 'save',
        prepared,
        key,
        reads: input.reads,
        network: facts.network,
        transaction: accountBatchTransactionOf(facts, key, calls),
        operates: walletAccountRefOf(facts),
        passBar
      }),
    newRequestId: newSendRequestId,
    readInFlight: () => inFlight.read(),
    claim: ({ draft, prepared }, requestId, startBlock) =>
      inFlight.claim({
        draft,
        prepared,
        requestId,
        claimedAt: Date.now(),
        ...(startBlock !== undefined ? { startBlock } : {})
      }),
    markSent: (requestId, transactionHash, startBlock) =>
      inFlight.markSent(requestId, transactionHash, startBlock),
    async release(requestId): Promise<void> {
      await inFlight.release(requestId)
    },
    async releaseUnsent(requestId): Promise<void> {
      await inFlight.releaseUnsent(requestId)
    },
    requestState: (requestId) =>
      sendRequestStateOf(input.requests, requestId, input.account, input.chainId),
    queueMoved: (limitMs) =>
      new Promise((resolve) => {
        let moved = false
        let timer: ReturnType<typeof setTimeout> | undefined
        let unsubscribe: (() => void) | undefined
        const done = () => {
          if (moved) {
            return
          }
          moved = true
          clearTimeout(timer)
          unsubscribe?.()
          resolve()
        }
        timer = setTimeout(done, limitMs)
        unsubscribe = input.requests.subscribe(({ controller }) => {
          if (controller === 'requests') {
            done()
          }
        })
        if (moved) {
          unsubscribe()
        }
      }),
    blockNumber,
    transactionKnown: (transactionHash) => input.receipts.transactionKnown(transactionHash),
    send: ({ calls }, dispatch, run, requestId, startBlock, onEstimation, canAdd) =>
      driveAccountBatch({
        dispatch,
        run,
        // The drive starts from the block the run already holds, so it reads
        // nothing from the network before it hands the request to the wallet.
        receipts: {
          blockNumber: () => Promise.resolve(startBlock),
          wait: (transactionHash, from) => input.receipts.wait(transactionHash, from)
        },
        port: input.port,
        account: input.account,
        calls,
        onEstimation,
        recoveryKit: recoveryKitMarkOf(client.descriptor),
        requestId,
        canAdd
      }),
    async waitAgain(transactionHash, startBlock, dispatch, run, onKnown): Promise<void> {
      // The wait's own lookup of the transaction is not exposed: one read
      // beside it answers whether the node knows the transaction as it opens.
      if (onKnown) {
        input.receipts
          .transactionKnown(transactionHash)
          .then((known) => {
            if (known === 'known') {
              onKnown()
            }
          })
          .catch(() => undefined)
      }
      try {
        const from = startBlock ?? (await blockNumber())
        const receipt = receiptOf(await input.receipts.wait(transactionHash, from))
        // A receipt with no status reads neither way, so the write keeps its hash.
        if (receipt) {
          dispatch({ type: 'receipt', run, receipt })
        }
      } catch (error: unknown) {
        dispatch({ type: 'error', run, error, transactionHash })
      }
    },
    confirm: ({ draft, prepared }) => client.setup.confirmSetup(sdkDraftOf(draft), prepared),
    newBlock: (limitMs) => waitForNewBlock(() => input.receipts.blockNumber(), limitMs),
    async wipe() {
      await input.records.saveSetup(input.chainId, input.account)
      await endPastCountdown(input)
    }
  }
}
