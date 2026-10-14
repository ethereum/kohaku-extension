/**
 * @jest-environment jsdom
 *
 * Where the readout comes from and where it leads: the recovery entry record
 * it reads for the route, the chrome of each route, a live session that sends
 * the holder on to the checklist, continue on each route, and a read that
 * answers after the readout moved on.
 */
import type { Mounted } from '@web/modules/social-recovery/recovery/entry/__tests__/harness'
import {
  BASIC,
  CARD_PASSWORD,
  CHAIN_ID,
  commitLostSetup,
  LOST,
  LOST_SETUP,
  mountReadout,
  navigate,
  outside,
  readoutSearchOf,
  rebuildClient,
  records,
  resetEdges,
  SMART,
  settle,
  storage,
  storedCache,
  storeEntry,
  storeLiveRecovery,
  t
} from '@web/modules/social-recovery/recovery/entry/__tests__/harness'
import type { SetupState } from '@web/modules/social-recovery/sdk-interfaces'
import type { HiddenLevel } from '@web/modules/social-recovery/recovery/entry/types'
import { wipeRecoveryPassword } from '@web/modules/social-recovery/shared/records'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

const ACCOUNT_STEP = '/social-recovery/recovery/account'
const CHECKLIST = `/social-recovery/recovery/checklist?account=${LOST}`
const GAS_STEP = `/social-recovery/fast-track/gas?account=${LOST}`

let screen: Mounted | null = null
const open = async (search: string = readoutSearchOf(LOST)) => {
  screen = await mountReadout(search)
  return screen
}

beforeEach(() => {
  resetEdges()
  wipeRecoveryPassword(CHAIN_ID, LOST)
})
// A write a test held and never released would keep the next test's writes waiting.
afterEach(async () => {
  screen?.unmount()
  screen = null
  storage.hold?.resolve()
  await settle()
})

const navigatedTo = () => navigate.mock.calls.map(([path]) => path)

const storeCache = async (state: SetupState) => {
  await records().decryptedSetupCache(CHAIN_ID, LOST).write({
    configuration: LOST_SETUP,
    setupNonce: state.setupNonce,
    setupCommitment: state.setupCommitment
  })
}

describe('the recovery entry record', () => {
  it('sends the holder to the account step when no entry record is stored for the account', async () => {
    await commitLostSetup('public')
    const page = await open()
    expect(navigate).toHaveBeenCalledWith(ACCOUNT_STEP)
    expect(page.has('readout')).toBe(false)
  })

  it('sends the holder to the account step when only another account has an entry record', async () => {
    await records()
      .recoveryEntry(CHAIN_ID, SMART)
      .write({ account: SMART, route: 'logged-in', receivingAccount: BASIC })
    await commitLostSetup('public')
    const page = await open()
    expect(navigate).toHaveBeenCalledWith(ACCOUNT_STEP)
    expect(page.has('readout')).toBe(false)
  })

  const unusable: [string, string][] = [
    ['no search', ''],
    ['a malformed account', '?account=0x1234']
  ]
  unusable.forEach(([name, search]) => {
    it(`sends the holder to the account step for ${name}`, async () => {
      await storeEntry('logged-in')
      const page = await open(search)
      expect(navigate).toHaveBeenCalledWith(ACCOUNT_STEP)
      expect(page.has('readout')).toBe(false)
    })
  })

  it('shows the third of five stages in the settings chrome on the logged-in route', async () => {
    await storeEntry('logged-in')
    await commitLostSetup('public')
    const page = await open()
    expect(page.textOf('recovery-stage')).toBe(
      t('socialRecovery.entry.stageCounter', { step: 3, total: 5 })
    )
    expect(page.text()).toContain(t('socialRecovery.chrome.breadcrumb'))
  })

  it('shows the plain header and no counter on the fresh-install route', async () => {
    await storeEntry('fresh-install', SMART)
    await commitLostSetup('public')
    const page = await open()
    expect(page.has('recovery-stage')).toBe(false)
    expect(page.text()).not.toContain(t('socialRecovery.chrome.breadcrumb'))
    expect(page.text()).toContain(t('socialRecovery.routes.recover'))
    expect(page.has('readout-readable-public')).toBe(true)
  })
})

describe('continue', () => {
  it('goes to the checklist on the logged-in route', async () => {
    await storeEntry('logged-in')
    await commitLostSetup('public')
    const page = await open()
    expect(navigate).not.toHaveBeenCalled()
    await page.press('readout-continue')
    expect(navigatedTo()).toEqual([CHECKLIST])
  })

  it('goes to the gas step on the fresh-install route', async () => {
    await storeEntry('fresh-install', SMART)
    await commitLostSetup('public')
    const page = await open()
    await page.press('readout-continue')
    expect(navigatedTo()).toEqual([GAS_STEP])
  })

  it('goes on from a private setup once the card password opened it', async () => {
    await storeEntry('fresh-install', SMART)
    await commitLostSetup('private')
    const page = await open()
    await page.type('readout-password-field', CARD_PASSWORD)
    await page.press('readout-unlock')
    await page.press('readout-continue')
    expect(navigatedTo()).toEqual([GAS_STEP])
  })

  it('goes on only once the opened setup is written, so the next screen finds it', async () => {
    await storeEntry('logged-in')
    const hold = deferred<void>()
    storage.hold = hold
    await commitLostSetup('public')
    const page = await open()
    expect(page.has('readout-readable-public')).toBe(true)
    await page.press('readout-continue')
    expect(navigate).not.toHaveBeenCalled()
    await outside(() => hold.resolve())
    expect(navigatedTo()).toEqual([CHECKLIST])
    expect(await storedCache()).not.toBeNull()
  })

  it('sends once for a double press', async () => {
    await storeEntry('logged-in')
    await commitLostSetup('public')
    const page = await open()
    await page.press('readout-continue')
    await page.press('readout-continue')
    expect(navigatedTo()).toEqual([CHECKLIST])
  })
})

describe('a live session', () => {
  it('sends the holder to the checklist with no chain read when this device keeps the opened setup', async () => {
    const world = await commitLostSetup('private')
    await storeLiveRecovery(LOST, { route: 'fresh-install', receivingAccount: SMART })
    await storeCache(await world.client.setup.setupState())
    const setupState = jest.spyOn(world.client.setup, 'setupState')
    const page = await open()
    expect(navigatedTo()).toEqual([CHECKLIST])
    expect(setupState).not.toHaveBeenCalled()
    expect(page.has('readout-password-field')).toBe(false)
  })

  it('asks the card password first when this device keeps no opened setup, then keeps it and sends the holder to the checklist', async () => {
    await commitLostSetup('private')
    await storeLiveRecovery(LOST, { route: 'logged-in', receivingAccount: BASIC })
    const page = await open()
    expect(page.has('readout-locked-private')).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
    await page.type('readout-password-field', CARD_PASSWORD)
    await page.press('readout-unlock')
    expect(navigatedTo()).toEqual([CHECKLIST])
    expect(await storedCache()).not.toBeNull()
  })

  it('keeps a public setup it reads again and sends the holder to the checklist with no password', async () => {
    await commitLostSetup('public')
    await storeLiveRecovery(LOST, { route: 'fresh-install', receivingAccount: SMART })
    await open()
    expect(navigatedTo()).toEqual([CHECKLIST])
    expect(await storedCache()).not.toBeNull()
  })
})

describe('a read that answers after the readout moved on', () => {
  it('does not navigate on a setup read that answers after the screen closed', async () => {
    const world = await commitLostSetup('public')
    await storeLiveRecovery(LOST, { route: 'logged-in', receivingAccount: BASIC })
    const held = deferred<void>()
    const real = world.client.setup.setupState.bind(world.client.setup)
    jest.spyOn(world.client.setup, 'setupState').mockImplementationOnce(async () => {
      await held.promise
      return real()
    })
    const page = await open()
    expect(page.has('readout-reading')).toBe(true)
    page.unmount()
    screen = null
    await outside(() => held.resolve())
    expect(navigate).not.toHaveBeenCalled()
    expect(await storedCache()).toBeNull()
  })

  it('ignores a stale read from the client before a rebuild and renders the latest one', async () => {
    await storeEntry('logged-in')
    const world = await commitLostSetup('public')
    const held = deferred<void>()
    const real = world.client.setup.setupState.bind(world.client.setup)
    jest.spyOn(world.client.setup, 'setupState').mockImplementationOnce(async () => {
      await held.promise
      return { ...(await real()), hasSetup: false }
    })
    const page = await open()
    expect(page.has('readout-reading')).toBe(true)
    await rebuildClient(world)
    await settle()
    expect(page.has('readout-readable-public')).toBe(true)
    await outside(() => held.resolve())
    expect(navigate).not.toHaveBeenCalled()
    expect(page.has('readout-readable-public')).toBe(true)
  })
})

describe('a run of the reads that starts again', () => {
  it('runs an unlock typed after the reads started again while the first check was still open, and renders its values', async () => {
    await storeEntry('logged-in')
    const world = await commitLostSetup('private')
    const page = await open()
    const held = deferred<void>()
    const real = world.client.setup.getSetup.bind(world.client.setup)
    jest.spyOn(world.client.setup, 'getSetup').mockImplementationOnce(async (source) => {
      await held.promise
      return real(source)
    })
    await page.type('readout-password-field', CARD_PASSWORD)
    await page.press('readout-unlock')
    expect(page.has('readout-unlock-checking')).toBe(true)

    const rebuilt = await rebuildClient(world)
    await settle()
    expect(page.has('readout-locked-private')).toBe(true)
    const getSetup = jest.spyOn(rebuilt.client.setup, 'getSetup')
    await page.type('readout-password-field', CARD_PASSWORD)
    await page.press('readout-unlock')
    expect(getSetup).toHaveBeenCalledTimes(1)
    expect(page.has('readout-readable-private')).toBe(true)
    expect(page.has('readout-continue')).toBe(true)

    await outside(() => held.resolve())
    expect(page.has('readout-readable-private')).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('navigates nothing when the screen closes after continue was pressed', async () => {
    await storeEntry('logged-in')
    const hold = deferred<void>()
    storage.hold = hold
    await commitLostSetup('public')
    const page = await open()
    await page.press('readout-continue')
    expect(navigate).not.toHaveBeenCalled()
    page.unmount()
    screen = null
    await outside(() => hold.resolve())
    expect(navigate).not.toHaveBeenCalled()
  })

  it('offers continue again once the reads start again after a press, and goes on once', async () => {
    await storeEntry('logged-in')
    const hold = deferred<void>()
    storage.hold = hold
    const world = await commitLostSetup('public')
    const page = await open()
    await page.press('readout-continue')
    expect(page.isDisabled('readout-continue')).toBe(true)

    await rebuildClient(world)
    await settle()
    expect(page.has('readout-readable-public')).toBe(true)
    expect(page.isDisabled('readout-continue')).toBe(false)
    await page.press('readout-continue')
    expect(navigate).not.toHaveBeenCalled()
    await outside(() => hold.resolve())
    expect(navigatedTo()).toEqual([CHECKLIST])
  })
})

describe('a public setup this device could not keep', () => {
  const WRITE_FAILED = t('socialRecovery.checklist.writeFailed')

  it('renders the failure with a retry on continue and goes nowhere, keeping continue off', async () => {
    await storeEntry('logged-in')
    await commitLostSetup('public')
    storage.refuse = true
    const page = await open()
    expect(page.has('readout-readable-public')).toBe(true)
    await page.press('readout-continue')
    expect(navigate).not.toHaveBeenCalled()
    expect(page.textOf('readout-write-failed')).toContain(WRITE_FAILED)
    expect(page.has('readout-write-failed-retry')).toBe(true)
    expect(page.has('readout-path')).toBe(true)
    expect(page.isDisabled('readout-continue')).toBe(true)
    await page.press('readout-continue')
    expect(navigate).not.toHaveBeenCalled()
    expect(await storedCache()).toBeNull()
  })

  it('stays on the failure when the retried write is refused again, and goes on once a retry is kept', async () => {
    await storeEntry('logged-in')
    await commitLostSetup('public')
    storage.refuse = true
    const page = await open()
    await page.press('readout-continue')
    await page.press('readout-write-failed-retry')
    expect(navigate).not.toHaveBeenCalled()
    expect(page.has('readout-write-failed')).toBe(true)

    storage.refuse = false
    await page.press('readout-write-failed-retry')
    expect(navigatedTo()).toEqual([CHECKLIST])
    expect(await storedCache()).not.toBeNull()
  })

  it('clears the failure while the retried write runs, and goes on once it is kept', async () => {
    await storeEntry('logged-in')
    await commitLostSetup('public')
    storage.refuse = true
    const page = await open()
    await page.press('readout-continue')
    expect(page.has('readout-write-failed')).toBe(true)

    storage.refuse = false
    const hold = deferred<void>()
    storage.hold = hold
    const writesBefore = storage.set.mock.calls.length
    await page.press('readout-write-failed-retry')
    expect(page.has('readout-write-failed')).toBe(false)
    expect(page.isDisabled('readout-continue')).toBe(true)
    if (page.has('readout-write-failed-retry')) {
      await page.press('readout-write-failed-retry')
    }
    expect(storage.set.mock.calls.length - writesBefore).toBe(1)
    expect(navigate).not.toHaveBeenCalled()

    await outside(() => hold.resolve())
    expect(navigatedTo()).toEqual([CHECKLIST])
  })

  it('drops the failure once the reads start again, and goes on from the new run', async () => {
    await storeEntry('logged-in')
    const world = await commitLostSetup('public')
    storage.refuse = true
    const page = await open()
    await page.press('readout-continue')
    expect(page.has('readout-write-failed')).toBe(true)

    storage.refuse = false
    await rebuildClient(world)
    await settle()
    expect(page.has('readout-readable-public')).toBe(true)
    expect(page.has('readout-write-failed')).toBe(false)
    expect(page.isDisabled('readout-continue')).toBe(false)
    await page.press('readout-continue')
    expect(navigatedTo()).toEqual([CHECKLIST])
  })

  it('goes on to the gas step on the fresh-install route once a retry is kept', async () => {
    await storeEntry('fresh-install', SMART)
    await commitLostSetup('public')
    storage.refuse = true
    const page = await open()
    await page.press('readout-continue')
    expect(navigate).not.toHaveBeenCalled()
    storage.refuse = false
    await page.press('readout-write-failed-retry')
    expect(navigatedTo()).toEqual([GAS_STEP])
  })

  it('renders the failure with a retry and Back on a resume, and does not send the holder to the checklist', async () => {
    await commitLostSetup('public')
    await storeLiveRecovery(LOST, { route: 'logged-in', receivingAccount: BASIC })
    storage.refuse = true
    const page = await open()
    expect(navigate).not.toHaveBeenCalled()
    expect(page.has('readout-leave-failed')).toBe(true)
    expect(page.holds('readout-leave-failed', 'readout-write-failed')).toBe(true)
    expect(page.holds('readout-leave-failed', 'readout-write-failed-retry')).toBe(true)
    expect(page.holds('readout-leave-failed', 'readout-back')).toBe(true)
    expect(page.textOf('readout-write-failed')).toContain(WRITE_FAILED)
    expect(page.has('readout-reading')).toBe(false)
    expect(await storedCache()).toBeNull()

    await page.press('readout-back')
    expect(navigatedTo()).toHaveLength(1)
    expect(navigatedTo()[0]).toMatch(new RegExp(`^${ACCOUNT_STEP}\\?`))
  })

  it('sends the holder to the checklist from a resume once a retry is kept', async () => {
    await commitLostSetup('public')
    await storeLiveRecovery(LOST, { route: 'fresh-install', receivingAccount: SMART })
    storage.refuse = true
    const page = await open()
    await page.press('readout-write-failed-retry')
    expect(navigate).not.toHaveBeenCalled()
    expect(page.has('readout-leave-failed')).toBe(true)

    storage.refuse = false
    await page.press('readout-write-failed-retry')
    expect(navigatedTo()).toEqual([CHECKLIST])
    expect(await storedCache()).not.toBeNull()
  })
})

describe('a setup opened with the card password that this device could not keep', () => {
  const levels: HiddenLevel[] = ['private', 'shape-visible']
  levels.forEach((level) => {
    it(`still goes on at ${level}, since the password in memory opens it on the next screen`, async () => {
      await storeEntry('logged-in')
      await commitLostSetup(level)
      storage.refuse = true
      const page = await open()
      await page.type('readout-password-field', CARD_PASSWORD)
      await page.press('readout-unlock')
      expect(page.has(`readout-readable-${level}`)).toBe(true)
      expect(page.has('readout-write-failed')).toBe(false)
      await page.press('readout-continue')
      expect(navigatedTo()).toEqual([CHECKLIST])
      expect(page.has('readout-write-failed')).toBe(false)
      expect(await storedCache()).toBeNull()
    })
  })

  it('still sends the holder to the checklist on a resume', async () => {
    await commitLostSetup('private')
    await storeLiveRecovery(LOST, { route: 'logged-in', receivingAccount: BASIC })
    storage.refuse = true
    const page = await open()
    await page.type('readout-password-field', CARD_PASSWORD)
    await page.press('readout-unlock')
    expect(navigatedTo()).toEqual([CHECKLIST])
    expect(page.has('readout-leave-failed')).toBe(false)
    expect(await storedCache()).toBeNull()
  })
})
