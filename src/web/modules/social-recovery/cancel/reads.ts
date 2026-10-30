/**
 * The page's own reads of an account's attempt. A page poll reads the account
 * at the latest block through the watcher's poll of one account, writes the
 * account's record under the record's queue, so the banner and the badge
 * follow what the page read, and answers its own reading: the record is not
 * read back, since a newer write may stand there.
 */
import isUndefined from 'lodash/isUndefined'
import omitBy from 'lodash/omitBy'
import isEqual from 'react-fast-compare'
import { isAddress, isAddressEqual, isHex, keccak256 } from 'viem'

import type { BlockHeader, RawLog } from '@kohaku-eth/social-recovery'
import {
  CHAIN_IDS,
  providerReadFailure,
  readWithin,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import {
  watchedDeploymentOf,
  watcherConnectionFor
} from '@web/modules/social-recovery/shared/client/watcher-reads'
import {
  isOfDeployment,
  recordDeploymentOf
} from '@web/modules/social-recovery/shared/records/deployment'
import { extensionRecordStorage } from '@web/modules/social-recovery/shared/records/extensionStorage'
import { sameHash } from '@web/modules/social-recovery/shared/writes/hashes'
import {
  pollAccount,
  pollAccounts,
  POLL_LIMIT_MS,
  readWatcherRecord,
  SCAN_LIMIT_MS,
  updateWatcherRecord
} from '@web/modules/social-recovery/watcher'
import type { WatcherReading } from '@web/modules/social-recovery/watcher'

import { LANDING_ATTEMPTS } from './constants'
import type {
  AttemptReader,
  AttemptReaderInput,
  CancelLog,
  LandingInput,
  LandingOutcome,
  LandingReader,
  LandingReaderInput,
  OwnerCancelInput,
  PollOnceInput,
  ReceiptLog
} from './types'

/**
 * A reading with its block and its absent members left out: a reading read
 * back from storage and a fresh poll of an unchanged attempt compare equal.
 */
const comparableOf = ({ block, attempt, ended, ...rest }: WatcherReading) => ({
  ...rest,
  ...(attempt ? { attempt: omitBy(attempt, isUndefined) } : {}),
  ...(ended ? { ended: omitBy(ended, isUndefined) } : {})
})

/**
 * A fresh reading of the account at the latest block, written to its record
 * under the time the read started, as the background's poll stamps its own.
 * The record is written only where the reading changed, apart from its block,
 * or where it carries a failed mark to clear; a reading of a block below the
 * stored one writes nothing, not even its start time, so a poll that started
 * earlier but read a newer block is still written, and the read answers the
 * stored newer reading, never the lagging node's. Rejects as a failed
 * provider read where the poll failed or did not answer within its limit, and
 * marks the record failed: a failed read never reads as no attempt.
 */
export const attemptReaderOf =
  ({
    reads,
    deployment,
    account,
    chainId,
    storage,
    now = Date.now,
    limitMs = POLL_LIMIT_MS,
    scanLimitMs = SCAN_LIMIT_MS
  }: AttemptReaderInput): AttemptReader =>
  async () => {
    const polledAt = now()
    let latest: Promise<BlockHeader> | undefined
    const latestBlock = () => {
      latest = latest ?? reads.latestBlock()
      return latest
    }
    try {
      const record = await readWatcherRecord(storage, chainId, account)
      // A reading of another deployment, or one that names none, says nothing of this one.
      const previous = isOfDeployment(record?.reading?.deployment, deployment)
        ? record?.reading
        : undefined
      const reading: WatcherReading = {
        ...(await pollAccount(reads, account, latestBlock, previous, {
          stateMs: limitMs,
          scanMs: scanLimitMs
        })),
        deployment
      }
      const unchanged =
        !!previous && !record?.failed && isEqual(comparableOf(previous), comparableOf(reading))
      // A reading of a newer block than the page's own stands: the page's node lags.
      let answer = previous && previous.block.number > reading.block.number ? previous : reading
      const newer = (stored: WatcherReading | undefined) => {
        if (stored && stored.block.number > answer.block.number) {
          answer = stored
        }
      }
      if (!unchanged) {
        const written = await updateWatcherRecord(
          storage,
          chainId,
          account,
          (current) => {
            const stored = current?.reading
            const ours = isOfDeployment(stored?.deployment, deployment)
            if (ours && stored && reading.block.number < stored.block.number) {
              newer(stored)
              // A throw inside the update leaves the record untouched, its poll's start time too.
              throw new Error(
                `The page read block ${reading.block.number}, below the stored ${stored.block.number}.`
              )
            }
            // A new manager numbers its attempts afresh: no dismissal of another deployment holds.
            return { reading, dismissed: ours ? current?.dismissed ?? [] : [] }
          },
          { now, polledAt }
        ).catch(() => undefined)
        newer(written?.reading)
      }
      return answer
    } catch (thrown: unknown) {
      const failed = {
        at: now(),
        message: thrown instanceof Error ? thrown.message : String(thrown)
      }
      await updateWatcherRecord(
        storage,
        chainId,
        account,
        (current) => ({ ...current, failed, dismissed: current?.dismissed ?? [] }),
        { now, polledAt }
      ).catch(() => undefined)
      throw providerReadFailure('call', thrown)
    }
  }

/** A receipt's log in the kit's form; a log whose fields are not hex is none of the manager's. */
const rawLogOf = (log: ReceiptLog): RawLog | undefined => {
  const { address, topics, data, blockHash, transactionHash } = log
  if (
    !isAddress(address, { strict: false }) ||
    !topics.every((topic) => isHex(topic)) ||
    !isHex(data) ||
    !isHex(blockHash) ||
    !isHex(transactionHash)
  ) {
    return undefined
  }
  return {
    address,
    topics: topics as RawLog['topics'],
    data,
    blockNumber: log.blockNumber,
    blockHash,
    logIndex: log.index,
    transactionHash,
    removed: log.removed
  }
}

/**
 * The owner's cancel of the account among a receipt's logs, decoded by the
 * kit's events feed: it names the attempt the cancel ended, whatever its id.
 * Only the logs of the receipt's own transaction count. Undefined where no
 * log is that cancel; a log at the manager's address that does not decode
 * throws, and the caller then falls back to the reading by id.
 */
export const ownerCancelOf = ({
  logs,
  transactionHash,
  events,
  account,
  action
}: OwnerCancelInput): CancelLog | undefined =>
  logs
    .map((log) => {
      const raw = rawLogOf(log)
      return raw && !raw.removed && sameHash(raw.transactionHash, transactionHash)
        ? events.decodeLog(raw)
        : undefined
    })
    .find(
      (decoded): decoded is CancelLog =>
        decoded?.kind === 'attempt-cancelled' &&
        decoded.cancelledBy === 'cancelByOwner' &&
        isAddressEqual(decoded.account, account) &&
        isAddressEqual(decoded.action, action)
    )

/**
 * What a landed cancel ended. The receipt's own log of the owner's cancel
 * names the attempt it ended, whatever its id, so a later cancel of the
 * account from another device is never taken for this one; the attempt is
 * named by its new key where the opening's payload decodes, and a fresh
 * reading brings the record up to date. Only where the receipt's logs could
 * not be read does the read fall back to the ending logs by id: a fresh
 * reading at or past the receipt's block, then the ending logs of the
 * attempts from the newest the reading names down to the one the run meant;
 * an owner's cancel logged by the receipt's own transaction is taken as this
 * cancel, and one of another transaction never is. Without one, an ending of
 * the meant attempt by another road reads as that road. Anything else answers
 * undefined, so the caller reads again.
 */
export const landingReaderOf = ({
  reads,
  account,
  readAttempt,
  limitMs = SCAN_LIMIT_MS
}: LandingReaderInput): LandingReader => {
  const newKeyOf = (attemptId: bigint, block: number) =>
    readWithin(async () => {
      // At the cancel's block the manager still holds the attempt it ended, with its payload's hash.
      const state = await reads.stateOf(account, block)
      if (state.attempt.attemptId !== attemptId) {
        return undefined
      }
      const { started } = await reads.attemptEventsOf(account, attemptId, {
        from: state.setupCommittedAtBlock,
        to: block
      })
      return started && sameHash(keccak256(started.payload), state.attempt.payloadHash)
        ? reads.handoverOf(started.payload)?.newAuthority
        : undefined
    }, limitMs).catch(() => undefined)

  const cancelledOf = async (
    attemptId: bigint,
    block: number,
    known: LandingInput['known']
  ): Promise<LandingOutcome> => {
    const newKey =
      attemptId === known?.attemptId && known.newKey
        ? known.newKey
        : await newKeyOf(attemptId, block)
    return { stage: 'cancelled', attemptId, ...(newKey ? { newKey } : {}) }
  }

  return async ({ target, known, startBlock, landedBlock, transactionHash, cancelled }) => {
    if (cancelled) {
      await readAttempt().catch(() => undefined)
      return cancelledOf(cancelled.attemptId, cancelled.at.blockNumber, known)
    }
    const reading = await readAttempt()
    const pinned = reading.block.number
    if (pinned < landedBlock) {
      return undefined
    }
    const newest = reading.attempt?.attemptId ?? reading.ended?.attemptId ?? target
    const ids: bigint[] = []
    for (let id = newest; id >= target && ids.length < LANDING_ATTEMPTS; id -= 1n) {
      ids.push(id)
    }
    const scans = await readWithin(
      () =>
        Promise.all(
          ids.map(async (attemptId) => ({
            attemptId,
            events: await reads.attemptEventsOf(account, attemptId, {
              from: Math.min(startBlock, landedBlock),
              to: pinned,
              until: 'ending'
            })
          }))
        ),
      limitMs
    )
    const owners = scans.find(
      ({ events }) =>
        events.cancelled?.cancelledBy === 'cancelByOwner' &&
        sameHash(events.cancelled.at.transactionHash, transactionHash)
    )
    if (owners?.events.cancelled) {
      return cancelledOf(owners.attemptId, owners.events.cancelled.at.blockNumber, known)
    }
    const meant = scans.find(({ attemptId }) => attemptId === target)?.events.cancelled
    const ended = reading.ended?.attemptId === target ? reading.ended : undefined
    const road = meant?.cancelledBy ?? (ended?.road === 'cancelled' ? ended.cancelledBy : undefined)
    if (road && road !== 'cancelByOwner') {
      return { stage: 'otherRoad', attemptId: target, road }
    }
    return undefined
  }
}

/** The deployment the watcher reads: the build's deployed kit, or none. */
export const cancelDeploymentOf = () => {
  try {
    return watchedDeploymentOf(WALLET_RECOVERY_CHAIN)
  } catch {
    // A malformed deployment variable leaves the build with no kit to read.
    return undefined
  }
}

/**
 * One poll of one account from a page, over a provider built for this poll
 * and released after it. The poll writes the record, a failed one as failed.
 * Nothing runs where the build reads no deployed kit or the wallet holds no
 * network for the chain.
 */
export const pollOnce = async ({
  account,
  network,
  deployment = cancelDeploymentOf,
  connect = watcherConnectionFor,
  storage = extensionRecordStorage,
  now = Date.now,
  limitMs = POLL_LIMIT_MS,
  scanLimitMs = SCAN_LIMIT_MS
}: PollOnceInput): Promise<void> => {
  const descriptor = deployment()
  if (!descriptor || !network) {
    return
  }
  const connection = connect(network, descriptor)
  try {
    await pollAccounts({
      reads: connection.reads,
      deployment: recordDeploymentOf(descriptor),
      accounts: [account],
      chainId: CHAIN_IDS[WALLET_RECOVERY_CHAIN],
      storage,
      now,
      limitMs,
      scanLimitMs
    })
  } finally {
    connection.destroy()
  }
}
