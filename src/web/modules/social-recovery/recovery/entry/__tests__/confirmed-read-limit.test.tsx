/**
 * @jest-environment jsdom
 */
import type { Address, BlockTag } from '@web/modules/social-recovery/sdk-interfaces'
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
  useLiveFakeClock
} from '@web/modules/social-recovery/recovery/entry/__tests__/harness'
import type { Mounted } from '@web/modules/social-recovery/recovery/entry/__tests__/harness'
import {
  ACCOUNT,
  KEY_A
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__tests__/harness'
import {
  CREATION,
  HOLDS,
  same,
  worldOf
} from '@web/modules/social-recovery/shared/client/kit/wallet-reads/__fixtures__/world'

const HOUR_MS = 60 * 60 * 1000

const listedDeployed = () =>
  worldOf({
    creation: CREATION,
    initialPrivileges: [[KEY_A, HOLDS]],
    associatedKeys: [KEY_A],
    holders: [KEY_A],
    authorities: [KEY_A]
  })

/** Holds the second code read of the account at a past block forever; every other read answers. */
const holdSecondHistoricalCode = (world: ReturnType<typeof listedDeployed>) => {
  const answer = world.node.codeRead.code.getMockImplementation()!
  let numbered = 0
  world.node.codeRead.code.mockImplementation((address: Address, block?: BlockTag) => {
    if (same(address, ACCOUNT) && typeof block === 'number') {
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
    const world = listedDeployed()
    holdSecondHistoricalCode(world)
    kit.removedKey.mockImplementation(() => world.reads.removedKey())
    useLiveFakeClock()
    screen = await mountAccountStep(searchOf('logged-in', BASIC))
    await confirmLost(screen)
    expect(screen.has('entry-reads-fit-loading')).toBe(true)

    await waitAnHour()

    expect(
      world.node.codeRead.code.mock.calls.filter(([, block]) => typeof block === 'number').length
    ).toBe(2)
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

    await outside(() => answerLate({ kind: 'unavailable', cause: 'no-creation-record' }))

    expect(screen.has('entry-continue')).toBe(true)
    expect(screen.has('entry-cannot-recover')).toBe(false)
  })
})
