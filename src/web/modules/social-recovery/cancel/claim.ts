/**
 * The cancel in flight on this device, in the extension's local storage under
 * `socialRecovery:cancelInFlight:<chainId>:<account>`, stored as
 * `{ value, savedAt }` like every record of the wallet. Every write runs in
 * the queue of its key, so two tabs never both claim one cancel.
 *
 * A claim carries the time it was stored. Its page adds its request only while
 * the claim is still its own, holds no hash and is younger than the send
 * limit, so a page that finds a younger claim held nowhere in the wallet
 * waits for it instead of releasing it between its claim and its add.
 */
import { isHex } from 'viem'

import type { Address, Hex } from '@kohaku-eth/social-recovery'
import { isDecimalString } from '@web/modules/social-recovery/shared/records/guards'
import { inQueue, RECORDS_KEY_PREFIX } from '@web/modules/social-recovery/shared/records/records'
import type { ChainId } from '@web/modules/social-recovery/shared/records/types'
import type { WatcherStorage } from '@web/modules/social-recovery/watcher'

import { CLAIM_SEND_LIMIT_MS, UNTRACKED_FOLLOW_MS } from './constants'
import type { CancelClaim, CancelClaims, StoredCancelClaim } from './types'

export const cancelClaimKeyOf = (chainId: ChainId, account: Address): string =>
  `${RECORDS_KEY_PREFIX}:cancelInFlight:${String(chainId)}:${account.toLowerCase()}`

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

/** The claim a stored value holds; a storage read is a boundary, so every field is checked. */
export const cancelClaimFrom = (stored: unknown): CancelClaim | undefined => {
  if (typeof stored !== 'object' || stored === null || !('value' in stored)) {
    return undefined
  }
  const { value } = stored as { value: unknown }
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const { attemptId, requestId, startBlock, claimedAt, transactionHash } = value as Record<
    string,
    unknown
  >
  if (
    !isDecimalString(attemptId) ||
    typeof requestId !== 'string' ||
    !Number.isSafeInteger(startBlock) ||
    !isTime(claimedAt) ||
    (transactionHash !== undefined && !isHex(transactionHash))
  ) {
    return undefined
  }
  return {
    attemptId: BigInt(attemptId),
    requestId,
    startBlock: startBlock as number,
    claimedAt,
    ...(transactionHash ? { transactionHash: transactionHash as Hex } : {})
  }
}

const storedOf = (claim: CancelClaim): StoredCancelClaim => ({
  ...claim,
  attemptId: claim.attemptId.toString()
})

export const cancelClaimsOf = (
  storage: WatcherStorage,
  chainId: ChainId,
  account: Address,
  now: () => number = Date.now
): CancelClaims => {
  const key = cancelClaimKeyOf(chainId, account)
  const read = async () => cancelClaimFrom(await storage.get(key))
  const write = async (claim: CancelClaim | null) => {
    await storage.set(key, { value: claim ? storedOf(claim) : null, savedAt: now() })
  }
  const sendableMs = (claim: CancelClaim) => CLAIM_SEND_LIMIT_MS - (now() - claim.claimedAt)
  return {
    read,
    claim: (claim) =>
      inQueue(key, async () => {
        const held = await read()
        if (held) {
          return { claimed: false, held }
        }
        await write({ ...claim, claimedAt: now() })
        return { claimed: true }
      }),
    async canStillSend(requestId) {
      const held = await read()
      return held?.requestId === requestId && !held.transactionHash && sendableMs(held) > 0
    },
    sendableMs,
    untrackedFollowMs: (claim) => UNTRACKED_FOLLOW_MS - (now() - claim.claimedAt),
    markSent: (requestId, transactionHash) =>
      inQueue(key, async () => {
        const held = await read()
        if (held?.requestId === requestId) {
          await write({ ...held, transactionHash })
        }
      }),
    release: (requestId) =>
      inQueue(key, async () => {
        const held = await read()
        if (held?.requestId === requestId) {
          await write(null)
        }
      })
  }
}
