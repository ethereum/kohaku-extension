/**
 * @jest-environment jsdom
 *
 * Opening the checklist: one gathering over the setup's configuration and the
 * handover, written as the live session before any row renders; a resume
 * that reads the stored session and opens nothing new; a wiped session that
 * renders its reason and gathers again; and the holder sent to the readout
 * where this device cannot open the setup.
 */
import type { Configuration } from '@web/modules/social-recovery/sdk-interfaces'

import type {
  Mounted,
  TestRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  CHAIN_ID,
  DAY_SECONDS,
  commitmentMismatch,
  configurationOf,
  depsOf,
  DESTINATION,
  each,
  fakeKit,
  gatheringOf,
  GUARDIANS,
  guardianCredential,
  MIXED_PATH,
  mountChecklist,
  outside,
  PASSWORD,
  REMOVED,
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
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  NO_PAYMENT_ORDER
}: typeof import('@web/modules/social-recovery/recovery/checklist') = require('@web/modules/social-recovery/recovery/checklist')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

describe('opening the checklist', () => {
  let view: Mounted | undefined
  let world: TestRecords

  beforeEach(async () => {
    world = testRecords()
    await seedEntry(world.records)
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('opens one gathering over the cached configuration with the destination key and the removed key', async () => {
    await seedCache(world.records, MIXED_PATH)
    const kit = fakeKit(MIXED_PATH)
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })

    expect(kit.initRecoveryGathering).toHaveBeenCalledTimes(1)
    expect(kit.initRecoveryGathering).toHaveBeenCalledWith(
      MIXED_PATH,
      { newAuthority: DESTINATION, removedAuthority: REMOVED },
      NO_PAYMENT_ORDER,
      { window: DAY_SECONDS }
    )
    expect(kit.getSetup).not.toHaveBeenCalled()
    const stored = await storedSession(world.records)
    expect(stored?.value).toEqual({ state: 'live', gathering: gatheringOf(MIXED_PATH, 1) })
    expect(view.byTestId('checklist-rows')).not.toBeNull()
  })

  it('renders no row until the live session is written', async () => {
    await seedCache(world.records, MIXED_PATH)
    const kit = fakeKit(MIXED_PATH)
    const release = world.storage.hold('recoverySession')
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })
    await settle()

    expect(kit.initRecoveryGathering).toHaveBeenCalledTimes(1)
    expect(view.byTestId('checklist-rows')).toBeNull()
    expect(view.byTestId('checklist-row-0')).toBeNull()
    expect(view.byTestId('checklist-loading')).not.toBeNull()
    expect(await storedSession(world.records)).toBeNull()

    await outside(async () => release())
    await settle()
    expect(await storedSession(world.records)).not.toBeNull()
    expect(view.byTestId('checklist-row-0')).not.toBeNull()
  })

  it('renders a failed open with a retry, never an empty path, where the session cannot be written', async () => {
    await seedCache(world.records, MIXED_PATH)
    const kit = fakeKit(MIXED_PATH)
    world.storage.refuse.push('recoverySession')
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })

    const failure = view.byTestId('checklist-failed-open')?.textContent
    expect(failure).toContain(t('socialRecovery.checklist.openFailedTitle'))
    expect(failure).toContain(t('socialRecovery.checklist.openFailedBody'))
    expect(view.byTestId('checklist-rows')).toBeNull()

    world.storage.refuse.length = 0
    await view.press('checklist-failed-open-retry')
    expect(view.byTestId('checklist-row-0')).not.toBeNull()
    expect(await storedSession(world.records)).not.toBeNull()
  })

  it('resumes the stored session and opens no second gathering', async () => {
    await seedCache(world.records, MIXED_PATH)
    const held = withReplies(gatheringOf(MIXED_PATH, 7), [1])
    const seeded = await seedSession(world.records, held)
    const kit = fakeKit(MIXED_PATH)
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })

    expect(kit.initRecoveryGathering).not.toHaveBeenCalled()
    const stored = await storedSession(world.records)
    expect(stored?.revision).toBe(seeded.revision)
    expect(stored?.value).toEqual({ state: 'live', gathering: held })
    expect(view.byTestId('checklist-row-1-chip')?.textContent).toBe(
      t('socialRecovery.status.collection.complete')
    )

    // A second mount, as a reload or a second tab, opens nothing either.
    view.unmount()
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })
    expect(kit.initRecoveryGathering).not.toHaveBeenCalled()
    expect((await storedSession(world.records))?.revision).toBe(seeded.revision)
  })

  it('keeps the session another tab wrote first while this one was opening', async () => {
    await seedCache(world.records, MIXED_PATH)
    const theirs = gatheringOf(MIXED_PATH, 9)
    const kit = fakeKit(MIXED_PATH)
    kit.initRecoveryGathering.mockImplementationOnce(async () => {
      await world.otherTab.recoverySession(CHAIN_ID, ACCOUNT).write(theirs, null)
      return gatheringOf(MIXED_PATH, 1)
    })
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })

    expect((await storedSession(world.records))?.value).toEqual({
      state: 'live',
      gathering: theirs
    })
    expect(view.byTestId('checklist-row-0')).not.toBeNull()
  })

  it('opens the setup with the recovery password held in memory where no cache exists', async () => {
    const kit = fakeKit(MIXED_PATH)
    const readPassword = jest.fn(() => PASSWORD)
    view = await mountChecklist({
      records: world.records,
      client: kit.state,
      deps: depsOf({ readPassword })
    })

    expect(readPassword).toHaveBeenCalledWith(CHAIN_ID, ACCOUNT)
    expect(kit.getSetup).toHaveBeenCalledWith({ password: PASSWORD })
    expect(kit.initRecoveryGathering).toHaveBeenCalledTimes(1)
    expect(view.byTestId('checklist-row-0')).not.toBeNull()
  })

  it('sends the holder to the readout where neither the cache nor the password exists', async () => {
    const kit = fakeKit(MIXED_PATH)
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })

    expect(view.lastPath()).toBe(`/${WEB_ROUTES.socialRecoveryRecoveryReadout}?account=${ACCOUNT}`)
    expect(kit.initRecoveryGathering).not.toHaveBeenCalled()
    expect(await storedSession(world.records)).toBeNull()
  })

  it('goes to the wait where the submission already landed', async () => {
    await seedCache(world.records, MIXED_PATH)
    const seeded = await seedSession(world.records, gatheringOf(MIXED_PATH))
    await world.records.landSubmission(CHAIN_ID, ACCOUNT, seeded.revision)
    const kit = fakeKit(MIXED_PATH)
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })

    expect(view.lastPath()).toBe(`/${WEB_ROUTES.socialRecoveryRecoveryWait}?account=${ACCOUNT}`)
    expect(kit.initRecoveryGathering).not.toHaveBeenCalled()
  })

  it('opens nothing until the destination key is read, and fails with a retry where it cannot be', async () => {
    await seedCache(world.records, MIXED_PATH)
    const kit = fakeKit(MIXED_PATH)
    const retry = jest.fn()
    view = await mountChecklist({
      records: world.records,
      client: kit.state,
      deps: depsOf(),
      destination: { status: 'unavailable', retry }
    })

    expect(kit.initRecoveryGathering).not.toHaveBeenCalled()
    expect(view.byTestId('checklist-failed-destination')).not.toBeNull()
    await view.press('checklist-failed-destination-retry')
    expect(retry).toHaveBeenCalled()
  })

  each([
    ['deadline-passed', 'expired', true],
    ['another-attempt-opened', 'void', false],
    ['setup-changed', 'setupChanged', false]
  ] as const)(
    'renders a session the %s wipe ended with its reason',
    async ([reason, slug, offers]) => {
      await seedCache(world.records, MIXED_PATH)
      const seeded = await seedSession(world.records, gatheringOf(MIXED_PATH, 3))
      await world.records.wipeRecoverySession(CHAIN_ID, ACCOUNT, reason, seeded.revision)
      const kit = fakeKit(MIXED_PATH)
      kit.recoveryState.mockResolvedValue({
        attempt: { state: 'Waiting', attemptId: 3n, setupNonce: 1n },
        nextAttemptId: 4n,
        setupNonce: 1n
      })
      view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })

      expect(kit.initRecoveryGathering).not.toHaveBeenCalled()
      expect(view.byTestId('checklist-wiped-title')?.textContent).toBe(
        t(`socialRecovery.records.${slug}Title`)
      )
      expect(view.text()).toContain(t('socialRecovery.records.wipedNote'))
      expect(view.byTestId('checklist-rows')).toBeNull()
      expect(!!view.byTestId('checklist-gather-again')).toBe(offers)
    }
  )

  it('opens over a session the recoverer abandoned as over no session, writing under its revision', async () => {
    await seedCache(world.records, MIXED_PATH)
    const seeded = await seedSession(world.records, gatheringOf(MIXED_PATH, 3))
    await world.records.wipeRecoverySession(
      CHAIN_ID,
      ACCOUNT,
      'recoverer-abandoned',
      seeded.revision
    )
    const kit = fakeKit(MIXED_PATH)
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })

    expect(view.byTestId('checklist-wiped')).toBeNull()
    expect(kit.initRecoveryGathering).toHaveBeenCalledTimes(1)
    expect((await storedSession(world.records))?.value).toEqual({
      state: 'live',
      gathering: gatheringOf(MIXED_PATH, 1)
    })
    expect(view.byTestId('checklist-row-0')).not.toBeNull()
  })

  it('gathers again in one write over the wiped line, clearing nothing first', async () => {
    await seedCache(world.records, MIXED_PATH)
    const seeded = await seedSession(world.records, gatheringOf(MIXED_PATH, 3))
    await world.records.wipeRecoverySession(CHAIN_ID, ACCOUNT, 'deadline-passed', seeded.revision)
    const kit = fakeKit(MIXED_PATH)
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })
    const remove = jest.spyOn(world.storage, 'remove')
    const setsBefore = world.storage.sets.length

    await view.press('checklist-gather-again')

    const sessionSets = world.storage.sets
      .slice(setsBefore)
      .filter((key) => key.includes('recoverySession'))
    expect(sessionSets).toHaveLength(1)
    expect(remove.mock.calls.filter(([key]) => String(key).includes('recoverySession'))).toEqual([])
  })

  it('keeps the wiped reason on screen and in the records where the new gathering cannot open', async () => {
    await seedCache(world.records, MIXED_PATH)
    const seeded = await seedSession(world.records, gatheringOf(MIXED_PATH, 3))
    await world.records.wipeRecoverySession(CHAIN_ID, ACCOUNT, 'deadline-passed', seeded.revision)
    const wiped = await storedSession(world.records)
    const kit = fakeKit(MIXED_PATH)
    kit.initRecoveryGathering.mockRejectedValueOnce(new Error('node unavailable'))
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })

    await view.press('checklist-gather-again')

    expect(view.byTestId('checklist-wiped-title')?.textContent).toBe(
      t('socialRecovery.records.expiredTitle')
    )
    expect(view.byTestId('checklist-gather-again-failed')).not.toBeNull()
    expect(await storedSession(world.records)).toEqual(wiped)

    await view.press('checklist-gather-again')
    expect((await storedSession(world.records))?.value.state).toBe('live')
  })

  it('reads a stale cache again with the password held in memory and opens over the fresh setup', async () => {
    const fresh = configurationOf([
      ...MIXED_PATH.clauses,
      { threshold: 1, credentials: [guardianCredential(GUARDIANS[3], 'Dana')] }
    ])
    await seedCache(world.records, MIXED_PATH)
    const kit = fakeKit(fresh)
    kit.initRecoveryGathering.mockRejectedValueOnce(commitmentMismatch())
    view = await mountChecklist({
      records: world.records,
      client: kit.state,
      deps: depsOf({ readPassword: () => PASSWORD })
    })

    expect(kit.getSetup).toHaveBeenCalledWith({ password: PASSWORD })
    expect(kit.initRecoveryGathering).toHaveBeenCalledTimes(2)
    expect(kit.initRecoveryGathering.mock.calls[0][0]).toEqual(MIXED_PATH)
    expect(kit.initRecoveryGathering.mock.calls[1][0]).toEqual(fresh)
    expect(view.byTestId('checklist-failed-setup')).toBeNull()
    expect(view.byTestId('checklist-row-5')).not.toBeNull()
    expect((await storedSession(world.records))?.value.state).toBe('live')
  })

  describe('a setup read with the password that the chain no longer commits', () => {
    const fresh = configurationOf([
      ...MIXED_PATH.clauses,
      { threshold: 1, credentials: [guardianCredential(GUARDIANS[3], 'Dana')] }
    ])

    /** A client whose first setup read answers the stale setup, and whose init refuses it. */
    const staleKit = () => {
      const kit = fakeKit(fresh)
      kit.getSetup.mockResolvedValueOnce(MIXED_PATH)
      let inits = 0
      kit.initRecoveryGathering.mockImplementation(async (configuration: Configuration) => {
        if (configuration === MIXED_PATH) {
          throw commitmentMismatch()
        }
        inits += 1
        return gatheringOf(fresh, inits)
      })
      return kit
    }

    it('reads the setup again with the password and opens over the fresh setup', async () => {
      const kit = staleKit()
      view = await mountChecklist({
        records: world.records,
        client: kit.state,
        deps: depsOf({ readPassword: () => PASSWORD })
      })

      expect(kit.getSetup).toHaveBeenCalledTimes(2)
      expect(kit.getSetup).toHaveBeenLastCalledWith({ password: PASSWORD })
      expect(kit.initRecoveryGathering.mock.calls[1][0]).toEqual(fresh)
      expect(view.byTestId('checklist-row-5')).not.toBeNull()
      expect((await storedSession(world.records))?.value).toEqual({
        state: 'live',
        gathering: gatheringOf(fresh, 1)
      })
    })

    it('gathers again after a wipe over the fresh setup, where it read the stale one first', async () => {
      const seeded = await seedSession(world.records, gatheringOf(MIXED_PATH, 3))
      await world.records.wipeRecoverySession(CHAIN_ID, ACCOUNT, 'deadline-passed', seeded.revision)
      const kit = staleKit()
      view = await mountChecklist({
        records: world.records,
        client: kit.state,
        deps: depsOf({ readPassword: () => PASSWORD })
      })
      expect(kit.getSetup).toHaveBeenCalledTimes(1)

      await view.press('checklist-gather-again')

      expect(view.byTestId('checklist-gather-again-failed')).toBeNull()
      expect(kit.getSetup).toHaveBeenCalledTimes(2)
      expect(kit.getSetup).toHaveBeenLastCalledWith({ password: PASSWORD })
      expect((await storedSession(world.records))?.value).toEqual({
        state: 'live',
        gathering: gatheringOf(fresh, 1)
      })
      expect(view.byTestId('checklist-wiped')).toBeNull()
      expect(view.byTestId('checklist-row-5')).not.toBeNull()
    })
  })

  it('sends the holder to the readout over a stale cache with no password held', async () => {
    await seedCache(world.records, MIXED_PATH)
    const kit = fakeKit(MIXED_PATH)
    kit.initRecoveryGathering.mockRejectedValueOnce(commitmentMismatch())
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })

    expect(view.lastPath()).toBe(`/${WEB_ROUTES.socialRecoveryRecoveryReadout}?account=${ACCOUNT}`)
    expect(kit.getSetup).not.toHaveBeenCalled()
    expect(await storedSession(world.records)).toBeNull()
  })

  it('gathers again after a wipe: the reason goes and one new gathering is the live session', async () => {
    await seedCache(world.records, MIXED_PATH)
    const seeded = await seedSession(world.records, gatheringOf(MIXED_PATH, 3))
    await world.records.wipeRecoverySession(CHAIN_ID, ACCOUNT, 'deadline-passed', seeded.revision)
    const kit = fakeKit(MIXED_PATH)
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })

    await view.press('checklist-gather-again')

    expect(kit.initRecoveryGathering).toHaveBeenCalledTimes(1)
    expect((await storedSession(world.records))?.value).toEqual({
      state: 'live',
      gathering: gatheringOf(MIXED_PATH, 1)
    })
    expect(view.byTestId('checklist-wiped')).toBeNull()
    expect(view.byTestId('checklist-row-0')).not.toBeNull()
  })
})
