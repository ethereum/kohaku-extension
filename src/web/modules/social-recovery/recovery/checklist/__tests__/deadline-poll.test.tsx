/**
 * @jest-environment jsdom
 *
 * The request's deadline and the poll of the account's recovery state, on
 * Jest's fake clock: the deadline line ticks every minute and once more the
 * moment the deadline passes, which wipes the session after one chain read
 * and holds every add, launch and continue while that read runs; it says
 * every approval dies together unless one approval is the whole
 * request; the poll reads at once, on every period and when the tab returns
 * to view; a poll that throws or runs past its limit holds every add, launch
 * and continue under the failed read with a retry, and the rows never render
 * from a poll that has not returned since open. A client rebuilt for the same
 * session keeps the rows and reads with the new client; a new session starts
 * from nothing returned. An account that no longer authorizes the action
 * reads as dormant and keeps every approval.
 */
import type { Configuration } from '@web/modules/social-recovery/sdk-interfaces'

import type {
  FakeKit,
  FakeVisibility,
  Mounted,
  SwappableChecklist,
  TestRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  configurationOf,
  depsOf,
  fakeKit,
  gatheringOf,
  GUARDIANS,
  guardianCredential,
  MIXED_PATH,
  mountChecklist,
  mountSwappableChecklist,
  NOW,
  NOW_SECONDS,
  outside,
  passkeyCredential,
  recoveryStateOf,
  replyOf,
  seedCache,
  seedEntry,
  seedSession,
  settle,
  storedSession,
  t,
  testRecords,
  visibilitySource,
  withReplies
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const { keccak256 }: typeof import('viem') = require('viem')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  passed
}: typeof import('@web/modules/social-recovery/shared/ceremony') = require('@web/modules/social-recovery/shared/ceremony')
const {
  CHECKLIST_POLL_MS,
  POLL_LIMIT_MS
}: typeof import('@web/modules/social-recovery/recovery/checklist/constants') = require('@web/modules/social-recovery/recovery/checklist/constants')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const CHECKLIST = 'socialRecovery.checklist'
const MINUTE_MS = 60_000

const ONE_ROW: Configuration = configurationOf([
  { threshold: 1, credentials: [passkeyCredential('Laptop passkey')] }
])
const TWO_ROWS: Configuration = configurationOf([
  { threshold: 1, credentials: [passkeyCredential('Laptop passkey')] },
  { threshold: 1, credentials: [guardianCredential(GUARDIANS[0], 'Alice')] }
])

/** A gathering whose deadline is `seconds` after the fixed clock. */
const closingIn = (configuration: Configuration, seconds: number) => {
  const gathering = gatheringOf(configuration)
  return {
    ...gathering,
    request: { ...gathering.request, validUntil: String(NOW_SECONDS + seconds) }
  }
}

describe('the checklist deadline and poll', () => {
  let view: Mounted | undefined
  let world: TestRecords
  let kit: FakeKit
  let visibility: FakeVisibility

  const open = async (configuration: Configuration, gathering = gatheringOf(configuration)) => {
    await seedCache(world.records, configuration)
    await seedSession(world.records, gathering)
    kit = fakeKit(configuration)
    view = await mountChecklist({
      records: world.records,
      client: kit.state,
      deps: depsOf({ now: () => Date.now(), visibility })
    })
    return view
  }

  beforeEach(async () => {
    jest.useFakeTimers()
    jest.setSystemTime(NOW)
    world = testRecords()
    visibility = visibilitySource()
    await seedEntry(world.records)
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
    jest.useRealTimers()
  })

  describe('the deadline', () => {
    it('says every approval dies together on a path of two rows, with the submittable line under it', async () => {
      const mounted = await open(TWO_ROWS)

      const line = mounted.byTestId('checklist-deadline')?.textContent ?? ''
      expect(line).toContain(t(`${CHECKLIST}.deadline.diesTogether`))
      expect(mounted.byTestId('checklist-submittable')?.textContent).toBe(
        t(`${CHECKLIST}.submittable`)
      )
      const deadline = mounted.byTestId('checklist-deadline')
      const submittable = mounted.byTestId('checklist-submittable')
      expect(
        deadline &&
          submittable &&
          // eslint-disable-next-line no-bitwise
          deadline.compareDocumentPosition(submittable) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
      const rows = mounted.byTestId('checklist-rows')
      expect(
        submittable &&
          rows &&
          // eslint-disable-next-line no-bitwise
          submittable.compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })

    it('says no such thing where one approval is the whole request', async () => {
      const mounted = await open(ONE_ROW)

      const line = mounted.byTestId('checklist-deadline')?.textContent ?? ''
      expect(line).not.toBe('')
      expect(line).not.toContain(t(`${CHECKLIST}.deadline.diesTogether`))
      expect(mounted.byTestId('checklist-submittable')).not.toBeNull()
    })

    it('says no such thing for a lone group of threshold one, and says it for a group of two', async () => {
      const loneGroup = configurationOf([
        {
          threshold: 1,
          credentials: [guardianCredential(GUARDIANS[0]), guardianCredential(GUARDIANS[1])]
        }
      ])
      const first = await open(loneGroup)
      expect(first.byTestId('checklist-deadline')?.textContent).not.toContain(
        t(`${CHECKLIST}.deadline.diesTogether`)
      )
      first.unmount()

      world = testRecords()
      await seedEntry(world.records)
      const groupOfTwo = configurationOf([
        {
          threshold: 2,
          credentials: [guardianCredential(GUARDIANS[0]), guardianCredential(GUARDIANS[1])]
        }
      ])
      view = await open(groupOfTwo)
      expect(view.byTestId('checklist-deadline')?.textContent).toContain(
        t(`${CHECKLIST}.deadline.diesTogether`)
      )
    })

    it('renders the time left again every minute from the page clock', async () => {
      const mounted = await open(TWO_ROWS, closingIn(TWO_ROWS, 10 * 60))
      const minutes = (count: number) => t('socialRecovery.display.remainingMinutes', { count })

      expect(mounted.byTestId('checklist-deadline')?.textContent).toContain(minutes(10))

      await settle(MINUTE_MS)
      expect(mounted.byTestId('checklist-deadline')?.textContent).toContain(minutes(9))

      await settle(MINUTE_MS)
      expect(mounted.byTestId('checklist-deadline')?.textContent).toContain(minutes(8))
    })

    it('wipes the session the moment the deadline passes, before the next poll and after one chain read', async () => {
      const wipe = jest.spyOn(world.records, 'wipeRecoverySession')
      const mounted = await open(TWO_ROWS, closingIn(TWO_ROWS, 40))

      await settle(CHECKLIST_POLL_MS + 1000)
      expect(kit.recoveryState).toHaveBeenCalledTimes(2)
      expect(wipe).not.toHaveBeenCalled()
      expect(mounted.byTestId('checklist-rows')).not.toBeNull()

      await settle(10_500)

      expect(wipe).toHaveBeenCalledTimes(1)
      expect(wipe).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'deadline-passed',
        expect.anything()
      )
      expect(kit.recoveryState).toHaveBeenCalledTimes(3)
      expect(mounted.byTestId('checklist-rows')).toBeNull()
      expect(mounted.byTestId('checklist-wiped-title')?.textContent).toBe(
        t('socialRecovery.records.expiredTitle')
      )
      expect((await storedSession(world.records))?.value).toMatchObject({
        state: 'wiped',
        reason: 'deadline-passed'
      })
    })

    it('wipes the session on the return of a poll still reading when the deadline passes', async () => {
      const wipe = jest.spyOn(world.records, 'wipeRecoverySession')
      const mounted = await open(TWO_ROWS, closingIn(TWO_ROWS, 35))
      // The second round reads for ten seconds, across the deadline.
      kit.recoveryState.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(recoveryStateOf()), 10_000)
          })
      )

      await settle(CHECKLIST_POLL_MS + 6000)
      expect(kit.recoveryState).toHaveBeenCalledTimes(2)
      expect(wipe).not.toHaveBeenCalled()

      await settle(4500)

      expect(wipe).toHaveBeenCalledTimes(1)
      expect(wipe).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'deadline-passed',
        expect.anything()
      )
      expect(kit.recoveryState).toHaveBeenCalledTimes(3)
      expect(mounted.byTestId('checklist-wiped-title')?.textContent).toBe(
        t('socialRecovery.records.expiredTitle')
      )
    })
  })

  describe('past the deadline, while its one chain read runs', () => {
    const ROW_ACTIONS = [
      'checklist-row-0-answer-here',
      'checklist-row-0-phone',
      'checklist-row-1-mark-declined'
    ]
    const WAIT_PATH = `/${WEB_ROUTES.socialRecoveryRecoveryWait}?account=${ACCOUNT}`

    /** Holds the next chain read, then moves the clock just past a deadline 40 s away. */
    const holdReadAcrossDeadline = async () => {
      await settle(CHECKLIST_POLL_MS + 1000)
      const read = deferred<ReturnType<typeof recoveryStateOf>>()
      kit.recoveryState.mockImplementationOnce(() => read.promise)
      await settle(10_500)
      return read
    }

    it('holds every row action from the moment the deadline passes, then renders the expired state', async () => {
      const wipe = jest.spyOn(world.records, 'wipeRecoverySession')
      const mounted = await open(TWO_ROWS, closingIn(TWO_ROWS, 40))
      ROW_ACTIONS.forEach((id) => expect(mounted.isDisabled(id)).toBe(false))

      const read = await holdReadAcrossDeadline()

      expect(kit.recoveryState).toHaveBeenCalledTimes(3)
      expect(wipe).not.toHaveBeenCalled()
      expect(mounted.byTestId('checklist-rows')).not.toBeNull()
      ROW_ACTIONS.forEach((id) => expect(mounted.isDisabled(id)).toBe(true))

      read.resolve(recoveryStateOf())
      await settle()

      expect(wipe).toHaveBeenCalledTimes(1)
      expect(wipe).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'deadline-passed',
        expect.anything()
      )
      expect(mounted.byTestId('checklist-rows')).toBeNull()
      expect(mounted.byTestId('checklist-wiped-title')?.textContent).toBe(
        t('socialRecovery.records.expiredTitle')
      )
    })

    it('holds continue on a satisfied path, then lands the request another holder submitted', async () => {
      const payload = '0xabcdef'
      const closing = withReplies(closingIn(TWO_ROWS, 40), [0, 1])
      const land = jest.spyOn(world.records, 'landSubmission')
      const mounted = await open(TWO_ROWS, {
        ...closing,
        request: { ...closing.request, payload }
      })
      expect(mounted.isDisabled('checklist-continue')).toBe(false)

      const read = await holdReadAcrossDeadline()

      expect(mounted.byTestId('checklist-satisfied')).not.toBeNull()
      expect(mounted.isDisabled('checklist-continue')).toBe(true)
      await mounted.press('checklist-continue')
      expect(mounted.navigate).not.toHaveBeenCalled()

      read.resolve(
        recoveryStateOf({
          state: 'Waiting',
          attemptId: BigInt(1),
          nextAttemptId: BigInt(2),
          payloadHash: keccak256(payload)
        })
      )
      await settle()

      expect(land).toHaveBeenCalledTimes(1)
      expect(mounted.navigate).toHaveBeenCalledTimes(1)
      expect(mounted.navigate).toHaveBeenLastCalledWith(WAIT_PATH, { replace: true })
    })

    it('adds no passed claim that reports while the read runs, and keeps no reply of it', async () => {
      const gathering = closingIn(TWO_ROWS, 40)
      await seedCache(world.records, TWO_ROWS)
      await seedSession(world.records, gathering)
      kit = fakeKit(TWO_ROWS)
      const deps = depsOf({ now: () => Date.now(), visibility })
      view = await mountChecklist({ records: world.records, client: kit.state, deps })
      await view.press('checklist-row-0-phone')
      const [id] = deps.requestIds
      // The holder returns before the ceremony tab writes its report.
      view.unmount()
      view = await mountChecklist({
        records: world.records,
        client: kit.state,
        deps,
        search: { account: ACCOUNT, ceremony: id }
      })

      const read = await holdReadAcrossDeadline()
      await outside(() =>
        deps.channel.report(id, 'createClaim', passed({ reply: replyOf(gathering, 0) }), Date.now())
      )
      await settle()

      expect(kit.addApproverReply).not.toHaveBeenCalled()
      const during = await storedSession(world.records)
      expect(during?.value.state === 'live' && during.value.gathering.replies).toEqual([])

      read.resolve(recoveryStateOf())
      await settle()

      expect(kit.addApproverReply).not.toHaveBeenCalled()
      expect((await storedSession(world.records))?.value).toMatchObject({
        state: 'wiped',
        reason: 'deadline-passed'
      })
    })

    it('makes the rows live again for the new request once the holder gathers again', async () => {
      const mounted = await open(TWO_ROWS, closingIn(TWO_ROWS, 40))
      const read = await holdReadAcrossDeadline()
      read.resolve(recoveryStateOf())
      await settle()
      expect(mounted.byTestId('checklist-wiped-title')).not.toBeNull()

      await mounted.press('checklist-gather-again')
      await settle()

      expect(mounted.byTestId('checklist-rows')).not.toBeNull()
      ROW_ACTIONS.forEach((id) => expect(mounted.isDisabled(id)).toBe(false))
    })
  })

  describe('the poll', () => {
    it('reads the recovery state and the authorization at once on open', async () => {
      await open(MIXED_PATH)

      expect(kit.recoveryState).toHaveBeenCalledTimes(1)
      expect(kit.isAuthorized).toHaveBeenCalledTimes(1)
    })

    it('reads again on every period', async () => {
      await open(MIXED_PATH)

      await settle(CHECKLIST_POLL_MS - 1)
      expect(kit.recoveryState).toHaveBeenCalledTimes(1)
      await settle(1)
      expect(kit.recoveryState).toHaveBeenCalledTimes(2)
      await settle(CHECKLIST_POLL_MS)
      expect(kit.recoveryState).toHaveBeenCalledTimes(3)
      expect(kit.isAuthorized).toHaveBeenCalledTimes(3)
    })

    it('reads again at once when the tab returns to view, not when it is hidden', async () => {
      await open(MIXED_PATH)

      visibility.turn('hidden')
      await settle()
      expect(kit.recoveryState).toHaveBeenCalledTimes(1)

      visibility.turn('visible')
      await settle()
      expect(kit.recoveryState).toHaveBeenCalledTimes(2)
    })

    it('stops reading once the checklist closes', async () => {
      await open(MIXED_PATH)
      view?.unmount()
      view = undefined

      await settle(3 * CHECKLIST_POLL_MS)
      visibility.turn('visible')
      await settle()
      expect(kit.recoveryState).toHaveBeenCalledTimes(1)
    })

    it('renders the assessment again with the clock read before each poll', async () => {
      await open(MIXED_PATH)
      const firstClock = kit.assess.mock.calls[kit.assess.mock.calls.length - 1][1]
      expect(firstClock).toBe(NOW_SECONDS)

      // The next read answers five seconds after it starts.
      kit.recoveryState.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(recoveryStateOf()), 5000)
          })
      )
      kit.assess.mockClear()
      await settle(CHECKLIST_POLL_MS + 5000)
      expect(kit.assess).toHaveBeenCalled()
      const lastClock = kit.assess.mock.calls[kit.assess.mock.calls.length - 1][1]
      expect(lastClock).toBe(NOW_SECONDS + CHECKLIST_POLL_MS / 1000)
    })

    it('renders no row from a poll that has not returned since open, then the failed read past its limit', async () => {
      await seedCache(world.records, MIXED_PATH)
      await seedSession(world.records, gatheringOf(MIXED_PATH))
      kit = fakeKit(MIXED_PATH)
      kit.recoveryState.mockImplementation(() => new Promise(() => {}))
      view = await mountChecklist({
        records: world.records,
        client: kit.state,
        deps: depsOf({ now: () => Date.now(), visibility })
      })

      expect(view.byTestId('checklist-loading')).not.toBeNull()
      expect(view.byTestId('checklist-rows')).toBeNull()
      expect(view.byTestId('checklist-row-0')).toBeNull()

      await settle(POLL_LIMIT_MS - 1)
      expect(view.byTestId('checklist-rows')).toBeNull()
      expect(view.byTestId('checklist-poll-failed')).toBeNull()

      await settle(1)
      expect(view.byTestId('checklist-poll-failed')).not.toBeNull()
      expect(view.byTestId('checklist-poll-retry')).not.toBeNull()
    })

    it('holds every launch and every row action under a poll that throws, and a retry that succeeds restores them', async () => {
      const mounted = await open(MIXED_PATH)
      const actions = [
        'checklist-row-0-answer-here',
        'checklist-row-0-phone',
        'checklist-row-1-mark-declined'
      ]
      actions.forEach((id) => expect(mounted.isDisabled(id)).toBe(false))

      kit.recoveryState.mockRejectedValue(new Error('node unavailable'))
      await settle(CHECKLIST_POLL_MS)

      expect(mounted.byTestId('checklist-poll-failed')?.textContent).toContain(
        t(`${CHECKLIST}.pollFailed.title`)
      )
      expect(mounted.byTestId('checklist-poll-failed')?.textContent).toContain(
        t(`${CHECKLIST}.pollFailed.body`)
      )
      expect(mounted.byTestId('checklist-poll-held')?.textContent).toBe(
        t(`${CHECKLIST}.pollFailed.held`)
      )
      expect(mounted.byTestId('checklist-rows')).not.toBeNull()
      actions.forEach((id) => expect(mounted.isDisabled(id)).toBe(true))

      kit.recoveryState.mockClear()
      await mounted.press('checklist-poll-retry')
      expect(kit.recoveryState).toHaveBeenCalledTimes(1)
      expect(mounted.byTestId('checklist-poll-failed')).not.toBeNull()

      kit.recoveryState.mockResolvedValue(recoveryStateOf())
      await mounted.press('checklist-poll-retry')

      expect(mounted.byTestId('checklist-poll-failed')).toBeNull()
      actions.forEach((id) => expect(mounted.isDisabled(id)).toBe(false))
    })

    it('holds continue on a satisfied path under a failed poll, and the next period restores it', async () => {
      const mounted = await open(TWO_ROWS, withReplies(gatheringOf(TWO_ROWS), [0, 1]))
      expect(mounted.isDisabled('checklist-continue')).toBe(false)

      kit.recoveryState.mockRejectedValueOnce(new Error('node unavailable'))
      await settle(CHECKLIST_POLL_MS)
      expect(mounted.byTestId('checklist-poll-failed')).not.toBeNull()
      expect(mounted.byTestId('checklist-satisfied')).not.toBeNull()
      expect(mounted.isDisabled('checklist-continue')).toBe(true)

      await settle(CHECKLIST_POLL_MS)
      expect(mounted.byTestId('checklist-poll-failed')).toBeNull()
      expect(mounted.isDisabled('checklist-continue')).toBe(false)
    })

    it('holds the rows where the authorization read throws, and the next period restores them', async () => {
      const mounted = await open(MIXED_PATH)
      kit.isAuthorized.mockRejectedValueOnce(new Error('node unavailable'))

      await settle(CHECKLIST_POLL_MS)
      expect(mounted.byTestId('checklist-poll-failed')).not.toBeNull()
      expect(mounted.isDisabled('checklist-row-0-answer-here')).toBe(true)

      await settle(CHECKLIST_POLL_MS)
      expect(mounted.byTestId('checklist-poll-failed')).toBeNull()
      expect(mounted.isDisabled('checklist-row-0-answer-here')).toBe(false)
    })

    it('holds the rows where a later poll hangs past its limit', async () => {
      const mounted = await open(MIXED_PATH)
      kit.recoveryState.mockImplementationOnce(() => new Promise(() => {}))

      await settle(CHECKLIST_POLL_MS + POLL_LIMIT_MS - 1)
      expect(mounted.byTestId('checklist-poll-failed')).toBeNull()
      await settle(1)
      expect(mounted.byTestId('checklist-poll-failed')).not.toBeNull()
      expect(mounted.isDisabled('checklist-row-0-phone')).toBe(true)
    })
  })

  describe('a client rebuilt while the checklist is open', () => {
    const openSwappable = async (): Promise<SwappableChecklist> => {
      await seedCache(world.records, MIXED_PATH)
      await seedSession(world.records, gatheringOf(MIXED_PATH))
      kit = fakeKit(MIXED_PATH)
      const swappable = await mountSwappableChecklist({
        records: world.records,
        client: kit.state,
        deps: depsOf({ now: () => Date.now(), visibility })
      })
      view = swappable
      expect(swappable.byTestId('checklist-row-0')).not.toBeNull()
      return swappable
    }

    it('keeps the poll answered and the rows mounted while the new client reads, and reads with it from then on', async () => {
      const mounted = await openSwappable()
      const row = mounted.byTestId('checklist-row-0')
      const rebuilt = fakeKit(MIXED_PATH)
      const read = deferred<ReturnType<typeof recoveryStateOf>>()
      rebuilt.recoveryState.mockImplementationOnce(() => read.promise)

      await mounted.swapClient(rebuilt.state)

      expect(rebuilt.recoveryState).toHaveBeenCalledTimes(1)
      expect(mounted.byTestId('checklist-loading')).toBeNull()
      expect(mounted.byTestId('checklist-poll-failed')).toBeNull()
      expect(mounted.byTestId('checklist-row-0')).toBe(row)

      await outside(async () => read.resolve(recoveryStateOf()))
      await settle()
      expect(mounted.byTestId('checklist-row-0')).toBe(row)
      expect(mounted.byTestId('checklist-poll-failed')).toBeNull()

      kit.recoveryState.mockClear()
      await settle(CHECKLIST_POLL_MS)
      expect(rebuilt.recoveryState).toHaveBeenCalledTimes(2)
      expect(kit.recoveryState).not.toHaveBeenCalled()
    })

    it('drops the answer of the round the old client still had in flight', async () => {
      const mounted = await openSwappable()
      const wipe = jest.spyOn(world.records, 'wipeRecoverySession')
      const late = deferred<ReturnType<typeof recoveryStateOf>>()
      kit.recoveryState.mockImplementationOnce(() => late.promise)
      await settle(CHECKLIST_POLL_MS)
      expect(kit.recoveryState).toHaveBeenCalledTimes(2)

      const rebuilt = fakeKit(MIXED_PATH)
      await mounted.swapClient(rebuilt.state)
      expect(rebuilt.recoveryState).toHaveBeenCalledTimes(1)

      await outside(async () => late.resolve(recoveryStateOf({ setupNonce: BigInt(2) })))
      await settle()

      expect(wipe).not.toHaveBeenCalled()
      expect(mounted.byTestId('checklist-wiped')).toBeNull()
      expect(mounted.byTestId('checklist-rows')).not.toBeNull()
      expect((await storedSession(world.records))?.value.state).toBe('live')
    })

    it('starts again from nothing returned where the client goes away and comes back', async () => {
      const mounted = await openSwappable()

      await mounted.swapClient({ status: 'loading' })
      expect(mounted.byTestId('checklist-rows')).toBeNull()
      expect(mounted.byTestId('checklist-loading')).not.toBeNull()

      const rebuilt = fakeKit(MIXED_PATH)
      const read = deferred<ReturnType<typeof recoveryStateOf>>()
      rebuilt.recoveryState.mockImplementationOnce(() => read.promise)
      await mounted.swapClient(rebuilt.state)
      expect(rebuilt.recoveryState).toHaveBeenCalledTimes(1)
      expect(mounted.byTestId('checklist-rows')).toBeNull()
      expect(mounted.byTestId('checklist-loading')).not.toBeNull()

      await outside(async () => read.resolve(recoveryStateOf()))
      await settle()
      expect(mounted.byTestId('checklist-rows')).not.toBeNull()
    })

    it('starts again from nothing returned for a new session', async () => {
      const mounted = await open(MIXED_PATH)
      kit.recoveryState.mockResolvedValue(
        recoveryStateOf({ state: 'Waiting', attemptId: BigInt(5), nextAttemptId: BigInt(6) })
      )
      await settle(CHECKLIST_POLL_MS)
      kit.recoveryState.mockResolvedValue(
        recoveryStateOf({ state: 'Cancelled', attemptId: BigInt(5), nextAttemptId: BigInt(6) })
      )
      await settle(CHECKLIST_POLL_MS)
      expect(mounted.byTestId('checklist-gather-again')).not.toBeNull()

      // The new gathering's first round reads until the test answers it.
      const read = deferred<ReturnType<typeof recoveryStateOf>>()
      kit.recoveryState.mockImplementationOnce(() => read.promise)
      kit.initRecoveryGathering.mockResolvedValueOnce(gatheringOf(MIXED_PATH, 6))
      await mounted.press('checklist-gather-again')
      await settle()

      expect((await storedSession(world.records))?.value.state).toBe('live')
      expect(mounted.byTestId('checklist-loading')).not.toBeNull()
      expect(mounted.byTestId('checklist-rows')).toBeNull()

      await outside(async () => read.resolve(recoveryStateOf({ nextAttemptId: BigInt(6) })))
      await settle()
      expect(mounted.byTestId('checklist-rows')).not.toBeNull()
    })
  })

  describe('an account that no longer authorizes the action', () => {
    it('reads as dormant, keeps every approval, holds continue and wipes nothing', async () => {
      const satisfied = withReplies(gatheringOf(TWO_ROWS), [0, 1])
      await seedCache(world.records, TWO_ROWS)
      const seeded = await seedSession(world.records, satisfied)
      kit = fakeKit(TWO_ROWS)
      kit.isAuthorized.mockResolvedValue(false)
      const wipe = jest.spyOn(world.records, 'wipeRecoverySession')
      view = await mountChecklist({
        records: world.records,
        client: kit.state,
        deps: depsOf({ now: () => Date.now(), visibility })
      })
      await settle(CHECKLIST_POLL_MS)

      expect(view.byTestId('checklist-dormant')?.textContent).toContain(
        t('socialRecovery.checklist.dormant.title')
      )
      expect(view.byTestId('checklist-dormant')?.textContent).toContain(
        t('socialRecovery.checklist.dormant.body')
      )
      expect(view.byTestId('checklist-satisfied')).not.toBeNull()
      expect(view.isDisabled('checklist-continue')).toBe(true)
      expect(view.byTestId('checklist-wiped')).toBeNull()
      expect(wipe).not.toHaveBeenCalled()
      const stored = await storedSession(world.records)
      expect(stored?.revision).toBe(seeded.revision)
      expect(stored?.value).toEqual({ state: 'live', gathering: satisfied })

      kit.isAuthorized.mockResolvedValue(true)
      await settle(CHECKLIST_POLL_MS)
      expect(view.byTestId('checklist-dormant')).toBeNull()
      expect(view.isDisabled('checklist-continue')).toBe(false)
    })
  })

  describe('a passed claim waiting to join the session', () => {
    it('adds its reply only once a poll has answered on the return', async () => {
      const gathering = gatheringOf(TWO_ROWS)
      await seedCache(world.records, TWO_ROWS)
      await seedSession(world.records, gathering)
      kit = fakeKit(TWO_ROWS)
      const deps = depsOf({ now: () => Date.now(), visibility })
      view = await mountChecklist({ records: world.records, client: kit.state, deps })
      await view.press('checklist-row-0-phone')
      const [id] = deps.requestIds
      await deps.channel.report(id, 'createClaim', passed({ reply: replyOf(gathering, 0) }))

      // The holder returns while the account's recovery state has not answered.
      let answer: (state: ReturnType<typeof recoveryStateOf>) => void = () => undefined
      kit.recoveryState.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve
          })
      )
      view.unmount()
      view = await mountChecklist({
        records: world.records,
        client: kit.state,
        deps,
        search: { account: ACCOUNT, ceremony: id }
      })
      await settle(1000)

      expect(view.byTestId('checklist-loading')).not.toBeNull()
      expect(kit.addApproverReply).not.toHaveBeenCalled()
      const before = await storedSession(world.records)
      expect(before?.value.state === 'live' && before.value.gathering.replies).toEqual([])

      answer(recoveryStateOf())
      await settle()
      await settle()

      expect(kit.addApproverReply).toHaveBeenCalledTimes(1)
      const after = await storedSession(world.records)
      expect(after?.value.state === 'live' && after.value.gathering.replies).toEqual([
        replyOf(gathering, 0)
      ])
    })
  })
})
