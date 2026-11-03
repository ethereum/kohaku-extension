/**
 * @jest-environment jsdom
 */
import type { Address, BlockTag, Hex } from '@kohaku-eth/social-recovery'

import {
  advanceClock,
  BASIC,
  confirmLost,
  holdRemovedKeyOnce,
  kit,
  mountAccountStep,
  outside,
  resetEdges,
  searchOf,
  t,
  useLiveFakeClock
} from '@web/modules/social-recovery/recovery/entry/__tests__/harness'
import type { Mounted } from '@web/modules/social-recovery/recovery/entry/__tests__/harness'
import {
  addressBookOf,
  buildRecoveryClient,
  descriptorOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import { sdkStandIn } from '@web/modules/social-recovery/shared/client/stand-in'

const HOUR_MS = 60 * 60 * 1000

const KEY_A: Address = '0x00000000000000000000000000000000000ca1a1'
// Any non-zero privilege value: the creation grants KEY_A the key privilege.
const HOLDS: Hex = `0x${'00'.repeat(31)}01`
const CREATION = {
  factory: '0x00000000000000000000000000000000000fac70' as Address,
  bytecode: '0x00' as Hex,
  salt: `0x${'00'.repeat(32)}` as Hex,
  block: 1
}

/** The listed basic account deployed on its fake node, KEY_A holding it, and a client over it. */
const listedDeployed = async () => {
  sdkStandIn.reset()
  const addressBook = addressBookOf(WALLET_RECOVERY_CHAIN)
  const node = sdkStandIn.nodeFor(descriptorOf(WALLET_RECOVERY_CHAIN, addressBook), BASIC, {
    authorities: [KEY_A]
  })
  const client = await buildRecoveryClient({
    chain: WALLET_RECOVERY_CHAIN,
    account: BASIC,
    addressBook,
    provider: node,
    creation: CREATION,
    initialPrivileges: [[KEY_A, HOLDS]],
    candidateKeys: [KEY_A]
  })
  return { node, client }
}

/** Holds the second code read of the account at a past block forever; every other read answers. */
const holdSecondHistoricalCode = (world: Awaited<ReturnType<typeof listedDeployed>>) => {
  const answer = world.node.code.bind(world.node)
  let numbered = 0
  return jest.spyOn(world.node, 'code').mockImplementation((address: Address, block: BlockTag) => {
    if (address.toLowerCase() === BASIC.toLowerCase() && typeof block === 'number') {
      numbered += 1
      if (numbered === 2) {
        return new Promise<never>(() => {})
      }
    }
    return answer(address, block)
  })
}

const waitAnHour = () => advanceClock(HOUR_MS)

let screen: Mounted | null = null
beforeEach(resetEdges)
afterEach(() => {
  jest.useRealTimers()
  screen?.unmount()
  screen = null
})

describe('the reads after the confirmation have a time limit', () => {
  it('shows the failed fit view with its retry when a code read of the search never answers', async () => {
    const world = await listedDeployed()
    const code = holdSecondHistoricalCode(world)
    kit.removedKey.mockImplementation(() => world.client.walletReads.removedKey())
    useLiveFakeClock()
    screen = await mountAccountStep(searchOf('logged-in', BASIC))
    await confirmLost(screen)
    expect(screen.textOf('entry-reads-fit-loading')).toBe(
      t('socialRecovery.entry.confirm.readingFit')
    )
    expect(
      screen.byTestId('entry-reads-fit-loading')?.querySelector('[data-testid="loading-block"]')
    ).not.toBeNull()

    await waitAnHour()

    expect(code.mock.calls.filter(([, block]) => typeof block === 'number').length).toBe(2)
    expect(screen.has('entry-reads-fit-failed-retry')).toBe(true)
    expect(screen.has('entry-reads-fit-loading')).toBe(false)
  })

  it('runs the read again on a retry after the limit and moves on when it answers', async () => {
    holdRemovedKeyOnce()
    useLiveFakeClock()
    screen = await mountAccountStep(searchOf('logged-in', BASIC))
    await confirmLost(screen)
    await waitAnHour()
    expect(screen.has('entry-reads-fit-failed-retry')).toBe(true)

    await screen.press('entry-reads-fit-failed-retry')

    expect(kit.removedKey).toHaveBeenCalledTimes(2)
    expect(screen.has('entry-continue')).toBe(true)
  })

  it('ignores a late answer of the expired read after the retry answered', async () => {
    const answerLate = holdRemovedKeyOnce()
    useLiveFakeClock()
    screen = await mountAccountStep(searchOf('logged-in', BASIC))
    await confirmLost(screen)
    await waitAnHour()
    await screen.press('entry-reads-fit-failed-retry')
    expect(screen.has('entry-continue')).toBe(true)

    await outside(() => answerLate({ kind: 'unavailable', cause: 'no-source' }))

    expect(screen.has('entry-continue')).toBe(true)
    expect(screen.has('entry-cannot-recover')).toBe(false)
  })
})
