/**
 * The submission's steps over the wallet's own seams: the session and its
 * claim in the records, the attempt read and the prepare through the client,
 * the shared gas check on the sending key, the send through the request queue
 * by route, the receipt wait, where the wallet holds the request of a claim
 * with no hash, and the landing of the session.
 *
 * Every update of the session reads it first and passes the revision it read;
 * where another tab moved it meanwhile (a reply poll, a note), the update is
 * tried again over a fresh read while the session is live. Every update, and
 * the landing, is bound to this run's request: a stored session of another
 * request (a gathering abandoned and gathered again in another tab) is
 * neither claimed, written nor landed.
 */
import { keccak256 } from 'viem'

import type { Address, Gathering, Hex, RecoveryState } from '@kohaku-eth/social-recovery'
import {
  accountBatchTransactionOf,
  listedBasicAccountOf,
  newSendRequestId
} from '@web/modules/social-recovery/shared/client'
import { isSessionRevisionConflict } from '@web/modules/social-recovery/shared/records'
import type {
  RecoverySessionRecord,
  SessionRevision,
  StoredSession
} from '@web/modules/social-recovery/shared/records'
import {
  assertWriteDoor,
  checkGas,
  driveAccountBatch,
  driveSend,
  gasTransactionOf,
  receiptOf,
  requestHoldOf,
  walletAccountRefOf
} from '@web/modules/social-recovery/shared/writes'

import { CONFLICT_RETRIES } from './constants'
import type {
  AttemptReading,
  ClaimRelease,
  LandOutcome,
  SubmitClaim,
  SubmitSteps,
  SubmitStepsInput
} from './types'

export const submitStepsOf = (input: SubmitStepsInput): SubmitSteps => {
  const { client, records, chainId, account, gathering, plan, network, reads } = input
  const session = records.recoverySession(chainId, account)
  const attemptId = BigInt(gathering.request.attemptId)
  const setupNonce = BigInt(gathering.request.setupNonce)
  const payloadOf = (request: Gathering['request']): Hex | undefined =>
    'payload' in request ? request.payload : undefined
  const payload = payloadOf(gathering.request)
  // The manager keeps the hash of the payload the start carried, the request's own.
  const payloadHash = keccak256(payload ?? '0x')
  // The landed session keeps that hash only where the request carried a payload.
  const landedPayloadHash = payload === undefined ? undefined : keccak256(payload)

  const sameHex = (a: Hex | undefined, b: Hex | undefined): boolean =>
    a === undefined || b === undefined ? a === b : a.toLowerCase() === b.toLowerCase()

  // The same request: its attempt number, setup number, deadline and payload.
  const isThisRequest = (request: Gathering['request']): boolean =>
    request.attemptId === gathering.request.attemptId &&
    request.setupNonce === gathering.request.setupNonce &&
    request.validUntil === gathering.request.validUntil &&
    sameHex(payloadOf(request), payload)

  const ownsSession = (value: RecoverySessionRecord): boolean => {
    switch (value.state) {
      case 'live':
        return isThisRequest(value.gathering.request)
      case 'landed':
        return (
          value.attemptId === gathering.request.attemptId &&
          value.setupNonce === gathering.request.setupNonce &&
          sameHex(value.payloadHash, landedPayloadHash)
        )
      default:
        return false
    }
  }

  // A block number that is not a safe integer of zero or more reads as a failed read.
  const blockNumber = async (): Promise<number> => {
    const block = await input.receipts.blockNumber()
    if (!Number.isSafeInteger(block) || block < 0) {
      throw new Error(`The chain answered no usable block number: ${String(block)}`)
    }
    return block
  }

  // An update over a fresh read of the session, read and tried again where
  // another tab moved it; each try judges the session as that read found it.
  const withFreshRevision = async <T>(
    update: (revision: SessionRevision, read: StoredSession) => Promise<T>,
    tries = 0
  ): Promise<T> => {
    const read = await session.read()
    if (read.status !== 'present') {
      throw new Error(`No recovery session for ${account}`)
    }
    try {
      return await update(read.revision, read)
    } catch (error: unknown) {
      if (!isSessionRevisionConflict(error) || tries >= CONFLICT_RETRIES) {
        throw error
      }
      return withFreshRevision(update, tries + 1)
    }
  }

  /**
   * This request's attempt: under its attempt number, its setup number and
   * the hash of its payload, in any state but none, so one already cancelled
   * or consumed is ours too. Under the same number with another setup number
   * or payload it is a rival's. Under another number, a waiting attempt is
   * another one running; a closed one is an earlier attempt and blocks nothing.
   */
  const attemptOf = ({ attempt }: RecoveryState): AttemptReading => {
    if (attempt.state === 'None') {
      return 'none'
    }
    if (attempt.attemptId !== attemptId) {
      return attempt.state === 'Waiting' ? 'other' : 'none'
    }
    const ours =
      attempt.setupNonce === setupNonce &&
      attempt.payloadHash.toLowerCase() === payloadHash.toLowerCase()
    return ours ? 'ours' : 'other'
  }

  const receiptsFrom = (startBlock: number, beforeReceipt: () => Promise<void>) => ({
    blockNumber: () => Promise.resolve(startBlock),
    wait: async (transactionHash: Hex, from: number) => {
      await beforeReceipt()
      return input.receipts.wait(transactionHash, from)
    }
  })

  return {
    readSession: () => session.read(),
    attemptRead: () => client.recovery.recoveryState(),
    attemptOf,
    ownsSession,
    async prepare() {
      const now = Math.floor(input.now() / 1000)
      // The client picks the smallest set of approvals that satisfies the rule.
      const request = client.recovery.complete(gathering, undefined, now)
      if (!('payload' in request)) {
        throw new Error('The gathering completed to no start request.')
      }
      // The start carries the set the screen verified and shows, or nothing is sent.
      const places = new Set(request.proofs.map((proof) => proof.place))
      if (
        places.size !== input.chosen.size ||
        [...places].some((place) => !input.chosen.has(place))
      ) {
        return { status: 'set-changed' }
      }
      const prepared = await client.recovery.prepareStartAttempt(request, now)
      assertWriteDoor('submission', prepared)
      return { status: 'prepared', prepared }
    },
    checkGas: (prepared) =>
      plan.kind === 'key'
        ? checkGas({
            write: 'submission',
            prepared,
            key: plan.key,
            reads,
            network,
            fastTrack: true
          })
        : checkGas({
            write: 'submission',
            prepared,
            key: plan.key,
            reads,
            network,
            transaction: accountBatchTransactionOf(plan.facts, plan.key, [prepared]),
            operates: walletAccountRefOf(plan.facts)
          }),
    blockNumber,
    newRequestId: newSendRequestId,
    now: input.now,
    claim: (claim) =>
      withFreshRevision(async (revision, read): Promise<SubmitClaim> => {
        if (read.value.state === 'live' && !ownsSession(read.value)) {
          return { status: 'other-request' }
        }
        const written = await session.claimSubmission(claim, revision)
        return written.claimed
          ? { status: 'claimed' }
          : { status: 'followed', submission: written.submission }
      }),
    async markSent(claim, transactionHash) {
      await withFreshRevision(async (revision, read) => {
        // A session of another request takes no claim of this one, not even written back.
        if (read.value.state !== 'live' || !ownsSession(read.value)) {
          return
        }
        const held = read.value.submission
        if (held && held.requestId !== claim.requestId) {
          return
        }
        if (held) {
          await session.setSubmissionHash(claim.requestId, transactionHash, revision)
          return
        }
        // Another tab released the claim while the wallet held the send: the
        // claim is written back with its hash, so every page follows it.
        const written = await session.claimSubmission(claim, revision)
        if (written.claimed) {
          await session.setSubmissionHash(claim.requestId, transactionHash, written.record.revision)
        }
      })
    },
    async release(requestId) {
      await withFreshRevision((revision) => session.releaseSubmission(requestId, revision))
    },
    releaseClaim: (requestId, hashes) =>
      withFreshRevision(async (revision, read): Promise<ClaimRelease> => {
        const held = read.value.state === 'live' ? read.value.submission : undefined
        if (!held || held.requestId !== requestId) {
          return { status: 'gone' }
        }
        const hash = held.transactionHash
        if (hash && !hashes.some((known) => known.toLowerCase() === hash.toLowerCase())) {
          return { status: 'hashed', transactionHash: hash }
        }
        await session.releaseSubmission(requestId, revision)
        return { status: 'released' }
      }),
    requestHold: (requestId) =>
      requestHoldOf(
        input.requests,
        requestId,
        plan.kind === 'key'
          ? (listedBasicAccountOf(input.requests.accounts(), plan.key)?.addr as Address | undefined)
          : plan.account,
        chainId
      ),
    transactionKnown: (transactionHash) => input.receipts.transactionKnown(transactionHash),
    send: (prepared, dispatch, run, startBlock, requestId, beforeReceipt, canAdd) =>
      plan.kind === 'key'
        ? driveSend({
            dispatch,
            run,
            receipts: receiptsFrom(startBlock, beforeReceipt),
            port: input.port,
            key: plan.key,
            transaction: gasTransactionOf({ prepared, key: plan.key }),
            requestId,
            canAdd
          })
        : driveAccountBatch({
            dispatch,
            run,
            receipts: receiptsFrom(startBlock, beforeReceipt),
            port: input.port,
            account: plan.account,
            calls: [prepared],
            requestId,
            canAdd
          }),
    async waitAgain(transactionHash, startBlock, dispatch, run) {
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
    land: (executableAt) =>
      // A session another page landed meanwhile for this request, on any try,
      // is this landing done; one of another request is not this run's to land.
      withFreshRevision(async (revision, read): Promise<LandOutcome> => {
        if (read.value.state === 'landed') {
          return ownsSession(read.value) ? 'landed' : 'other-request'
        }
        if (read.value.state === 'live' && !ownsSession(read.value)) {
          return 'other-request'
        }
        await records.landSubmission(chainId, account, revision, executableAt)
        return 'landed'
      })
  }
}
