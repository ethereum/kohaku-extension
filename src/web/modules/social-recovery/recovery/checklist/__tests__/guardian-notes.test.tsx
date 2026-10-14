/**
 * @jest-environment jsdom
 *
 * The guardian row's notes: set and cleared through the records under the
 * revision the checklist read. A change another tab made first renders as a
 * conflict to reload, and the reload shows both tabs' notes: none is lost.
 * Abandon wipes the session with the abandon reason, clears the entry and
 * leaves for the route's entry.
 */
import type {
  FakeKit,
  Mounted,
  TestRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  CHAIN_ID,
  depsOf,
  each,
  entryOf,
  fakeKit,
  gatheringOf,
  MIXED_PATH,
  mountChecklist,
  outside,
  seedCache,
  seedEntry,
  seedSession,
  storedSession,
  t,
  testRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const GUARDIAN = 'socialRecovery.checklist.guardian'
const chip = (name: string) => t(`socialRecovery.status.collection.${name}`)

describe('the guardian row notes', () => {
  let view: Mounted | undefined
  let world: TestRecords
  let kit: FakeKit

  const open = async () => {
    view?.unmount()
    view = await mountChecklist({ records: world.records, client: kit.state, deps: depsOf() })
    return view
  }

  beforeEach(async () => {
    world = testRecords()
    await seedEntry(world.records)
    await seedCache(world.records, MIXED_PATH)
    await seedSession(world.records, gatheringOf(MIXED_PATH))
    kit = fakeKit(MIXED_PATH)
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('sets a declined note through the records and clears it with one tap', async () => {
    const mounted = await open()
    const first = await storedSession(world.records)

    await mounted.press('checklist-row-1-mark-declined')

    const marked = await storedSession(world.records)
    expect(marked?.value.state === 'live' && marked.value.notes).toEqual({ 1: 'declined' })
    expect(marked?.revision).not.toBe(first?.revision)
    expect(mounted.byTestId('checklist-row-1-chip')?.textContent).toBe(chip('declined'))
    expect(mounted.byTestId('checklist-row-1-marked')?.textContent).toBe(
      t(`${GUARDIAN}.markedDeclined`)
    )

    await mounted.press('checklist-row-1-clear')

    const cleared = await storedSession(world.records)
    expect(cleared?.value.state === 'live' && cleared.value.notes).toBeUndefined()
    expect(cleared?.revision).not.toBe(marked?.revision)
    expect(mounted.byTestId('checklist-row-1-chip')?.textContent).toBe(chip('notAsked'))
    expect(mounted.byTestId('checklist-row-1-mark-declined')).not.toBeNull()
  })

  it('writes two notes in a row, each under the revision the last one left', async () => {
    const mounted = await open()

    await mounted.press('checklist-row-1-mark-unanswered')
    await mounted.press('checklist-row-2-mark-declined')

    const stored = await storedSession(world.records)
    expect(stored?.value.state === 'live' && stored.value.notes).toEqual({
      1: 'unanswered',
      2: 'declined'
    })
    expect(mounted.byTestId('checklist-conflict')).toBeNull()
  })

  it('renders a note another tab wrote first as a conflict to reload, and loses neither note', async () => {
    const mounted = await open()
    const read = await storedSession(world.records)
    await outside(() =>
      world.otherTab
        .recoverySession(CHAIN_ID, ACCOUNT)
        .setNote(2, 'unanswered', read?.revision ?? null)
    )

    await mounted.press('checklist-row-1-mark-declined')

    const conflict = mounted.byTestId('checklist-conflict')?.textContent
    expect(conflict).toContain(t('socialRecovery.checklist.conflictTitle'))
    expect(conflict).toContain(t('socialRecovery.checklist.conflictBody'))
    expect(mounted.byTestId('checklist-rows')).toBeNull()
    const afterConflict = await storedSession(world.records)
    expect(afterConflict?.value.state === 'live' && afterConflict.value.notes).toEqual({
      2: 'unanswered'
    })

    await mounted.press('checklist-conflict-retry')

    expect(kit.initRecoveryGathering).not.toHaveBeenCalled()
    expect(mounted.byTestId('checklist-row-2-chip')?.textContent).toBe(chip('unanswered'))
    await mounted.press('checklist-row-1-mark-declined')
    const both = await storedSession(world.records)
    expect(both?.value.state === 'live' && both.value.notes).toEqual({
      1: 'declined',
      2: 'unanswered'
    })
  })

  each([
    ['logged-in', `/${WEB_ROUTES.socialRecoveryRecovery}`],
    ['fresh-install', `/${WEB_ROUTES.socialRecoveryRecover}`]
  ] as const)(
    'abandons on the %s route: the session is wiped with the abandon reason, the entry goes, the holder leaves',
    async ([route, path]) => {
      world = testRecords()
      await seedEntry(world.records, entryOf(route))
      await seedCache(world.records, MIXED_PATH)
      await seedSession(world.records, gatheringOf(MIXED_PATH))
      const mounted = await mountChecklist({
        records: world.records,
        client: kit.state,
        deps: depsOf(),
        entry: entryOf(route)
      })
      view = mounted

      await mounted.press('checklist-cannot-complete')
      expect(mounted.byTestId('checklist-abandon-confirm')?.textContent).toBe(
        t('socialRecovery.checklist.abandon.confirm')
      )
      expect((await storedSession(world.records))?.value.state).toBe('live')
      await mounted.press('checklist-abandon-action')

      expect((await storedSession(world.records))?.value).toEqual({
        state: 'wiped',
        reason: 'recoverer-abandoned',
        account: ACCOUNT
      })
      expect((await world.records.recoveryEntry(CHAIN_ID, ACCOUNT).read()).status).toBe('absent')
      expect(mounted.navigate).toHaveBeenLastCalledWith(path, { replace: true })
    }
  )

  it('says the note was not kept where its write fails, and leaves the row as it was', async () => {
    const mounted = await open()
    world.storage.refuse.push('recoverySession')

    await mounted.press('checklist-row-1-mark-declined')

    expect(mounted.byTestId('checklist-write-failed')?.textContent).toContain(
      t('socialRecovery.checklist.writeFailed')
    )
    const stored = await storedSession(world.records)
    expect(stored?.value.state === 'live' && stored.value.notes).toBeUndefined()
    expect(mounted.byTestId('checklist-row-1-chip')?.textContent).toBe(chip('notAsked'))
  })

  it('keeps the session and the entry where the abandon cannot be written, and says so', async () => {
    const mounted = await open()
    await mounted.press('checklist-cannot-complete')
    world.storage.refuse.push('recoverySession')

    await mounted.press('checklist-abandon-action')

    expect(mounted.byTestId('checklist-abandon-failed')?.textContent).toBe(
      t('socialRecovery.checklist.writeFailed')
    )
    expect((await storedSession(world.records))?.value.state).toBe('live')
    expect((await world.records.recoveryEntry(CHAIN_ID, ACCOUNT).read()).status).toBe('present')
    expect(mounted.navigate).not.toHaveBeenCalled()
  })

  it('keeps the session when the holder steps back from the abandon', async () => {
    const mounted = await open()

    await mounted.press('checklist-cannot-complete')
    await mounted.press('checklist-abandon-keep')

    expect((await storedSession(world.records))?.value.state).toBe('live')
    expect((await world.records.recoveryEntry(CHAIN_ID, ACCOUNT).read()).status).toBe('present')
    expect(mounted.byTestId('checklist-abandon')).toBeNull()
    expect(mounted.navigate).not.toHaveBeenCalled()
  })
})
