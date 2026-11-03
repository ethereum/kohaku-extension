/**
 * The execution's steps over the wallet's own seams, in the submission's
 * shape: the countdown and its execution in flight in the records, the
 * execution call the client prepares for the attempt and the payload that
 * started it, the shared gas check on the same sending key, the send through
 * the request queue by route, the receipt wait, where the wallet holds the
 * request of a claim with no hash, the manager's events for a hash the node no
 * longer knows, and the node's read of a hash.
 *
 * The run keeps its own countdown: the one that names the attempt the run
 * was started for, by its id, its setup number and its payload hash. Every
 * read of the countdown is matched on those three values, and a record of
 * another attempt, or one with none of them, reads as `replaced`. Every update
 * reads the countdown first, matches it the same way and passes the revision
 * it read; a record of another attempt is refused, with nothing claimed,
 * written or released on it. Where another page moved the run's own countdown
 * meanwhile, the update is tried again over a fresh read while the countdown
 * is there; a refused record is never tried again.
 */
import type { Address, Hex } from '@kohaku-eth/social-recovery'
import {
  accountBatchTransactionOf,
  listedBasicAccountOf,
  newSendRequestId,
  sameAddress
} from '@web/modules/social-recovery/shared/client'
import { isSessionRevisionConflict } from '@web/modules/social-recovery/shared/records'
import type {
  ExecutionInFlightRecord,
  SessionRevision
} from '@web/modules/social-recovery/shared/records'
import {
  assertWriteDoor,
  checkGas,
  driveAccountBatch,
  driveSend,
  gasTransactionOf,
  receiptOf,
  requestHoldOf,
  sameHash,
  walletAccountRefOf
} from '@web/modules/social-recovery/shared/writes'

import { COUNTDOWN_CONFLICT_RETRIES } from './constants'
import { isAttemptOf, isCountdownOf } from './read'
import type {
  ExecuteSteps,
  ExecuteStepsInput,
  ExecutionRelease,
  RunClaim,
  RunCountdownRead,
  RunWrite
} from './types'

export const executeStepsOf = (input: ExecuteStepsInput): ExecuteSteps => {
  const { records, chainId, account, landed, client, plan, network, reads, receipts, port } = input
  const { attempt, payload } = input
  const countdown = records.countdown(chainId, account)

  // A block number that is not a safe integer of zero or more reads as a failed read.
  const blockNumber = async (): Promise<number> => {
    const block = await receipts.blockNumber()
    if (!Number.isSafeInteger(block) || block < 0) {
      throw new Error(`The chain answered no usable block number: ${String(block)}`)
    }
    return block
  }

  const readOwn = async (): Promise<RunCountdownRead> => {
    const read = await countdown.read()
    if (read.status === 'present' && !isCountdownOf(read.value, landed)) {
      return { status: 'replaced' }
    }
    return read
  }

  // An update over a fresh read of the run's own countdown, read and tried again
  // where another page moved it; a countdown of another attempt answers `replaced`.
  const withFreshRevision = async <T>(
    update: (
      revision: SessionRevision,
      execution: ExecutionInFlightRecord | undefined
    ) => Promise<T>,
    replaced: T,
    tries = 0
  ): Promise<T> => {
    const read = await readOwn()
    if (read.status === 'replaced') {
      return replaced
    }
    if (read.status !== 'present') {
      throw new Error(`No countdown for ${account}`)
    }
    try {
      return await update(read.revision, read.value.execution)
    } catch (error: unknown) {
      if (!isSessionRevisionConflict(error) || tries >= COUNTDOWN_CONFLICT_RETRIES) {
        throw error
      }
      return withFreshRevision(update, replaced, tries + 1)
    }
  }

  const receiptsFrom = (startBlock: number) => ({
    blockNumber: () => Promise.resolve(startBlock),
    wait: (transactionHash: Hex, from: number) => receipts.wait(transactionHash, from)
  })

  return {
    readCountdown: readOwn,
    async prepare() {
      // The sender names who an open payee is paid to, for the screen's row.
      const from = plan.kind === 'key' ? plan.key.addr : plan.account
      const prepared = await client.recovery.prepareExecuteHandover(attempt, payload, { from })
      assertWriteDoor('execution', prepared)
      return prepared
    },
    checkGas: (prepared) =>
      plan.kind === 'key'
        ? checkGas({
            write: 'execution',
            prepared,
            key: plan.key,
            reads,
            network,
            fastTrack: true
          })
        : checkGas({
            write: 'execution',
            prepared,
            key: plan.key,
            reads,
            network,
            transaction: accountBatchTransactionOf(plan.facts, plan.key, [prepared]),
            operates: walletAccountRefOf(plan.facts)
          }),
    blockNumber,
    newRequestId: newSendRequestId,
    claim: (claim) =>
      withFreshRevision<RunClaim>(
        (revision) => countdown.claimExecution(claim, revision),
        'replaced'
      ),
    /**
     * Where the countdown names another attempt, the send already went out
     * for the run's own attempt: its hash is written on no record, and the
     * run keeps it in its own state for the receipt wait.
     */
    markSent: (claim, transactionHash) =>
      withFreshRevision<RunWrite>(async (revision, execution) => {
        if (execution?.requestId === claim.requestId) {
          await countdown.setExecutionHash(claim.requestId, transactionHash, revision)
          return 'written'
        }
        // Another page released the claim while the wallet still held the send: written back with its hash.
        if (!execution) {
          const written = await countdown.claimExecution(claim, revision)
          if (written.claimed) {
            await countdown.setExecutionHash(
              claim.requestId,
              transactionHash,
              written.record.revision
            )
          }
        }
        return 'written'
      }, 'replaced'),
    release: (requestId) =>
      withFreshRevision<RunWrite>(async (revision) => {
        await countdown.releaseExecution(requestId, revision)
        return 'written'
      }, 'replaced'),
    releaseClaim: (requestId, hashes) =>
      withFreshRevision(
        async (revision, execution): Promise<ExecutionRelease> => {
          if (!execution || execution.requestId !== requestId) {
            return { status: 'gone' }
          }
          const hash = execution.transactionHash
          if (hash && !hashes.some((known) => sameHash(known, hash))) {
            return { status: 'hashed', transactionHash: hash }
          }
          await countdown.releaseExecution(requestId, revision)
          return { status: 'released' }
        },
        { status: 'replaced' }
      ),
    requestHold: (requestId) =>
      requestHoldOf(
        input.requests,
        requestId,
        plan.kind === 'key'
          ? (listedBasicAccountOf(input.requests.accounts(), plan.key)?.addr as Address | undefined)
          : plan.account,
        chainId
      ),
    send: (prepared, dispatch, run, startBlock, requestId, canAdd) =>
      plan.kind === 'key'
        ? driveSend({
            dispatch,
            run,
            receipts: receiptsFrom(startBlock),
            port,
            key: plan.key,
            transaction: gasTransactionOf({ prepared, key: plan.key }),
            requestId,
            canAdd
          })
        : driveAccountBatch({
            dispatch,
            run,
            receipts: receiptsFrom(startBlock),
            port,
            account: plan.facts.account.addr as Address,
            calls: [prepared],
            requestId,
            canAdd
          }),
    async waitAgain(transactionHash, startBlock, dispatch, run) {
      try {
        const from = startBlock ?? (await blockNumber())
        const receipt = receiptOf(await receipts.wait(transactionHash, from))
        // A receipt with no status reads neither way, so the write keeps its hash.
        if (receipt) {
          dispatch({ type: 'receipt', run, receipt })
        }
      } catch (error: unknown) {
        dispatch({ type: 'error', run, error, transactionHash })
      }
    },
    async consumedSince(startBlock) {
      const state = await client.recovery.recoveryState()
      if (state.attempt.state === 'Consumed' && isAttemptOf(state.attempt, landed)) {
        return true
      }
      const to = state.block.number
      if (to < startBlock) {
        throw new Error(`The node reads block ${to}, before the claim's block ${startBlock}.`)
      }
      const { events } = client.recovery
      const notifications = await events.fetch(events.accountFilter(), { from: startBlock, to })
      return notifications.some(
        (notification) =>
          notification.kind === 'attempt-consumed' &&
          !notification.at.removed &&
          notification.attemptId === landed.attemptId &&
          sameAddress(notification.account, account)
      )
    },
    transactionKnown: (transactionHash) => receipts.transactionKnown(transactionHash),
    now: input.now
  }
}
