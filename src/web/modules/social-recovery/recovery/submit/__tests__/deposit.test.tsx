/**
 * @jest-environment jsdom
 *
 * The gas check on the sending key before the submission: a key that holds
 * too little gets the deposit step, which reads the balance again by itself
 * and goes on to the send once the key holds enough. Leaving the step drops
 * the prepared start; a check that does not answer within the read limit
 * reads failed with a retry. The clock is Jest's.
 */
import type { Mounted, World } from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import {
  hasButton,
  mockWallet,
  mountSubmit,
  openWorld,
  providerReadFailure,
  sessionOf,
  t,
  tick
} from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const { getAddress }: typeof import('viem') = require('viem')
const {
  BALANCE_POLL_MS,
  READ_LIMIT_MS
}: typeof import('@web/modules/social-recovery/recovery/submit') = require('@web/modules/social-recovery/recovery/submit')
const {
  checklistPathOf
}: typeof import('@web/modules/social-recovery/recovery/checklist') = require('@web/modules/social-recovery/recovery/checklist')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const GAS = 'socialRecovery.writes.gas'
/** The estimate with its headroom the step asks for at a balance of zero: 300000 gas at 2 gwei, plus 20%. */
const OUTSIDE_AMOUNT = '0.00072 ETH'

describe('the deposit step', () => {
  let view: Mounted | undefined

  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
    jest.useRealTimers()
  })

  /** Opens the confirmation with the sending key empty and presses Start recovery. */
  const startEmpty = async (world: World) => {
    world.kit.reads.nativeBalance.mockResolvedValue(0n)
    view = await mountSubmit(world.account, { useTimers: true })
    await view.press('submit-verify-details')
    await view.press('submit-action')
    return view
  }

  it('shows the sending key in full and the amount, with both routes on the logged-in route', async () => {
    const world = await openWorld({ route: 'logged-in', receiving: 'smart' })
    const mounted = await startEmpty(world)
    const step = mounted.textOf('submit-gas-step')
    expect(step).toContain(getAddress(world.sendingKey))
    expect(step).toContain(t(`${GAS}.outsideRoute`, { amount: OUTSIDE_AMOUNT }))
    expect(step).toContain('Transfer ')
    expect(step).toContain(`from ${world.receiving.preferences.label} to its key`)
    expect(world.kit.reads.nativeBalance).toHaveBeenCalledWith(world.sendingKey)
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('says why above the step and that the approvals stay below it, with Back to the checklist', async () => {
    const world = await openWorld()
    const mounted = await startEmpty(world)
    expect(mounted.textOf('submit-gas-lead')).toBe(t('socialRecovery.submit.gas.lead'))
    expect(mounted.textOf('submit-gas-collected-stays')).toBe(
      t('socialRecovery.submit.gas.collectedStays')
    )
    expect(mounted.byTestId('submit-gas-step')).not.toBeNull()
    await mounted.press('submit-back')
    expect(mockWallet.navigate).toHaveBeenLastCalledWith(checklistPathOf(world.account))
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('offers the deposit from outside alone on the fresh install', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const mounted = await startEmpty(world)
    const step = mounted.textOf('submit-gas-step')
    expect(step).toContain(getAddress(world.sendingKey))
    expect(step).toContain(t(`${GAS}.submissionAmount`, { amount: OUTSIDE_AMOUNT }))
    expect(step).not.toContain('Transfer ')
    expect(step).not.toContain(t(`${GAS}.outsideRoute`, { amount: OUTSIDE_AMOUNT }))
    expect(world.kit.reads.nativeBalance).toHaveBeenCalledWith(world.sendingKey)
    expect(world.port.send).not.toHaveBeenCalled()
  })

  it('reads the balance again by itself and goes on to the send once the key holds enough', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const mounted = await startEmpty(world)
    const reads = world.kit.reads.nativeBalance.mock.calls.length

    await tick(BALANCE_POLL_MS)
    expect(world.kit.reads.nativeBalance.mock.calls.length).toBe(reads + 1)
    expect(mounted.byTestId('submit-gas-step')).not.toBeNull()
    expect(world.port.send).not.toHaveBeenCalled()

    world.kit.reads.nativeBalance.mockResolvedValue(1_000_000_000_000_000_000n)
    await tick(BALANCE_POLL_MS)
    expect(world.port.send).toHaveBeenCalledTimes(1)
    expect(world.port.send.mock.calls[0][0].addr).toBe(world.sendingKey)
    expect(mounted.byTestId('submit-gas-step')).toBeNull()
  })

  it('renders failed with a retry where a balance read fails, and sends nothing', async () => {
    const world = await openWorld()
    const mounted = await startEmpty(world)
    world.kit.reads.nativeBalance.mockRejectedValue(
      providerReadFailure('nativeBalance', new Error('node down'))
    )
    await tick(BALANCE_POLL_MS)
    expect(mounted.byTestId('submit-gas-step')).toBeNull()
    expect(mounted.text()).toContain(t('socialRecovery.writes.gasCheckFailed'))
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()

    world.kit.reads.nativeBalance.mockResolvedValue(1_000_000_000_000_000_000n)
    await mounted.pressText(t('socialRecovery.writes.tryAgain'))
    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('drops the prepared start on Back, so a key funded later sends nothing', async () => {
    const world = await openWorld()
    const mounted = await startEmpty(world)
    await mounted.press('submit-back')
    expect(mounted.byTestId('submit-gas-step')).toBeNull()
    expect(mounted.byTestId('submit-action')).not.toBeNull()

    world.kit.reads.nativeBalance.mockResolvedValue(1_000_000_000_000_000_000n)
    await tick(BALANCE_POLL_MS)
    await tick(BALANCE_POLL_MS)
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    const session = await sessionOf(world.records, world.account)
    expect(session?.state === 'live' && session.submission).toBeFalsy()

    await mounted.press('submit-action')
    expect(world.kit.prepareStartAttempt).toHaveBeenCalledTimes(2)
    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('drops the prepared start where the screen goes away on the deposit step, and offers Start again on return', async () => {
    const world = await openWorld()
    const mounted = await startEmpty(world)
    mounted.unmount()
    view = undefined
    world.kit.reads.nativeBalance.mockResolvedValue(1_000_000_000_000_000_000n)
    await tick(BALANCE_POLL_MS)
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()

    view = await mountSubmit(world.account, { useTimers: true })
    expect(view.byTestId('submit-gas-step')).toBeNull()
    expect(view.byTestId('submit-action')).not.toBeNull()
    await tick(BALANCE_POLL_MS)
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('sends nothing where the screen goes away while a balance read is out and the read then answers enough', async () => {
    const world = await openWorld()
    const mounted = await startEmpty(world)
    const balance = deferred<bigint>()
    world.kit.reads.nativeBalance.mockImplementation(() => balance.promise)
    await tick(BALANCE_POLL_MS)
    mounted.unmount()
    view = undefined
    balance.resolve(1_000_000_000_000_000_000n)
    await tick(0)
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    const session = await sessionOf(world.records, world.account)
    expect(session?.state === 'live' && session.submission).toBeFalsy()
  })

  it('keeps the step while a balance read is out, and reads failed with a retry once it passes the limit, sending nothing', async () => {
    const world = await openWorld()
    const mounted = await startEmpty(world)
    world.kit.reads.nativeBalance.mockImplementation(() => deferred<bigint>().promise)
    await tick(BALANCE_POLL_MS)
    await tick(READ_LIMIT_MS - 1_000)
    expect(mounted.byTestId('submit-gas-step')).not.toBeNull()

    await tick(1_000)
    expect(mounted.byTestId('submit-gas-step')).toBeNull()
    expect(mounted.byTestId('submit-write-gasReadError')).not.toBeNull()
    expect(mounted.text()).toContain(t('socialRecovery.writes.gasCheckFailed'))
    expect(hasButton(mounted, t('socialRecovery.writes.tryAgain'))).toBe(true)
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()

    world.kit.reads.nativeBalance.mockResolvedValue(1_000_000_000_000_000_000n)
    const reads = world.kit.reads.nativeBalance.mock.calls.length
    await mounted.pressText(t('socialRecovery.writes.tryAgain'))
    expect(world.kit.reads.nativeBalance.mock.calls.length).toBeGreaterThan(reads)
    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('reads failed with a retry where the first gas check passes the limit, sending nothing', async () => {
    const world = await openWorld()
    world.kit.reads.nativeBalance.mockImplementation(() => deferred<bigint>().promise)
    view = await mountSubmit(world.account, { useTimers: true })
    await view.press('submit-verify-details')
    await view.press('submit-action')
    await tick(READ_LIMIT_MS)
    expect(view.byTestId('submit-write-gasReadError')).not.toBeNull()
    expect(view.text()).toContain(t('socialRecovery.writes.gasCheckFailed'))
    expect(hasButton(view, t('socialRecovery.writes.tryAgain'))).toBe(true)
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()

    world.kit.reads.nativeBalance.mockResolvedValue(1_000_000_000_000_000_000n)
    await view.pressText(t('socialRecovery.writes.tryAgain'))
    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('sends at once, with no step, where the key already holds enough', async () => {
    const world = await openWorld()
    view = await mountSubmit(world.account, { useTimers: true })
    await view.press('submit-verify-details')
    await view.press('submit-action')
    expect(view.byTestId('submit-gas-step')).toBeNull()
    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })
})
