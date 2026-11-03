/**
 * The banner's reading of a recovery that executed: the notice that the
 * account is no longer controlled from this device shows only where the
 * keystore does not hold the key that controls the account since, and waits
 * until the keystore is read.
 */
import type { Address } from '@kohaku-eth/social-recovery'
import { bannerReadingOf } from '@web/modules/social-recovery/cancel'
import type { WatchedAttemptState } from '@web/modules/social-recovery/watcher'

const ACCOUNT: Address = '0x00000000000000000000000000000000000a11ce'
const CONTROLLER: Address = '0x000000000000000000000000000000000000c0de'
const OTHER_KEY: Address = '0x0000000000000000000000000000000000000b0b'

const executed: WatchedAttemptState = {
  status: 'watched',
  attemptDismissed: false,
  reading: {
    account: ACCOUNT,
    block: { number: 10, timestamp: 1_000 },
    hasSetup: true,
    dormant: false,
    ended: { attemptId: 4n, road: 'executed', controller: CONTROLLER, at: 900 }
  }
}

describe('the banner reading of an executed recovery', () => {
  it('reads the executed notice where the keystore does not hold the controller', () => {
    expect(bannerReadingOf(executed, [], [OTHER_KEY])).toMatchObject({ kind: 'executed' })
  })

  it('reads none where the keystore holds the controller, in any letter case', () => {
    const held = CONTROLLER.toUpperCase().replace('0X', '0x') as Address
    expect(bannerReadingOf(executed, [], [OTHER_KEY, held])).toEqual({ kind: 'none' })
  })

  it('reads none until the keystore is read', () => {
    expect(bannerReadingOf(executed, [], undefined)).toEqual({ kind: 'none' })
  })
})
