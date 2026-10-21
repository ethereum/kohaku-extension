/**
 * One poll of the watcher: every read of it pinned to the latest block, read
 * once for the whole poll, never the finalized one.
 *
 * An account's reading is drawn from the manager's record at that block
 * alone, so an attempt a reorganization dropped is gone from the next reading
 * that no longer reads it, and an attempt that ended reads as its ending. A
 * poll that fails, or whose state reads do not answer within their limit,
 * keeps the last good reading and marks it failed; it never reads as no
 * attempt. The log scans run under a limit of their own, so a slow scan only
 * leaves its fields unread for the next poll.
 *
 * The record holds the payload's hash alone, so the key an attempt hands the
 * account to comes from its opening log, decoded in the action's layout, and
 * only from an opening whose payload hashes to the record's. Until that decode
 * returned the reading carries the countdown and no key.
 */
import { getAddress, isAddress, keccak256, zeroHash } from 'viem'

import type { Account } from '@ambire-common/interfaces/account'
import type {
  ActionState,
  Address,
  BlockHeader,
  BlockRange,
  Hex
} from '@kohaku-eth/social-recovery'
import { readWithin, within } from '@web/modules/social-recovery/shared/client/limits'
import { isProviderReadFailure } from '@web/modules/social-recovery/shared/client/provider-adapter'
import type {
  AttemptEvents,
  AttemptScan,
  WatcherReads
} from '@web/modules/social-recovery/shared/client/types'
import { isOfDeployment } from '@web/modules/social-recovery/shared/records/deployment'
import { sameHash } from '@web/modules/social-recovery/shared/writes/hashes'

import { RESCAN_MARGIN_BLOCKS } from './constants'
import { attemptDismissed, readWatcherRecord, updateWatcherRecord } from './record'
import type {
  AttemptEnding,
  Opening,
  PollInput,
  PollLimits,
  WatchedAttempt,
  WatcherReading,
  WatcherRecord
} from './types'

/**
 * The smart accounts among the listed ones, each once; a basic account holds
 * no setup, and an address that does not parse is skipped.
 */
export const watchedAccountsOf = (accounts: readonly Account[]): Address[] =>
  accounts
    .filter((account) => !!account.creation && isAddress(account.addr, { strict: false }))
    .map((account) => getAddress(account.addr))
    .filter((addr, index, all) => all.indexOf(addr) === index)

// Anything that reads as a URL, which a provider's error text can carry with a key in it.
const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/\S+/gi
const MESSAGE_LIMIT = 200

// The text of a failure: ethers' short message where it gives one, which leaves out the request.
const textOf = (thrown: unknown): string => {
  if (!(thrown instanceof Error)) {
    return String(thrown)
  }
  if ('shortMessage' in thrown && typeof thrown.shortMessage === 'string' && thrown.shortMessage) {
    return thrown.shortMessage
  }
  if (isProviderReadFailure(thrown)) {
    return `The provider could not answer ${thrown.read}: ${textOf(thrown.cause)}`
  }
  return thrown.message
}

/** The failure's text as a record keeps it: with no URL in it and at most 200 characters. */
export const messageOf = (thrown: unknown): string =>
  textOf(thrown).replace(URL_PATTERN, '<url>').slice(0, MESSAGE_LIMIT)

const samePayload = (payload: Hex, payloadHash: Hex): boolean =>
  sameHash(keccak256(payload), payloadHash)

/** The attempt the last reading holds, where it is this attempt with this payload. */
const heldAttemptOf = (
  attempt: ActionState['attempt'],
  previous: WatcherReading | undefined
): WatchedAttempt | undefined => {
  const held = previous?.attempt
  return held &&
    held.attemptId === attempt.attemptId &&
    sameHash(held.payloadHash, attempt.payloadHash)
    ? held
    : undefined
}

const openingFieldsOf = ({
  openedAt,
  newKey,
  removedKey,
  openingGap,
  scannedTo,
  scannedFrom,
  openingBlock
}: Opening): Opening => ({
  ...(openedAt !== undefined ? { openedAt } : {}),
  ...(newKey ? { newKey } : {}),
  ...(removedKey ? { removedKey } : {}),
  ...(openingGap ? { openingGap } : {}),
  ...(scannedTo !== undefined ? { scannedTo } : {}),
  ...(scannedFrom !== undefined ? { scannedFrom } : {}),
  ...(openingBlock !== undefined ? { openingBlock } : {})
})

/**
 * The block ranges an opening not found yet is scanned over, newest first: the
 * blocks from a margin below the last scan's last block to the pinned block,
 * then the blocks below the ones the earlier scans reached, where they ran out
 * before the setup block. The first scan reads from the setup block.
 */
const rangesBelowOf = (
  setupBlock: number,
  pinned: number,
  held: WatchedAttempt | undefined
): BlockRange[] => {
  const heldTo = held?.scannedTo
  if (heldTo === undefined) {
    return [{ from: setupBlock, to: pinned }]
  }
  const top: BlockRange = {
    from: Math.max(setupBlock, heldTo - RESCAN_MARGIN_BLOCKS),
    to: pinned
  }
  const below = held?.scannedFrom
  if (below === undefined || below <= setupBlock) {
    return top.from <= top.to ? [top] : []
  }
  if (below >= top.from) {
    return [{ from: setupBlock, to: pinned }]
  }
  const rest: BlockRange = { from: setupBlock, to: below - 1 }
  return top.from <= top.to ? [top, rest] : [rest]
}

/**
 * The ranges of `rangesBelowOf`, after the one block an earlier poll found the
 * opening in where it ended before reading the opening's time: an opening once
 * found is read there first and never skipped.
 */
const openingRangesOf = (
  setupBlock: number,
  pinned: number,
  held: WatchedAttempt | undefined
): BlockRange[] => {
  const found = held?.openingBlock
  const ranges = rangesBelowOf(setupBlock, pinned, held)
  return found !== undefined && found <= pinned ? [{ from: found, to: found }, ...ranges] : ranges
}

/**
 * The blocks the scans of this poll and the earlier ones read, as one range:
 * the merged stretch that reaches highest. The blocks below it are scanned on
 * a later poll.
 */
const coveredOf = (read: BlockRange[]): BlockRange | undefined =>
  [...read]
    .sort((a, b) => b.to - a.to)
    .reduce<BlockRange | undefined>((covered, range) => {
      if (!covered) {
        return { ...range }
      }
      return range.to >= covered.from - 1
        ? { from: Math.min(covered.from, range.from), to: covered.to }
        : covered
    }, undefined)

/**
 * The attempt's opening. A decoded opening, or one whose payload does not
 * decode, is never read again. One not found is scanned again on every poll
 * from a margin below the last scan's last block, so a log a lagging node or
 * a reorganization put there is read later; a scan that runs out of its limit
 * keeps the chunks it read before the one holding the opening, so a long range
 * progresses across polls. An opening found by a poll that then failed or ran
 * out of its limit keeps its block for the next poll.
 */
const openingOf = async (
  reads: WatcherReads,
  account: Address,
  state: ActionState,
  block: BlockHeader,
  previous: WatcherReading | undefined,
  scanMs: number
): Promise<Opening> => {
  const { attempt } = state
  const held = heldAttemptOf(attempt, previous)
  if (held && (held.openingGap === undefined || held.openingGap === 'undecodable')) {
    return openingFieldsOf(held)
  }
  const setupBlock = state.setupCommittedAtBlock
  const ranges = openingRangesOf(setupBlock, block.number, held)
  // The lowest block each range's scan reached, by the range's place.
  const reached: (number | undefined)[] = ranges.map(() => undefined)
  let foundAt: number | undefined
  let stopped = false
  const read = await within(async (): Promise<Opening> => {
    const started = await ranges.reduce<Promise<AttemptEvents['started']>>(
      async (found, range, index) =>
        (await found) ??
        (
          await reads.attemptEventsOf(account, attempt.attemptId, {
            ...range,
            until: 'opening',
            stop: () => stopped,
            onChunk: (from) => {
              reached[index] = from
            }
          })
        ).started,
      Promise.resolve(undefined)
    )
    if (!started || !samePayload(started.payload, attempt.payloadHash)) {
      return { openingGap: 'not-found', scannedTo: block.number }
    }
    foundAt = started.at.blockNumber
    const openedAt = await reads.blockTime(started.at.blockNumber)
    const handover = reads.handoverOf(started.payload)
    if (!handover) {
      return { openedAt, openingGap: 'undecodable' }
    }
    return { openedAt, newKey: handover.newAuthority, removedKey: handover.removedAuthority }
  }, scanMs)
  // A scan still running past its limit stops before its next chunk.
  stopped = true
  if (read) {
    return read
  }
  const earlier: BlockRange[] =
    held?.scannedTo === undefined
      ? []
      : [{ from: held.scannedFrom ?? setupBlock, to: held.scannedTo }]
  const covered = coveredOf([
    ...earlier,
    ...ranges.flatMap((range, index) => {
      const from = reached[index]
      return from === undefined ? [] : [{ from, to: range.to }]
    })
  ])
  return openingFieldsOf({
    openingGap: 'read-failed',
    scannedTo: covered?.to,
    scannedFrom: covered && covered.from > setupBlock ? covered.from : undefined,
    openingBlock: foundAt
  })
}

const roadOf = (attempt: ActionState['attempt']): AttemptEnding['road'] =>
  attempt.state === 'Consumed' ? 'executed' : 'cancelled'

/** The ending the last reading holds for this attempt and road. */
const heldEndingOf = (
  attempt: ActionState['attempt'],
  previous: WatcherReading | undefined
): AttemptEnding | undefined => {
  const held = previous?.ended
  return held && held.attemptId === attempt.attemptId && held.road === roadOf(attempt)
    ? held
    : undefined
}

/**
 * The ending the last reading holds for this attempt where it is settled:
 * every field named, or its logs read and a field found missing for good.
 */
const settledEndingOf = (
  attempt: ActionState['attempt'],
  previous: WatcherReading | undefined
): AttemptEnding | undefined => {
  const held = heldEndingOf(attempt, previous)
  if (!held) {
    return undefined
  }
  if (held.endingGap !== undefined) {
    return held
  }
  const named = held.road === 'executed' ? !!held.controller : !!held.cancelledBy
  return named && held.at !== undefined ? held : undefined
}

/**
 * The blocks an ending's logs are scanned over: from the setup's commit, or,
 * once a scan found a log missing, from a margin below that scan's block, to
 * the pinned block.
 */
const endingScanOf = (
  state: ActionState,
  block: BlockHeader,
  notFoundAt: number | undefined,
  until: AttemptScan['until']
): AttemptScan => ({
  from:
    notFoundAt === undefined
      ? state.setupCommittedAtBlock
      : Math.max(state.setupCommittedAtBlock, notFoundAt - RESCAN_MARGIN_BLOCKS),
  to: block.number,
  until
})

/**
 * An ending a scan found a log of missing: looked for again until the pinned
 * block is a margin past the first such scan, then settled without it.
 */
const notFoundEndingOf = (
  ending: AttemptEnding,
  notFoundAt: number | undefined,
  block: BlockHeader
): AttemptEnding => {
  const first = notFoundAt ?? block.number
  return block.number >= first + RESCAN_MARGIN_BLOCKS
    ? { ...ending, endingGap: 'not-found' }
    : { ...ending, notFoundAt: first }
}

/** An ending whose logs did not answer this poll, keeping what earlier polls read. */
const unreadEndingOf = (ending: AttemptEnding, held: AttemptEnding | undefined): AttemptEnding => ({
  ...ending,
  ...(held?.at !== undefined ? { at: held.at } : {}),
  ...(held?.notFoundAt !== undefined ? { notFoundAt: held.notFoundAt } : {})
})

/** The controller an earlier reading already decoded for this attempt. */
const knownControllerOf = (
  attempt: ActionState['attempt'],
  previous: WatcherReading | undefined
): Address | undefined => {
  const ended = previous?.ended
  if (ended?.attemptId === attempt.attemptId && ended.road === 'executed' && ended.controller) {
    return ended.controller
  }
  return heldAttemptOf(attempt, previous)?.newKey
}

const executedOf = async (
  reads: WatcherReads,
  account: Address,
  state: ActionState,
  block: BlockHeader,
  previous: WatcherReading | undefined,
  scanMs: number
): Promise<AttemptEnding> => {
  const { attempt } = state
  const { attemptId } = attempt
  const known = knownControllerOf(attempt, previous)
  const held = heldEndingOf(attempt, previous)
  const read = await within(async (): Promise<AttemptEnding> => {
    // With the controller already decoded only the consume log is needed.
    const { started, consumed } = await reads.attemptEventsOf(
      account,
      attemptId,
      endingScanOf(state, block, held?.notFoundAt, known ? 'ending' : 'opening')
    )
    const at = consumed ? await reads.blockTime(consumed.at.blockNumber) : held?.at
    const opening =
      started && samePayload(started.payload, attempt.payloadHash) ? started : undefined
    const controller =
      known ?? (opening ? reads.handoverOf(opening.payload)?.newAuthority : undefined)
    const ending: AttemptEnding = { attemptId, road: 'executed', controller, at }
    if (at === undefined || (!known && !opening)) {
      return notFoundEndingOf(ending, held?.notFoundAt, block)
    }
    return controller ? ending : { ...ending, endingGap: 'undecodable' }
  }, scanMs)
  return (
    read ??
    unreadEndingOf({ attemptId, road: 'executed', ...(known ? { controller: known } : {}) }, held)
  )
}

const cancelledOf = async (
  reads: WatcherReads,
  account: Address,
  state: ActionState,
  block: BlockHeader,
  previous: WatcherReading | undefined,
  scanMs: number
): Promise<AttemptEnding> => {
  const { attemptId } = state.attempt
  const held = heldEndingOf(state.attempt, previous)
  const read = await within(async (): Promise<AttemptEnding> => {
    const { cancelled } = await reads.attemptEventsOf(
      account,
      attemptId,
      endingScanOf(state, block, held?.notFoundAt, 'ending')
    )
    if (!cancelled) {
      return notFoundEndingOf({ attemptId, road: 'cancelled' }, held?.notFoundAt, block)
    }
    return {
      attemptId,
      road: 'cancelled',
      cancelledBy: cancelled.cancelledBy,
      at: await reads.blockTime(cancelled.at.blockNumber)
    }
  }, scanMs)
  return read ?? unreadEndingOf({ attemptId, road: 'cancelled' }, held)
}

/**
 * The account's state at the pinned block: its code, the manager's record and
 * the action's authorization. These decide the poll and reject where they fail.
 */
const stateReadingOf = async (reads: WatcherReads, account: Address, block: BlockHeader) => {
  const pinned = { number: block.number, timestamp: block.timestamp }
  // An address with no code holds no setup, and the registry's reads revert on it.
  if (!(await reads.hasCode(account, block.number))) {
    const reading: WatcherReading = { account, block: pinned, hasSetup: false, dormant: false }
    return { block, reading, state: undefined }
  }
  const state = await reads.stateOf(account, block.number)
  const hasSetup = state.setupCommitment.toLowerCase() !== zeroHash
  const authorized = hasSetup ? await reads.isAuthorized(account, block.number) : false
  const reading: WatcherReading = {
    account,
    block: pinned,
    hasSetup,
    dormant: hasSetup && !authorized
  }
  return { block, reading, state }
}

/**
 * One account's reading at the latest block. The state reads answer within
 * `limits.stateMs` or reject; the opening and ending logs then run within
 * `limits.scanMs` and only add to the reading, a scan that failed or ran out
 * leaving its fields unread for the next poll.
 */
export const pollAccount = async (
  reads: WatcherReads,
  account: Address,
  latestBlock: () => Promise<BlockHeader>,
  previous: WatcherReading | undefined,
  limits: PollLimits
): Promise<WatcherReading> => {
  const { block, reading, state } = await readWithin(
    async () => stateReadingOf(reads, account, await latestBlock()),
    limits.stateMs
  )
  if (!state) {
    return reading
  }
  const { attempt } = state
  if (attempt.state === 'Waiting') {
    const opening = await openingOf(reads, account, state, block, previous, limits.scanMs)
    return {
      ...reading,
      attempt: {
        attemptId: attempt.attemptId,
        setupNonce: attempt.setupNonce,
        payloadHash: attempt.payloadHash,
        consumableAfter: attempt.consumableAfter,
        executionDue: block.timestamp >= attempt.consumableAfter,
        ...opening
      }
    }
  }
  if (attempt.state === 'Cancelled' || attempt.state === 'Consumed') {
    const ended =
      settledEndingOf(attempt, previous) ??
      (attempt.state === 'Consumed'
        ? await executedOf(reads, account, state, block, previous, limits.scanMs)
        : await cancelledOf(reads, account, state, block, previous, limits.scanMs))
    return { ...reading, ended }
  }
  return reading
}

/** Whether the badge counts a record: an open attempt not dismissed, or a failed last poll. */
export const countsOnBadge = (record: WatcherRecord | undefined): boolean =>
  !!record &&
  (!!record.failed || (record.reading?.attempt !== undefined && !attemptDismissed(record)))

/** Why a reading of a block below the stored reading's block is written as a failed poll. */
const olderBlockMessage = (block: number, stored: number): string =>
  `The node answers an older block than the last reading: ${block}, below ${stored}.`

/**
 * One poll over the watched accounts: the latest block read once, then each
 * account's reading at it, written to the account's record. Each account's
 * state reads answer within the limit, counted from the poll's start, or the
 * account reads as failed. Every write names when the poll started, so a
 * write of a poll that outlived its tick never covers a newer poll's. A
 * reading of a block below the stored reading's is written as a failed poll
 * beside the stored reading. Each reading names the deployment it was read
 * from, and only a stored reading of the same deployment lends its scan hints
 * and its settled ending. Answers the number of accounts the badge counts.
 */
export const pollAccounts = async ({
  reads,
  deployment,
  accounts,
  chainId,
  storage,
  now,
  polledAt = now(),
  limitMs,
  scanLimitMs
}: PollInput): Promise<number> => {
  const deadline = now() + limitMs
  let latest: Promise<BlockHeader> | undefined
  const latestBlock = () => {
    latest = latest ?? reads.latestBlock()
    return latest
  }
  const records = await Promise.all(
    accounts.map(async (account) => {
      try {
        // A reading of another deployment, or one that names none, holds no hint for this one.
        const held = (await readWatcherRecord(storage, chainId, account))?.reading
        const previous = isOfDeployment(held?.deployment, deployment) ? held : undefined
        const reading = await pollAccount(reads, account, latestBlock, previous, {
          stateMs: Math.max(deadline - now(), 0),
          scanMs: scanLimitMs
        })
        return await updateWatcherRecord(
          storage,
          chainId,
          account,
          (current) => {
            // A new manager numbers its attempts afresh: no dismissal of another deployment holds.
            const dismissed = isOfDeployment(current?.reading?.deployment, deployment)
              ? current?.dismissed ?? []
              : []
            const stored = current?.reading?.block.number
            if (stored !== undefined && reading.block.number < stored) {
              const failed = { at: now(), message: olderBlockMessage(reading.block.number, stored) }
              return { ...current, failed, dismissed }
            }
            return { reading: { ...reading, deployment }, dismissed }
          },
          { now, polledAt }
        )
      } catch (thrown) {
        const failed = { at: now(), message: messageOf(thrown) }
        return updateWatcherRecord(
          storage,
          chainId,
          account,
          (current) => ({ ...current, failed, dismissed: current?.dismissed ?? [] }),
          { now, polledAt }
        ).catch(() => ({ failed, dismissed: [] }))
      }
    })
  )
  return records.filter(countsOnBadge).length
}
