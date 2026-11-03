/**
 * @jest-environment jsdom
 *
 * The readout under each privacy level, read from a setup committed on the
 * stand-in's chain: what renders before the recovery password, the password's
 * blockers, the records an opened setup leaves on this device, the origin read
 * of each passkey, and the states of a read that fails or a setup this build
 * cannot read. Every state says that the account has a recovery setup.
 */
import type { Mounted } from '@web/modules/social-recovery/recovery/entry/__tests__/harness'
import {
  advanceClock,
  BASIC,
  CARD_PASSWORD,
  CHAIN_ID,
  commitLostSetup,
  failedClient,
  GUARDIANS,
  LOST,
  LOST_SETUP,
  mountReadout,
  navigate,
  NETWORK,
  ONE_ANSWERABLE_SETUP,
  OTHER_ORIGIN_SETUP,
  outside,
  readoutSearchOf,
  refusedClient,
  resetEdges,
  restoreRefusal,
  setClient,
  SHORT_GROUP_SETUP,
  shortAddress,
  storage,
  storedCache,
  storeEntry,
  t,
  UNKNOWN_METHOD_SETUP,
  useLiveFakeClock
} from '@web/modules/social-recovery/recovery/entry/__tests__/harness'
import { RETRY_PAUSES_MS } from '@web/modules/social-recovery/shared/client/events/__fixtures__/retries'
import type { SetupState } from '@kohaku-eth/social-recovery'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'
import type { HiddenLevel } from '@web/modules/social-recovery/recovery/entry/types'
import {
  readRecoveryPassword,
  wipeRecoveryPassword
} from '@web/modules/social-recovery/shared/records'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

const NO_SETUP_SENTENCES = [
  t('socialRecovery.entry.noSetup.title', { network: NETWORK }),
  t('socialRecovery.writes.causes.NoSetup')
]
const CONFIGURED_LINES = [
  t('socialRecovery.readout.configuredLine'),
  t('socialRecovery.readout.leadPrivate'),
  t('socialRecovery.readout.leadCommitted'),
  t('socialRecovery.readout.leadUnlocked')
]
const HIDDEN_DOTS = t('socialRecovery.display.hiddenValue')
const HIDDEN_CHIP = t('socialRecovery.display.hiddenChip')
const WAIT_VALUE = t('socialRecovery.display.remainingHours', { count: 120 })
const ORIGIN_MISMATCH = t('socialRecovery.ceremony.relyingPartyMismatch')
const WRONG_PASSWORD = 'ember-harbor-quiet-17'
const PASSWORD_WORKED = t('socialRecovery.readout.eventFailed.title', { network: NETWORK })
const CANNOT_RECOVER = t('socialRecovery.review.blocked.cannotRecover.title')
const CONTINUE_LINE = t('socialRecovery.readout.continueLine', { hours: 24 })

let screen: Mounted | null = null
const open = async () => {
  screen = await mountReadout(readoutSearchOf(LOST))
  return screen
}

beforeEach(async () => {
  resetEdges()
  wipeRecoveryPassword(CHAIN_ID, LOST)
  wipeRecoveryPassword(CHAIN_ID, BASIC)
  await storeEntry('logged-in')
})
afterEach(() => {
  jest.useRealTimers()
  screen?.unmount()
  screen = null
})

/** The page says the account has a recovery setup and never that it has none. */
const expectConfigured = (page: Mounted) => {
  const text = page.text()
  expect(CONFIGURED_LINES.some((line) => text.includes(line))).toBe(true)
  NO_SETUP_SENTENCES.forEach((sentence) => expect(text).not.toContain(sentence))
}

/** No guardian's address renders, in full or shortened. */
const expectNoGuardian = (text: string) =>
  GUARDIANS.forEach((guardian) => {
    expect(text).not.toContain(renderFullAddress(guardian))
    expect(text).not.toContain(shortAddress(guardian))
  })

/** Nothing of the setup renders: no path, no masked row, no value. */
const expectNothingOfTheSetup = (page: Mounted) => {
  expect(page.has('readout-path')).toBe(false)
  const text = page.text()
  expect(text).not.toContain(HIDDEN_DOTS)
  expect(text).not.toContain(WAIT_VALUE)
  expectNoGuardian(text)
}

/** The setup's values render: the guardians, the passkey's kind and the wait. */
const expectValues = (page: Mounted) => {
  expect(page.has('readout-path')).toBe(true)
  const text = page.text()
  GUARDIANS.forEach((guardian) => expect(text).toContain(renderFullAddress(guardian)))
  expect(page.textOf('readout-row-0-0-name')).toBe(t('socialRecovery.methodNames.passkey'))
  expect(page.textOf('readout-wait-value')).toBe(WAIT_VALUE)
  expect(text).not.toContain(HIDDEN_DOTS)
}

const unlockWith = async (page: Mounted, password: string) => {
  await page.type('readout-password-field', password)
  await page.press('readout-unlock')
}

/** Unlocks while the node answers no log, past every retry pause of the log reads. */
const unlockWithLogsDown = async (page: Mounted, password: string) => {
  useLiveFakeClock()
  await unlockWith(page, password)
  await advanceClock(RETRY_PAUSES_MS * 2)
}

describe('the readout at Private', () => {
  it('renders the lock and nothing of the setup before the password', async () => {
    await commitLostSetup('private')
    const page = await open()
    expect(page.has('readout-locked-private')).toBe(true)
    expect(page.textOf('readout-title')).toBe(t('socialRecovery.readout.lockedTitle'))
    expect(page.text()).toContain(t('socialRecovery.readout.leadPrivate'))
    expect(page.has('readout-password-field')).toBe(true)
    expect(page.has('readout-continue')).toBe(false)
    expectNothingOfTheSetup(page)
    expectConfigured(page)
  })

  it('shows what the password field takes before anything is typed', async () => {
    await commitLostSetup('private')
    const page = await open()
    expect(page.inputOf('readout-password-field')?.placeholder).toBe(
      t('socialRecovery.readout.passwordPlaceholder')
    )
  })

  it('keeps unlock off while the field is empty', async () => {
    const world = await commitLostSetup('private')
    const getSetup = jest.spyOn(world.client.setup, 'getSetup')
    const page = await open()
    getSetup.mockClear()
    expect(page.isDisabled('readout-unlock')).toBe(true)
    await page.press('readout-unlock')
    expect(getSetup).not.toHaveBeenCalled()
    expect(page.has('readout-locked')).toBe(true)
  })

  it('shows nothing of the setup while the password is being checked', async () => {
    const world = await commitLostSetup('private')
    const page = await open()
    const held = deferred<void>()
    const real = world.client.setup.getSetup.bind(world.client.setup)
    jest.spyOn(world.client.setup, 'getSetup').mockImplementationOnce(async (source) => {
      await held.promise
      return real(source)
    })
    await unlockWith(page, CARD_PASSWORD)
    expect(page.has('readout-unlock-checking')).toBe(true)
    expect(
      page.byTestId('readout-unlock-checking')?.querySelector('[data-testid="loading-block"]')
    ).not.toBeNull()
    expectNothingOfTheSetup(page)
    expectConfigured(page)
    await outside(() => held.resolve())
    expectValues(page)
  })

  it('renders a wrong password as a blocker with a retry and the card pointer, never a degrade to hidden values', async () => {
    await commitLostSetup('private')
    const page = await open()
    await unlockWith(page, WRONG_PASSWORD)
    expect(page.has('readout-wrong-password')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.readout.wrongPassword.title'))
    expect(page.text()).toContain(t('socialRecovery.readout.wrongPassword.cardPointer'))
    expect(page.has('readout-wrong-password-retry')).toBe(true)
    expect(page.has('readout-continue')).toBe(false)
    expectNothingOfTheSetup(page)
    expectConfigured(page)
    expect(readRecoveryPassword(CHAIN_ID, LOST)).toBeUndefined()
    expect(await storedCache()).toBeNull()

    await page.press('readout-wrong-password-retry')
    expect(page.has('readout-password-field')).toBe(true)
    await unlockWith(page, CARD_PASSWORD)
    expectValues(page)
  })

  it('renders the values with the card password, and keeps the password and the opened setup under the account being recovered', async () => {
    const world = await commitLostSetup('private')
    const page = await open()
    await unlockWith(page, CARD_PASSWORD)
    expect(page.has('readout-readable-private')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.readout.leadUnlocked'))
    expectValues(page)
    expectConfigured(page)

    const state: SetupState = await world.client.setup.setupState()
    expect(readRecoveryPassword(CHAIN_ID, LOST)).toBe(CARD_PASSWORD)
    expect(await storedCache()).toEqual({
      configuration: LOST_SETUP,
      setupNonce: state.setupNonce,
      setupCommitment: state.setupCommitment,
      deployment: {
        manager: world.client.descriptor.manager,
        action: world.client.descriptor.action
      }
    })
    expect(readRecoveryPassword(CHAIN_ID, BASIC)).toBeUndefined()
    expect(await storedCache(BASIC)).toBeNull()
  })

  it('renders a failed setup event read after the card password as its own state naming the network, and its retry opens the setup', async () => {
    const world = await commitLostSetup('private')
    const page = await open()
    world.chain.failRead('logs')
    await unlockWithLogsDown(page, CARD_PASSWORD)
    expect(page.has('readout-event-failed')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.readout.readFailedTitle', { network: NETWORK }))
    expect(page.text()).not.toContain(PASSWORD_WORKED)
    expect(page.has('readout-wrong-password')).toBe(false)
    expect(page.has('readout-no-details')).toBe(false)
    expectNothingOfTheSetup(page)
    expectConfigured(page)

    world.chain.restoreRead('logs')
    await page.press('readout-event-failed-retry')
    expectValues(page)
    expect(readRecoveryPassword(CHAIN_ID, LOST)).toBe(CARD_PASSWORD)
    expect(await storedCache()).not.toBeNull()
  })
  it('renders a failed setup event read after a wrong password under the neutral title, never as a password that worked', async () => {
    const world = await commitLostSetup('private')
    const page = await open()
    world.chain.failRead('logs')
    await unlockWithLogsDown(page, WRONG_PASSWORD)
    expect(page.has('readout-event-failed')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.readout.readFailedTitle', { network: NETWORK }))
    expect(page.text()).toContain(
      t('socialRecovery.readout.eventFailed.body', { network: NETWORK })
    )
    expect(page.text()).not.toContain(PASSWORD_WORKED)
    expectNothingOfTheSetup(page)
    expectConfigured(page)
    expect(readRecoveryPassword(CHAIN_ID, LOST)).toBeUndefined()
    expect(await storedCache()).toBeNull()

    world.chain.restoreRead('logs')
    await page.press('readout-event-failed-retry')
    expect(page.has('readout-wrong-password')).toBe(true)
    expectNothingOfTheSetup(page)
    expect(readRecoveryPassword(CHAIN_ID, LOST)).toBeUndefined()
  })
})

describe('the readout at Shape visible', () => {
  it('renders the structure with every value masked and asks the password before continue', async () => {
    await commitLostSetup('shape-visible')
    const page = await open()
    expect(page.has('readout-locked-shape-visible')).toBe(true)
    expect(page.has('readout-path')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.readout.shapePreview'))
    expect(page.textOf('readout-group-1-threshold')).toBe('2')
    expect(page.textOf('readout-group-1-members')).toBe('3')
    const rows = ['readout-row-0-0', 'readout-row-1-0', 'readout-row-1-1', 'readout-row-1-2']
    rows.forEach((row) => {
      expect(page.textOf(`${row}-name`)).toBe(HIDDEN_DOTS)
      expect(page.textOf(`${row}-chip`)).toBe(HIDDEN_CHIP)
    })
    expect(page.textOf('readout-wait-value')).toBe(HIDDEN_DOTS)
    const text = page.text()
    expectNoGuardian(text)
    expect(text).not.toContain(WAIT_VALUE)
    expect(page.has('readout-password-field')).toBe(true)
    expect(page.has('readout-continue')).toBe(false)
    expectConfigured(page)
    expect(await storedCache()).toBeNull()

    await unlockWith(page, CARD_PASSWORD)
    expect(page.has('readout-readable-shape-visible')).toBe(true)
    expectValues(page)
    expect(page.has('readout-continue')).toBe(true)
    expect(readRecoveryPassword(CHAIN_ID, LOST)).toBe(CARD_PASSWORD)
    expect(await storedCache()).not.toBeNull()
  })

  it('renders a rejected setup event read as a failed read with a retry, never as Private', async () => {
    const world = await commitLostSetup('shape-visible')
    const refusal = new Error('the node did not answer')
    const { events } = world.client.setup
    const fetch = events.fetch.bind(events)
    // The restore with no password reads the setup event first; the note read follows it.
    jest.spyOn(events, 'fetch').mockImplementationOnce(fetch).mockRejectedValueOnce(refusal)
    const page = await open()
    expect(events.fetch).toHaveBeenCalledTimes(2)
    expect(page.has('readout-read-failed')).toBe(true)
    expect(page.has('readout-locked-private')).toBe(false)
    expect(page.has('readout-locked-shape-visible')).toBe(false)
    expectConfigured(page)

    await page.press('readout-read-failed-block-retry')
    expect(page.has('readout-locked-shape-visible')).toBe(true)
  })

  it('renders a wrong password as the blocker and keeps the values masked', async () => {
    await commitLostSetup('shape-visible')
    const page = await open()
    await unlockWith(page, WRONG_PASSWORD)
    expect(page.has('readout-wrong-password')).toBe(true)
    expect(page.has('readout-continue')).toBe(false)
    const text = page.text()
    expectNoGuardian(text)
    expect(text).not.toContain(WAIT_VALUE)
    expectConfigured(page)
  })

  it('renders a failed setup event read after the password under the details title, and its retry opens the setup', async () => {
    const world = await commitLostSetup('shape-visible')
    const page = await open()
    world.chain.failRead('logs')
    await unlockWithLogsDown(page, CARD_PASSWORD)
    expect(page.has('readout-event-failed')).toBe(true)
    expect(page.textOf('readout-event-failed-alert')).toContain(
      t('socialRecovery.readout.detailsFailed')
    )
    expect(page.text()).not.toContain(PASSWORD_WORKED)
    expect(page.text()).not.toContain(
      t('socialRecovery.readout.readFailedTitle', { network: NETWORK })
    )
    expect(page.has('readout-continue')).toBe(false)
    const text = page.text()
    expectNoGuardian(text)
    expect(text).not.toContain(WAIT_VALUE)
    expectConfigured(page)

    world.chain.restoreRead('logs')
    await page.press('readout-event-failed-retry')
    expect(page.has('readout-readable-shape-visible')).toBe(true)
    expectValues(page)
  })
})

describe('the readout at Public', () => {
  it('renders the structure and the values with no password and offers continue at once', async () => {
    await commitLostSetup('public')
    const page = await open()
    expect(page.has('readout-readable-public')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.readout.publicLine'))
    expect(page.has('readout-password-field')).toBe(false)
    expectValues(page)
    expect(page.has('readout-continue')).toBe(true)
    expect(page.isDisabled('readout-continue')).toBe(false)
    expect(page.textOf('readout-continue-line')).toBe(
      t('socialRecovery.readout.continueLine', { hours: 24 })
    )
    expect(page.text()).toContain(t('socialRecovery.readout.answerWhichever'))
    expectConfigured(page)
  })

  it('keeps the opened setup under the account being recovered and sets no password', async () => {
    const world = await commitLostSetup('public')
    await open()
    const state: SetupState = await world.client.setup.setupState()
    expect(await storedCache()).toEqual({
      configuration: LOST_SETUP,
      setupNonce: state.setupNonce,
      setupCommitment: state.setupCommitment,
      deployment: {
        manager: world.client.descriptor.manager,
        action: world.client.descriptor.action
      }
    })
    expect(await storedCache(BASIC)).toBeNull()
    expect(readRecoveryPassword(CHAIN_ID, LOST)).toBeUndefined()
  })
})

describe("the passkey's origin", () => {
  it('marks a passkey created under another origin once the values are readable', async () => {
    await commitLostSetup('public', OTHER_ORIGIN_SETUP)
    const page = await open()
    expect(page.textOf('readout-row-0-0-line-0')).toBe(ORIGIN_MISMATCH)
  })

  it('marks a passkey of another origin after the card password opens a private setup', async () => {
    await commitLostSetup('private', OTHER_ORIGIN_SETUP)
    const page = await open()
    expect(page.text()).not.toContain(ORIGIN_MISMATCH)
    await unlockWith(page, CARD_PASSWORD)
    expect(page.textOf('readout-row-0-0-line-0')).toBe(ORIGIN_MISMATCH)
  })

  it('marks a passkey of another origin whose config carries bytes after its three words', async () => {
    const [clause] = OTHER_ORIGIN_SETUP.clauses
    const [credential] = clause.credentials
    await commitLostSetup('public', {
      ...OTHER_ORIGIN_SETUP,
      clauses: [
        {
          ...clause,
          credentials: [{ ...credential, config: `${credential.config}${'ab'.repeat(32)}` }]
        }
      ]
    })
    const page = await open()
    expect(page.textOf('readout-row-0-0-line-0')).toBe(ORIGIN_MISMATCH)
    expect(page.isDisabled('readout-continue')).toBe(true)
    expect(page.textOf('readout-continue-reason')).toBe(ORIGIN_MISMATCH)
  })

  it('leaves a passkey created under this origin unmarked', async () => {
    await commitLostSetup('public')
    const page = await open()
    expect(page.has('readout-row-0-0')).toBe(true)
    expect(page.text()).not.toContain(ORIGIN_MISMATCH)
  })
})

describe('the reads that fail and the setups this build cannot read', () => {
  it('shows the read running, then the setup, never an answer before it', async () => {
    const world = await commitLostSetup('private')
    const held = deferred<void>()
    const real = world.client.setup.setupState.bind(world.client.setup)
    jest.spyOn(world.client.setup, 'setupState').mockImplementationOnce(async () => {
      await held.promise
      return real()
    })
    const page = await open()
    expect(page.has('readout-reading')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.readout.reading', { network: NETWORK }))
    expect(
      page.byTestId('readout-reading')?.querySelector('[data-testid="loading-block"]')
    ).not.toBeNull()
    expect(page.has('readout-locked')).toBe(false)
    expectConfigured(page)
    await outside(() => held.resolve())
    expect(page.has('readout-locked-private')).toBe(true)
  })

  it('renders a failed setup state read with the network and a retry, never as no setup', async () => {
    const world = await commitLostSetup('private')
    world.chain.failRead('stateOf')
    const page = await open()
    expect(page.has('readout-read-failed')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.readout.readFailedTitle', { network: NETWORK }))
    expectNothingOfTheSetup(page)
    expectConfigured(page)

    world.chain.restoreRead('stateOf')
    await page.press('readout-read-failed-block-retry')
    expect(page.has('readout-locked-private')).toBe(true)
  })

  it('renders a client that failed to build with a retry, never as no setup', async () => {
    setClient(LOST, failedClient(LOST))
    const page = await open()
    expect(page.has('readout-read-failed')).toBe(true)
    expect(page.has('readout-read-failed-block-retry')).toBe(true)
    expectConfigured(page)
  })

  it('renders update the wallet for a manager whose digest version this build refuses', async () => {
    setClient(LOST, refusedClient())
    const page = await open()
    expect(page.has('readout-update-the-wallet')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.client.updateTheWalletTitle'))
    expect(page.text()).toContain(t('socialRecovery.client.updateTheWalletHow'))
    expect(page.has('readout-password-field')).toBe(false)
    expectConfigured(page)
  })

  it('offers Back on update the wallet, and Back goes to the account step on the fresh-install route', async () => {
    await storeEntry('fresh-install')
    setClient(LOST, refusedClient())
    const page = await open()
    expect(page.holds('readout-update-the-wallet', 'readout-back')).toBe(true)
    expect(page.textOf('readout-back')).toBe(t('socialRecovery.actions.back'))

    await page.press('readout-back')
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate.mock.calls[0][0]).toMatch(/^\/social-recovery\/recovery\/account\?/)
  })

  it('renders a setup with no backup this device can open as its own state, never as no setup', async () => {
    const world = await commitLostSetup('private')
    jest
      .spyOn(world.client.setup, 'getSetup')
      .mockRejectedValue(restoreRefusal('restore.no-backup', { setup: 'standing', backup: 'none' }))
    const page = await open()
    expect(page.has('readout-no-details')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.readout.noDetails'))
    expectNothingOfTheSetup(page)
    expectConfigured(page)
  })

  it('renders an opened setup that does not match the commitment as its own state, with no value', async () => {
    const world = await commitLostSetup('private')
    const page = await open()
    jest
      .spyOn(world.client.setup, 'getSetup')
      .mockRejectedValue(restoreRefusal('restore.commitment-mismatch'))
    await unlockWith(page, CARD_PASSWORD)
    expect(page.has('readout-mismatch')).toBe(true)
    expect(page.text()).toContain(t('socialRecovery.readout.detailsMismatch', { network: NETWORK }))
    expectNothingOfTheSetup(page)
    expectConfigured(page)
    expect(await storedCache()).toBeNull()
  })
})

/** A locked state offers no continue at all, and no line about why it cannot begin. */
const expectNoContinue = (page: Mounted) => {
  expect(page.has('readout-continue')).toBe(false)
  expect(page.has('readout-continue-locked')).toBe(false)
  expect(page.has('readout-continue-reason')).toBe(false)
  expect(page.text()).not.toContain('cannot begin this recovery')
}

describe('the readout while the setup is locked', () => {
  const levels: HiddenLevel[] = ['private', 'shape-visible']
  levels.forEach((level) => {
    it(`asks for the recovery password in its title, with unlock and back and no continue, at ${level}`, async () => {
      await commitLostSetup(level)
      const page = await open()
      expect(page.has(`readout-locked-${level}`)).toBe(true)
      expect(page.textOf('readout-title')).toBe(t('socialRecovery.readout.lockedTitle'))
      expect(page.has('readout-unlock')).toBe(true)
      expect(page.has('readout-back')).toBe(true)
      expectNoContinue(page)
    })

    it(`shows no continue while the password is being checked at ${level}`, async () => {
      const world = await commitLostSetup(level)
      const page = await open()
      const held = deferred<void>()
      const real = world.client.setup.getSetup.bind(world.client.setup)
      jest.spyOn(world.client.setup, 'getSetup').mockImplementationOnce(async (source) => {
        await held.promise
        return real(source)
      })
      await unlockWith(page, CARD_PASSWORD)
      expect(page.has('readout-unlock-checking')).toBe(true)
      expectNoContinue(page)
      await outside(() => held.resolve())
      expect(page.has(`readout-readable-${level}`)).toBe(true)
      expect(page.textOf('readout-title')).toBe(t('socialRecovery.readout.title'))
      expect(page.isDisabled('readout-continue')).toBe(false)
    })

    it(`shows back and no continue after a wrong password at ${level}`, async () => {
      await commitLostSetup(level)
      const page = await open()
      await unlockWith(page, WRONG_PASSWORD)
      expect(page.has('readout-wrong-password')).toBe(true)
      expect(page.has('readout-back')).toBe(true)
      expectNoContinue(page)
    })

    it(`shows back and no continue after the setup event read failed at ${level}`, async () => {
      const world = await commitLostSetup(level)
      const page = await open()
      world.chain.failRead('logs')
      await unlockWithLogsDown(page, CARD_PASSWORD)
      expect(page.has('readout-event-failed')).toBe(true)
      expect(page.has('readout-back')).toBe(true)
      expectNoContinue(page)
    })
  })

  it('puts the note on the two passwords beside the field, and says the field is not the extension password once', async () => {
    await commitLostSetup('private')
    const page = await open()
    const aside = page.byTestId('readout-columns-aside')
    expect(aside?.querySelector('[data-testid="readout-two-passwords"]')?.textContent).toBe(
      t('socialRecovery.readout.twoPasswords.title') + t('socialRecovery.readout.twoPasswords.body')
    )
    expect(page.textOf('readout')).not.toContain(t('socialRecovery.readout.twoPasswords.body'))
    expect(page.text().split(t('socialRecovery.readout.locked.notExtensionPassword'))).toHaveLength(
      2
    )
  })

  it('names the account on one line in its short form, with the network', async () => {
    await commitLostSetup('private')
    const page = await open()
    expect(page.textOf('readout-account')).toBe(`Account ${shortAddress(LOST)} · ${NETWORK}`)
    expect(page.text()).not.toContain(renderFullAddress(LOST))
  })
})

describe('a path this device cannot complete', () => {
  it('switches continue off with the origin reason where the only passkey was created under another origin', async () => {
    await commitLostSetup('public', OTHER_ORIGIN_SETUP)
    const page = await open()
    expect(page.has('readout-readable-public')).toBe(true)
    expect(page.isDisabled('readout-continue')).toBe(true)
    expect(page.textOf('readout-continue-reason')).toBe(ORIGIN_MISMATCH)
    expect(page.comesAfter('readout-continue-reason', 'readout-continue')).toBe(true)
    expect(page.comesAfter('readout-continue-reason', 'readout-back')).toBe(true)
    expect(page.has('readout-continue-line')).toBe(false)
    expect(page.text()).not.toContain(CONTINUE_LINE)
    await page.press('readout-continue')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('switches continue off with the origin reason once the card password opens a private setup with such a passkey', async () => {
    await commitLostSetup('private', OTHER_ORIGIN_SETUP)
    const page = await open()
    await unlockWith(page, CARD_PASSWORD)
    expect(page.has('readout-readable-private')).toBe(true)
    expect(page.isDisabled('readout-continue')).toBe(true)
    expect(page.textOf('readout-continue-reason')).toBe(ORIGIN_MISMATCH)
    await page.press('readout-continue')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('names the origin where a group short of answers holds a passkey of another origin beside a guardian', async () => {
    await commitLostSetup('public', SHORT_GROUP_SETUP)
    const page = await open()
    expect(page.textOf('readout-row-0-1-name')).toBe(renderFullAddress(GUARDIANS[0]))
    expect(page.isDisabled('readout-continue')).toBe(true)
    expect(page.textOf('readout-continue-reason')).toBe(ORIGIN_MISMATCH)
  })

  it('switches continue off with the release reason for a method this build does not know', async () => {
    await commitLostSetup('public', UNKNOWN_METHOD_SETUP)
    const page = await open()
    expect(page.has('readout-readable-public')).toBe(true)
    expect(page.isDisabled('readout-continue')).toBe(true)
    expect(page.textOf('readout-continue-reason')).toBe(CANNOT_RECOVER)
    expect(page.text()).not.toContain(ORIGIN_MISMATCH)
    expect(page.has('readout-continue-line')).toBe(false)
    await page.press('readout-continue')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('keeps continue where one member this device can answer completes the group, with the mismatch on its row', async () => {
    await commitLostSetup('public', ONE_ANSWERABLE_SETUP)
    const page = await open()
    expect(page.textOf('readout-row-0-0-line-0')).toBe(ORIGIN_MISMATCH)
    expect(page.isDisabled('readout-continue')).toBe(false)
    expect(page.has('readout-continue-reason')).toBe(false)
    expect(page.textOf('readout-continue-line')).toBe(CONTINUE_LINE)
    await page.press('readout-continue')
    expect(navigate).toHaveBeenCalledTimes(1)
  })
})

describe('the values the readout names', () => {
  it('names every guardian by the full address, never a shortened one', async () => {
    await commitLostSetup('public')
    const page = await open()
    GUARDIANS.forEach((guardian, member) => {
      expect(page.textOf(`readout-row-1-${member}-name`)).toBe(renderFullAddress(guardian))
    })
    const text = page.text()
    GUARDIANS.forEach((guardian) => expect(text).not.toContain(shortAddress(guardian)))
  })

  it('names the guardians in full once the card password opens a private setup', async () => {
    await commitLostSetup('private')
    const page = await open()
    await unlockWith(page, CARD_PASSWORD)
    GUARDIANS.forEach((guardian, member) => {
      expect(page.textOf(`readout-row-1-${member}-name`)).toBe(renderFullAddress(guardian))
    })
  })

  it("titles the page with what the account's recovery needs, and keeps the path's own label", async () => {
    await commitLostSetup('public')
    const page = await open()
    expect(page.textOf('readout-title')).toBe(t('socialRecovery.readout.title'))
    expect(page.textOf('readout-path')).toContain(t('socialRecovery.review.pathHeader'))
  })

  it('says the account has a recovery setup on a failed read, with Back beside it', async () => {
    const world = await commitLostSetup('private')
    world.chain.failRead('stateOf')
    const page = await open()
    expect(page.textOf('readout-read-failed-block')).toContain(
      t('socialRecovery.readout.configuredLine')
    )
    expect(page.textOf('readout-back')).toBe(t('socialRecovery.actions.back'))
  })

  it('says it opens the recovery while the recovery entry has not been read, with no readout', async () => {
    await commitLostSetup('public')
    const get = jest.spyOn(storage, 'get').mockImplementation(() => new Promise<never>(() => {}))
    const page = await open()
    expect(page.textOf('readout-entry-reading')).toBe(t('socialRecovery.loading.session'))
    expect(
      page.byTestId('readout-entry-reading')?.querySelector('[data-testid="loading-screen"]')
    ).not.toBeNull()
    expect(page.has('readout')).toBe(false)
    get.mockRestore()
  })

  it('renders a failed read of the recovery entry with its own line and a retry that opens the readout', async () => {
    await commitLostSetup('public')
    storage.refuseGet = true
    const page = await open()
    expect(page.textOf('readout-entry-read-failed')).toContain(
      t('socialRecovery.readout.entryReadFailed')
    )
    expect(page.has('readout')).toBe(false)
    expect(navigate).not.toHaveBeenCalled()

    storage.refuseGet = false
    await page.press('readout-entry-read-failed-retry')
    expect(page.has('readout-readable-public')).toBe(true)
  })
})
