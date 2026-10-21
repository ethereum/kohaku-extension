/**
 * The overview's readings over the setup state, the attempt, the logs since
 * the commit and the watcher's last ending, and the draft a re-authorize
 * commits again.
 */
import { zeroAddress } from 'viem'

import {
  attemptOpenOf,
  endedNoticeOf,
  goalStands,
  isBelowFloor,
  knownFloorOf,
  movedInPath,
  noticesOf,
  overviewKindOf,
  reauthorizeDraftOf
} from '@web/modules/social-recovery/management/overview/readings'
import type {
  Address,
  Configuration,
  KitNotification,
  SetupState
} from '@kohaku-eth/social-recovery'
import type { RecoveryAttemptState } from '@web/modules/social-recovery/shared/client'
import type { AttemptEnding, WatcherRecord } from '@web/modules/social-recovery/watcher'

const METHOD_A: Address = '0x00000000000000000000000000000000000000aa'
const METHOD_B: Address = '0x00000000000000000000000000000000000000bb'
const HASH = `0x${'11'.repeat(32)}` as const

const setupOf = (fields: Partial<SetupState>): SetupState => ({
  isAuthorized: true,
  hasSetup: true,
  setupCommitment: HASH,
  setupNonce: 1n,
  setupCommittedAtBlock: 100,
  attemptActive: false,
  block: { number: 200, timestamp: 2_000, hash: HASH },
  ...fields
})

const attemptOf = (state: RecoveryAttemptState['attempt']['state']): RecoveryAttemptState => ({
  attempt: {
    state,
    attemptId: 3n,
    setupNonce: 1n,
    consumableAfter: 0,
    payloadHash: HASH,
    order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
    usedMethods: [],
    ignoresPause: true
  },
  nextAttemptId: 4n,
  setupCommitment: HASH,
  setupNonce: 1n,
  block: { number: 200, timestamp: 2_000, hash: HASH }
})

const at = (blockNumber: number, removed = false) => ({
  blockNumber,
  blockHash: HASH,
  logIndex: 0,
  transactionHash: HASH,
  removed
})

const CONFIGURATION: Configuration = {
  clauses: [{ threshold: 1, credentials: [{ method: METHOD_A, config: '0x01' }] }],
  wait: 86_400,
  ignoresPause: true
}

describe('the overview readings', () => {
  it('reads the four states from the setup and the authorization', () => {
    expect(overviewKindOf(setupOf({ hasSetup: false, isAuthorized: false }))).toBe('not-set-up')
    expect(overviewKindOf(setupOf({ hasSetup: true, isAuthorized: true }))).toBe('set-up')
    expect(overviewKindOf(setupOf({ hasSetup: true, isAuthorized: false }))).toBe('dormant')
    expect(overviewKindOf(setupOf({ hasSetup: false, isAuthorized: true }))).toBe('mirror')
  })

  it('counts an attempt as open where either read says so, pending or ready', () => {
    expect(attemptOpenOf(setupOf({ attemptActive: false }), attemptOf('Waiting'))).toBe(true)
    expect(attemptOpenOf(setupOf({ attemptActive: true }), attemptOf('None'))).toBe(true)
    expect(attemptOpenOf(setupOf({ attemptActive: false }), attemptOf('Cancelled'))).toBe(false)
    expect(attemptOpenOf(setupOf({ attemptActive: false }), attemptOf('Consumed'))).toBe(false)
  })

  it('keeps each method latest key update and the cancelled attempts, and drops removed logs', () => {
    const found: KitNotification[] = [
      { kind: 'method-keys-updated', method: METHOD_A, previous: [], current: [HASH], at: at(120) },
      { kind: 'method-keys-updated', method: METHOD_A, previous: [], current: [HASH], at: at(150) },
      {
        kind: 'method-keys-updated',
        method: METHOD_B,
        previous: [],
        current: [HASH],
        at: at(130, true)
      },
      {
        kind: 'attempt-cancelled',
        account: METHOD_A,
        action: METHOD_A,
        attemptId: 3n,
        canceller: METHOD_A,
        vetoingMethod: METHOD_A,
        cancelledBy: 'cancelByOwner',
        setupNonce: 1n,
        usedPlaces: [],
        at: at(140)
      }
    ]
    const notices = noticesOf(found)
    expect(notices.moved).toEqual([{ method: METHOD_A, at: at(150) }])
    expect(notices.cancelledAttempts).toEqual([3n])
  })

  it('names only the moved methods the path uses', () => {
    const moved = [
      { method: METHOD_A, at: at(120) },
      { method: METHOD_B, at: at(130) }
    ]
    expect(movedInPath(moved, [METHOD_B])).toEqual([{ method: METHOD_B, at: at(130) }])
    expect(movedInPath(moved, [])).toEqual([])
  })

  it('draws the ended notice after the owner cancel or a setup write, from the commit on only', () => {
    const owner: AttemptEnding = {
      attemptId: 3n,
      road: 'cancelled',
      cancelledBy: 'cancelByOwner',
      at: 1_500
    }
    const write: AttemptEnding = {
      attemptId: 3n,
      road: 'cancelled',
      cancelledBy: 'setupWrite',
      at: 1_600
    }
    expect(endedNoticeOf(owner, [3n])).toEqual({ road: 'ownerCancel', at: 1_500 })
    expect(endedNoticeOf(write, [3n])).toEqual({ road: 'setupWrite', at: 1_600 })
    // A setup committed after the ending holds no log of that cancel.
    expect(endedNoticeOf(owner, [])).toBeNull()
    expect(endedNoticeOf({ ...owner, cancelledBy: 'cancelByProofs' }, [3n])).toBeNull()
    expect(endedNoticeOf({ ...owner, at: undefined }, [3n])).toBeNull()
    expect(endedNoticeOf({ attemptId: 3n, road: 'executed', at: 1_500 }, [3n])).toBeNull()
    expect(endedNoticeOf(undefined, [3n])).toBeNull()
  })

  it('rebuilds the re-authorize draft from the configuration at its committed level', () => {
    const publicDraft = reauthorizeDraftOf(CONFIGURATION, 'public')
    expect(publicDraft.clauses).toEqual(CONFIGURATION.clauses)
    expect(publicDraft.wait).toBe(CONFIGURATION.wait)
    expect(publicDraft.ignoresPause).toBe(CONFIGURATION.ignoresPause)
    expect(publicDraft.privacy).toEqual({ backup: 'clear', publicMetadata: '0x' })
    expect(reauthorizeDraftOf(CONFIGURATION, 'private').privacy).toEqual({
      backup: 'encrypted',
      publicMetadata: '0x'
    })
    const shape = reauthorizeDraftOf(CONFIGURATION, 'shape-visible').privacy
    expect(shape.backup).toBe('encrypted')
    expect(shape.publicMetadata).not.toBe('0x')
  })

  it('reads each write as done once its end stands on the chain', () => {
    expect(goalStands('reauthorize', setupOf({ hasSetup: true, isAuthorized: true }))).toBe(true)
    expect(goalStands('reauthorize', setupOf({ hasSetup: true, isAuthorized: false }))).toBe(false)
    expect(goalStands('clear', setupOf({ hasSetup: false }))).toBe(true)
    expect(goalStands('clear', setupOf({ hasSetup: true }))).toBe(false)
    expect(goalStands('removeAuthorization', setupOf({ isAuthorized: false }))).toBe(true)
    expect(goalStands('removeAuthorization', setupOf({ isAuthorized: true }))).toBe(false)
  })
})

describe('the setup this device has seen', () => {
  const DEPLOYMENT = { manager: METHOD_A, action: METHOD_B }
  const nonceOf = (...args: Parameters<typeof knownFloorOf>) => knownFloorOf(...args).setupNonce
  const RETIRED = {
    manager: '0x00000000000000000000000000000000000000cc' as Address,
    action: METHOD_B
  }
  const cacheAt = (setupNonce: bigint, deployment?: typeof DEPLOYMENT) => ({
    configuration: { clauses: [], wait: 1, ignoresPause: false },
    setupNonce,
    ...(deployment ? { deployment } : {})
  })
  const watchedAt = (setupNonce: bigint, deployment?: typeof DEPLOYMENT): WatcherRecord => ({
    reading: {
      account: METHOD_A,
      block: { number: 1, timestamp: 1 },
      hasSetup: true,
      dormant: false,
      attempt: {
        attemptId: 1n,
        setupNonce,
        payloadHash: HASH,
        consumableAfter: 2,
        executionDue: false
      },
      ...(deployment ? { deployment } : {})
    },
    dismissed: []
  })

  it('takes the higher nonce of the records read under the same manager and action', () => {
    expect(nonceOf(cacheAt(2n, DEPLOYMENT), watchedAt(3n, DEPLOYMENT), DEPLOYMENT)).toBe(3n)
    expect(nonceOf(cacheAt(4n, DEPLOYMENT), watchedAt(3n, DEPLOYMENT), DEPLOYMENT)).toBe(4n)
  })

  it('matches the deployment whatever the case of its addresses', () => {
    const upper = {
      manager: `0x${METHOD_A.slice(2).toUpperCase()}` as Address,
      action: `0x${METHOD_B.slice(2).toUpperCase()}` as Address
    }
    expect(nonceOf(cacheAt(2n, upper), undefined, DEPLOYMENT)).toBe(2n)
  })

  it('gives no floor from a record of another manager or another action', () => {
    expect(nonceOf(cacheAt(2n, RETIRED), watchedAt(2n, RETIRED), DEPLOYMENT)).toBe(undefined)
    const otherAction = { manager: METHOD_A, action: METHOD_A }
    expect(nonceOf(cacheAt(2n, otherAction), undefined, DEPLOYMENT)).toBe(undefined)
    expect(nonceOf(cacheAt(1n, DEPLOYMENT), watchedAt(5n, RETIRED), DEPLOYMENT)).toBe(1n)
  })

  it('gives no floor from a record that names no deployment', () => {
    expect(nonceOf(cacheAt(2n), watchedAt(2n), DEPLOYMENT)).toBe(undefined)
  })

  it("reads no setup below the block of the watcher's reading that found one as below the floor, and a clear at or after it as standing", () => {
    const reading = (hasSetup: boolean, deployment?: typeof DEPLOYMENT): WatcherRecord => ({
      reading: {
        account: METHOD_A,
        block: { number: 1001, timestamp: 1 },
        hasSetup,
        dormant: false,
        ...(deployment ? { deployment } : {})
      },
      dismissed: []
    })
    const known = knownFloorOf(undefined, reading(true, DEPLOYMENT), DEPLOYMENT)
    const cleared = (number: number) =>
      setupOf({ hasSetup: false, setupNonce: 0n, block: { number, timestamp: 1, hash: HASH } })
    expect(isBelowFloor(cleared(1000), known)).toBe(true)
    expect(isBelowFloor(cleared(1001), known)).toBe(false)
    expect(isBelowFloor(cleared(1002), known)).toBe(false)
    expect(
      isBelowFloor(setupOf({ block: { number: 1000, timestamp: 1, hash: HASH } }), known)
    ).toBe(false)
    const unfounded = [
      knownFloorOf(undefined, reading(false, DEPLOYMENT), DEPLOYMENT),
      knownFloorOf(undefined, reading(true, RETIRED), DEPLOYMENT),
      knownFloorOf(undefined, reading(true), DEPLOYMENT)
    ]
    unfounded.forEach((floor) => expect(isBelowFloor(cleared(1000), floor)).toBe(false))
  })
})
