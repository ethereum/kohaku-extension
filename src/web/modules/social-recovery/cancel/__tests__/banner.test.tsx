/**
 * @jest-environment jsdom
 */
import type { Account } from '@ambire-common/interfaces/account'
import type { Address } from '@kohaku-eth/social-recovery'
import type { WatcherRecord } from '@web/modules/social-recovery/watcher'

// viem builds a TextEncoder and a TextDecoder when either entry loads, which
// jsdom lacks: Node's own are installed first, whichever entry loads first.
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

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const fixtures: typeof import('@web/modules/social-recovery/cancel/__fixtures__/mount') = require('@web/modules/social-recovery/cancel/__fixtures__/mount')
const watcherFixtures: typeof import('@web/modules/social-recovery/watcher/__fixtures__/harness') = require('@web/modules/social-recovery/watcher/__fixtures__/harness')
const runFixtures: typeof import('@web/modules/social-recovery/cancel/__fixtures__/run') = require('@web/modules/social-recovery/cancel/__fixtures__/run')
const display: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
const watcher: typeof import('@web/modules/social-recovery/watcher') = require('@web/modules/social-recovery/watcher')
const {
  pollOnce
}: typeof import('@web/modules/social-recovery/cancel') = require('@web/modules/social-recovery/cancel')
const RecoveryAttemptBannerView: typeof import('@web/modules/social-recovery/cancel/RecoveryAttemptBannerView').default =
  require('@web/modules/social-recovery/cancel/RecoveryAttemptBannerView').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const { act, mount, t, watchedStorage, storeRecord, hooksOver } = fixtures
const { ACCOUNT, OTHER_ACCOUNT, NEW_KEY, HEAD, HEAD_TIME, SEPOLIA, ENDED_TIME } = watcherFixtures
const ZONE = 'UTC'

const smartAccount = (addr: Address, label: string): Account => ({
  ...watcherFixtures.listed(addr),
  preferences: { label, pfp: addr }
})

const openRecord = (
  overrides: Partial<NonNullable<WatcherRecord['reading']>> = {},
  attempt: Partial<NonNullable<NonNullable<WatcherRecord['reading']>['attempt']>> = {}
): WatcherRecord => ({
  reading: {
    account: ACCOUNT,
    block: { number: HEAD, timestamp: HEAD_TIME },
    hasSetup: true,
    dormant: false,
    attempt: {
      attemptId: 4n,
      setupNonce: 1n,
      payloadHash: `0x${'11'.repeat(32)}`,
      consumableAfter: HEAD_TIME + 3600,
      executionDue: false,
      newKey: NEW_KEY,
      ...attempt
    },
    deployment: watcherFixtures.DEPLOYMENT,
    ...overrides
  },
  dismissed: []
})

const dateOf = (seconds: number) => display.renderDateTimeInZone(seconds * 1000, ZONE).date

describe('the recovery banner', () => {
  let world: ReturnType<typeof watchedStorage>
  let onCancel: jest.Mock
  let onDismiss: jest.Mock
  let onRetry: jest.Mock
  let view: Awaited<ReturnType<typeof mount>> | undefined

  const render = (accounts: Account[]) =>
    mount(
      <RecoveryAttemptBannerView
        accounts={accounts}
        {...hooksOver(world)}
        onCancel={onCancel}
        onDismiss={onDismiss}
        onRetry={onRetry}
        timeZone={ZONE}
      />
    )

  beforeEach(() => {
    world = watchedStorage()
    onCancel = jest.fn()
    onDismiss = jest.fn((account: Address, attemptId: bigint) =>
      watcher.dismissAttempt(SEPOLIA, account, attemptId, world.storage)
    )
    onRetry = jest.fn(async () => undefined)
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const id = ACCOUNT.toLowerCase()

  it('names the new key in full, the end, the countdown, both actions and the two sentences, and never guardians', async () => {
    await storeRecord(world, SEPOLIA, ACCOUNT, openRecord())
    view = await render([smartAccount(ACCOUNT, 'Main')])

    expect(view.textOf(`recovery-banner-${id}`)).toContain(t('socialRecovery.watcher.banner.title'))
    expect(view.textOf(`recovery-banner-${id}-new-key`)).toBe(display.renderFullAddress(NEW_KEY))
    expect(view.textOf(`recovery-banner-${id}-finishes`)).toBe(
      t('socialRecovery.watcher.banner.finishes', { date: dateOf(HEAD_TIME + 3600) })
    )
    expect(view.textOf(`recovery-banner-${id}-countdown`)).toBe(
      t('socialRecovery.watcher.banner.waiting', { countdown: '01:00:00' })
    )
    expect(view.textOf(`recovery-banner-${id}-not-me`)).toBe(
      t('socialRecovery.watcher.banner.notMe')
    )
    expect(view.textOf(`recovery-banner-${id}-is-me`)).toBe(t('socialRecovery.watcher.banner.isMe'))
    expect(view.textOf(`recovery-banner-${id}-hides-only`)).toBe(
      t('socialRecovery.watcher.banner.hidesOnly')
    )
    expect(view.textOf(`recovery-banner-${id}-only-own-key`)).toBe(
      t('socialRecovery.watcher.banner.onlyOwnKey')
    )
    expect(view.textOf(`recovery-banner-${id}-edit-cancels`)).toBe(
      t('socialRecovery.watcher.banner.editCancels')
    )
    expect(view.text().toLowerCase()).not.toContain('guardian')
    // One account listed: no account line.
    expect(view.byTestId(`recovery-banner-${id}-account`)).toBeNull()

    await view.press(`recovery-banner-${id}-not-me`)
    expect(onCancel).toHaveBeenCalledWith(ACCOUNT)
  })

  it('reads the new key as pending while the opening is not decoded', async () => {
    await storeRecord(
      world,
      SEPOLIA,
      ACCOUNT,
      openRecord({}, { newKey: undefined, openingGap: 'not-found' })
    )
    view = await render([smartAccount(ACCOUNT, 'Main')])

    expect(view.textOf(`recovery-banner-${id}-new-key`)).toBe(
      t('socialRecovery.watcher.banner.newKeyPending')
    )
    expect(view.byTestId(`recovery-banner-${id}-countdown`)).not.toBeNull()
  })

  it('reads execution due with the day the wait ended, and keeps both actions', async () => {
    await storeRecord(
      world,
      SEPOLIA,
      ACCOUNT,
      openRecord({}, { consumableAfter: HEAD_TIME - 60, executionDue: true })
    )
    view = await render([smartAccount(ACCOUNT, 'Main')])

    expect(view.textOf(`recovery-banner-${id}-chip`)).toBe(
      t('socialRecovery.watcher.banner.executionDue')
    )
    expect(view.textOf(`recovery-banner-${id}-due`)).toBe(
      t('socialRecovery.watcher.banner.dueBody', { date: dateOf(HEAD_TIME - 60) })
    )
    expect(view.textOf(`recovery-banner-${id}-due-cancel`)).toBe(
      t('socialRecovery.watcher.banner.dueCancel')
    )
    expect(view.byTestId(`recovery-banner-${id}-countdown`)).toBeNull()
    expect(view.byTestId(`recovery-banner-${id}-not-me`)).not.toBeNull()
    expect(view.byTestId(`recovery-banner-${id}-is-me`)).not.toBeNull()
  })

  it('reads the dormant line in place of the countdown, and still offers the cancel', async () => {
    await storeRecord(world, SEPOLIA, ACCOUNT, openRecord({ dormant: true }))
    view = await render([smartAccount(ACCOUNT, 'Main')])

    expect(view.textOf(`recovery-banner-${id}-dormant`)).toBe(
      t('socialRecovery.watcher.banner.dormant')
    )
    expect(view.byTestId(`recovery-banner-${id}-countdown`)).toBeNull()
    expect(view.byTestId(`recovery-banner-${id}-finishes`)).toBeNull()
    expect(view.byTestId(`recovery-banner-${id}-not-me`)).not.toBeNull()
  })

  it('reads the dormant line alone where the attempt is also due', async () => {
    await storeRecord(
      world,
      SEPOLIA,
      ACCOUNT,
      openRecord({ dormant: true }, { consumableAfter: HEAD_TIME - 60, executionDue: true })
    )
    view = await render([smartAccount(ACCOUNT, 'Main')])

    expect(view.textOf(`recovery-banner-${id}-dormant`)).toBe(
      t('socialRecovery.watcher.banner.dormant')
    )
    expect(view.byTestId(`recovery-banner-${id}-chip`)).toBeNull()
    expect(view.byTestId(`recovery-banner-${id}-due`)).toBeNull()
    expect(view.byTestId(`recovery-banner-${id}-due-cancel`)).toBeNull()
    expect(view.byTestId(`recovery-banner-${id}-not-me`)).not.toBeNull()
  })

  it("ticks the countdown each second on the view's own clock", async () => {
    // The countdown's ticks are held by the test, so each one runs when the test says a second passed.
    const ticks: (() => void)[] = []
    const intervals = jest.spyOn(window, 'setInterval').mockImplementation((handler) => {
      ticks.push(() => handler())
      // A timer that never repeats stands for the interval's handle.
      return setTimeout(() => undefined, 0)
    })
    try {
      await storeRecord(world, SEPOLIA, ACCOUNT, openRecord())
      view = await render([smartAccount(ACCOUNT, 'Main')])
      expect(view.textOf(`recovery-banner-${id}-countdown`)).toBe(
        t('socialRecovery.watcher.banner.waiting', { countdown: '01:00:00' })
      )
      for (let second = 0; second < 3; second += 1) {
        act(() => ticks.forEach((tick) => tick()))
      }
      expect(view.textOf(`recovery-banner-${id}-countdown`)).toBe(
        t('socialRecovery.watcher.banner.waiting', { countdown: '00:59:57' })
      )
    } finally {
      intervals.mockRestore()
    }
  })

  it('reads a failed poll as failed, with the last check and the retry, and keeps the attempt under it', async () => {
    await storeRecord(world, SEPOLIA, ACCOUNT, {
      ...openRecord(),
      failed: { at: HEAD_TIME * 1000 + 120_000, message: 'node down' }
    })
    view = await render([smartAccount(ACCOUNT, 'Main')])

    expect(view.textOf(`recovery-banner-${id}`)).toContain(t('socialRecovery.watcher.failed.title'))
    expect(view.textOf(`recovery-banner-${id}`)).toContain(t('socialRecovery.watcher.failed.body'))
    expect(view.textOf(`recovery-banner-${id}-last-read`)).toBe(
      t('socialRecovery.watcher.failed.lastRead', { date: dateOf(HEAD_TIME) })
    )
    expect(view.textOf(`recovery-banner-${id}-new-key`)).toBe(display.renderFullAddress(NEW_KEY))
    expect(view.byTestId(`recovery-banner-${id}-not-me`)).not.toBeNull()

    await view.press(`recovery-banner-${id}-retry`)
    expect(onRetry).toHaveBeenCalledWith(ACCOUNT)
  })

  it('runs one poll on retry and follows the record it writes', async () => {
    await storeRecord(world, SEPOLIA, ACCOUNT, {
      reading: { ...openRecord().reading!, attempt: undefined },
      failed: { at: HEAD_TIME * 1000, message: 'node down' },
      dismissed: []
    })
    const chain = runFixtures.openChain()
    const destroy = jest.fn()
    onRetry = jest.fn((account: Address) =>
      pollOnce({
        account,
        network: { chainId: BigInt(SEPOLIA) } as never,
        deployment: () => watcherFixtures.DEPLOYMENT as never,
        connect: () => ({ reads: chain.reads, providerKey: 'test', destroy }),
        storage: world.storage
      })
    )
    view = await render([smartAccount(ACCOUNT, 'Main')])
    expect(view.textOf(`recovery-banner-${id}`)).toContain(t('socialRecovery.watcher.failed.title'))
    expect(view.byTestId(`recovery-banner-${id}-attempt`)).toBeNull()

    await view.press(`recovery-banner-${id}-retry`)

    expect(chain.reads.latestBlock).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(view.textOf(`recovery-banner-${id}`)).not.toContain(
      t('socialRecovery.watcher.failed.title')
    )
    expect(view.textOf(`recovery-banner-${id}-new-key`)).toBe(display.renderFullAddress(NEW_KEY))
  })

  it('hides one attempt on "it is me", and warns again for the next attempt', async () => {
    await storeRecord(world, SEPOLIA, ACCOUNT, openRecord())
    view = await render([smartAccount(ACCOUNT, 'Main')])

    await view.press(`recovery-banner-${id}-is-me`)
    expect(onDismiss).toHaveBeenCalledWith(ACCOUNT, 4n)
    const record = await watcher.readWatcherRecord(world.storage, SEPOLIA, ACCOUNT)
    expect(record?.dismissed).toEqual([4n])
    expect(view.byTestId(`recovery-banner-${id}`)).toBeNull()

    await storeRecord(world, SEPOLIA, ACCOUNT, {
      ...openRecord({}, { attemptId: 5n }),
      dismissed: [4n]
    })
    await fixtures.settle()
    expect(view.byTestId(`recovery-banner-${id}`)).not.toBeNull()
  })

  it("reads a record that cannot be read as failed, with the hook's retry", async () => {
    const retry = jest.fn()
    view = await mount(
      <RecoveryAttemptBannerView
        accounts={[smartAccount(ACCOUNT, 'Main')]}
        useAttempt={() => ({ status: 'failed', retry })}
        useDismissed={() => undefined}
        onCancel={onCancel}
        onDismiss={onDismiss}
        onRetry={onRetry}
        timeZone={ZONE}
      />
    )

    expect(view.textOf(`recovery-banner-${id}`)).toContain(t('socialRecovery.watcher.failed.title'))
    expect(view.textOf(`recovery-banner-${id}`)).toContain(t('socialRecovery.watcher.failed.body'))
    expect(view.byTestId(`recovery-banner-${id}-attempt`)).toBeNull()
    await view.press(`recovery-banner-${id}-retry`)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('renders the executed notice with the controller and no cancel, until it is dismissed', async () => {
    await storeRecord(world, SEPOLIA, ACCOUNT, {
      reading: {
        ...openRecord().reading!,
        attempt: undefined,
        ended: { attemptId: 4n, road: 'executed', controller: NEW_KEY, at: ENDED_TIME }
      },
      dismissed: []
    })
    view = await render([smartAccount(ACCOUNT, 'Main')])

    expect(view.textOf(`recovery-banner-${id}`)).toContain(
      t('socialRecovery.watcher.executed.title')
    )
    expect(view.textOf(`recovery-banner-${id}`)).toContain(
      t('socialRecovery.watcher.executed.body', { date: dateOf(ENDED_TIME) })
    )
    expect(view.textOf(`recovery-banner-${id}-controller`)).toBe(display.renderFullAddress(NEW_KEY))
    expect(view.byTestId(`recovery-banner-${id}-not-me`)).toBeNull()

    await view.press(`recovery-banner-${id}-executed-dismiss`)
    expect(onDismiss).toHaveBeenCalledWith(ACCOUNT, 4n)
    expect(view.byTestId(`recovery-banner-${id}`)).toBeNull()
  })

  it('renders nothing for an attempt a cancel ended, for a dismissed attempt, and for an account not polled', async () => {
    await storeRecord(world, SEPOLIA, ACCOUNT, {
      reading: {
        ...openRecord().reading!,
        attempt: undefined,
        ended: { attemptId: 4n, road: 'cancelled', cancelledBy: 'cancelByOwner', at: ENDED_TIME }
      },
      dismissed: []
    })
    await storeRecord(world, SEPOLIA, OTHER_ACCOUNT, { ...openRecord(), dismissed: [4n] })
    const third = runFixtures.KEY
    view = await render([
      smartAccount(ACCOUNT, 'Main'),
      smartAccount(OTHER_ACCOUNT, 'Savings'),
      smartAccount(third, 'Spare')
    ])

    expect(view.byTestId(`recovery-banner-${id}`)).toBeNull()
    expect(view.byTestId(`recovery-banner-${OTHER_ACCOUNT.toLowerCase()}`)).toBeNull()
    expect(view.byTestId(`recovery-banner-${third.toLowerCase()}`)).toBeNull()
  })

  it('gives one banner per account with an attempt, each named by its account', async () => {
    await storeRecord(world, SEPOLIA, ACCOUNT, openRecord())
    await storeRecord(world, SEPOLIA, OTHER_ACCOUNT, openRecord({ account: OTHER_ACCOUNT }))
    view = await render([smartAccount(ACCOUNT, 'Main'), smartAccount(OTHER_ACCOUNT, 'Savings')])

    expect(view.textOf(`recovery-banner-${id}-account`)).toBe(
      t('socialRecovery.watcher.banner.account', {
        name: 'Main',
        address: display.renderShortAddress(ACCOUNT)
      })
    )
    expect(view.textOf(`recovery-banner-${OTHER_ACCOUNT.toLowerCase()}-account`)).toBe(
      t('socialRecovery.watcher.banner.account', {
        name: 'Savings',
        address: display.renderShortAddress(OTHER_ACCOUNT)
      })
    )
  })

  it('names an account with an empty label by its address alone', async () => {
    await storeRecord(world, SEPOLIA, ACCOUNT, openRecord())
    view = await render([smartAccount(ACCOUNT, ''), smartAccount(OTHER_ACCOUNT, 'Savings')])

    expect(view.textOf(`recovery-banner-${id}-account`)).toBe(display.renderShortAddress(ACCOUNT))
  })
})
