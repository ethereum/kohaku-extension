/**
 * @jest-environment jsdom
 *
 * On both routes the done screen adds the recovered account to this wallet
 * through the wallet's own action, once, beside the key the recovery granted;
 * it renders the done text only once the wallet lists the account with that
 * key, renders the add's failure with retry, and on the fast track only marks
 * the wallet's setup complete once the account is listed. An account the
 * wallet lists without the granted key is added again; one it lists with the
 * key is not. A mount again before the first add ended follows that add and
 * dispatches none of its own until a retry: while the first mount still builds
 * the account, after its dispatch and before the wallet reads the add running,
 * while it runs, and after it ended and before the wallet lists the account.
 */
import { dedicatedToOneSAPriv } from '@ambire-common/interfaces/keystore'
import { getSmartAccount } from '@ambire-common/libs/account/account'

import {
  ADD_ACTION,
  addedAccountOf,
  attemptStarted,
  dispatchedOf,
  mockWallet,
  mountDone,
  NEW_KEY,
  openWorld,
  ORIGINAL_PRIV,
  recoveryPrivileges,
  RECEIVING_ADDR,
  REMOVED_KEY,
  setWallet,
  SETUP_COMPLETE_ACTION,
  t,
  tick,
  useDoneClock,
  walletAddsIt
} from '@web/modules/social-recovery/recovery/done/__tests__/harness'
import type { Mounted } from '@web/modules/social-recovery/recovery/done/__tests__/harness'
import { ADD_LIMIT_MS } from '@web/modules/social-recovery/recovery/done'
import * as accountModule from '@web/modules/social-recovery/recovery/done/account'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'

useDoneClock()

const DONE = 'socialRecovery.done'

/** Nothing of the done text renders: no lead, no keys, no line that the account is in the wallet. */
const expectNoDoneText = (screen: Mounted) => {
  expect(screen.has('done')).toBe(false)
  expect(screen.has('done-lead')).toBe(false)
  expect(screen.has('done-controlled-by')).toBe(false)
  expect(screen.has('done-now-in-wallet')).toBe(false)
  expect(screen.text()).not.toContain(t(`${DONE}.nowInWallet`))
}

describe('the fast track adds the recovered account', () => {
  it('dispatches the add once with the account and the granted key, and renders the done text only once the wallet lists it', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const screen = await mountDone(world.account)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    const added = addedAccountOf()
    expect(added.addr).toBe(world.account)
    expect(added.associatedKeys).toEqual([NEW_KEY])
    expect(screen.has('done-adding')).toBe(true)
    expectNoDoneText(screen)

    await setWallet({ statuses: { addAccounts: 'LOADING' } })
    await tick(1000)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    expectNoDoneText(screen)

    await setWallet({
      accounts: [...(mockWallet.accounts ?? []), added],
      statuses: { addAccounts: 'SUCCESS' }
    })
    expect(screen.textOf('done-now-in-wallet')).toBe(t(`${DONE}.nowInWallet`))
    expect(screen.textOf('done-controlled-by')).toBe(renderFullAddress(NEW_KEY))
    expect(screen.has('done-lead')).toBe(true)
    await tick(ADD_LIMIT_MS * 2)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    expect(screen.has('done-add-failed')).toBe(false)
    screen.unmount()
  })

  it('builds the account creation from the privilege the removed key held, with the picker preferences', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const screen = await mountDone(world.account)
    const added = addedAccountOf()
    const expected = await getSmartAccount([{ addr: REMOVED_KEY, hash: ORIGINAL_PRIV }], [])
    expect(added.initialPrivileges).toEqual([[REMOVED_KEY, ORIGINAL_PRIV]])
    expect(added.creation).toEqual(expected.creation)
    expect(added.preferences.label).toBe('Account 3')
    expect(added.preferences.pfp).toBe(world.account)
    screen.unmount()
  })

  it('computes the creation with the stand-in privilege where no event names the removed key earlier', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    world.kit.chain.privilegeEvents = recoveryPrivileges(world.account, { creation: false })
    const screen = await mountDone(world.account)
    expect(addedAccountOf().initialPrivileges).toEqual([[REMOVED_KEY, dedicatedToOneSAPriv]])
    expect(addedAccountOf().associatedKeys).toEqual([NEW_KEY])
    screen.unmount()
  })

  it('marks the wallet setup complete once, and only after the wallet lists the account', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const screen = await mountDone(world.account)
    expect(dispatchedOf(SETUP_COMPLETE_ACTION)).toHaveLength(0)
    await walletAddsIt()
    expect(dispatchedOf(SETUP_COMPLETE_ACTION)).toEqual([
      { type: SETUP_COMPLETE_ACTION, params: { isSetupComplete: true } }
    ])
    await setWallet({ statuses: { addAccounts: 'INITIAL' } })
    expect(dispatchedOf(SETUP_COMPLETE_ACTION)).toHaveLength(1)
    screen.unmount()
  })

  it('renders the add failure with retry when the accounts controller reports an error, and the retry adds again', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const screen = await mountDone(world.account)
    await setWallet({ statuses: { addAccounts: 'LOADING' } })
    await setWallet({ statuses: { addAccounts: 'ERROR' } })
    expect(screen.has('done-add-failed')).toBe(true)
    expect(screen.text()).toContain(t(`${DONE}.addFailed`))
    expectNoDoneText(screen)
    expect(dispatchedOf(SETUP_COMPLETE_ACTION)).toHaveLength(0)

    await screen.press('done-add-retry')
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(2)
    expect(screen.has('done-adding')).toBe(true)
    await walletAddsIt()
    expect(screen.has('done-now-in-wallet')).toBe(true)
    expect(dispatchedOf(SETUP_COMPLETE_ACTION)).toHaveLength(1)
    screen.unmount()
  })

  it('does not read an error the controller held before this add started as its failure', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    mockWallet.statuses = { addAccounts: 'ERROR' }
    const screen = await mountDone(world.account)
    await tick(1000)
    expect(screen.has('done-adding')).toBe(true)
    expect(screen.has('done-add-failed')).toBe(false)
    screen.unmount()
  })

  it('renders the add failure with retry where the wallet does not list the account within the limit', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const screen = await mountDone(world.account)
    await tick(ADD_LIMIT_MS - 1000)
    expect(screen.has('done-adding')).toBe(true)
    await tick(2000)
    expect(screen.has('done-add-failed')).toBe(true)
    expectNoDoneText(screen)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    screen.unmount()
  })

  it('reads a listing that comes after the failure as done', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const screen = await mountDone(world.account)
    await tick(ADD_LIMIT_MS + 1000)
    expect(screen.has('done-add-failed')).toBe(true)
    await walletAddsIt()
    expect(screen.has('done-now-in-wallet')).toBe(true)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    screen.unmount()
  })

  it('dispatches no add for an account the wallet already lists, and renders done', async () => {
    const world = await openWorld({ route: 'fresh-install', listed: true })
    const screen = await mountDone(world.account)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(0)
    expect(screen.has('done-now-in-wallet')).toBe(true)
    screen.unmount()
  })

  it('adds nothing before the consume is read, and nothing where no consume exists', async () => {
    const pending = await openWorld({ route: 'fresh-install' })
    pending.kit.chain.hanging = true
    const waiting = await mountDone(pending.account)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(0)
    waiting.unmount()

    const none = await openWorld({ route: 'fresh-install' })
    none.kit.chain.accountEvents = [attemptStarted(none.account, [0])]
    const screen = await mountDone(none.account)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(0)
    screen.unmount()
  })
})

describe('the logged-in route adds the recovered account with the receiving account key', () => {
  it('dispatches the add once with the receiving account key, renders done only once listed, and never marks the setup complete', async () => {
    const world = await openWorld({ route: 'logged-in' })
    world.kit.chain.privilegeEvents = recoveryPrivileges(world.account, { granted: RECEIVING_ADDR })
    const screen = await mountDone(world.account)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    const added = addedAccountOf()
    expect(added.addr).toBe(world.account)
    expect(added.associatedKeys).toEqual([RECEIVING_ADDR])
    expect(screen.has('done-adding')).toBe(true)
    expectNoDoneText(screen)

    await walletAddsIt()
    expect(screen.has('done')).toBe(true)
    expect(screen.textOf('done-controlled-by')).toBe(renderFullAddress(RECEIVING_ADDR))
    expect(screen.textOf('done-controlled-by-line-0')).toBe(
      t(`${DONE}.sharedKey`, { account: 'Daily account' })
    )
    expect(screen.has('done-now-in-wallet')).toBe(false)
    await tick(ADD_LIMIT_MS * 2)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    expect(dispatchedOf(SETUP_COMPLETE_ACTION)).toHaveLength(0)
    screen.unmount()
  })

  it('renders the add failure with retry on the logged-in route too, and the retry adds again', async () => {
    const world = await openWorld({ route: 'logged-in' })
    const screen = await mountDone(world.account)
    await setWallet({ statuses: { addAccounts: 'LOADING' } })
    await setWallet({ statuses: { addAccounts: 'ERROR' } })
    expect(screen.has('done-add-failed')).toBe(true)
    expectNoDoneText(screen)
    await screen.press('done-add-retry')
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(2)
    await walletAddsIt()
    expect(screen.has('done')).toBe(true)
    expect(dispatchedOf(SETUP_COMPLETE_ACTION)).toHaveLength(0)
    screen.unmount()
  })
})

describe('an account the wallet already lists', () => {
  const routes = ['fresh-install', 'logged-in'] as const
  routes.forEach((route) => {
    it(`on the ${route} route adds an account listed without the granted key, and renders done once the key is merged in`, async () => {
      const world = await openWorld({ route, listed: 'without-key' })
      const screen = await mountDone(world.account)
      expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
      expect(addedAccountOf().addr).toBe(world.account)
      expect(addedAccountOf().associatedKeys).toEqual([NEW_KEY])
      expectNoDoneText(screen)
      await setWallet({
        accounts: (mockWallet.accounts ?? []).map((candidate) =>
          candidate.addr === world.account
            ? { ...candidate, associatedKeys: [...candidate.associatedKeys, NEW_KEY] }
            : candidate
        ),
        statuses: { addAccounts: 'SUCCESS' }
      })
      expect(screen.has('done')).toBe(true)
      expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
      expect(dispatchedOf(SETUP_COMPLETE_ACTION)).toHaveLength(route === 'fresh-install' ? 1 : 0)
      screen.unmount()
    })

    it(`on the ${route} route adds nothing for an account listed with the granted key, and renders done`, async () => {
      const world = await openWorld({ route, listed: true })
      const screen = await mountDone(world.account)
      expect(screen.has('done')).toBe(true)
      await tick(ADD_LIMIT_MS * 2)
      expect(dispatchedOf(ADD_ACTION)).toHaveLength(0)
      expect(screen.has('done-add-failed')).toBe(false)
      screen.unmount()
    })
  })
})

describe('the wallet account list going and coming back', () => {
  it('dispatches no second add while one add runs, nor once it is done', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const screen = await mountDone(world.account)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    const before = mockWallet.accounts
    await setWallet({ accounts: undefined })
    await setWallet({ accounts: before })
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    expect(screen.has('done-adding')).toBe(true)

    await walletAddsIt()
    expect(screen.has('done')).toBe(true)
    const listed = mockWallet.accounts
    await setWallet({ accounts: undefined })
    await setWallet({ accounts: listed })
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    expect(dispatchedOf(SETUP_COMPLETE_ACTION)).toHaveLength(1)
    expect(screen.has('done')).toBe(true)
    screen.unmount()
  })
})

describe('a mount again while the first add runs', () => {
  /** Mounts, lets the add start, and mounts again while the accounts controller still reads it loading. */
  const remountDuringAdd = async (route: 'fresh-install' | 'logged-in' = 'fresh-install') => {
    const world = await openWorld({ route })
    const first = await mountDone(world.account)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    await setWallet({ statuses: { addAccounts: 'LOADING' } })
    first.unmount()
    const screen = await mountDone(world.account)
    return { world, screen }
  }

  /** The wallet lists the account the first add sent, with the granted key. */
  const walletListsFirstAdd = () =>
    setWallet({
      accounts: [...(mockWallet.accounts ?? []), addedAccountOf()],
      statuses: { addAccounts: 'SUCCESS' }
    })

  /** The second mount sends nothing, reads done once the wallet lists the account, and sends nothing after. */
  const expectFollowedToDone = async (screen: Mounted) => {
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    expect(screen.has('done-adding')).toBe(true)
    expectNoDoneText(screen)
    await tick(1000)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)

    await walletListsFirstAdd()
    expect(screen.has('done')).toBe(true)
    expect(screen.textOf('done-controlled-by')).toBe(renderFullAddress(NEW_KEY))
    await tick(ADD_LIMIT_MS * 2)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    expect(screen.has('done-add-failed')).toBe(false)
  }

  const routes = ['fresh-install', 'logged-in'] as const
  routes.forEach((route) => {
    it(`on the ${route} route dispatches no second add and reads done once the wallet lists the account with the key`, async () => {
      const { screen } = await remountDuringAdd(route)
      await expectFollowedToDone(screen)
      expect(dispatchedOf(SETUP_COMPLETE_ACTION)).toHaveLength(route === 'fresh-install' ? 1 : 0)
      screen.unmount()
    })
  })

  it('dispatches no second add where the first mount went while it still built the account', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const real = accountModule.recoveredAccountOf
    const build = jest.spyOn(accountModule, 'recoveredAccountOf')
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    build.mockImplementationOnce(async (input) => {
      await held
      return real(input)
    })
    const first = await mountDone(world.account)
    expect(build).toHaveBeenCalledTimes(1)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(0)
    first.unmount()

    const screen = await mountDone(world.account)
    expect(build).toHaveBeenCalledTimes(1)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(0)
    expect(screen.has('done-adding')).toBe(true)
    release()
    await tick(0)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    expect(addedAccountOf().associatedKeys).toEqual([NEW_KEY])
    await expectFollowedToDone(screen)
    build.mockRestore()
    screen.unmount()
  })

  it('dispatches no second add where the first mount went after its dispatch and before the wallet reads the add running', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const first = await mountDone(world.account)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    expect(mockWallet.statuses?.addAccounts).toBe('INITIAL')
    first.unmount()

    const screen = await mountDone(world.account)
    await setWallet({ statuses: { addAccounts: 'LOADING' } })
    await expectFollowedToDone(screen)
    screen.unmount()
  })

  it('dispatches no second add where the first mount went after the add ended and before the wallet lists the account', async () => {
    const world = await openWorld({ route: 'logged-in' })
    const first = await mountDone(world.account)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    await setWallet({ statuses: { addAccounts: 'LOADING' } })
    await setWallet({ statuses: { addAccounts: 'SUCCESS' } })
    first.unmount()

    const screen = await mountDone(world.account)
    await expectFollowedToDone(screen)
    screen.unmount()
  })

  it('follows the first add to failed where the wallet reports an error after a mount again that came before the add ran', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const first = await mountDone(world.account)
    first.unmount()
    const screen = await mountDone(world.account)
    await setWallet({ statuses: { addAccounts: 'LOADING' } })
    await setWallet({ statuses: { addAccounts: 'ERROR' } })
    expect(screen.has('done-add-failed')).toBe(true)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)

    await screen.press('done-add-retry')
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(2)
    await tick(1000)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(2)
    screen.unmount()

    const again = await mountDone(world.account)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(2)
    await walletAddsIt()
    expect(again.has('done-now-in-wallet')).toBe(true)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(2)
    again.unmount()
  })

  it('dispatches again on a mount after the followed add ended in failure', async () => {
    const world = await openWorld({ route: 'fresh-install' })
    const first = await mountDone(world.account)
    await tick(ADD_LIMIT_MS + 1000)
    expect(first.has('done-add-failed')).toBe(true)
    first.unmount()

    const screen = await mountDone(world.account)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(2)
    expect(screen.has('done-adding')).toBe(true)
    screen.unmount()
  })

  it('reads the followed add ending in an error as failed, and the retry dispatches once', async () => {
    const { screen } = await remountDuringAdd()
    await setWallet({ statuses: { addAccounts: 'ERROR' } })
    expect(screen.has('done-add-failed')).toBe(true)
    expect(screen.textOf('done-add-retry')).toBe(t(`${DONE}.addRetry`))
    expectNoDoneText(screen)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)

    await screen.press('done-add-retry')
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(2)
    expect(addedAccountOf(1).associatedKeys).toEqual([NEW_KEY])
    expect(screen.has('done-adding')).toBe(true)
    await walletAddsIt()
    expect(screen.has('done-now-in-wallet')).toBe(true)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(2)
    screen.unmount()
  })

  it('reads the followed add as failed where the wallet does not list the account within the limit', async () => {
    const { screen } = await remountDuringAdd()
    await tick(ADD_LIMIT_MS + 1000)
    expect(screen.has('done-add-failed')).toBe(true)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(1)
    await screen.press('done-add-retry')
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(2)
    screen.unmount()
  })
})
