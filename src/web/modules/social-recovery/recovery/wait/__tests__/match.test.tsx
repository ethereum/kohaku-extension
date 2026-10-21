/**
 * @jest-environment jsdom
 */
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import {
  attemptCancelled,
  attemptConsumed,
  attemptOf,
  attemptStarted,
  CHAIN_ID,
  elapse,
  landCountdown,
  MIXED_PATH,
  mountWait,
  NO_ATTEMPT,
  openWorld,
  PAYLOAD,
  PAYLOAD_HASH,
  RIVAL_PAYLOAD,
  storeCountdownWithoutAttempt,
  t,
  tick,
  useWaitClock
} from '@web/modules/social-recovery/recovery/wait/__tests__/harness'
import type { Mounted, World } from '@web/modules/social-recovery/recovery/wait/__tests__/harness'
import type { Hex } from '@kohaku-eth/social-recovery'

const POLL_MS = 30_000

const donePath = (world: World) =>
  `/${WEB_ROUTES.socialRecoveryRecoveryDone}?account=${world.account}`

/** The screen reads cannot execute for an attempt it cannot match, and nothing ends, executes or moves on. */
const expectUnmatched = async (view: Mounted, world: World) => {
  expect(view.textOf('wait-cannot-execute-unmatched')).toBe(
    t('socialRecovery.wait.cannotExecute.unmatched')
  )
  expect(view.textOf('wait-cannot-execute-chip')).toBe(
    t('socialRecovery.status.recovery.cannotExecute')
  )
  expect(view.byTestId('wait-execute')).toBeNull()
  expect(view.byTestId('wait-execution-due')).toBeNull()
  expect(view.byTestId('wait-time-left')).toBeNull()
  expect(view.byTestId('wait-cancelled-action')).toBeNull()
  expect(view.paths()).toEqual([])
  expect(world.kit.prepareExecuteHandover).not.toHaveBeenCalled()
  expect(world.port.send).not.toHaveBeenCalled()
  expect((await world.records.countdown(CHAIN_ID, world.account).read()).status).toBe('present')
  expect((await world.records.recoveryEntry(CHAIN_ID, world.account).read()).status).toBe('present')
}

describe('a rival attempt under the recovery id', () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('reads cannot execute for an attempt at its end under another setup number', async () => {
    const world = await openWorld()
    world.kit.chain.attempt = attemptOf(world.account, { setupNonce: 2n })
    elapse(world.kit)
    view = await mountWait(world.account)

    await expectUnmatched(view, world)
    await tick(POLL_MS)
    await expectUnmatched(view, world)
  })

  it('reads cannot execute for an attempt at its end under another payload hash', async () => {
    const world = await openWorld()
    world.kit.chain.attempt = attemptOf(world.account, { payloadHash: `0x${'ab'.repeat(32)}` })
    elapse(world.kit)
    view = await mountWait(world.account)

    await expectUnmatched(view, world)
  })

  it('renders no cancelled terminal for a rival attempt under the id that was cancelled', async () => {
    const world = await openWorld()
    world.kit.chain.attempt = attemptOf(world.account, { state: 'Cancelled', setupNonce: 2n })
    world.kit.chain.events = [attemptCancelled(world.account, 'cancelByOwner')]
    view = await mountWait(world.account)

    await expectUnmatched(view, world)
  })

  it('reads cannot execute where the opening event under the id carries another payload, though the attempt read names ours', async () => {
    const world = await openWorld()
    elapse(world.kit)
    world.kit.chain.events = [attemptStarted(world.account, RIVAL_PAYLOAD)]
    view = await mountWait(world.account)

    await expectUnmatched(view, world)
  })

  it("renders no cancelled terminal where a rival's opening event shares the id of a cancelled attempt", async () => {
    const world = await openWorld()
    world.kit.chain.attempt = { ...world.kit.chain.attempt, state: 'Cancelled' }
    world.kit.chain.events = [
      attemptStarted(world.account, RIVAL_PAYLOAD),
      attemptCancelled(world.account, 'cancelByOwner')
    ]
    view = await mountWait(world.account)

    await expectUnmatched(view, world)
  })

  it("renders no setup-change terminal where a rival's opening event shares the id of an attempt gone", async () => {
    const world = await openWorld()
    world.kit.chain.attempt = NO_ATTEMPT
    world.kit.chain.events = [attemptStarted(world.account, RIVAL_PAYLOAD)]
    view = await mountWait(world.account)

    await expectUnmatched(view, world)
  })

  it("opens no done screen where a rival's opening event shares the id of a consumed attempt", async () => {
    const world = await openWorld()
    world.kit.chain.attempt = NO_ATTEMPT
    world.kit.chain.events = [
      attemptStarted(world.account, RIVAL_PAYLOAD),
      attemptConsumed(world.account)
    ]
    view = await mountWait(world.account)

    await expectUnmatched(view, world)
  })
})

describe('the recovery own attempt', () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('executes the attempt whose id, setup number and payload hash the landing kept', async () => {
    const world = await openWorld({ countdown: false })
    await landCountdown(world.records, world.account, MIXED_PATH, 7)
    const { chain } = world.kit
    chain.attempt = attemptOf(world.account, { attemptId: 7n })
    chain.events = [attemptStarted(world.account, PAYLOAD, 7n)]
    elapse(world.kit)
    view = await mountWait(world.account)

    expect(view.isDisabled('wait-execute')).toBe(false)
    await view.press('wait-execute')
    expect(world.port.send).toHaveBeenCalledTimes(1)
    expect(world.kit.prepareExecuteHandover).toHaveBeenCalledWith(chain.attempt, PAYLOAD, {
      from: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/)
    })
  })

  it('matches the payload hash the chain reports in capitals', async () => {
    const world = await openWorld()
    const capitals = `0x${PAYLOAD_HASH.slice(2).toUpperCase()}` as Hex
    world.kit.chain.attempt = attemptOf(world.account, { payloadHash: capitals })
    elapse(world.kit)
    view = await mountWait(world.account)

    expect(view.byTestId('wait-cannot-execute')).toBeNull()
    expect(view.isDisabled('wait-execute')).toBe(false)
  })

  it('reads cannot execute for the attempt under a later id than the one the landing kept', async () => {
    const world = await openWorld()
    world.kit.chain.attempt = attemptOf(world.account, { attemptId: 2n })
    world.kit.chain.events = [attemptStarted(world.account, PAYLOAD, 2n)]
    elapse(world.kit)
    view = await mountWait(world.account)

    await expectUnmatched(view, world)
    await tick(POLL_MS)
    await expectUnmatched(view, world)
  })
})

describe('a consume event with no matched opening', () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('opens no done screen where the attempt is gone and only a consume event names the id', async () => {
    const world = await openWorld()
    world.kit.chain.attempt = NO_ATTEMPT
    world.kit.chain.events = [attemptConsumed(world.account)]
    view = await mountWait(world.account)

    await expectUnmatched(view, world)
  })

  it('opens no done screen where a later attempt runs and only a consume event names the id', async () => {
    const world = await openWorld()
    world.kit.chain.attempt = attemptOf(world.account, { attemptId: 2n })
    world.kit.chain.events = [attemptConsumed(world.account)]
    view = await mountWait(world.account)

    await expectUnmatched(view, world)
  })

  it('opens the done screen where the attempt is gone and both its opening and its consume event show', async () => {
    const world = await openWorld()
    world.kit.chain.attempt = NO_ATTEMPT
    world.kit.chain.events = [attemptStarted(world.account), attemptConsumed(world.account)]
    view = await mountWait(world.account)

    expect(view.paths()).toEqual([donePath(world)])
  })
})

describe('a countdown stored before it kept its attempt', () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const CASES: [string, (world: World) => void][] = [
    ['the attempt runs', () => undefined],
    ['the attempt reached its end', (world) => elapse(world.kit)],
    [
      'the attempt was cancelled by its owner',
      (world) => {
        const { chain } = world.kit
        chain.attempt = { ...chain.attempt, state: 'Cancelled' }
        chain.events = [...chain.events, attemptCancelled(world.account, 'cancelByOwner')]
      }
    ],
    [
      'the attempt is gone with no event',
      (world) => {
        const { chain } = world.kit
        chain.attempt = NO_ATTEMPT
      }
    ],
    [
      'the attempt executed',
      (world) => {
        const { chain } = world.kit
        chain.attempt = { ...chain.attempt, state: 'Consumed' }
        chain.events = [...chain.events, attemptConsumed(world.account)]
      }
    ]
  ]

  CASES.forEach(([name, move]) => {
    it(`reads cannot execute where ${name}, and nothing ends the countdown`, async () => {
      const world = await openWorld()
      await storeCountdownWithoutAttempt(world.storage, world.account)
      move(world)
      view = await mountWait(world.account)

      await expectUnmatched(view, world)
      await tick(POLL_MS)
      await expectUnmatched(view, world)
    })
  })
})
