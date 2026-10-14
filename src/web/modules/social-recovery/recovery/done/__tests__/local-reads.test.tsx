/**
 * @jest-environment jsdom
 *
 * The done screen's read of the setup on this device: the configuration (the
 * decrypted cache, else the setup the recovery password opens). A read that
 * throws or does not answer within its limit renders failed with retry, never
 * as a path this device does not hold; only a device holding neither the
 * cache nor the password reads as holding no path.
 */
import {
  CHAIN_ID,
  mountDone,
  openWorld,
  PASSWORD,
  tick,
  useDoneClock
} from '@web/modules/social-recovery/recovery/done/__tests__/harness'
import { POLL_LIMIT_MS } from '@web/modules/social-recovery/recovery/checklist/constants'
import { setRecoveryPassword } from '@web/modules/social-recovery/shared/records'

useDoneClock()

describe('the configuration read', () => {
  it('renders failed with retry where the setup read throws, and the retry renders done', async () => {
    const world = await openWorld({ route: 'logged-in', cache: false, walletAdds: true })
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    world.kit.getSetup.mockRejectedValueOnce(new Error('the provider did not answer'))
    const screen = await mountDone(world.account)
    expect(screen.has('done-read-failed')).toBe(true)
    expect(screen.has('done')).toBe(false)
    expect(screen.allByTestIdPrefix('done-cleanup-')).toHaveLength(0)
    await screen.press('done-read-failed-retry')
    expect(world.kit.getSetup).toHaveBeenCalledTimes(2)
    expect(screen.has('done')).toBe(true)
    expect(screen.textOf('done-used')).toContain('Laptop passkey')
    screen.unmount()
  })

  it('renders loading while the setup read has not answered, then failed with retry at its limit', async () => {
    const world = await openWorld({ route: 'logged-in', cache: false, walletAdds: true })
    setRecoveryPassword(CHAIN_ID, world.account, PASSWORD)
    world.kit.getSetup.mockImplementationOnce(() => new Promise(() => {}))
    const screen = await mountDone(world.account)
    expect(screen.has('done-loading')).toBe(true)
    await tick(POLL_LIMIT_MS - 1000)
    expect(screen.has('done-loading')).toBe(true)
    expect(screen.has('done-read-failed')).toBe(false)
    await tick(2000)
    expect(screen.has('done-read-failed')).toBe(true)
    expect(screen.has('done')).toBe(false)
    await screen.press('done-read-failed-retry')
    expect(screen.has('done')).toBe(true)
    screen.unmount()
  })

  it('renders failed where the decrypted cache read throws, never as no path', async () => {
    const world = await openWorld({ route: 'logged-in', walletAdds: true })
    const { get } = world.storage
    world.storage.get = async (key, fallback) => {
      if (key?.includes('decrypted')) {
        throw new Error('storage unavailable')
      }
      return get(key, fallback)
    }
    const screen = await mountDone(world.account)
    expect(screen.has('done-read-failed')).toBe(true)
    expect(screen.has('done')).toBe(false)
    world.storage.get = get
    await screen.press('done-read-failed-retry')
    expect(screen.has('done')).toBe(true)
    expect(screen.allByTestIdPrefix('done-cleanup-synced-').length).toBeGreaterThan(0)
    screen.unmount()
  })

  it('reads as holding no path only where the device holds neither the cache nor the password', async () => {
    const world = await openWorld({ route: 'logged-in', cache: false, walletAdds: true })
    const screen = await mountDone(world.account)
    expect(screen.has('done')).toBe(true)
    expect(world.kit.getSetup).not.toHaveBeenCalled()
    expect(screen.has('done-discoverable')).toBe(false)
    screen.unmount()
  })
})
