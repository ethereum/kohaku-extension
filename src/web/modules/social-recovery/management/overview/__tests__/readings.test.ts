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
  movedInPath,
  noticesOf,
  overviewKindOf,
  reauthorizeDraftOf
} from '@web/modules/social-recovery/management/overview/readings'
import type {
  Address,
  Configuration,
  Notification,
  SetupState
} from '@web/modules/social-recovery/sdk-interfaces'
import type { RecoveryAttemptState } from '@web/modules/social-recovery/shared/client'
import type { AttemptEnding } from '@web/modules/social-recovery/watcher'

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
  wait: 86_400n,
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
    const found: Notification[] = [
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
