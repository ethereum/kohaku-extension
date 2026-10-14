/**
 * @jest-environment jsdom
 *
 * The done screen's last act, on Close and on the edit actions: it ends the
 * countdown, clears the entry record and the recovery password held in
 * memory, keeps the decrypted setup cache, and only then leaves. A countdown
 * of another attempt, stored since the mount, stays with its entry and its
 * password. With no countdown, a live session of a new gathering keeps them
 * too, and a session read that does not answer clears nothing. A reload
 * after it renders from the consume event alone where the wallet lists the
 * account, and sends to the account step where it does not.
 */
import {
  ADD_ACTION,
  CHAIN_ID,
  dispatchedOf,
  endStoredCountdown,
  landCountdown,
  mockWallet,
  mountDone,
  NEW_KEY,
  openGathering,
  openWorld,
  PASSWORD,
  RECEIVING_ADDR,
  REMOVED_KEY,
  reportSelected,
  SIGNER_STATE_KEY,
  SLOT_SMART,
  t,
  tick,
  useDoneClock
} from '@web/modules/social-recovery/recovery/done/__tests__/harness'
import type { World } from '@web/modules/social-recovery/recovery/done/__tests__/harness'
import { POLL_LIMIT_MS } from '@web/modules/social-recovery/recovery/checklist/constants'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'
import {
  readRecoveryPassword,
  setRecoveryPassword
} from '@web/modules/social-recovery/shared/records'

useDoneClock()

const DONE = 'socialRecovery.done'

const recordsOf = async ({ records, account }: World) => ({
  countdown: (await records.countdown(CHAIN_ID, account).read()).status,
  entry: (await records.recoveryEntry(CHAIN_ID, account).read()).status,
  cache: (await records.decryptedSetupCache(CHAIN_ID, account).read()).status,
  password: readRecoveryPassword(CHAIN_ID, account)
})

/** The attempt id the stored countdown landed, if one is stored. */
const landedIdOf = async ({ records, account }: World) => {
  const read = await records.countdown(CHAIN_ID, account).read()
  return read.status === 'present' ? read.value.attemptId : undefined
}

const BEFORE = { countdown: 'present', entry: 'present', cache: 'present', password: PASSWORD }
const AFTER = { countdown: 'absent', entry: 'absent', cache: 'present', password: undefined }

/** A recovery on `route` with the recovery password held, mounted and done once the wallet added the account. */
const openDone = async (options: Parameters<typeof openWorld>[0] = {}) => {
  const world = await openWorld({ walletAdds: true, ...options })
  setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
  const screen = await mountDone(world.account)
  expect(screen.has('done')).toBe(true)
  return { world, screen }
}

describe('the last act', () => {
  it('on Close ends the countdown, clears the entry and the password, keeps the cache, and leaves for the dashboard', async () => {
    const { world, screen } = await openDone({ route: 'fresh-install' })
    expect(await recordsOf(world)).toEqual(BEFORE)
    await screen.press('done-close')
    expect(await recordsOf(world)).toEqual(AFTER)
    expect(screen.paths()).toEqual(['/dashboard'])
    expect(mockWallet.navigate.mock.calls[0][1]).toEqual({ replace: true })
    screen.unmount()
  })

  it('runs the last act on the logged-in route too', async () => {
    const { world, screen } = await openDone({ route: 'logged-in' })
    await screen.press('done-close')
    expect(await recordsOf(world)).toEqual(AFTER)
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })

  it('on Remove the row in the editor runs the last act and opens the editor', async () => {
    const { world, screen } = await openDone({ route: 'fresh-install' })
    await screen.press('done-remove-in-editor')
    expect(await recordsOf(world)).toEqual(AFTER)
    expect(screen.paths()).toEqual(['/social-recovery/setup/editor'])
    screen.unmount()
  })

  it('stays with the actions pressable and leaves nothing where the last act fails, then leaves on a second press', async () => {
    const { world, screen } = await openDone({ route: 'logged-in' })
    const { remove } = world.storage
    world.storage.remove = async () => {
      throw new Error('storage unavailable')
    }
    await screen.press('done-close')
    expect(screen.has('done-finish-failed')).toBe(true)
    expect(screen.paths()).toEqual([])
    expect(screen.byTestId('done-close')?.getAttribute('aria-disabled')).not.toBe('true')
    world.storage.remove = remove
    await screen.press('done-close')
    expect(await recordsOf(world)).toEqual(AFTER)
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })

  it('disables the actions while the last act runs, so one press leaves once', async () => {
    const { world, screen } = await openDone({ route: 'logged-in' })
    const { remove } = world.storage
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    world.storage.remove = async (key) => {
      await gate
      return remove(key)
    }
    await screen.press('done-close')
    expect(screen.byTestId('done-close')?.getAttribute('aria-disabled')).toBe('true')
    expect(screen.byTestId('done-edit')?.getAttribute('aria-disabled')).toBe('true')
    expect(screen.paths()).toEqual([])
    release()
    await screen.press('done-edit')
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })
})

describe('the last act ends only the countdown of the attempt this screen matched', () => {
  const KEPT = { countdown: 'present', entry: 'present', cache: 'present', password: PASSWORD }

  it('leaves a countdown another recovery landed since the mount, with its entry and password, and leaves for the dashboard', async () => {
    const { world, screen } = await openDone({ route: 'fresh-install' })
    await endStoredCountdown(world)
    await landCountdown(world, { attempt: 2 })
    await screen.press('done-close')
    expect(await recordsOf(world)).toEqual(KEPT)
    expect(await landedIdOf(world)).toBe('2')
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })

  it('leaves a countdown under the same attempt id with another payload', async () => {
    const { world, screen } = await openDone({ route: 'logged-in' })
    await endStoredCountdown(world)
    await landCountdown(world, { attempt: 1, payload: '0xbad0' })
    await screen.press('done-close')
    expect(await recordsOf(world)).toEqual(KEPT)
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })

  it('leaves a countdown under the same attempt id and payload with another setup number', async () => {
    const { world, screen } = await openDone({ route: 'logged-in' })
    await endStoredCountdown(world)
    await landCountdown(world, { attempt: 1, setupNonce: 2 })
    await screen.press('done-close')
    expect(await recordsOf(world)).toEqual(KEPT)
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })

  it('leaves a countdown landed after a mount that found none, and leaves the screen', async () => {
    const { world, screen } = await openDone({ route: 'logged-in', countdown: false, listed: true })
    await landCountdown(world, { attempt: 2 })
    await screen.press('done-close')
    expect(await recordsOf(world)).toEqual(KEPT)
    expect(await landedIdOf(world)).toBe('2')
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })

  it('on Edit leaves the other countdown too, and still opens the editor', async () => {
    const { world, screen } = await openDone({ route: 'logged-in' })
    await endStoredCountdown(world)
    await landCountdown(world, { attempt: 2 })
    await screen.press('done-edit')
    expect(await recordsOf(world)).toEqual(KEPT)
    expect(screen.paths()).toEqual(['/social-recovery/setup/editor'])
    screen.unmount()
  })

  it('ends a countdown of the same attempt stored again since the mount, and clears the entry', async () => {
    const { world, screen } = await openDone({ route: 'logged-in' })
    await endStoredCountdown(world)
    await landCountdown(world, { attempt: 1 })
    await screen.press('done-close')
    expect(await recordsOf(world)).toEqual(AFTER)
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })
})

describe('the last act with no countdown', () => {
  /** A device that holds the entry and the password but no countdown, for an account listed with the granted key. */
  const openWithoutCountdown = async () => {
    const opened = await openDone({ route: 'logged-in', countdown: false, listed: true })
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(0)
    return opened
  }
  const NO_COUNTDOWN_KEPT = {
    countdown: 'absent',
    entry: 'present',
    cache: 'present',
    password: PASSWORD
  }

  it('clears the entry and the password where no session is stored, keeps the cache, and leaves', async () => {
    const { world, screen } = await openWithoutCountdown()
    expect((await world.records.recoverySession(CHAIN_ID, world.account).read()).status).toBe(
      'absent'
    )
    await screen.press('done-close')
    expect(await recordsOf(world)).toEqual(AFTER)
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })

  it('leaves the entry, the password and the live session of a new gathering, and leaves the screen', async () => {
    const { world, screen } = await openWithoutCountdown()
    await openGathering(world, { attempt: 2 })
    await screen.press('done-close')
    expect(await recordsOf(world)).toEqual(NO_COUNTDOWN_KEPT)
    const session = await world.records.recoverySession(CHAIN_ID, world.account).read()
    expect(session.status === 'present' && session.value.state).toBe('live')
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })

  it('clears the entry and the password where the stored session is a wiped one', async () => {
    const { world, screen } = await openWithoutCountdown()
    const live = await openGathering(world, { attempt: 2 })
    await world.records.wipeRecoverySession(
      CHAIN_ID,
      world.account,
      'another-attempt-opened',
      live.revision
    )
    await screen.press('done-close')
    expect(await recordsOf(world)).toEqual(AFTER)
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })

  it('clears nothing where the session read throws, and leaves the screen', async () => {
    const { world, screen } = await openWithoutCountdown()
    const { get } = world.storage
    let sessionReads = 0
    world.storage.get = async (...args: Parameters<typeof get>) => {
      if (String(args[0]).includes('recoverySession')) {
        sessionReads += 1
        // The one read after Close is the session's.
        if (sessionReads === 1) {
          throw new Error('storage unavailable')
        }
      }
      return get(...args)
    }
    await screen.press('done-close')
    world.storage.get = get
    expect(sessionReads).toBe(1)
    expect(await recordsOf(world)).toEqual(NO_COUNTDOWN_KEPT)
    expect(screen.has('done-finish-failed')).toBe(false)
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })

  it('clears nothing where the session read does not answer within its limit, and leaves the screen then', async () => {
    const { world, screen } = await openWithoutCountdown()
    const { get } = world.storage
    let sessionReads = 0
    world.storage.get = async (...args: Parameters<typeof get>) => {
      if (String(args[0]).includes('recoverySession')) {
        sessionReads += 1
        if (sessionReads === 1) {
          return new Promise<never>(() => {})
        }
      }
      return get(...args)
    }
    await screen.press('done-close')
    await tick(POLL_LIMIT_MS - 1000)
    expect(screen.paths()).toEqual([])
    await tick(2000)
    world.storage.get = get
    expect(await recordsOf(world)).toEqual(NO_COUNTDOWN_KEPT)
    expect(screen.paths()).toEqual(['/dashboard'])
    screen.unmount()
  })
})

describe('Edit selects the recovered account', () => {
  const routes = ['fresh-install', 'logged-in'] as const
  routes.forEach((route) => {
    it(`on the ${route} route runs the last act, selects the recovered account, never the receiving one, and opens the editor`, async () => {
      const { world, screen } = await openDone({ route })
      await screen.press('done-edit')
      expect(await recordsOf(world)).toEqual(AFTER)
      expect(dispatchedOf('MAIN_CONTROLLER_SELECT_ACCOUNT')).toEqual([
        { type: 'MAIN_CONTROLLER_SELECT_ACCOUNT', params: { accountAddr: world.account } }
      ])
      expect(screen.paths()).toEqual(['/social-recovery/setup/editor'])
      screen.unmount()
    })

    it(`on the ${route} route opens the editor only once the wallet reports the recovered account selected`, async () => {
      const { world, screen } = await openDone({ route })
      mockWallet.holdsSelection = true
      await reportSelected(route === 'logged-in' ? RECEIVING_ADDR : SLOT_SMART)
      await screen.press('done-edit')
      expect(dispatchedOf('MAIN_CONTROLLER_SELECT_ACCOUNT')).toHaveLength(1)
      expect(await recordsOf(world)).toEqual(AFTER)
      expect(screen.paths()).toEqual([])
      expect(screen.byTestId('done-edit')?.getAttribute('aria-disabled')).toBe('true')
      expect(screen.byTestId('done-close')?.getAttribute('aria-disabled')).toBe('true')

      await reportSelected(SIGNER_STATE_KEY)
      expect(screen.paths()).toEqual([])
      await reportSelected(world.account)
      expect(screen.paths()).toEqual(['/social-recovery/setup/editor'])
      await reportSelected(world.account)
      expect(screen.paths()).toEqual(['/social-recovery/setup/editor'])
      screen.unmount()
    })
  })

  it('does not open the editor for a recovered account selected before Edit was pressed', async () => {
    const { world, screen } = await openDone({ route: 'logged-in' })
    await reportSelected(world.account)
    expect(screen.paths()).toEqual([])
    screen.unmount()
  })
})

describe('a reload after the last act', () => {
  it('renders from the consume event alone where the wallet lists the account, adding nothing', async () => {
    const { world, screen } = await openDone({ route: 'fresh-install' })
    await screen.press('done-close')
    screen.unmount()
    const adds = dispatchedOf(ADD_ACTION).length

    const reloaded = await mountDone(world.account)
    expect(reloaded.has('done')).toBe(true)
    expect(reloaded.has('setup-chrome')).toBe(true)
    expect(reloaded.textOf('done-controlled-by')).toBe(renderFullAddress(NEW_KEY))
    expect(reloaded.textOf('done-removed')).toBe(renderFullAddress(REMOVED_KEY))
    expect(reloaded.textOf('done-controlled-by-line-0')).toBe(t(`${DONE}.keyLimit`))
    expect(reloaded.has('done-controlled-by-line-1')).toBe(false)
    expect(reloaded.has('done-now-in-wallet')).toBe(false)
    expect(dispatchedOf(ADD_ACTION).length).toBe(adds)
    expect(reloaded.paths()).toEqual([])
    reloaded.unmount()
  })

  it('sends to the account step where no entry record is left and the wallet does not list the account', async () => {
    const world = await openWorld({ route: 'logged-in', entry: false, countdown: false })
    const reloaded = await mountDone(world.account)
    expect(reloaded.paths()).toEqual(['/social-recovery/recovery/account'])
    expect(reloaded.has('done')).toBe(false)
    expect(dispatchedOf(ADD_ACTION)).toHaveLength(0)
    reloaded.unmount()
  })
})
