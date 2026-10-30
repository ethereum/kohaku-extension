/**
 * A save that lands on an account this device recovered ends the countdown of
 * a recovery the chain shows consumed, so the home line and the done screen no
 * longer offer it. A waiting attempt's countdown stays, and so does one whose
 * attempt read fails.
 */
import type { Account } from '@ambire-common/interfaces/account'
import type { Address } from '@kohaku-eth/social-recovery'
import {
  createWalletRecords,
  recordDeploymentOf
} from '@web/modules/social-recovery/shared/records'
import { isSaved } from '@web/modules/social-recovery/setup/arm'
import {
  CHAIN_ID,
  DESCRIPTOR,
  HAPPY,
  memoryStorage,
  runSave,
  smartAccount,
  wireSave
} from '@web/modules/social-recovery/setup/arm/__tests__/harness'
import type { SaveScript } from '@web/modules/social-recovery/setup/arm/__tests__/harness'

let account: Account

beforeAll(async () => {
  account = await smartAccount()
})

/** Lands a save over a countdown of attempt 4 and reads whether the countdown stands. */
const countdownAfterSave = async (lastAttempt: SaveScript['lastAttempt']) => {
  const storage = memoryStorage()
  const records = createWalletRecords({ storage })
  const address = account.addr as Address
  await records.restoreCountdown(CHAIN_ID, address, {
    attemptId: 4n,
    setupNonce: 2n,
    payloadHash: `0x${'aa'.repeat(32)}`,
    openedAtMs: 1_699_990_000_000,
    executableAt: 1_700_076_400,
    deployment: recordDeploymentOf(DESCRIPTOR)
  })
  const wired = wireSave(
    account,
    { ...HAPPY, authorized: true, deployed: true, lastAttempt },
    { storage }
  )
  const store = await runSave(wired.steps)
  expect(isSaved(store.state())).toBe(true)
  return (await records.countdown(CHAIN_ID, address).read()).status
}

describe("the save's landing over a countdown", () => {
  it('ends the countdown of an attempt the chain shows consumed', async () => {
    expect(await countdownAfterSave({ attemptId: 4n, state: 'Consumed' })).toBe('absent')
  })

  it('keeps the countdown of an attempt still waiting', async () => {
    expect(await countdownAfterSave({ attemptId: 4n, state: 'Waiting' })).toBe('present')
  })

  it('keeps the countdown where the attempt read fails', async () => {
    expect(await countdownAfterSave(undefined)).toBe('present')
  })
})
