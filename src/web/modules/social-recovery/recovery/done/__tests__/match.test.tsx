/**
 * @jest-environment jsdom
 *
 * Whose consume the done screen takes. While the countdown's record names the
 * attempt this device landed, the consume is ours only where the manager's
 * attempt carries that attempt's id, setup number and payload hash, and no
 * opening under the id before the consume carries another: the manager hands
 * the next id to whoever opens next. A record that does not name its attempt,
 * or a countdown read that fails, renders failed with retry and reads no
 * consume. With no countdown, whether or not the entry record is there,
 * nothing names this device's attempt: the screen adds nothing and renders
 * only for an account the wallet lists with the granted key.
 */
import {
  ADD_ACTION,
  attemptConsumed,
  attemptStarted,
  CHAIN_ID,
  CONSUME_BLOCK,
  dispatchedOf,
  landRecordWithoutAttempt,
  mockWallet,
  mountDone,
  NEW_KEY,
  openWorld,
  PASSWORD,
  PAYLOAD_HASH,
  recoveryPrivileges,
  REMOVED_KEY,
  reportSelected,
  setWallet,
  t,
  tick,
  useDoneClock
} from '@web/modules/social-recovery/recovery/done/__tests__/harness'
import type {
  FakeChain,
  Mounted,
  World
} from '@web/modules/social-recovery/recovery/done/__tests__/harness'
import { ADD_LIMIT_MS } from '@web/modules/social-recovery/recovery/done'
import { POLL_LIMIT_MS } from '@web/modules/social-recovery/recovery/checklist/constants'
import { accountStepPath, waitPathOf } from '@web/modules/social-recovery/recovery/checklist'
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'
import {
  readRecoveryPassword,
  setRecoveryPassword
} from '@web/modules/social-recovery/shared/records'
import { keccak256 } from 'viem'

useDoneClock()

const RIVAL_PAYLOAD: Hex = '0xbad0'
/** The key a rival's consume grants. */
const RIVAL_KEY: Address = '0x00000000000000000000000000000000000bad01'

/** The keys the wallet lists the account with, none where it does not list it. */
const listedKeysOf = (account: string) =>
  (mockWallet.accounts ?? [])
    .filter((candidate) => candidate.addr.toLowerCase() === account.toLowerCase())
    .flatMap((candidate) => candidate.associatedKeys)

/** The records the last act clears, as they stand. */
const recordsOf = async ({ records, account }: World) => ({
  countdown: await records.countdown(CHAIN_ID, account).read(),
  entry: await records.recoveryEntry(CHAIN_ID, account).read(),
  cache: (await records.decryptedSetupCache(CHAIN_ID, account).read()).status,
  password: readRecoveryPassword(CHAIN_ID, account)
})

/** Nothing of done renders and nothing goes to the wallet. */
const expectNothingDone = (screen: Mounted) => {
  expect(screen.has('done')).toBe(false)
  expect(screen.has('done-adding')).toBe(false)
  expect(screen.text()).not.toContain(t('socialRecovery.done.title'))
  expect(screen.text()).not.toContain(renderFullAddress(NEW_KEY))
  expect(mockWallet.dispatch).not.toHaveBeenCalled()
}

/** A fast-track recovery with the recovery password held, whose landed attempt the chain then changes. */
const openLanded = async (options: Parameters<typeof openWorld>[0] = {}) => {
  const world = await openWorld({ route: 'fresh-install', ...options })
  setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
  return world
}

describe('a consume under the landed attempt id that is not the landed attempt', () => {
  const rivals: { name: string; change: (world: World) => Partial<FakeChain> }[] = [
    {
      name: 'the manager attempt carries another payload hash',
      change: ({ kit }) => ({
        attempt: { ...kit.chain.attempt, payloadHash: keccak256(RIVAL_PAYLOAD) }
      })
    },
    {
      name: 'the manager attempt carries another setup nonce',
      change: ({ kit }) => ({ attempt: { ...kit.chain.attempt, setupNonce: 2n } })
    },
    {
      name: 'an opening with another payload comes before the consume',
      change: ({ account }) => ({
        accountEvents: [
          attemptStarted(account, [0, 1, 3], 1n, undefined, { payload: RIVAL_PAYLOAD }),
          attemptConsumed(account)
        ]
      })
    },
    {
      name: 'an opening with another setup nonce comes before the consume',
      change: ({ account }) => ({
        accountEvents: [
          attemptStarted(account, [0, 1, 3], 1n, undefined, { setupNonce: 2n }),
          attemptConsumed(account)
        ]
      })
    },
    {
      name: 'a rival opening comes before ours under the same id',
      change: ({ account }) => ({
        accountEvents: [
          attemptStarted(account, [0], 1n, CONSUME_BLOCK - 200, { payload: RIVAL_PAYLOAD }),
          attemptStarted(account, [0, 1, 3], 1n, CONSUME_BLOCK - 100),
          attemptConsumed(account)
        ]
      })
    }
  ]

  rivals.forEach(({ name, change }) => {
    it(`answers none where ${name}: back to the wait, nothing dispatched, the records unchanged`, async () => {
      const world = await openLanded()
      Object.assign(world.kit.chain, change(world))
      const before = await recordsOf(world)
      const screen = await mountDone(world.account)
      expect(screen.paths()).toEqual([waitPathOf(world.account)])
      expect(mockWallet.navigate.mock.calls[0][1]).toEqual({ replace: true })
      expectNothingDone(screen)
      await tick(ADD_LIMIT_MS + 1)
      expect(mockWallet.dispatch).not.toHaveBeenCalled()
      expect(await recordsOf(world)).toEqual(before)
      expect(before.countdown.status).toBe('present')
      expect(before.entry.status).toBe('present')
      expect(before.password).toBe(PASSWORD)
      screen.unmount()
    })
  })
})

describe('the consume of the landed attempt', () => {
  it('renders done for a manager attempt and an opening that match by id, setup nonce and payload hash', async () => {
    const world = await openLanded({ walletAdds: true })
    expect(world.kit.chain.attempt.payloadHash).toBe(PAYLOAD_HASH)
    const screen = await mountDone(world.account)
    expect(screen.has('done')).toBe(true)
    expect(screen.textOf('done-controlled-by')).toBe(renderFullAddress(NEW_KEY))
    expect(screen.textOf('done-removed')).toBe(renderFullAddress(REMOVED_KEY))
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    expect(screen.paths()).toEqual([])
    screen.unmount()
  })

  it('renders done for a consume with no opening event where the manager attempt matches', async () => {
    const world = await openLanded({ walletAdds: true })
    world.kit.chain.accountEvents = [attemptConsumed(world.account)]
    const screen = await mountDone(world.account)
    expect(screen.has('done')).toBe(true)
    expect(screen.textOf('done-controlled-by')).toBe(renderFullAddress(NEW_KEY))
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    expect(screen.paths()).toEqual([])
    screen.unmount()
  })

  it('ignores an opening under another attempt id', async () => {
    const world = await openLanded({ walletAdds: true, attempt: 2 })
    const { account, kit } = world
    kit.chain.attempt = { ...kit.chain.attempt, attemptId: 2n }
    kit.chain.accountEvents = [
      attemptStarted(account, [0], 1n, CONSUME_BLOCK - 300, { payload: RIVAL_PAYLOAD }),
      attemptStarted(account, [0, 1, 3], 2n, CONSUME_BLOCK - 100),
      attemptConsumed(account, 2n)
    ]
    const screen = await mountDone(account)
    expect(screen.has('done')).toBe(true)
    expect(screen.paths()).toEqual([])
    screen.unmount()
  })
})

describe('a countdown that does not tell the landed attempt', () => {
  it('renders failed with retry for a record stored without the landed attempt, and reads no consume', async () => {
    const world = await openLanded({ countdown: false, walletAdds: true })
    await landRecordWithoutAttempt(world)
    const before = await recordsOf(world)
    expect(before.countdown.status).toBe('present')
    const screen = await mountDone(world.account)
    expect(screen.has('done-read-failed')).toBe(true)
    expect(screen.has('done-read-failed-retry')).toBe(true)
    expectNothingDone(screen)
    expect(world.kit.recoveryState).not.toHaveBeenCalled()
    expect(world.kit.fetch).not.toHaveBeenCalled()

    await screen.press('done-read-failed-retry')
    expect(screen.has('done-read-failed')).toBe(true)
    expectNothingDone(screen)
    expect(world.kit.recoveryState).not.toHaveBeenCalled()
    await tick(ADD_LIMIT_MS + 1)
    expect(screen.paths()).toEqual([])
    expect(await recordsOf(world)).toEqual(before)
    screen.unmount()
  })

  it('renders failed with retry where the countdown read throws, reads no consume, and the retry reads it again', async () => {
    const world = await openLanded({ walletAdds: true })
    const { get } = world.storage
    let countdownReads = 0
    let failing = true
    world.storage.get = async (...args: Parameters<typeof get>) => {
      if (String(args[0]).includes('recoverySession')) {
        countdownReads += 1
        if (failing) {
          throw new Error('storage unavailable')
        }
      }
      return get(...args)
    }
    const screen = await mountDone(world.account)
    expect(screen.has('done-read-failed')).toBe(true)
    expectNothingDone(screen)
    expect(world.kit.recoveryState).not.toHaveBeenCalled()
    expect(screen.paths()).toEqual([])
    const reads = countdownReads
    expect(reads).toBeGreaterThan(0)

    failing = false
    await screen.press('done-read-failed-retry')
    expect(countdownReads).toBeGreaterThan(reads)
    expect(screen.has('done')).toBe(true)
    expect(screen.textOf('done-controlled-by')).toBe(renderFullAddress(NEW_KEY))
    screen.unmount()
  })
})

describe('the countdown read once per mount', () => {
  it('keeps the landed match through Close: no second consume read, and done stays', async () => {
    const world = await openLanded({ walletAdds: true })
    const screen = await mountDone(world.account)
    expect(screen.has('done')).toBe(true)
    const reads = world.kit.recoveryState.mock.calls.length
    await screen.press('done-close')
    expect((await recordsOf(world)).countdown.status).toBe('absent')
    expect(screen.paths()).toEqual(['/dashboard'])
    await tick(POLL_LIMIT_MS + 1)
    expect(world.kit.recoveryState.mock.calls.length).toBe(reads)
    expect(screen.has('done')).toBe(true)
    expect(screen.has('done-loading')).toBe(false)
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })

  it('keeps the landed match through Edit: no second consume read, and the editor opens once selected', async () => {
    const world = await openLanded({ walletAdds: true })
    mockWallet.holdsSelection = true
    const screen = await mountDone(world.account)
    expect(screen.has('done')).toBe(true)
    const reads = world.kit.recoveryState.mock.calls.length
    await screen.press('done-edit')
    expect((await recordsOf(world)).countdown.status).toBe('absent')
    await tick(POLL_LIMIT_MS + 1)
    expect(world.kit.recoveryState.mock.calls.length).toBe(reads)
    expect(screen.has('done')).toBe(true)
    expect(screen.has('done-loading')).toBe(false)
    await reportSelected(world.account)
    expect(screen.paths()).toEqual(['/social-recovery/setup/editor'])
    screen.unmount()
  })
})

describe('neither the countdown nor the entry record', () => {
  it('renders no done screen for a listing without the granted key, dispatches no add, and goes to the account step', async () => {
    const world = await openWorld({
      route: 'fresh-install',
      entry: false,
      countdown: false,
      listed: 'without-key',
      walletAdds: true
    })
    const screen = await mountDone(world.account)
    expect(screen.paths()).toEqual([accountStepPath()])
    expect(mockWallet.navigate.mock.calls[0][1]).toEqual({ replace: true })
    expectNothingDone(screen)
    await tick(ADD_LIMIT_MS + 1)
    expect(mockWallet.dispatch).not.toHaveBeenCalled()
    expect(screen.has('done-add-failed')).toBe(false)
    expect(screen.has('done')).toBe(false)
    expect(screen.paths()).toEqual([accountStepPath()])
    screen.unmount()
  })

  it('renders done with nothing dispatched for a listing with the granted key', async () => {
    const world = await openWorld({
      route: 'fresh-install',
      entry: false,
      countdown: false,
      listed: true
    })
    const screen = await mountDone(world.account)
    expect(screen.has('done')).toBe(true)
    expect(screen.textOf('done-controlled-by')).toBe(renderFullAddress(NEW_KEY))
    expect(screen.has('done-now-in-wallet')).toBe(false)
    await tick(ADD_LIMIT_MS + 1)
    expect(mockWallet.dispatch).not.toHaveBeenCalled()
    expect(screen.has('done-add-failed')).toBe(false)
    expect(screen.paths()).toEqual([])
    screen.unmount()
  })

  it('offers no add failure while the wallet accounts go and come back without the key, and adds nothing', async () => {
    const world = await openWorld({
      route: 'fresh-install',
      entry: false,
      countdown: false,
      listed: 'without-key',
      walletAdds: true
    })
    const screen = await mountDone(world.account)
    const listing = mockWallet.accounts
    await setWallet({ accounts: undefined })
    await tick(ADD_LIMIT_MS + 1)
    expect(screen.has('done-add-failed')).toBe(false)
    expect(screen.has('done')).toBe(false)
    await setWallet({ accounts: listing })
    await tick(ADD_LIMIT_MS + 1)
    expect(screen.has('done-add-failed')).toBe(false)
    expect(screen.has('done')).toBe(false)
    expect(mockWallet.dispatch).not.toHaveBeenCalled()
    expect(screen.paths().every((path) => path === accountStepPath())).toBe(true)
    screen.unmount()
  })
})

describe('an entry record with no countdown', () => {
  /** The wallet adds nothing, offers no add failure, and the screen goes to the wait. */
  const expectToWait = async (screen: Mounted, account: Address) => {
    expect(screen.paths()).toEqual([waitPathOf(account)])
    expect(mockWallet.navigate.mock.calls[0][1]).toEqual({ replace: true })
    expectNothingDone(screen)
    await tick(ADD_LIMIT_MS + 1)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(0)
    expect(screen.has('done-add-failed')).toBe(false)
    expect(screen.has('done')).toBe(false)
  }

  const routes = ['fresh-install', 'logged-in'] as const
  routes.forEach((route) => {
    it(`on the ${route} route adds nothing for an account the wallet does not list, and goes to the wait`, async () => {
      const world = await openWorld({ route, countdown: false, walletAdds: true })
      const screen = await mountDone(world.account)
      await expectToWait(screen, world.account)
      expect((await recordsOf(world)).entry.status).toBe('present')
      screen.unmount()
    })
  })

  it('adds nothing for an account the wallet lists without the granted key, and goes to the wait', async () => {
    const world = await openWorld({
      route: 'fresh-install',
      countdown: false,
      listed: 'without-key',
      walletAdds: true
    })
    const screen = await mountDone(world.account)
    await expectToWait(screen, world.account)
    screen.unmount()
  })

  it('renders done with no add for an account the wallet lists with the granted key', async () => {
    const world = await openWorld({ route: 'fresh-install', countdown: false, listed: true })
    const screen = await mountDone(world.account)
    expect(screen.has('done')).toBe(true)
    expect(screen.textOf('done-controlled-by')).toBe(renderFullAddress(NEW_KEY))
    await tick(ADD_LIMIT_MS + 1)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(0)
    expect(screen.has('done-add-failed')).toBe(false)
    expect(screen.paths()).toEqual([])
    screen.unmount()
  })

  it('adds no rival key: a consume that grants another key goes to the wait where the wallet lists ours', async () => {
    const world = await openWorld({
      route: 'fresh-install',
      countdown: false,
      listed: true,
      walletAdds: true
    })
    world.kit.chain.accountEvents = [
      attemptStarted(world.account, [0], 1n, undefined, { payload: RIVAL_PAYLOAD }),
      attemptConsumed(world.account)
    ]
    world.kit.chain.attempt = { ...world.kit.chain.attempt, payloadHash: keccak256(RIVAL_PAYLOAD) }
    world.kit.chain.privilegeEvents = recoveryPrivileges(world.account, { granted: RIVAL_KEY })
    const screen = await mountDone(world.account)
    await expectToWait(screen, world.account)
    expect(screen.text()).not.toContain(renderFullAddress(RIVAL_KEY))
    expect(listedKeysOf(world.account)).toEqual([NEW_KEY])
    screen.unmount()
  })

  it('adds no rival key where the wallet does not list the account', async () => {
    const world = await openWorld({ route: 'fresh-install', countdown: false, walletAdds: true })
    world.kit.chain.privilegeEvents = recoveryPrivileges(world.account, { granted: RIVAL_KEY })
    const screen = await mountDone(world.account)
    await expectToWait(screen, world.account)
    expect(listedKeysOf(world.account)).toEqual([])
    screen.unmount()
  })
})

// Jest fails a test in which a promise rejects with no handler.
describe('the reads settle', () => {
  it('leaves no unhandled rejection where the consume and the setup reads throw, hang, or outlive the screen', async () => {
    const world = await openLanded({ cache: false, walletAdds: true })
    world.kit.chain.failing = true
    world.kit.getSetup.mockImplementation(async () => {
      throw new Error('the setup read failed')
    })
    const screen = await mountDone(world.account)
    expect(screen.has('done-read-failed')).toBe(true)

    world.kit.chain.failing = false
    world.kit.chain.hanging = true
    await screen.press('done-read-failed-retry')
    expect(screen.has('done-loading')).toBe(true)
    await tick(POLL_LIMIT_MS + 1)
    expect(screen.has('done-read-failed')).toBe(true)
    await screen.press('done-read-failed-retry')
    screen.unmount()
    await tick(POLL_LIMIT_MS + 1)
    expect(mockWallet.dispatch).not.toHaveBeenCalled()
  })
})
