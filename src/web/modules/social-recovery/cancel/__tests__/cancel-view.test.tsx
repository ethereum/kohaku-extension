/**
 * @jest-environment jsdom
 */
import type { CancelState, CancelViewProps } from '@web/modules/social-recovery/cancel'
import type { LastReadingCase } from '@web/modules/social-recovery/cancel/__fixtures__/mount'
import type { WatcherReading } from '@web/modules/social-recovery/watcher'

jest.mock('viem', () => {
  // eslint-disable-next-line global-require
  const { TextDecoder, TextEncoder } = require('util')
  Object.assign(globalThis, { TextDecoder, TextEncoder })
  return jest.requireActual('viem')
})
jest.mock('viem/chains', () => {
  // eslint-disable-next-line global-require
  const { TextDecoder, TextEncoder } = require('util')
  Object.assign(globalThis, { TextDecoder, TextEncoder })
  return jest.requireActual('viem/chains')
})
jest.mock('@common/utils/clipboard', () => ({ setStringAsync: async () => true }))
const mockNavigate = jest.fn()
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: mockNavigate })
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const fixtures: typeof import('@web/modules/social-recovery/cancel/__fixtures__/mount') = require('@web/modules/social-recovery/cancel/__fixtures__/mount')
const watcherFixtures: typeof import('@web/modules/social-recovery/watcher/__fixtures__/harness') = require('@web/modules/social-recovery/watcher/__fixtures__/harness')
const runFixtures: typeof import('@web/modules/social-recovery/cancel/__fixtures__/run') = require('@web/modules/social-recovery/cancel/__fixtures__/run')
const display: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  accountBatchRefusal
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  initialCancelState
}: typeof import('@web/modules/social-recovery/cancel') = require('@web/modules/social-recovery/cancel')
const CancelView: typeof import('@web/modules/social-recovery/cancel/CancelView').default =
  require('@web/modules/social-recovery/cancel/CancelView').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const { mount, t } = fixtures
const { ACCOUNT, NEW_KEY, OLD_KEY, HEAD, HEAD_TIME, ENDED_TIME } = watcherFixtures
const { TX_HASH, SHORT } = runFixtures
const ZONE = 'UTC'

const ATTEMPT_4: NonNullable<WatcherReading['attempt']> = {
  attemptId: 4n,
  setupNonce: 1n,
  payloadHash: `0x${'11'.repeat(32)}`,
  consumableAfter: HEAD_TIME + 3600,
  executionDue: false,
  newKey: NEW_KEY
}

const OPEN: WatcherReading = {
  account: ACCOUNT,
  block: { number: HEAD, timestamp: HEAD_TIME },
  hasSetup: true,
  dormant: false,
  attempt: ATTEMPT_4
}

const endedBy = (ended: NonNullable<WatcherReading['ended']>): WatcherReading => ({
  account: OPEN.account,
  block: OPEN.block,
  hasSetup: true,
  dormant: false,
  ended
})

const RECEIPT = { transactionHash: TX_HASH, status: 0 as const, blockNumber: HEAD + 1 }

const LANDED: CancelState['write'] = {
  status: 'landed',
  write: 'cancel',
  run: 1,
  transactionHash: TX_HASH,
  receipt: { ...RECEIPT, status: 1 }
}

const withWrite = (write: CancelState['write'], rest: Partial<CancelState> = {}): CancelState => ({
  ...initialCancelState(),
  target: 4n,
  write,
  ...rest
})

describe('the cancel screen', () => {
  let props: CancelViewProps
  let view: Awaited<ReturnType<typeof mount>> | undefined

  beforeEach(() => {
    props = {
      read: { status: 'read', arrival: { reading: OPEN } },
      run: initialCancelState(),
      readiness: 'ready',
      timeZone: ZONE,
      onRetryRead: jest.fn(),
      onRetryReady: jest.fn(),
      onSend: jest.fn(),
      onRecheck: jest.fn(),
      onCheckAgain: jest.fn(),
      onBack: jest.fn(),
      onDone: jest.fn(),
      onMoveFunds: jest.fn(),
      moveFundsBusy: false
    }
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const render = (overrides: Partial<CancelViewProps> = {}) =>
    mount(<CancelView {...props} {...overrides} />)

  it('confirms with the attempt facts, the one transaction and the only-own-key line', async () => {
    view = await render()

    expect(view.textOf('cancel-confirm-title')).toBe(t('socialRecovery.cancel.confirm.title'))
    expect(view.textOf('cancel-confirm-lead')).toBe(t('socialRecovery.cancel.confirm.lead'))
    expect(view.textOf('cancel-confirm-one-transaction')).toBe(
      t('socialRecovery.cancel.confirm.oneTransaction')
    )
    expect(view.textOf('cancel-new-key')).toBe(display.renderFullAddress(NEW_KEY))
    expect(view.textOf('cancel-finishes')).toBe(
      t('socialRecovery.watcher.banner.finishes', {
        date: display.renderDateTimeInZone((HEAD_TIME + 3600) * 1000, ZONE).date
      })
    )
    expect(view.textOf('cancel-only-own-key')).toBe(t('socialRecovery.watcher.banner.onlyOwnKey'))
    expect(view.textOf('cancel-back')).toBe(t('socialRecovery.cancel.confirm.back'))

    await view.press('cancel-send')
    expect(props.onSend).toHaveBeenCalledWith(4n)
  })

  it('confirms a dormant attempt with the dormant line alone, even once its execution is due', async () => {
    view = await render({
      read: {
        status: 'read',
        arrival: {
          reading: { ...OPEN, dormant: true, attempt: { ...ATTEMPT_4, executionDue: true } }
        }
      }
    })

    expect(view.textOf('cancel-dormant')).toBe(t('socialRecovery.watcher.banner.dormant'))
    expect(view.byTestId('cancel-due-chip')).toBeNull()
    expect(view.byTestId('cancel-due')).toBeNull()
    expect(view.byTestId('cancel-finishes')).toBeNull()
    expect(view.isDisabled('cancel-send')).toBe(false)
  })

  it('keeps the send closed while the client failed to load, with a retry', async () => {
    view = await render({ readiness: 'failed' })

    expect(view.isDisabled('cancel-send')).toBe(true)
    expect(view.textOf('cancel-ready-failed-line')).toBe(
      t('socialRecovery.cancel.confirm.clientFailed')
    )
    await view.press('cancel-ready-retry')
    expect(props.onRetryReady).toHaveBeenCalled()
  })

  it('says the wallet holds no key for the account, with the send closed', async () => {
    view = await render({ readiness: 'noKey' })

    expect(view.isDisabled('cancel-send')).toBe(true)
    expect(view.textOf('cancel-view-only')).toBe(t('socialRecovery.cancel.confirm.viewOnly'))
  })

  it('refuses an attempt already ended by another road, naming it, and sends nothing', async () => {
    view = await render({
      read: {
        status: 'read',
        arrival: {
          reading: endedBy({ attemptId: 4n, road: 'cancelled', cancelledBy: 'cancelByProofs' })
        }
      }
    })

    expect(view.textOf('cancel-ended-line')).toBe(t('socialRecovery.cancel.confirm.ended'))
    expect(view.textOf('cancel-ended-road')).toBe(
      t('socialRecovery.writes.cancelGoneRoad.cancelByProofs')
    )
    expect(view.byTestId('cancel-send')).toBeNull()
  })

  it('names the controller where the attempt executed', async () => {
    view = await render({
      read: {
        status: 'read',
        arrival: {
          reading: endedBy({ attemptId: 4n, road: 'executed', controller: NEW_KEY, at: ENDED_TIME })
        }
      }
    })
    expect(view.textOf('cancel-ended-controller')).toBe(display.renderFullAddress(NEW_KEY))
  })

  it('says the road is not read yet where the ending names none, and nothing where it settled without one', async () => {
    view = await render({
      read: {
        status: 'read',
        arrival: { reading: endedBy({ attemptId: 4n, road: 'cancelled' }) }
      }
    })
    expect(view.textOf('cancel-ended-unread')).toBe(t('socialRecovery.cancel.landed.unread'))
    expect(view.byTestId('cancel-ended-road')).toBeNull()
    view.unmount()

    view = await render({
      read: {
        status: 'read',
        arrival: {
          reading: endedBy({ attemptId: 4n, road: 'cancelled', endingGap: 'not-found' })
        }
      }
    })
    expect(view.byTestId('cancel-ended-unread')).toBeNull()
    expect(view.textOf('cancel-ended-line')).toBe(t('socialRecovery.cancel.confirm.ended'))
  })

  it("reads again from the ended block's unread line: the run's reading, or the arrival's", async () => {
    const unread = endedBy({ attemptId: 4n, road: 'cancelled' })
    view = await render({ run: { ...initialCancelState(), target: 4n, gone: unread } })
    expect(view.textOf('cancel-ended-check-again')).toBe(
      t('socialRecovery.cancel.landed.checkAgain')
    )
    await view.press('cancel-ended-check-again')
    expect(props.onCheckAgain).toHaveBeenCalledTimes(1)
    expect(props.onRetryRead).not.toHaveBeenCalled()
    view.unmount()

    view = await render({ read: { status: 'read', arrival: { reading: unread } } })
    await view.press('cancel-ended-check-again')
    expect(props.onRetryRead).toHaveBeenCalledTimes(1)
    expect(props.onCheckAgain).toHaveBeenCalledTimes(1)
  })

  it('shows the ending beside a followed request the wallet still holds', async () => {
    view = await render({
      run: withWrite(
        { status: 'submitting', write: 'cancel', run: 1 },
        {
          follow: 'held',
          followGone: endedBy({ attemptId: 4n, road: 'cancelled', cancelledBy: 'cancelByProofs' })
        }
      )
    })

    expect(view.byTestId('cancel-in-progress')).not.toBeNull()
    expect(view.textOf('cancel-ended-road')).toBe(
      t('socialRecovery.writes.cancelGoneRoad.cancelByProofs')
    )
    // The holder may still sign the request, so the page never says nothing was sent.
    expect(view.byTestId('cancel-ended-line')).toBeNull()
    expect(view.byTestId('cancel-back')).toBeNull()
  })

  it('offers no cancel of a newer attempt while a followed request may still land', async () => {
    const newer = { ...ATTEMPT_4, attemptId: 5n, newKey: OLD_KEY }
    view = await render({
      run: withWrite(
        { status: 'submitting', write: 'cancel', run: 1 },
        { follow: 'held', followGone: { ...OPEN, attempt: newer } }
      )
    })

    expect(view.byTestId('cancel-in-progress')).not.toBeNull()
    expect(view.byTestId('cancel-send')).toBeNull()
    expect(view.byTestId('cancel-confirm')).toBeNull()
  })

  it('tells no road where the reading ends another attempt than the one the run meant', async () => {
    view = await render({
      run: {
        ...initialCancelState(),
        target: 4n,
        gone: endedBy({ attemptId: 5n, road: 'cancelled', cancelledBy: 'cancelByProofs' })
      }
    })

    expect(view.textOf('cancel-ended-line')).toBe(t('socialRecovery.cancel.confirm.ended'))
    expect(view.byTestId('cancel-ended-road')).toBeNull()
  })

  it('offers the cancel of a newer attempt open on arrival, never that the recovery ended', async () => {
    const newer = { ...ATTEMPT_4, attemptId: 5n, newKey: OLD_KEY }
    view = await render({
      read: { status: 'read', arrival: { reading: { ...OPEN, attempt: newer } } }
    })

    expect(view.byTestId('cancel-ended')).toBeNull()
    expect(view.textOf('cancel-new-key')).toBe(display.renderFullAddress(OLD_KEY))
    await view.press('cancel-send')
    expect(props.onSend).toHaveBeenCalledWith(5n)
  })

  it('offers the newer attempt the run found open where its own attempt was gone, over the arrival', async () => {
    const newer = { ...ATTEMPT_4, attemptId: 5n, newKey: OLD_KEY }
    view = await render({
      run: { ...initialCancelState(), target: 4n, gone: { ...OPEN, attempt: newer } }
    })

    expect(view.textOf('cancel-new-key')).toBe(display.renderFullAddress(OLD_KEY))
    await view.press('cancel-send')
    expect(props.onSend).toHaveBeenCalledWith(5n)
  })

  it('reads a failed read as failed, with the retry, and sends nothing', async () => {
    view = await render({ read: { status: 'failed' } })

    expect(view.textOf('cancel-read-failed-line')).toBe(
      t('socialRecovery.cancel.confirm.readFailed')
    )
    expect(view.byTestId('cancel-send')).toBeNull()
    await view.press('cancel-read-retry')
    expect(props.onRetryRead).toHaveBeenCalled()
  })

  it("shows the watcher's last open attempt beside the refreshing line, the send held, while the fresh read runs", async () => {
    view = await render({ read: { status: 'loading' }, last: OPEN })

    expect(view.textOf('cancel-refreshing')).toBe(t('socialRecovery.loading.refreshingAttempt'))
    expect(
      view.byTestId('cancel-refreshing')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
    expect(view.textOf('cancel-new-key')).toBe(display.renderFullAddress(NEW_KEY))
    expect(view.isDisabled('cancel-send')).toBe(true)
    await view.press('cancel-send')
    expect(props.onSend).not.toHaveBeenCalled()
  })

  const UNKNOWN: LastReadingCase[] = [
    { name: 'this device holds no reading', last: null },
    {
      name: 'the last reading names no open attempt',
      last: endedBy({ attemptId: 4n, road: 'cancelled' })
    }
  ]
  UNKNOWN.forEach(({ name, last }) =>
    it(`says it reads the recovery in a waiting block while the fresh read runs where ${name}`, async () => {
      view = await render({ read: { status: 'loading' }, last })
      expect(view.textOf('cancel-loading')).toBe(t('socialRecovery.loading.attempt'))
      expect(
        view.byTestId('cancel-loading')?.querySelector('[data-testid="loading-block"]')
      ).not.toBeNull()
      expect(view.byTestId('cancel-send')).toBeNull()
      expect(view.byTestId('cancel-confirm')).toBeNull()
      expect(view.byTestId('cancel-ended')).toBeNull()
    })
  )

  it("replaces the watcher's last open attempt with the ended block once the fresh read finds none, the send never open", async () => {
    view = await render({ read: { status: 'loading' }, last: OPEN })
    expect(view.textOf('cancel-new-key')).toBe(display.renderFullAddress(NEW_KEY))
    expect(view.isDisabled('cancel-send')).toBe(true)

    const { attempt, ...none } = OPEN
    await view.render(
      <CancelView {...props} read={{ status: 'read', arrival: { reading: none } }} last={OPEN} />
    )

    expect(view.byTestId('cancel-ended')).not.toBeNull()
    expect(view.textOf('cancel-ended-line')).toBe(t('socialRecovery.cancel.confirm.ended'))
    expect(view.byTestId('cancel-refreshing')).toBeNull()
    expect(view.byTestId('cancel-new-key')).toBeNull()
    expect(view.byTestId('cancel-send')).toBeNull()
    expect(props.onSend).not.toHaveBeenCalled()
  })

  it('opens the send once the fresh read answers, over the last reading', async () => {
    view = await render({ last: OPEN })

    expect(view.byTestId('cancel-refreshing')).toBeNull()
    expect(view.isDisabled('cancel-send')).toBe(false)
  })

  it('keeps the confirm on screen, its send held, beside the line that says the fee is checked', async () => {
    view = await render({ run: withWrite({ status: 'checkingGas', write: 'cancel', run: 1 }) })

    expect(view.textOf('cancel-checkingGas')).toBe(t('socialRecovery.loading.fee'))
    expect(
      view.byTestId('cancel-checkingGas')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
    expect(view.textOf('cancel-new-key')).toBe(display.renderFullAddress(NEW_KEY))
    expect(view.isDisabled('cancel-send')).toBe(true)
    await view.press('cancel-send')
    expect(props.onSend).not.toHaveBeenCalled()
  })

  it('says it checks the fee in a waiting block where no open attempt is read to confirm beside it', async () => {
    view = await render({
      read: { status: 'loading' },
      last: null,
      run: withWrite({ status: 'checkingGas', write: 'cancel', run: 1 })
    })

    expect(view.textOf('cancel-loading')).toBe(t('socialRecovery.loading.fee'))
    expect(
      view.byTestId('cancel-loading')?.querySelector('[data-testid="loading-block"]')
    ).not.toBeNull()
    expect(view.byTestId('cancel-send')).toBeNull()
  })

  it('shows the deposit step for the account key with both routes, and checks again on continue', async () => {
    view = await render({
      run: withWrite({
        status: 'needsDeposit',
        write: 'cancel',
        run: 1,
        step: SHORT.kind === 'deposit' ? SHORT.step : (undefined as never)
      })
    })

    expect(view.text()).toContain(t('socialRecovery.writes.gas.notEnoughGasAccountKey'))
    expect(view.text()).toContain(t('socialRecovery.writes.gas.shortfallCancel'))
    expect(view.byTestId('cancel-gas-route-transfer')).not.toBeNull()
    expect(view.byTestId('cancel-gas-route-outside')).not.toBeNull()
    await view.press('cancel-gas-continue')
    expect(props.onRecheck).toHaveBeenCalled()
  })

  it('reads the cancel in progress while it is on its way', async () => {
    view = await render({
      run: withWrite({ status: 'submitting', write: 'cancel', run: 1, transactionHash: TX_HASH })
    })

    expect(view.text()).toContain(t('socialRecovery.cancel.inProgress.title'))
    expect(view.text()).toContain(t('socialRecovery.cancel.inProgress.body'))
    expect(view.byTestId('cancel-check-again')).toBeNull()
  })

  it('reads landed, never cancelled, while the reads after the landing run', async () => {
    view = await render({ run: withWrite(LANDED, { after: { stage: 'reading' } }) })

    expect(view.textOf('cancel-landed-title')).toBe(t('socialRecovery.cancel.landed.title'))
    expect(view.textOf('cancel-landed-body')).toBe(t('socialRecovery.cancel.landed.body'))
    expect(view.byTestId('cancel-landed-unread')).toBeNull()
    expect(view.byTestId('cancel-cancelled')).toBeNull()
    expect(view.textOf('cancel-landed-reading')).toBe(t('socialRecovery.loading.refreshingAttempt'))
    expect(
      view.byTestId('cancel-landed-reading')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
  })

  it('reads landed but unconfirmed, with check again, once the reads did not confirm', async () => {
    view = await render({ run: withWrite(LANDED, { after: { stage: 'unread' } }) })

    expect(view.textOf('cancel-landed-title')).toBe(t('socialRecovery.cancel.landed.title'))
    expect(view.textOf('cancel-landed-unread')).toBe(t('socialRecovery.cancel.landed.unread'))
    expect(view.textOf('cancel-check-again')).toBe(t('socialRecovery.cancel.landed.checkAgain'))
    expect(view.byTestId('cancel-cancelled')).toBeNull()
    await view.press('cancel-check-again')
    expect(props.onCheckAgain).toHaveBeenCalled()
  })

  it('reads not sent with the retry and move funds', async () => {
    view = await render({
      run: withWrite({
        status: 'failedNotSent',
        write: 'cancel',
        run: 1,
        error: accountBatchRefusal('refused', ACCOUNT)
      })
    })

    expect(view.text()).toContain(t('socialRecovery.cancel.failed.title'))
    expect(view.text()).toContain(t('socialRecovery.cancel.failed.body'))
    expect(view.text()).toContain(t('socialRecovery.writes.tryAgain'))
    expect(view.textOf('cancel-move-funds')).toBe(t('socialRecovery.cancel.failed.moveFunds'))
  })

  it("reads the run's own gate refusing the add as nothing changed, never as rejected", async () => {
    view = await render({
      run: withWrite({
        status: 'failedNotSent',
        write: 'cancel',
        run: 1,
        error: accountBatchRefusal('timeout', ACCOUNT)
      })
    })

    expect(view.text()).toContain(t('socialRecovery.writes.notSent'))
    expect(view.text()).not.toContain(t('socialRecovery.cancel.failed.body'))
    expect(view.text()).toContain(t('socialRecovery.writes.tryAgain'))
  })

  it('keeps move funds closed while the wallet selects the account', async () => {
    view = await render({
      moveFundsBusy: true,
      run: withWrite({
        status: 'failedNotSent',
        write: 'cancel',
        run: 1,
        error: accountBatchRefusal('refused', ACCOUNT)
      })
    })

    expect(view.isDisabled('cancel-move-funds')).toBe(true)
  })

  it('reads a revert after an execution as nothing left to cancel, naming the controller, with move funds', async () => {
    view = await render({
      run: withWrite({
        status: 'failedReverted',
        write: 'cancel',
        run: 1,
        transactionHash: TX_HASH,
        receipt: RECEIPT,
        cause: { kind: 'attemptGone', ended: 'executed', controller: NEW_KEY }
      })
    })

    expect(view.text()).toContain(t('socialRecovery.writes.cancelRevertedTitle'))
    expect(view.text()).toContain(display.renderFullAddress(NEW_KEY))
    expect(view.textOf('cancel-move-funds')).toBe(t('socialRecovery.cancel.reverted.moveFunds'))
    expect(view.text()).not.toContain(t('socialRecovery.writes.tryAgain'))
  })

  it('reads a revert after another road with that road and no move funds', async () => {
    view = await render({
      run: withWrite({
        status: 'failedReverted',
        write: 'cancel',
        run: 1,
        transactionHash: TX_HASH,
        receipt: RECEIPT,
        cause: { kind: 'attemptGone', ended: 'cancelByProofs' }
      })
    })

    expect(view.text()).toContain(t('socialRecovery.writes.cancelGoneRoad.cancelByProofs'))
    expect(view.byTestId('cancel-move-funds')).toBeNull()
  })

  it('ends on the cancelled terminal with its lines, replace them, move funds and done', async () => {
    view = await render({
      run: withWrite(LANDED, { after: { stage: 'cancelled', attemptId: 4n } })
    })

    expect(view.textOf('cancel-cancelled-eyebrow')).toBe(
      t('socialRecovery.cancel.cancelled.eyebrow')
    )
    expect(view.textOf('cancel-cancelled-title')).toBe(t('socialRecovery.cancel.cancelled.title'))
    expect(view.textOf('cancel-cancelled-body')).toBe(t('socialRecovery.cancel.cancelled.body'))
    expect(view.textOf('cancel-cancelled-only-own-key')).toBe(
      t('socialRecovery.watcher.banner.onlyOwnKey')
    )
    const actions = Array.from(document.querySelectorAll('[tabindex]')).map(
      (node) => node.textContent
    )
    expect(actions).toEqual(
      expect.arrayContaining([
        t('socialRecovery.cancel.cancelled.replace'),
        t('socialRecovery.cancel.cancelled.moveFunds'),
        t('socialRecovery.cancel.cancelled.done')
      ])
    )
    expect(view.textOf('cancel-replace')).toBe(t('socialRecovery.cancel.cancelled.replace'))
    expect(view.textOf('cancel-move-funds')).toBe(t('socialRecovery.cancel.cancelled.moveFunds'))
    expect(view.textOf('cancel-done')).toBe(t('socialRecovery.cancel.cancelled.done'))

    await view.press('cancel-replace')
    expect(mockNavigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryManage)
    await view.press('cancel-move-funds')
    expect(props.onMoveFunds).toHaveBeenCalled()
    await view.press('cancel-done')
    expect(props.onDone).toHaveBeenCalled()
  })

  it('names the attempt the cancel ended by its new key on the terminal', async () => {
    view = await render({
      run: withWrite(LANDED, { after: { stage: 'cancelled', attemptId: 5n, newKey: OLD_KEY } })
    })

    expect(view.textOf('cancel-cancelled-new-key')).toBe(display.renderFullAddress(OLD_KEY))
  })

  it('shows the terminal a followed cancel reached with no write of its own', async () => {
    view = await render({
      run: { ...initialCancelState(), target: 4n, after: { stage: 'cancelled', attemptId: 4n } }
    })

    expect(view.textOf('cancel-cancelled-title')).toBe(t('socialRecovery.cancel.cancelled.title'))
  })

  it('names the other road that ended the attempt first, with done, no move funds and no replace', async () => {
    view = await render({
      run: withWrite(LANDED, { after: { stage: 'otherRoad', attemptId: 4n, road: 'setupWrite' } })
    })

    expect(view.textOf('cancel-other-road')).toBe(
      t('socialRecovery.cancel.cancelled.otherRoad', {
        road: t('socialRecovery.writes.cancelGoneRoad.setupWrite')
      })
    )
    expect(view.byTestId('cancel-move-funds')).toBeNull()
    expect(view.byTestId('cancel-replace')).toBeNull()
    expect(view.byTestId('cancel-done')).not.toBeNull()
  })
})
