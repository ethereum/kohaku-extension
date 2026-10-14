/**
 * @jest-environment jsdom
 */
import {
  attemptOf,
  CHAIN_ID,
  CHAIN_TIME,
  elapse,
  HOUR,
  mountBand,
  NO_ATTEMPT,
  openWorld,
  resetTab,
  showTab,
  storeCountdownWithoutAttempt,
  t,
  tick,
  useWaitClock,
  waitPathOf,
  waiting
} from '@web/modules/social-recovery/recovery/wait/__tests__/harness'
import type { Mounted, World } from '@web/modules/social-recovery/recovery/wait/__tests__/harness'
import type { Attempt } from '@web/modules/social-recovery/sdk-interfaces'
import { renderShortAddress } from '@web/modules/social-recovery/shared/display'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

describe('the home band for a landed recovery', () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('renders the waiting line with the countdown and opens the wait', async () => {
    const world = await openWorld()
    view = await mountBand(world.records)
    const id = world.account.toLowerCase()

    expect(view.textOf(`home-countdown-${id}-line`)).toBe(
      t('socialRecovery.home.waitingRunning', { account: renderShortAddress(world.account) })
    )
    expect(view.textOf(`home-countdown-${id}-time`)).toBe(waiting(HOUR))
    expect(view.textOf(`home-countdown-${id}-chip`)).toBe(
      t('socialRecovery.status.attempt.recoveryInProgress')
    )
    await tick(3_000)
    expect(view.textOf(`home-countdown-${id}-time`)).toBe(waiting(HOUR - 3))

    expect(view.textOf(`home-countdown-${id}-open`)).toBe(t('socialRecovery.home.open'))
    await view.press(`home-countdown-${id}-open`)
    expect(view.paths()).toEqual([waitPathOf(world.account)])
  })

  it('renders the execution-due line once the wait elapsed', async () => {
    const world = await openWorld()
    elapse(world.kit)
    view = await mountBand(world.records)
    const id = world.account.toLowerCase()

    expect(view.textOf(`home-countdown-${id}-line`)).toBe(
      t('socialRecovery.home.executionDue', { account: renderShortAddress(world.account) })
    )
    expect(view.textOf(`home-countdown-${id}-chip`)).toBe(
      t('socialRecovery.status.attempt.executionDue')
    )
    expect(view.byTestId(`home-countdown-${id}-time`)).toBeNull()
  })

  it('names the account alone, with no number, where the attempt read fails', async () => {
    const world = await openWorld()
    world.kit.chain.failing = true
    view = await mountBand(world.records)
    const id = world.account.toLowerCase()

    expect(view.textOf(`home-countdown-${id}-line`)).toBe(
      t('socialRecovery.home.recovering', { account: renderShortAddress(world.account) })
    )
    expect(view.byTestId(`home-countdown-${id}-time`)).toBeNull()
    expect(view.byTestId(`home-countdown-${id}-chip`)).toBeNull()
  })

  it('names the account alone where the attempt no longer waits', async () => {
    const world = await openWorld()
    world.kit.chain.attempt = NO_ATTEMPT
    view = await mountBand(world.records)
    const id = world.account.toLowerCase()

    expect(view.textOf(`home-countdown-${id}-line`)).toBe(
      t('socialRecovery.home.recovering', { account: renderShortAddress(world.account) })
    )
    expect(view.byTestId(`home-countdown-${id}-time`)).toBeNull()
  })

  it('renders no countdown line once the countdown ended', async () => {
    const world = await openWorld()
    const read = await world.records.countdown(CHAIN_ID, world.account).read()
    if (read.status !== 'present') {
      throw new Error('no countdown')
    }
    await world.records.endCountdown(CHAIN_ID, world.account, read.revision)
    view = await mountBand(world.records)

    expect(view.byTestId(`home-countdown-${world.account.toLowerCase()}`)).toBeNull()
    expect(view.text()).toBe('')
  })
})

describe("the home band's countdown line keeps reading the chain", () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
    resetTab()
  })

  const POLL_MS = 30_000
  const LIMIT_MS = 15_000

  it('reads the attempt at once and again on every period, each round re-anchoring the number', async () => {
    const world = await openWorld()
    view = await mountBand(world.records)
    const id = world.account.toLowerCase()
    expect(world.kit.recoveryState).toHaveBeenCalledTimes(1)
    expect(view.textOf(`home-countdown-${id}-time`)).toBe(waiting(HOUR))

    world.kit.chain.blockTime = CHAIN_TIME + 600
    await tick(POLL_MS)
    expect(world.kit.recoveryState).toHaveBeenCalledTimes(2)
    expect(view.textOf(`home-countdown-${id}-time`)).toBe(waiting(HOUR - 600))
  })

  it('shows a cancel at the next period, never a counting number', async () => {
    const world = await openWorld()
    view = await mountBand(world.records)
    const id = world.account.toLowerCase()
    expect(view.byTestId(`home-countdown-${id}-time`)).not.toBeNull()

    world.kit.chain.attempt = { ...world.kit.chain.attempt, state: 'Cancelled' }
    await tick(POLL_MS)
    expect(view.textOf(`home-countdown-${id}-line`)).toBe(
      t('socialRecovery.home.recovering', { account: renderShortAddress(world.account) })
    )
    expect(view.byTestId(`home-countdown-${id}-time`)).toBeNull()
    expect(view.byTestId(`home-countdown-${id}-chip`)).toBeNull()
  })

  it('reads the attempt again when the tab comes back into view, and not while it is hidden', async () => {
    const world = await openWorld()
    view = await mountBand(world.records)
    const id = world.account.toLowerCase()

    await showTab('hidden')
    expect(world.kit.recoveryState).toHaveBeenCalledTimes(1)

    elapse(world.kit)
    await showTab('visible')
    expect(world.kit.recoveryState).toHaveBeenCalledTimes(2)
    expect(view.textOf(`home-countdown-${id}-line`)).toBe(
      t('socialRecovery.home.executionDue', { account: renderShortAddress(world.account) })
    )
  })

  it('starts no round while one is still out', async () => {
    const world = await openWorld()
    const answer = deferred<Awaited<ReturnType<typeof world.kit.client.recovery.recoveryState>>>()
    world.kit.recoveryState.mockImplementation(() => answer.promise)
    view = await mountBand(world.records)
    expect(world.kit.recoveryState).toHaveBeenCalledTimes(1)

    await tick(5_000)
    await showTab('visible')
    expect(world.kit.recoveryState).toHaveBeenCalledTimes(1)
  })

  it('drops the number once a later round fails, and a later round brings it back', async () => {
    const world = await openWorld()
    view = await mountBand(world.records)
    const id = world.account.toLowerCase()
    expect(view.byTestId(`home-countdown-${id}-time`)).not.toBeNull()

    world.kit.chain.failing = true
    await tick(POLL_MS)
    expect(view.textOf(`home-countdown-${id}-line`)).toBe(
      t('socialRecovery.home.recovering', { account: renderShortAddress(world.account) })
    )
    expect(view.byTestId(`home-countdown-${id}-time`)).toBeNull()
    expect(view.byTestId(`home-countdown-${id}-chip`)).toBeNull()

    world.kit.chain.failing = false
    await tick(POLL_MS)
    expect(view.textOf(`home-countdown-${id}-line`)).toBe(
      t('socialRecovery.home.waitingRunning', { account: renderShortAddress(world.account) })
    )
    expect(view.byTestId(`home-countdown-${id}-time`)).not.toBeNull()
  })

  it('drops the number once a round runs past its limit', async () => {
    const world = await openWorld()
    view = await mountBand(world.records)
    const id = world.account.toLowerCase()
    expect(view.byTestId(`home-countdown-${id}-time`)).not.toBeNull()

    world.kit.chain.hanging = true
    await tick(POLL_MS)
    await tick(LIMIT_MS)
    expect(view.textOf(`home-countdown-${id}-line`)).toBe(
      t('socialRecovery.home.recovering', { account: renderShortAddress(world.account) })
    )
    expect(view.byTestId(`home-countdown-${id}-time`)).toBeNull()
  })
})

describe('the home band for an attempt that is not the landed one', () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  /** The line names the account alone: no number and no chip. */
  const expectAccountAlone = (world: World) => {
    if (!view) {
      throw new Error('no view')
    }
    const id = world.account.toLowerCase()
    expect(view.textOf(`home-countdown-${id}-line`)).toBe(
      t('socialRecovery.home.recovering', { account: renderShortAddress(world.account) })
    )
    expect(view.byTestId(`home-countdown-${id}-time`)).toBeNull()
    expect(view.byTestId(`home-countdown-${id}-chip`)).toBeNull()
  }

  const RIVALS: [string, Partial<Attempt>][] = [
    ['a later attempt id', { attemptId: 2n }],
    ['another setup number', { setupNonce: 2n }],
    ['another payload hash', { payloadHash: `0x${'ab'.repeat(32)}` }]
  ]

  RIVALS.forEach(([name, rival]) => {
    it(`shows no number for a waiting attempt under ${name}`, async () => {
      const world = await openWorld()
      world.kit.chain.attempt = attemptOf(world.account, rival)
      view = await mountBand(world.records)

      expectAccountAlone(world)
      await tick(3_000)
      expectAccountAlone(world)
    })

    it(`does not read execution due for an attempt at its end under ${name}`, async () => {
      const world = await openWorld()
      world.kit.chain.attempt = attemptOf(world.account, rival)
      elapse(world.kit)
      view = await mountBand(world.records)

      expectAccountAlone(world)
    })
  })

  it('drops the number once a later round reads a rival attempt', async () => {
    const world = await openWorld()
    view = await mountBand(world.records)
    const id = world.account.toLowerCase()
    expect(view.textOf(`home-countdown-${id}-time`)).toBe(waiting(HOUR))

    world.kit.chain.attempt = attemptOf(world.account, { setupNonce: 2n })
    await tick(30_000)
    expectAccountAlone(world)
  })

  it('shows no number for a countdown stored without the landed attempt', async () => {
    const world = await openWorld()
    await storeCountdownWithoutAttempt(world.storage, world.account)
    view = await mountBand(world.records)

    expectAccountAlone(world)
  })

  it('does not read execution due for a countdown stored without the landed attempt', async () => {
    const world = await openWorld()
    await storeCountdownWithoutAttempt(world.storage, world.account)
    elapse(world.kit)
    view = await mountBand(world.records)

    expectAccountAlone(world)
  })
})
