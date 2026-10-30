/**
 * A countdown ends once the chain shows its attempt over: consumed, or behind
 * a later attempt. The countdown of a waiting or due attempt, a cancel this
 * device has not read included, stays.
 */
import type { Address } from '@kohaku-eth/social-recovery'
import { createWalletRecords } from '@web/modules/social-recovery/shared/records'
import type { ChainCountdown } from '@web/modules/social-recovery/shared/records'
import { makeStorage } from '@web/modules/social-recovery/shared/records/__fixtures__/storage'
import type { PastCountdownCase } from '@web/modules/social-recovery/shared/records/__fixtures__/types'

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const CHAIN_ID = 11155111n

const COUNTDOWN: ChainCountdown = {
  attemptId: 4n,
  setupNonce: 2n,
  payloadHash: `0x${'aa'.repeat(32)}`,
  openedAtMs: 1_699_990_000_000,
  executableAt: 1_700_076_400,
  deployment: {
    manager: '0x4444444444444444444444444444444444444444',
    action: '0x5555555555555555555555555555555555555555'
  }
}

const withCountdown = async () => {
  const records = createWalletRecords({ storage: makeStorage() })
  await records.restoreCountdown(CHAIN_ID, ACCOUNT, COUNTDOWN)
  return records
}

describe('the end of a countdown whose attempt is over', () => {
  const ENDS: PastCountdownCase[] = [
    ['its attempt consumed', { attemptId: 4n, state: 'Consumed' }],
    ['a later attempt the manager holds', { attemptId: 5n, state: 'Waiting' }]
  ]
  ENDS.forEach(([name, last]) =>
    it(`ends the countdown on ${name}`, async () => {
      const records = await withCountdown()
      expect(await records.endPastCountdown(CHAIN_ID, ACCOUNT, last)).toBe(true)
      expect((await records.countdown(CHAIN_ID, ACCOUNT).read()).status).toBe('absent')
    })
  )

  const STAYS: PastCountdownCase[] = [
    ['its attempt waiting', { attemptId: 4n, state: 'Waiting' }],
    ['its attempt cancelled', { attemptId: 4n, state: 'Cancelled' }]
  ]
  STAYS.forEach(([name, last]) =>
    it(`keeps the countdown on ${name}`, async () => {
      const records = await withCountdown()
      expect(await records.endPastCountdown(CHAIN_ID, ACCOUNT, last)).toBe(false)
      expect((await records.countdown(CHAIN_ID, ACCOUNT).read()).status).toBe('present')
    })
  )

  it('ends nothing where no countdown is stored', async () => {
    const records = createWalletRecords({ storage: makeStorage() })
    expect(
      await records.endPastCountdown(CHAIN_ID, ACCOUNT, { attemptId: 4n, state: 'Consumed' })
    ).toBe(false)
  })
})
