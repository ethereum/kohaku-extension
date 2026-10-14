/**
 * @jest-environment jsdom
 *
 * The recovery in progress lists the chain's live sessions with their state
 * line and its two actions, and sends the holder to the recovery's entry
 * where none is left. The home band renders a line for each live session and
 * nothing without one.
 */
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import type {
  Mounted,
  TestRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  CHAIN_ID,
  each,
  entryOf,
  gatheringOf,
  MIXED_PATH,
  mountBand,
  NOW,
  mountInProgress,
  SECOND_ACCOUNT,
  seedEntry,
  seedSession,
  storedSession,
  t,
  testRecords,
  TIME_ZONE
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  renderDateTimeInZone
}: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const IN_PROGRESS = 'socialRecovery.inProgress'
const THIRD_ACCOUNT: Address = '0x8888888888888888888888888888888888888888'
const idOf = (account: Address) => account.toLowerCase()

describe('the recovery in progress', () => {
  let view: Mounted | undefined
  let world: TestRecords

  /** Two live sessions, and a third the deadline wiped. */
  const seedThree = async () => {
    await seedEntry(world.records, undefined, ACCOUNT)
    await seedSession(world.records, gatheringOf(MIXED_PATH, 1, ACCOUNT), ACCOUNT)
    await seedEntry(world.records, undefined, SECOND_ACCOUNT)
    await seedSession(world.records, gatheringOf(MIXED_PATH, 1, SECOND_ACCOUNT), SECOND_ACCOUNT)
    await seedEntry(world.records, undefined, THIRD_ACCOUNT)
    const wiped = await seedSession(
      world.records,
      gatheringOf(MIXED_PATH, 1, THIRD_ACCOUNT),
      THIRD_ACCOUNT
    )
    await world.records.wipeRecoverySession(
      CHAIN_ID,
      THIRD_ACCOUNT,
      'deadline-passed',
      wiped.revision
    )
  }

  beforeEach(() => {
    world = testRecords()
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('lists each live session with its state line, and no wiped one', async () => {
    await seedThree()
    const holdsPath = async (account: Address) => account === ACCOUNT
    view = await mountInProgress({
      records: world.records,
      holdsPath,
      headline: { done: 1, total: 3 }
    })

    const first = idOf(ACCOUNT)
    const second = idOf(SECOND_ACCOUNT)
    expect(view.byTestId(`in-progress-${first}`)).not.toBeNull()
    expect(view.byTestId(`in-progress-${second}`)).not.toBeNull()
    expect(view.byTestId(`in-progress-${idOf(THIRD_ACCOUNT)}`)).toBeNull()

    const row = view.byTestId(`in-progress-${first}`)?.textContent ?? ''
    expect(row).toContain(t('socialRecovery.status.attempt.notSubmitted'))
    expect(view.byTestId(`in-progress-${first}-started`)?.textContent).toBe(
      t(`${IN_PROGRESS}.started`, { date: renderDateTimeInZone(NOW, TIME_ZONE).date })
    )
    expect(view.byTestId(`in-progress-${first}-progress`)?.textContent).toBe(
      t('socialRecovery.checklist.progress', { done: 1, total: 3 })
    )
    expect(view.byTestId(`in-progress-${first}-path`)?.textContent).toBe(
      t(`${IN_PROGRESS}.holdsPath`)
    )
    expect(view.byTestId(`in-progress-${second}-path`)?.textContent).toBe(
      t(`${IN_PROGRESS}.asksPassword`)
    )
  })

  it('shows no count for a session whose headline cannot be read', async () => {
    await seedThree()
    view = await mountInProgress({ records: world.records, headline: null })

    expect(view.byTestId(`in-progress-${idOf(ACCOUNT)}`)).not.toBeNull()
    expect(view.byTestId(`in-progress-${idOf(ACCOUNT)}-progress`)).toBeNull()
  })

  it('continues to the checklist where this device holds the path, through the readout where it does not', async () => {
    await seedThree()
    const holdsPath = async (account: Address) => account === ACCOUNT
    view = await mountInProgress({ records: world.records, holdsPath })

    await view.press(`in-progress-${idOf(ACCOUNT)}-continue`)
    expect(view.lastPath()).toBe(
      `/${WEB_ROUTES.socialRecoveryRecoveryChecklist}?account=${ACCOUNT}`
    )
    await view.press(`in-progress-${idOf(SECOND_ACCOUNT)}-continue`)
    expect(view.lastPath()).toBe(
      `/${WEB_ROUTES.socialRecoveryRecoveryReadout}?account=${SECOND_ACCOUNT}`
    )
  })

  it('abandons one recovery behind its confirmation and keeps the other listed', async () => {
    await seedThree()
    view = await mountInProgress({ records: world.records })
    const first = idOf(ACCOUNT)

    await view.press(`in-progress-${first}-abandon`)
    expect(view.byTestId(`in-progress-${first}-abandon-confirm`)).not.toBeNull()
    expect((await storedSession(world.records, ACCOUNT))?.value.state).toBe('live')
    await view.press(`in-progress-${first}-abandon-action`)

    expect((await storedSession(world.records, ACCOUNT))?.value).toEqual({
      state: 'wiped',
      reason: 'recoverer-abandoned',
      account: ACCOUNT
    })
    expect((await world.records.recoveryEntry(CHAIN_ID, ACCOUNT).read()).status).toBe('absent')
    expect(view.byTestId(`in-progress-${first}`)).toBeNull()
    expect(view.byTestId(`in-progress-${idOf(SECOND_ACCOUNT)}`)).not.toBeNull()
    expect((await storedSession(world.records, SECOND_ACCOUNT))?.value.state).toBe('live')
  })

  it('keeps a recovery listed and says so where its abandon cannot be written', async () => {
    await seedThree()
    view = await mountInProgress({ records: world.records })
    const first = idOf(ACCOUNT)
    world.storage.refuse.push('recoverySession')

    await view.press(`in-progress-${first}-abandon`)
    await view.press(`in-progress-${first}-abandon-action`)

    expect(view.byTestId('in-progress-abandon-failed')?.textContent).toBe(
      t('socialRecovery.checklist.writeFailed')
    )
    expect((await storedSession(world.records, ACCOUNT))?.value.state).toBe('live')
    expect((await world.records.recoveryEntry(CHAIN_ID, ACCOUNT).read()).status).toBe('present')
    expect(view.byTestId(`in-progress-${first}`)).not.toBeNull()
  })

  each([
    ['every recovery came by the fast track', 'fresh-install', 'fresh-install', 'fresh-install'],
    ['one recovery came from the settings', 'fresh-install', 'logged-in', 'logged-in'],
    ['every recovery came from the settings', 'logged-in', 'logged-in', 'logged-in']
  ] as const)('takes the chrome of its route where %s', async ([, first, second, chrome]) => {
    await seedEntry(world.records, entryOf(first), ACCOUNT)
    await seedSession(world.records, gatheringOf(MIXED_PATH, 1, ACCOUNT), ACCOUNT)
    await seedEntry(world.records, entryOf(second), SECOND_ACCOUNT)
    await seedSession(world.records, gatheringOf(MIXED_PATH, 1, SECOND_ACCOUNT), SECOND_ACCOUNT)
    const onRoute = jest.fn()
    view = await mountInProgress({ records: world.records, onRoute })

    expect(onRoute).toHaveBeenLastCalledWith(chrome)
  })

  it('sends the holder to the recovery entry where no live session is left', async () => {
    await seedEntry(world.records, undefined, THIRD_ACCOUNT)
    const wiped = await seedSession(
      world.records,
      gatheringOf(MIXED_PATH, 1, THIRD_ACCOUNT),
      THIRD_ACCOUNT
    )
    await world.records.wipeRecoverySession(
      CHAIN_ID,
      THIRD_ACCOUNT,
      'setup-changed',
      wiped.revision
    )
    view = await mountInProgress({ records: world.records })

    expect(view.navigate).toHaveBeenCalledWith(`/${WEB_ROUTES.socialRecoveryRecovery}`, {
      replace: true
    })
  })

  it('sends the holder to the recover door after abandoning the last fast-track recovery', async () => {
    await seedEntry(world.records, entryOf('fresh-install'), ACCOUNT)
    await seedSession(world.records, gatheringOf(MIXED_PATH, 1, ACCOUNT), ACCOUNT)
    view = await mountInProgress({ records: world.records })
    const first = idOf(ACCOUNT)

    await view.press(`in-progress-${first}-abandon`)
    await view.press(`in-progress-${first}-abandon-action`)

    expect((await storedSession(world.records, ACCOUNT))?.value.state).toBe('wiped')
    expect(view.navigate).toHaveBeenLastCalledWith(`/${WEB_ROUTES.socialRecoveryRecover}`, {
      replace: true
    })
    expect(view.navigate).not.toHaveBeenCalledWith(`/${WEB_ROUTES.socialRecoveryRecovery}`, {
      replace: true
    })
  })
})

describe('the home band', () => {
  let view: Mounted | undefined
  let world: TestRecords

  beforeEach(() => {
    world = testRecords()
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('renders a line for a live session that opens the recovery in progress', async () => {
    await seedEntry(world.records)
    await seedSession(world.records, gatheringOf(MIXED_PATH))
    view = await mountBand({ records: world.records, headline: { done: 2, total: 3 } })

    expect(view.byTestId('home-recovery-band')).not.toBeNull()
    const id = idOf(ACCOUNT)
    expect(view.byTestId(`home-recovery-${id}-account`)?.textContent).toContain('Recovering')
    expect(view.byTestId(`home-recovery-${id}-progress`)?.textContent).toContain('2 of 3 done')
    expect(view.byTestId(`home-recovery-${id}-chip`)?.textContent).toBe(
      t('socialRecovery.status.attempt.notSubmitted')
    )
    await view.press(`home-recovery-${id}-open`)
    expect(view.lastPath()).toBe(`/${WEB_ROUTES.socialRecoveryRecoveryInProgress}`)
  })

  it('renders nothing without a session', async () => {
    view = await mountBand({ records: world.records })

    expect(view.byTestId('home-recovery-band')).toBeNull()
    expect(view.text()).toBe('')
  })

  it('renders nothing where the only session was wiped', async () => {
    await seedEntry(world.records)
    const seeded = await seedSession(world.records, gatheringOf(MIXED_PATH))
    await world.records.wipeRecoverySession(CHAIN_ID, ACCOUNT, 'deadline-passed', seeded.revision)
    view = await mountBand({ records: world.records })

    expect(view.byTestId('home-recovery-band')).toBeNull()
  })
})
