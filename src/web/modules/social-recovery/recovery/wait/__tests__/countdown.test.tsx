/**
 * @jest-environment jsdom
 */
import { Linking } from 'react-native'

import {
  BOOK,
  CHAIN_ID,
  CHAIN_TIME,
  configurationOf,
  dateOf,
  DEVICE_NOW,
  elapse,
  GUARDIANS,
  guardianCredential,
  HOUR,
  MIXED_PATH,
  moveDeviceClock,
  mountWait,
  ONE_GUARDIAN,
  openWorld,
  passkeyCredential,
  passportCredential,
  resetTab,
  showTab,
  START_TX,
  submittedGathering,
  t,
  tick,
  useWaitClock,
  waiting
} from '@web/modules/social-recovery/recovery/wait/__tests__/harness'
import type {
  Mounted,
  NamedConfiguration,
  OneLineCase
} from '@web/modules/social-recovery/recovery/wait/__tests__/harness'
import { renderShortAddress } from '@web/modules/social-recovery/shared/display'
import { recordKeys } from '@web/modules/social-recovery/shared/records'
import { explorerTransactionUrlOf } from '@web/modules/social-recovery/setup/arm'
import { ruleLinesOf } from '@web/modules/social-recovery/setup/review'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

const POLL_MS = 30_000

describe('the countdown', () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it("counts down to the attempt's end against the pinned block's time, not this device's clock", async () => {
    const world = await openWorld()
    world.kit.chain.attempt = { ...world.kit.chain.attempt, consumableAfter: CHAIN_TIME + 2 * HOUR }
    view = await mountWait(world.account)

    expect(view.textOf('wait-time-left')).toBe(waiting(2 * HOUR))
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(view.textOf('wait-finishes')).toBe(
      t('socialRecovery.wait.finishes', { date: dateOf((CHAIN_TIME + 2 * HOUR) * 1000, zone) })
    )
    await tick(5_000)
    expect(view.textOf('wait-time-left')).toBe(waiting(2 * HOUR - 5))
  })

  it('once execution is due, draws the due chip alone, no countdown, and the end in the past tense', async () => {
    const world = await openWorld()
    world.kit.chain.attempt = { ...world.kit.chain.attempt, consumableAfter: CHAIN_TIME + HOUR }
    elapse(world.kit)
    view = await mountWait(world.account)

    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(view.textOf('wait-chip')).toBe(t('socialRecovery.status.attempt.executionDue'))
    expect(view.textOf('wait-title')).toBe(t('socialRecovery.wait.dueTitle'))
    expect(view.text()).toContain(t('socialRecovery.wait.dueLead'))
    expect(view.byTestId('wait-time-left')).toBeNull()
    expect(view.textOf('wait-finishes')).toBe(
      t('socialRecovery.wait.ended', { date: dateOf((CHAIN_TIME + HOUR) * 1000, zone) })
    )
    expect(view.text().split(t('socialRecovery.status.attempt.executionDue'))).toHaveLength(2)
  })

  it('moves only on the next poll when the device clock jumps', async () => {
    const world = await openWorld()
    view = await mountWait(world.account)
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR))

    moveDeviceClock(20 * 60_000)
    await tick(0)
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR))

    // The chain moved 10 minutes while the view's own clock counted 29 seconds.
    world.kit.chain.blockTime = CHAIN_TIME + 600
    await tick(POLL_MS - 1_000)
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR - 29))
    await tick(1_000)
    expect(world.kit.recoveryState).toHaveBeenCalledTimes(2)
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR - 600))
  })

  it('shows the running recovery: its chip, the account, the new key and the start on chain', async () => {
    const world = await openWorld()
    view = await mountWait(world.account)

    expect(view.textOf('wait-chip')).toBe(t('socialRecovery.status.attempt.recoveryInProgress'))
    expect(view.textOf('wait-title')).toBe(t('socialRecovery.wait.title'))
    expect(view.textOf('wait-account')).toBe(
      `Account ${renderShortAddress(world.account)} · Sepolia`
    )
    expect(view.textOf('wait-new-key')).toContain(world.newKey.slice(0, 6))
    const aside = view.byTestId('wait-columns-aside')
    expect(aside?.querySelector('[data-testid="wait-start-hash"]')).not.toBeNull()
    expect(aside?.querySelector('[data-testid="wait-explorer"]')).not.toBeNull()
    expect(aside?.querySelector('[data-testid="wait-end-from-chain"]')?.textContent).toBe(
      t('socialRecovery.wait.endFromChainTitle') + t('socialRecovery.wait.endFromChain')
    )
    expect(view.byTestId('wait-can-close')).not.toBeNull()
    expect(view.byTestId('wait-owner-can-cancel')).not.toBeNull()
    expect(view.byTestId('wait-who-finishes')).not.toBeNull()
  })

  it("dates the start on chain, the attempt's end less the setup's waiting period, where this device holds the setup", async () => {
    const world = await openWorld({ cache: true, configuration: MIXED_PATH })
    view = await mountWait(world.account)

    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const startMs = (CHAIN_TIME + HOUR - Number(MIXED_PATH.wait)) * 1000
    expect(dateOf(startMs, zone)).not.toBe(dateOf(DEVICE_NOW, zone))
    expect(view.textOf('wait-started')).toBe(
      t('socialRecovery.wait.started', { date: dateOf(startMs, zone) })
    )
  })

  it('dates the start by the day the submission landed here where this device holds no setup', async () => {
    const world = await openWorld()
    moveDeviceClock(400 * 24 * HOUR * 1000)
    view = await mountWait(world.account)

    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(dateOf(Date.now(), zone)).not.toBe(dateOf(DEVICE_NOW, zone))
    expect(view.textOf('wait-started')).toBe(
      t('socialRecovery.wait.started', { date: dateOf(DEVICE_NOW, zone) })
    )
  })

  it('opens the transaction that started the recovery on the chain explorer', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    try {
      const world = await openWorld()
      view = await mountWait(world.account)

      await view.press('wait-explorer')
      expect(openURL).toHaveBeenCalledTimes(1)
      expect(openURL).toHaveBeenCalledWith(explorerTransactionUrlOf('sepolia', START_TX))
      expect(openURL.mock.calls[0][0]).toContain(START_TX)
      expect(view.paths()).toEqual([])
    } finally {
      openURL.mockRestore()
    }
  })

  it('names the path by its rule lines where this device holds the setup', async () => {
    const world = await openWorld({ cache: true })
    view = await mountWait(world.account)

    expect(view.byTestId('wait-path')).not.toBeNull()
  })

  it('names no path where this device does not hold the setup', async () => {
    const world = await openWorld()
    view = await mountWait(world.account)

    expect(view.byTestId('wait-path')).toBeNull()
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR))
  })

  it('resumes from the countdown record alone after a reload', async () => {
    const world = await openWorld()
    view = await mountWait(world.account)
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR))
    view.unmount()

    const stored = JSON.stringify(await world.storage.getAll?.(), (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
    expect(stored).not.toContain('gathering')
    expect(stored).not.toContain('replies')

    world.kit.chain.blockTime = CHAIN_TIME + 100
    view = await mountWait(world.account)
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR - 100))
    expect(view.paths()).toEqual([])
  })

  it('counts the fifth of five stages on the logged-in route, under the settings chrome', async () => {
    const world = await openWorld()
    view = await mountWait(world.account)

    expect(view.byTestId('setup-chrome')).not.toBeNull()
    expect(view.byTestId('wait-stage')).not.toBeNull()
    expect(view.textOf('wait-stage')).toContain('5')
  })

  it('counts the fifth of five stages on the fresh install too, under the plain header', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    view = await mountWait(world.account)

    expect(view.byTestId('plain-chrome')).not.toBeNull()
    expect(view.textOf('wait-stage')).toBe(
      t('socialRecovery.entry.stageCounter', { step: 5, total: 5 })
    )
    expect(view.byTestId('wait-time-left')).not.toBeNull()
  })
})

describe("the countdown's record before the first poll answers", () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  /** Lands the recovery with the time its attempt becomes executable, and holds every poll. */
  const landedWith = async (executableAt: number | undefined) => {
    const world = await openWorld({ countdown: false })
    const live = await world.records
      .recoverySession(CHAIN_ID, world.account)
      .write(submittedGathering(world.account, MIXED_PATH), null)
    await world.records.landSubmission(CHAIN_ID, world.account, live.revision, executableAt)
    world.kit.recoveryState.mockImplementation(() => new Promise<never>(() => {}))
    return world
  }

  it('shows the countdown from the record at once, beside the line that says the chain is read', async () => {
    const world = await landedWith(Math.floor(DEVICE_NOW / 1000) + HOUR)
    view = await mountWait(world.account)

    expect(view.textOf('wait-refreshing')).toBe(t('socialRecovery.loading.refreshingAttempt'))
    expect(
      view.byTestId('wait-refreshing')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR))
    expect(view.textOf('wait-title')).toBe(t('socialRecovery.wait.title'))
    expect(view.byTestId('wait-execute')).toBeNull()
    await tick(5_000)
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR - 5))
  })

  it('holds execute where the record says the waiting period ended, until the chain answers', async () => {
    const world = await landedWith(Math.floor(DEVICE_NOW / 1000) - HOUR)
    view = await mountWait(world.account)

    expect(view.textOf('wait-title')).toBe(t('socialRecovery.wait.dueTitle'))
    expect(view.byTestId('wait-refreshing')).not.toBeNull()
    expect(view.isDisabled('wait-execute')).toBe(true)
    await view.press('wait-execute')
    expect(world.port.send).not.toHaveBeenCalled()
  })

  it('holds execute beside the refreshing line while a later poll reads, and gives it back once that poll answers', async () => {
    const world = await openWorld()
    elapse(world.kit)
    view = await mountWait(world.account)
    expect(view.isDisabled('wait-execute')).toBe(false)
    expect(view.byTestId('wait-refreshing')).toBeNull()

    const read = world.kit.recoveryState.getMockImplementation()
    const answer = deferred<void>()
    world.kit.recoveryState.mockImplementationOnce(async () => {
      await answer.promise
      return read?.()
    })
    await tick(POLL_MS)

    expect(view.byTestId('wait-refreshing')).not.toBeNull()
    expect(view.isDisabled('wait-execute')).toBe(true)
    await view.press('wait-execute')
    expect(world.kit.prepareExecuteHandover).not.toHaveBeenCalled()
    expect(world.port.send).not.toHaveBeenCalled()

    answer.resolve()
    await tick(0)

    expect(view.byTestId('wait-refreshing')).toBeNull()
    expect(view.isDisabled('wait-execute')).toBe(false)
  })

  it("re-anchors the countdown on the chain's first answer, and drops the refreshing line", async () => {
    const world = await openWorld({ countdown: false })
    const live = await world.records
      .recoverySession(CHAIN_ID, world.account)
      .write(submittedGathering(world.account, MIXED_PATH), null)
    await world.records.landSubmission(
      CHAIN_ID,
      world.account,
      live.revision,
      Math.floor(DEVICE_NOW / 1000) + 3 * HOUR
    )
    world.kit.chain.attempt = { ...world.kit.chain.attempt, consumableAfter: CHAIN_TIME + HOUR }
    const read = world.kit.recoveryState.getMockImplementation()
    const answer = deferred<void>()
    world.kit.recoveryState.mockImplementationOnce(async () => {
      await answer.promise
      return read?.()
    })
    view = await mountWait(world.account)
    await tick(5_000)
    expect(view.textOf('wait-time-left')).toBe(waiting(3 * HOUR - 5))
    expect(view.byTestId('wait-refreshing')).not.toBeNull()

    answer.resolve()
    await tick(0)

    expect(view.byTestId('wait-refreshing')).toBeNull()
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR))
    await tick(5_000)
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR - 5))
  })

  it('says it reads the waiting period while the countdown record has not been read', async () => {
    const world = await openWorld()
    const countdownKey = recordKeys.recoverySession(CHAIN_ID, world.account)
    const { get } = world.storage
    world.storage.get = (key, fallback) =>
      key === countdownKey ? new Promise<never>(() => {}) : get(key, fallback)
    view = await mountWait(world.account)

    expect(view.textOf('wait-countdown-loading')).toBe(t('socialRecovery.loading.countdown'))
    expect(
      view.byTestId('wait-countdown-loading')?.querySelector('[data-testid="loading-screen"]')
    ).not.toBeNull()
    expect(view.byTestId('wait-columns')).toBeNull()
    expect(view.byTestId('wait-title')).toBeNull()
    expect(view.byTestId('wait-time-left')).toBeNull()
  })

  it('says it reads the waiting period where the record holds no executable time', async () => {
    const world = await landedWith(undefined)
    view = await mountWait(world.account)

    expect(view.textOf('wait-loading')).toBe(t('socialRecovery.loading.countdown'))
    expect(
      view.byTestId('wait-loading')?.querySelector('[data-testid="loading-screen"]')
    ).not.toBeNull()
    expect(view.byTestId('wait-columns')).toBeNull()
    expect(view.byTestId('wait-time-left')).toBeNull()
    expect(view.byTestId('wait-refreshing')).toBeNull()
  })
})

describe('the entry record read', () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('says it opens the recovery, with no countdown, while the entry record read has not answered', async () => {
    const world = await openWorld()
    world.storage.get = () => new Promise<never>(() => {})
    view = await mountWait(world.account)

    expect(view.textOf('wait-entry-loading')).toBe(t('socialRecovery.loading.session'))
    expect(
      view.byTestId('wait-entry-loading')?.querySelector('[data-testid="loading-screen"]')
    ).not.toBeNull()
    expect(view.byTestId('wait-entry-failed')).toBeNull()
    expect(view.byTestId('wait-time-left')).toBeNull()
    expect(view.paths()).toEqual([])
  })

  it('renders failed with a retry where the entry record read fails, and the countdown once the retry reads it', async () => {
    const world = await openWorld()
    const { get } = world.storage
    world.storage.get = async () => {
      throw new Error('storage unavailable')
    }
    view = await mountWait(world.account)

    expect(view.textOf('wait-entry-failed')).toContain(t('socialRecovery.wait.readFailedTitle'))
    expect(view.byTestId('wait-time-left')).toBeNull()
    expect(view.paths()).toEqual([])

    world.storage.get = get
    await view.press('wait-entry-retry')
    expect(view.byTestId('wait-entry-failed')).toBeNull()
    expect(view.byTestId('wait-time-left')).not.toBeNull()
    expect(view.paths()).toEqual([])
  })
})

describe("the poll on the tab's return", () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
    resetTab()
  })

  it('asks the chain again when the tab comes back into view, and not while it is hidden', async () => {
    const world = await openWorld()
    view = await mountWait(world.account)
    expect(world.kit.recoveryState).toHaveBeenCalledTimes(1)

    await showTab('hidden')
    expect(world.kit.recoveryState).toHaveBeenCalledTimes(1)

    world.kit.chain.blockTime = CHAIN_TIME + 900
    await showTab('visible')
    expect(world.kit.recoveryState).toHaveBeenCalledTimes(2)
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR - 900))
  })

  it('reads the cancel at once when the tab comes back into view', async () => {
    const world = await openWorld()
    view = await mountWait(world.account)
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR))

    world.kit.chain.attempt = { ...world.kit.chain.attempt, state: 'Cancelled' }
    await showTab('visible')
    expect(view.byTestId('wait-time-left')).toBeNull()
    expect(view.byTestId('wait-cancelled-action')).not.toBeNull()
  })
})

describe('a failed or hanging poll', () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('reads failed with a retry and no number, and the retry restores the countdown', async () => {
    const world = await openWorld()
    world.kit.chain.failing = true
    view = await mountWait(world.account)

    expect(view.byTestId('wait-poll-failed')).not.toBeNull()
    expect(view.textOf('wait-poll-no-number')).toBe(
      t('socialRecovery.wait.pollFailed.noLastNumber')
    )
    expect(view.byTestId('wait-time-left')).toBeNull()
    expect(view.byTestId('wait-account')).toBeNull()

    world.kit.chain.failing = false
    await view.press('wait-poll-retry')
    expect(view.byTestId('wait-poll-failed')).toBeNull()
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR))
  })

  it('hides the last good number once a later poll fails, and a later poll restores it', async () => {
    const world = await openWorld()
    view = await mountWait(world.account)
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR))

    world.kit.chain.failing = true
    await tick(POLL_MS)
    expect(view.byTestId('wait-poll-failed')).not.toBeNull()
    expect(view.byTestId('wait-time-left')).toBeNull()

    world.kit.chain.failing = false
    world.kit.chain.blockTime = CHAIN_TIME + 60
    await tick(POLL_MS)
    expect(view.byTestId('wait-poll-failed')).toBeNull()
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR - 60))
  })

  it('reads failed once a poll runs past its limit, never the last good number', async () => {
    const world = await openWorld()
    view = await mountWait(world.account)
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR))

    world.kit.chain.hanging = true
    await tick(POLL_MS)
    expect(view.textOf('wait-refreshing')).toBe(t('socialRecovery.loading.refreshingAttempt'))
    expect(view.textOf('wait-time-left')).toBe(waiting(HOUR - POLL_MS / 1000))
    await tick(15_000)
    expect(view.byTestId('wait-poll-failed')).not.toBeNull()
    expect(view.byTestId('wait-time-left')).toBeNull()

    world.kit.chain.hanging = false
    await view.press('wait-poll-retry')
    expect(view.byTestId('wait-time-left')).not.toBeNull()
  })

  it('reads failed where the events cannot be read', async () => {
    const world = await openWorld()
    world.kit.fetch.mockRejectedValue(new Error('logs refused'))
    view = await mountWait(world.account)

    expect(view.byTestId('wait-poll-failed')).not.toBeNull()
    expect(view.byTestId('wait-time-left')).toBeNull()
  })
})

describe('the path line by shape', () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const PATH = 'socialRecovery.wait.path'
  const GUARDIAN = 'socialRecovery.display.nouns.guardian'
  const PASSPORT = 'socialRecovery.methodNames.passport'

  const ONE_LINE: OneLineCase[] = [
    [
      'any two of three guardians',
      configurationOf([
        {
          threshold: 2,
          credentials: [
            guardianCredential(GUARDIANS[0]),
            guardianCredential(GUARDIANS[1]),
            guardianCredential(GUARDIANS[2])
          ]
        }
      ]),
      () => t(`${PATH}.anyOf`, { threshold: 2, count: 3 })
    ],
    [
      'any one of two guardians',
      configurationOf([
        {
          threshold: 1,
          credentials: [guardianCredential(GUARDIANS[0]), guardianCredential(GUARDIANS[1])]
        }
      ]),
      () => t(`${PATH}.anyOf`, { threshold: 1, count: 2 })
    ],
    [
      'both of two guardians in one group',
      configurationOf([
        {
          threshold: 2,
          credentials: [guardianCredential(GUARDIANS[0]), guardianCredential(GUARDIANS[1])]
        }
      ]),
      () => t(`${PATH}.anyOf`, { threshold: 2, count: 2 })
    ],
    [
      'a passkey and a guardian each required',
      configurationOf([
        { threshold: 1, credentials: [passkeyCredential('Laptop passkey')] },
        { threshold: 1, credentials: [guardianCredential(GUARDIANS[0], 'Alice')] }
      ]),
      () => t(`${PATH}.bothRequired`, { first: 'Laptop passkey', second: t(GUARDIAN) })
    ],
    [
      'one group of a passkey and a passport that needs both',
      configurationOf([
        { threshold: 2, credentials: [passkeyCredential('Laptop passkey'), passportCredential()] }
      ]),
      () => t(`${PATH}.bothRequired`, { first: 'Laptop passkey', second: t(PASSPORT) })
    ],
    [
      'one group of a passport and a passkey that needs one',
      configurationOf([
        { threshold: 1, credentials: [passportCredential(), passkeyCredential('Phone passkey')] }
      ]),
      () => t(`${PATH}.eitherOne`, { first: t(PASSPORT), second: 'Phone passkey' })
    ]
  ]

  ONE_LINE.forEach(([name, configuration, line]) => {
    it(`names ${name} in one line`, async () => {
      const world = await openWorld({ cache: true, configuration })
      view = await mountWait(world.account)

      expect(view.textOf('wait-path')).toBe(
        `${t('socialRecovery.display.nouns.recoveryPath')}${line()}`
      )
    })
  })

  const RULE_LINES: NamedConfiguration[] = [
    ['two required methods and a group', MIXED_PATH],
    ['one guardian alone', ONE_GUARDIAN],
    [
      'three required methods',
      configurationOf([
        { threshold: 1, credentials: [passkeyCredential('Laptop passkey')] },
        { threshold: 1, credentials: [guardianCredential(GUARDIANS[0])] },
        { threshold: 1, credentials: [passportCredential()] }
      ])
    ],
    [
      'a group of a passkey and two guardians that needs two',
      configurationOf([
        {
          threshold: 2,
          credentials: [
            passkeyCredential('Laptop passkey'),
            guardianCredential(GUARDIANS[0]),
            guardianCredential(GUARDIANS[1])
          ]
        }
      ])
    ],
    [
      'a required passkey and a group of one of two guardians',
      configurationOf([
        { threshold: 1, credentials: [passkeyCredential('Laptop passkey')] },
        {
          threshold: 1,
          credentials: [guardianCredential(GUARDIANS[0]), guardianCredential(GUARDIANS[1])]
        }
      ])
    ]
  ]

  it('reads one guardian alone with no advice on the setup and no passkey lines', async () => {
    const world = await openWorld({ cache: true, configuration: ONE_GUARDIAN })
    view = await mountWait(world.account)

    const text = view.text()
    expect(text).not.toContain(t('socialRecovery.ruleLines.singleMethod'))
    expect(text).not.toContain(t('socialRecovery.ruleLines.secondMethodOfferAny'))
    expect(text).not.toContain(t('socialRecovery.ruleLines.secondMethodOffer'))
    expect(text).not.toContain(t('socialRecovery.ruleLines.platformFate'))
  })

  RULE_LINES.forEach(([name, configuration]) => {
    it(`keeps the rule lines for ${name}`, async () => {
      const world = await openWorld({ cache: true, configuration })
      view = await mountWait(world.account)

      const advice = [
        t('socialRecovery.ruleLines.singleMethod'),
        t('socialRecovery.ruleLines.secondMethodOffer'),
        t('socialRecovery.ruleLines.secondMethodOfferAny')
      ]
      const lines = ruleLinesOf(configuration, BOOK, t).filter((line) => !advice.includes(line))
      if (lines.length === 0) {
        expect(view.byTestId('wait-path')).toBeNull()
        return
      }
      expect(view.textOf('wait-path')).toBe(
        `${t('socialRecovery.display.nouns.recoveryPath')}${lines.join('')}`
      )
    })
  })
})
