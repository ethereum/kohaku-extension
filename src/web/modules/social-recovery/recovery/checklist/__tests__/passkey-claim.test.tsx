/**
 * @jest-environment jsdom
 *
 * The passkey row's claim: it stores the ceremony request with the hand-off
 * the holder chose, opens the ceremony tab, and on its report adds the reply
 * through the client and writes the session under the revision it read. A
 * ceremony that did not pass leaves its note with a retry; a passkey another
 * origin committed offers no action.
 */
import type { Configuration } from '@web/modules/social-recovery/sdk-interfaces'
import type { CeremonyOutcome, ReportStore } from '@web/modules/social-recovery/shared/ceremony'
import type { ChainId } from '@web/modules/social-recovery/shared/records'

import type { ChecklistSearch } from '@web/modules/social-recovery/recovery/checklist/types'

import type {
  FakeDeps,
  FakeKit,
  Mounted,
  TestRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  CHAIN_ID,
  configurationOf,
  depsOf,
  each,
  entryOf,
  fakeKit,
  gatheringOf,
  GUARDIANS,
  guardianCredential,
  mountChecklist,
  NOW,
  OTHER_RP_HASH,
  outside,
  passkeyCredential,
  replyOf,
  requestOf,
  SECOND_ACCOUNT,
  seedCache,
  seedEntry,
  seedSession,
  settle,
  storedSession,
  t,
  testRecords,
  withReplies
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  ceremonyPath,
  ceremonyReport,
  ceremonyResultKey,
  dismissed,
  failed,
  passed,
  unavailable
}: typeof import('@web/modules/social-recovery/shared/ceremony') = require('@web/modules/social-recovery/shared/ceremony')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  checklistPathOf,
  claimAskedOf
}: typeof import('@web/modules/social-recovery/recovery/checklist') = require('@web/modules/social-recovery/recovery/checklist')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const CEREMONY = 'socialRecovery.ceremony'
const PASSKEY = 'socialRecovery.checklist.passkey'

const PATH: Configuration = configurationOf([
  { threshold: 1, credentials: [passkeyCredential('Laptop passkey')] },
  { threshold: 1, credentials: [guardianCredential(GUARDIANS[0])] }
])

describe('the passkey row', () => {
  let view: Mounted | undefined
  let world: TestRecords
  let kit: FakeKit
  let deps: FakeDeps
  const gathering = gatheringOf(PATH, 1)

  const open = async (search: ChecklistSearch = { account: ACCOUNT }) => {
    view?.unmount()
    view = await mountChecklist({ records: world.records, client: kit.state, deps, search })
    return view
  }

  /** The tab writes its report and returns to the path the row gave it. */
  const returnFrom = async (id: string, outcome: CeremonyOutcome<unknown>) => {
    await deps.channel.report(id, 'createClaim', outcome)
    return open({ account: ACCOUNT, ceremony: id })
  }

  beforeEach(async () => {
    world = testRecords()
    await seedEntry(world.records)
    await seedCache(world.records, PATH)
    await seedSession(world.records, gathering)
    kit = fakeKit(PATH)
    deps = depsOf()
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  each([
    ['on this device', 'checklist-row-0-answer-here', false],
    ['on the phone', 'checklist-row-0-phone', true]
  ] as const)(
    'launches the claim ceremony %s with a ceremony request and the hand-off flag',
    async ([, button, handOff]) => {
      const mounted = await open()
      expect(mounted.byTestId(button)).not.toBeNull()

      await mounted.press(button)

      const [id] = deps.requestIds
      const stored = await world.records.ceremonyRequest(id).read()
      expect(stored.status === 'present' && stored.value).toEqual({
        call: 'createClaim',
        method: 'passkey',
        account: ACCOUNT,
        chainId: CHAIN_ID,
        request: requestOf(gathering, 0),
        params: { handOff }
      })
      expect(mounted.lastPath()).toBe(
        ceremonyPath({
          call: 'createClaim',
          method: 'passkey',
          id,
          handOff,
          returnTo: checklistPathOf(ACCOUNT, id)
        })
      )
    }
  )

  it('adds a passed claim through the client and writes the session under a new revision', async () => {
    const before = await storedSession(world.records)
    const mounted = await open()
    await mounted.press('checklist-row-0-phone')
    const [id] = deps.requestIds
    const reply = replyOf(gathering, 0)

    const back = await returnFrom(id, passed({ reply, facts: { place: 'phone' } }))

    expect(kit.addApproverReply).toHaveBeenCalledWith(gathering, reply)
    const after = await storedSession(world.records)
    expect(after?.revision).not.toBe(before?.revision)
    expect(after?.value.state === 'live' && after.value.gathering.replies).toEqual([reply])
    expect(back.byTestId('checklist-row-0-chip')?.textContent).toBe(
      t('socialRecovery.status.collection.complete')
    )
    expect(back.byTestId('checklist-row-0-answered')?.textContent).toContain(
      t(`${PASSKEY}.answeredPhone`, { date: '' }).trim()
    )
    expect(back.byTestId('checklist-row-0-answer-here')).toBeNull()
    expect((await world.records.ceremonyRequest(id).read()).status).toBe('absent')
  })

  it('adds a report that lands after the return through the listener', async () => {
    const mounted = await open()
    await mounted.press('checklist-row-0-answer-here')
    const [id] = deps.requestIds
    const back = await open({ account: ACCOUNT, ceremony: id })
    expect(back.byTestId('checklist-undelivered')).not.toBeNull()

    const reply = replyOf(gathering, 0)
    await outside(() => deps.channel.report(id, 'createClaim', passed({ reply })))
    await outside(async () => undefined)

    expect(kit.addApproverReply).toHaveBeenCalledWith(gathering, reply)
    const after = await storedSession(world.records)
    expect(after?.value.state === 'live' && after.value.gathering.replies).toEqual([reply])
    expect(back.byTestId('checklist-undelivered')).toBeNull()
  })

  it('reads a reply the client refuses as the row failed note, with the row still open', async () => {
    const mounted = await open()
    await mounted.press('checklist-row-0-answer-here')
    const [id] = deps.requestIds
    const stale = { ...replyOf(gathering, 0), attemptId: '99' }

    const back = await returnFrom(id, passed({ reply: stale }))

    expect(kit.addApproverReply).toHaveBeenCalledTimes(1)
    const after = await storedSession(world.records)
    expect(after?.value.state === 'live' && after.value.gathering.replies).toEqual([])
    expect(back.byTestId('checklist-row-0-note')?.textContent).toBe(t(`${CEREMONY}.failedNote`))
    expect(back.byTestId('checklist-row-0-chip')?.textContent).toBe(
      t('socialRecovery.status.collection.notAsked')
    )
  })

  it('keeps the claim request and the ceremony id until the reply is added', async () => {
    const mounted = await open()
    await mounted.press('checklist-row-0-answer-here')
    const [id] = deps.requestIds
    const release = world.storage.hold('recoverySession')
    await deps.channel.report(id, 'createClaim', passed({ reply: replyOf(gathering, 0) }))

    const back = await open({ account: ACCOUNT, ceremony: id })

    expect(kit.addApproverReply).toHaveBeenCalledTimes(1)
    expect((await world.records.ceremonyRequest(id).read()).status).toBe('present')
    expect(back.navigate).not.toHaveBeenCalledWith(checklistPathOf(ACCOUNT), { replace: true })

    await outside(async () => release())
    await outside(async () => undefined)

    expect((await world.records.ceremonyRequest(id).read()).status).toBe('absent')
    expect(back.navigate).toHaveBeenCalledWith(checklistPathOf(ACCOUNT), { replace: true })
  })

  it('keeps the claim request and the ceremony id where the session write fails', async () => {
    const mounted = await open()
    await mounted.press('checklist-row-0-answer-here')
    const [id] = deps.requestIds
    world.storage.refuse.push('recoverySession')
    await deps.channel.report(id, 'createClaim', passed({ reply: replyOf(gathering, 0) }))

    const back = await open({ account: ACCOUNT, ceremony: id })

    expect(kit.addApproverReply).toHaveBeenCalled()
    expect(back.byTestId('checklist-write-failed')?.textContent).toContain(
      t('socialRecovery.checklist.writeFailed')
    )
    expect((await world.records.ceremonyRequest(id).read()).status).toBe('present')
    expect(back.navigate).not.toHaveBeenCalledWith(checklistPathOf(ACCOUNT), { replace: true })
    const after = await storedSession(world.records)
    expect(after?.value.state === 'live' && after.value.gathering.replies).toEqual([])
  })

  it('reads waiting only while this tab has launched the claim or waits for its report', async () => {
    const mounted = await open()
    const chipOf = (shown: Mounted) => shown.byTestId('checklist-row-0-chip')?.textContent
    expect(chipOf(mounted)).toBe(t('socialRecovery.status.collection.notAsked'))

    await mounted.press('checklist-row-0-answer-here')
    expect(chipOf(mounted)).toBe(t('socialRecovery.status.collection.waiting'))

    const [id] = deps.requestIds
    const back = await open({ account: ACCOUNT, ceremony: id })
    expect(back.byTestId('checklist-undelivered')).not.toBeNull()
    expect(chipOf(back)).toBe(t('socialRecovery.status.collection.waiting'))

    const reload = await open()
    expect(chipOf(reload)).toBe(t('socialRecovery.status.collection.notAsked'))
  })

  each([
    ['cancelled', dismissed('cancelled'), `${CEREMONY}.cancelledNote`],
    ['refused', dismissed('refused'), `${CEREMONY}.refusedNote`],
    ['failed', failed('browser-error', 'NotAllowedError'), `${CEREMONY}.failedNote`],
    ['unreachable', unavailable('unreachable'), `${CEREMONY}.unreachableNote`]
  ] as const)(
    'renders the %s report as its note with a retry that launches again',
    async ([, outcome, noteKey]) => {
      const mounted = await open()
      await mounted.press('checklist-row-0-phone')
      const [id] = deps.requestIds

      const back = await returnFrom(id, outcome)

      expect(kit.addApproverReply).not.toHaveBeenCalled()
      expect(back.byTestId('checklist-row-0-note')?.textContent).toBe(t(noteKey))
      expect(back.byTestId('checklist-row-0-no-passkey')).toBeNull()
      expect(back.byTestId('checklist-row-0-retry')).not.toBeNull()

      await back.press('checklist-row-0-retry')
      const retried = deps.requestIds[1]
      expect(retried).toBeDefined()
      const stored = await world.records.ceremonyRequest(retried).read()
      expect(stored.status === 'present' && stored.value).toMatchObject({
        call: 'createClaim',
        params: { handOff: true }
      })
    }
  )

  each([
    [
      'a device that did not answer',
      unavailable('device-unavailable'),
      `${CEREMONY}.unavailableNote`
    ],
    ['InvalidStateError', dismissed('refused', 'InvalidStateError'), `${CEREMONY}.refusedNote`],
    ['NotSupportedError', dismissed('refused', 'NotSupportedError'), `${CEREMONY}.refusedNote`]
  ] as const)(
    'renders the no passkey block after %s, with the scan and the security key',
    async ([, outcome, noteKey]) => {
      const mounted = await open()
      await mounted.press('checklist-row-0-answer-here')
      const [id] = deps.requestIds

      const back = await returnFrom(id, outcome)

      expect(back.byTestId('checklist-row-0-note')?.textContent).toBe(t(noteKey))
      expect(back.byTestId('checklist-row-0-no-passkey')?.textContent).toBe(
        t(`${PASSKEY}.noPasskeyHeader`)
      )
      await back.press('checklist-row-0-security-key')
      const stored = await world.records.ceremonyRequest(deps.requestIds[1]).read()
      expect(stored.status === 'present' && stored.value).toMatchObject({
        params: { handOff: false }
      })
    }
  )

  /** The report the ceremony tab left for `id`, as the channel holds it. */
  const reportHeld = async (id: string) =>
    (await deps.reportStore.get(ceremonyResultKey(id), undefined)) !== undefined

  const repliesOf = async () => {
    const stored = await storedSession(world.records)
    return stored?.value.state === 'live' ? stored.value.gathering.replies : null
  }

  it('adds a passed claim on a reload under the same ceremony id once the session write works', async () => {
    const mounted = await open()
    await mounted.press('checklist-row-0-answer-here')
    const [id] = deps.requestIds
    const reply = replyOf(gathering, 0)
    world.storage.refuse.push('recoverySession')
    await deps.channel.report(id, 'createClaim', passed({ reply }))

    const failedBack = await open({ account: ACCOUNT, ceremony: id })
    expect(failedBack.byTestId('checklist-write-failed')).not.toBeNull()
    expect(await reportHeld(id)).toBe(true)

    world.storage.refuse.splice(0)
    const reload = await open({ account: ACCOUNT, ceremony: id })

    expect(await repliesOf()).toEqual([reply])
    expect(reload.byTestId('checklist-write-failed')).toBeNull()
    expect(reload.byTestId('checklist-row-0-chip')?.textContent).toBe(
      t('socialRecovery.status.collection.complete')
    )
    expect(await reportHeld(id)).toBe(false)
    expect((await world.records.ceremonyRequest(id).read()).status).toBe('absent')
  })

  it('keeps a report that lands through the listener across a reload until its reply is added', async () => {
    const mounted = await open()
    await mounted.press('checklist-row-0-answer-here')
    const [id] = deps.requestIds
    const back = await open({ account: ACCOUNT, ceremony: id })
    expect(back.byTestId('checklist-undelivered')).not.toBeNull()
    const reply = replyOf(gathering, 0)
    world.storage.refuse.push('recoverySession')

    await outside(() => deps.channel.report(id, 'createClaim', passed({ reply })))
    await outside(async () => undefined)

    expect(back.byTestId('checklist-write-failed')).not.toBeNull()
    expect(await repliesOf()).toEqual([])

    world.storage.refuse.splice(0)
    await open({ account: ACCOUNT, ceremony: id })

    expect(await repliesOf()).toEqual([reply])
    expect(await reportHeld(id)).toBe(false)
  })

  it('renders a reply another tab overtook as a conflict to reload, and adds the reply after it', async () => {
    const mounted = await open()
    await mounted.press('checklist-row-0-answer-here')
    const [id] = deps.requestIds
    const back = await open({ account: ACCOUNT, ceremony: id })
    const read = await storedSession(world.records)
    await outside(() =>
      world.otherTab
        .recoverySession(CHAIN_ID, ACCOUNT)
        .setNote(1, 'declined', read?.revision ?? null)
    )
    const reply = replyOf(gathering, 0)

    await outside(() => deps.channel.report(id, 'createClaim', passed({ reply })))
    await outside(async () => undefined)

    expect(back.byTestId('checklist-conflict')).not.toBeNull()
    expect(back.byTestId('checklist-write-failed')).toBeNull()
    const afterConflict = await storedSession(world.records)
    expect(afterConflict?.value.state === 'live' && afterConflict.value.notes).toEqual({
      1: 'declined'
    })
    expect(await repliesOf()).toEqual([])

    await back.press('checklist-conflict-retry')

    const both = await storedSession(world.records)
    expect(both?.value.state === 'live' && both.value.gathering.replies).toEqual([reply])
    expect(both?.value.state === 'live' && both.value.notes).toEqual({ 1: 'declined' })
  })

  /** A passed claim whose session write failed: it waits, its request and its report kept. */
  const waitingClaim = async () => {
    const mounted = await open()
    await mounted.press('checklist-row-0-answer-here')
    const [id] = deps.requestIds
    world.storage.refuse.push('recoverySession')
    await deps.channel.report(id, 'createClaim', passed({ reply: replyOf(gathering, 0) }))
    const back = await open({ account: ACCOUNT, ceremony: id })
    expect(back.byTestId('checklist-write-failed')).not.toBeNull()
    world.storage.refuse.splice(0)
    return { back, id }
  }

  it('takes a waiting claim with the abandoned session', async () => {
    const { back, id } = await waitingClaim()

    await back.press('checklist-cannot-complete')
    await back.press('checklist-abandon-action')

    expect((await storedSession(world.records))?.value.state).toBe('wiped')
    expect((await world.records.ceremonyRequest(id).read()).status).toBe('absent')
    expect(await reportHeld(id)).toBe(false)
    expect(back.navigate).toHaveBeenLastCalledWith(`/${WEB_ROUTES.socialRecoveryRecovery}`, {
      replace: true
    })
  })

  it('keeps the session, the entry and the waiting claim where another tab wrote before the abandon', async () => {
    const { back, id } = await waitingClaim()
    const read = await storedSession(world.records)
    await outside(() =>
      world.otherTab
        .recoverySession(CHAIN_ID, ACCOUNT)
        .setNote(1, 'declined', read?.revision ?? null)
    )

    await back.press('checklist-cannot-complete')
    await back.press('checklist-abandon-action')

    expect(back.byTestId('checklist-conflict')).not.toBeNull()
    const after = await storedSession(world.records)
    expect(after?.value.state === 'live' && after.value.notes).toEqual({ 1: 'declined' })
    expect((await world.records.recoveryEntry(CHAIN_ID, ACCOUNT).read()).status).toBe('present')
    expect((await world.records.ceremonyRequest(id).read()).status).toBe('present')
    expect(await reportHeld(id)).toBe(true)
    expect(back.navigate).not.toHaveBeenCalledWith(`/${WEB_ROUTES.socialRecoveryRecovery}`, {
      replace: true
    })
  })

  each([
    ['cancelled', dismissed('cancelled')],
    ['refused', dismissed('refused')],
    ['failed', failed('browser-error', 'NotAllowedError')],
    ['unreachable', unavailable('unreachable')]
  ] as const)(
    'drops the request, the report and the ceremony id of a %s claim at once',
    async ([, outcome]) => {
      const mounted = await open()
      await mounted.press('checklist-row-0-answer-here')
      const [id] = deps.requestIds

      const back = await returnFrom(id, outcome)

      expect(back.byTestId('checklist-row-0-note')).not.toBeNull()
      expect((await world.records.ceremonyRequest(id).read()).status).toBe('absent')
      expect(await reportHeld(id)).toBe(false)
      expect(back.navigate).toHaveBeenCalledWith(checklistPathOf(ACCOUNT), { replace: true })
    }
  )

  describe('a ceremony that returns to a request this checklist cannot take', () => {
    /** A claim request stored for `account` on `chainId`. */
    const claimOf = (account = ACCOUNT, chainId: ChainId = CHAIN_ID) => ({
      call: 'createClaim' as const,
      method: 'passkey',
      account,
      chainId,
      request: requestOf(gatheringOf(PATH, 1, account), 0),
      params: { handOff: false }
    })
    const passedReply = passed({ reply: replyOf(gathering, 0) })

    it('removes the report of a request that is gone, and applies nothing', async () => {
      const id = 'request-wiped'
      await deps.channel.report(id, 'createClaim', passedReply)

      const back = await open({ account: ACCOUNT, ceremony: id })

      expect(await reportHeld(id)).toBe(false)
      expect(kit.addApproverReply).not.toHaveBeenCalled()
      expect(await repliesOf()).toEqual([])
      expect(back.byTestId('checklist-undelivered')).toBeNull()
      expect(back.byTestId('checklist-row-0-chip')?.textContent).toBe(
        t('socialRecovery.status.collection.notAsked')
      )
      expect(back.navigate).toHaveBeenCalledWith(checklistPathOf(ACCOUNT), { replace: true })
    })

    each([
      ['another account', claimOf(SECOND_ACCOUNT)],
      ['another network', claimOf(ACCOUNT, 1)]
    ] as const)(
      'keeps the request and the report of %s, and applies nothing',
      async ([, claim]) => {
        const id = 'request-of-another'
        await world.records.ceremonyRequest(id).write(claim)
        await deps.channel.report(id, 'createClaim', passedReply)

        const back = await open({ account: ACCOUNT, ceremony: id })

        expect(await reportHeld(id)).toBe(true)
        expect((await world.records.ceremonyRequest(id).read()).status).toBe('present')
        expect(kit.addApproverReply).not.toHaveBeenCalled()
        expect(await repliesOf()).toEqual([])
        expect(back.byTestId('checklist-undelivered')).toBeNull()
        expect(back.navigate).toHaveBeenCalledWith(checklistPathOf(ACCOUNT), { replace: true })
      }
    )

    it('removes nothing where the request cannot be read', async () => {
      const id = 'request-unread'
      await world.records.ceremonyRequest(id).write(claimOf())
      await deps.channel.report(id, 'createClaim', passedReply)
      const get = world.storage.get
      const unreadable = jest
        .spyOn(world.storage, 'get')
        .mockImplementation(async (key, defaultValue) => {
          if (String(key).includes(id)) {
            throw new Error('storage unavailable')
          }
          return get(key, defaultValue)
        })

      await open({ account: ACCOUNT, ceremony: id })
      unreadable.mockRestore()

      expect(await reportHeld(id)).toBe(true)
      expect((await world.records.ceremonyRequest(id).read()).status).toBe('present')
      expect(kit.addApproverReply).not.toHaveBeenCalled()
      expect(await repliesOf()).toEqual([])
    })
  })

  each([
    ['no report has landed', false],
    ['a report landed that the listener has not delivered', true]
  ] as const)(
    'takes a claim still waiting for its report with the abandoned session, where %s',
    async ([, landed]) => {
      const mounted = await open()
      await mounted.press('checklist-row-0-answer-here')
      const [id] = deps.requestIds
      const back = await open({ account: ACCOUNT, ceremony: id })
      expect(back.byTestId('checklist-undelivered')).not.toBeNull()
      const reply = replyOf(gathering, 0)
      if (landed) {
        await deps.reportStore.set(
          ceremonyResultKey(id),
          ceremonyReport({ id, call: 'createClaim', method: 'passkey' }, passed({ reply }), NOW)
        )
      }

      await back.press('checklist-cannot-complete')
      await back.press('checklist-abandon-action')

      expect((await storedSession(world.records))?.value.state).toBe('wiped')
      expect((await world.records.ceremonyRequest(id).read()).status).toBe('absent')
      expect(await reportHeld(id)).toBe(false)
      expect(back.navigate).toHaveBeenLastCalledWith(`/${WEB_ROUTES.socialRecoveryRecovery}`, {
        replace: true
      })
      expect(kit.addApproverReply).not.toHaveBeenCalled()

      await outside(() => deps.channel.report(id, 'createClaim', passed({ reply })))
      await outside(async () => undefined)

      expect(kit.addApproverReply).not.toHaveBeenCalled()
      expect((await storedSession(world.records))?.value.state).toBe('wiped')
    }
  )

  each([
    ['the client would take it again', false],
    ['the client would refuse it', true]
  ] as const)(
    'settles a claim whose reply the session already holds after a reload, where %s: nothing added, nothing refused',
    async ([, refuses]) => {
      const mounted = await open()
      await mounted.press('checklist-row-0-phone')
      const [id] = deps.requestIds
      const reply = replyOf(gathering, 0)
      await deps.channel.report(id, 'createClaim', passed({ reply, facts: { place: 'phone' } }))
      // The reply was written, and the tab closed before it dropped the claim.
      const read = await storedSession(world.records)
      const written = await world.records
        .recoverySession(CHAIN_ID, ACCOUNT)
        .write(withReplies(gathering, [0]), read?.revision ?? null)
      if (refuses) {
        kit.addApproverReply.mockImplementation((held) => ({
          gathering: held,
          reason: { kind: 'add-refusal', cause: 'binding-mismatch' }
        }))
      }

      const back = await open({ account: ACCOUNT, ceremony: id })

      expect(kit.addApproverReply).not.toHaveBeenCalled()
      const after = await storedSession(world.records)
      expect(after?.revision).toBe(written.revision)
      expect(await repliesOf()).toEqual([reply])
      expect(back.byTestId('checklist-row-0-note')).toBeNull()
      expect(back.byTestId('checklist-write-failed')).toBeNull()
      expect(back.byTestId('checklist-row-0-chip')?.textContent).toBe(
        t('socialRecovery.status.collection.complete')
      )
      expect((await world.records.ceremonyRequest(id).read()).status).toBe('absent')
      expect(await reportHeld(id)).toBe(false)
      expect(back.navigate).toHaveBeenCalledWith(checklistPathOf(ACCOUNT), { replace: true })
    }
  )

  /** Holds every read of `target` whose key names `id` until the returned release runs. */
  const holdReads = (target: Pick<ReportStore, 'get'>, id: string) => {
    const read = target.get.bind(target)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    Object.assign(target, {
      get: async (key: string, defaultValue?: unknown) => {
        if (key.includes(id)) {
          await gate
        }
        return read(key, defaultValue)
      }
    })
    return () => release()
  }

  each([
    ['the claim request', () => world.storage],
    ['the ceremony report', () => deps.reportStore]
  ] as const)(
    'navigates nothing and wipes nothing where the checklist leaves during the read of %s',
    async ([, target]) => {
      const mounted = await open()
      await mounted.press('checklist-row-0-answer-here')
      const [id] = deps.requestIds
      await deps.channel.report(id, 'createClaim', dismissed('refused'))
      const release = holdReads(target(), id)

      const back = await open({ account: ACCOUNT, ceremony: id })
      const navigations = back.navigate.mock.calls.length
      back.unmount()
      view = undefined
      release()
      await settle()

      expect(back.navigate).toHaveBeenCalledTimes(navigations)
      expect((await world.records.ceremonyRequest(id).read()).status).toBe('present')
      expect(await reportHeld(id)).toBe(true)
    }
  )

  it('leaves no note from a claim settled over a held reply on the rows of the next gathering', async () => {
    const mounted = await open()
    await mounted.press('checklist-row-0-answer-here')
    const [id] = deps.requestIds
    await deps.channel.report(id, 'createClaim', passed({ reply: replyOf(gathering, 0) }))
    const read = await storedSession(world.records)
    const written = await world.records
      .recoverySession(CHAIN_ID, ACCOUNT)
      .write(withReplies(gathering, [0]), read?.revision ?? null)
    const back = await open({ account: ACCOUNT, ceremony: id })
    await outside(() =>
      world.otherTab
        .wipeRecoverySession(CHAIN_ID, ACCOUNT, 'deadline-passed', written.revision)
        .then(() => undefined)
    )

    await back.press('checklist-row-1-mark-declined')
    await back.press('checklist-conflict-retry')
    expect(back.byTestId('checklist-wiped')).not.toBeNull()
    await back.press('checklist-gather-again')

    expect(back.byTestId('checklist-row-0-answer-here')).not.toBeNull()
    expect(back.byTestId('checklist-row-0-note')).toBeNull()
    expect(back.byTestId('checklist-row-0-retry')).toBeNull()
  })

  it('shows the no passkey block on the fresh install before any claim', async () => {
    world = testRecords()
    await seedEntry(world.records, entryOf('fresh-install'))
    await seedCache(world.records, PATH)
    await seedSession(world.records, gathering)
    view?.unmount()
    view = await mountChecklist({
      records: world.records,
      client: kit.state,
      deps,
      entry: entryOf('fresh-install')
    })

    expect(view.byTestId('checklist-row-0-no-passkey')?.textContent).toBe(
      t(`${PASSKEY}.noPasskeyHeader`)
    )
    expect(view.byTestId('checklist-row-0-answer-here')).toBeNull()
    expect(view.byTestId('checklist-row-0-scan')).not.toBeNull()
  })

  it('shows no such block on the logged-in wallet before any claim', async () => {
    const mounted = await open()

    expect(mounted.byTestId('checklist-row-0-no-passkey')).toBeNull()
    expect(mounted.byTestId('checklist-row-0-answer-here')).not.toBeNull()
  })

  each([
    [
      'a cancel the browser reports as NotAllowedError',
      dismissed('cancelled', 'NotAllowedError'),
      true
    ],
    ['a cancel the browser reports as AbortError', dismissed('cancelled', 'AbortError'), false],
    ['a cancel with no detail', dismissed('cancelled'), false],
    ['a refusal reported as NotAllowedError', dismissed('refused', 'NotAllowedError'), false]
  ] as const)(
    'on the logged-in wallet, decides the no passkey block after %s',
    async ([, outcome, shown]) => {
      const mounted = await open()
      await mounted.press('checklist-row-0-answer-here')
      const [id] = deps.requestIds

      const back = await returnFrom(id, outcome)

      expect(back.byTestId('checklist-row-0-no-passkey') !== null).toBe(shown)
      expect(back.byTestId('checklist-row-0-answer-here') === null).toBe(shown)
      expect(back.byTestId('checklist-row-0-retry')).not.toBeNull()
    }
  )

  it('takes a stored request whose chain id is a string, and drops one of another chain', () => {
    const record = {
      call: 'createClaim',
      method: 'passkey',
      account: ACCOUNT,
      chainId: CHAIN_ID,
      request: requestOf(gathering, 0),
      params: { handOff: true }
    } as const
    const target = { account: ACCOUNT, chainId: CHAIN_ID }

    expect(claimAskedOf({ ...record, chainId: String(CHAIN_ID) } as never, target)).toEqual({
      place: 0,
      request: requestOf(gathering, 0),
      handOff: true
    })
    expect(claimAskedOf({ ...record, chainId: 'not-a-chain' } as never, target)).toBeNull()
    expect(claimAskedOf({ ...record, chainId: 1 }, target)).toBeNull()
  })

  it('shows the lines on synced passkeys and on passkeys of another browser', async () => {
    const mounted = await open()

    expect(mounted.byTestId('checklist-row-0-any-device')?.textContent).toBe(
      t(`${PASSKEY}.anyDevice`)
    )
    expect(mounted.byTestId('checklist-row-0-other-browser')?.textContent).toBe(
      t(`${PASSKEY}.otherBrowser`)
    )
    expect(mounted.byTestId('checklist-row-0')?.querySelector('[tabindex="0"]')).not.toBeNull()
  })

  it('renders the mismatch line and no action for a passkey another origin committed', async () => {
    const foreign = configurationOf([
      { threshold: 1, credentials: [passkeyCredential('Old passkey', OTHER_RP_HASH)] }
    ])
    world = testRecords()
    await seedEntry(world.records)
    await seedCache(world.records, foreign)
    await seedSession(world.records, gatheringOf(foreign))
    kit = fakeKit(foreign)

    const mounted = await open()

    expect(mounted.byTestId('checklist-row-0-mismatch')?.textContent).toBe(
      t(`${CEREMONY}.relyingPartyMismatch`)
    )
    expect(mounted.byTestId('checklist-row-0')?.querySelector('[tabindex="0"]')).toBeNull()
    expect(mounted.byTestId('checklist-row-0-answer-here')).toBeNull()
    expect(mounted.byTestId('checklist-row-0-phone')).toBeNull()
  })
})
