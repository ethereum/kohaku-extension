/**
 * The save's deposit step and its Continue, over the real steps and a store: a
 * holder who sends the amount the step names and presses Continue gets the
 * save sent, even where the gas price rose a little in between. A rise past
 * the bar shows the step again, for the new amount less what the key holds,
 * with nothing sent.
 */
import type { Account } from '@ambire-common/interfaces/account'
import type { DepositStep } from '@web/modules/social-recovery/shared/writes'

import { isSaved, recheckGas } from '@web/modules/social-recovery/setup/arm'
import type { ArmStore } from '@web/modules/social-recovery/setup/arm'
import {
  HAPPY,
  runSave,
  SHORT_TIMEOUT_MS,
  smartAccount,
  wireSave
} from '@web/modules/social-recovery/setup/arm/__tests__/harness'

const GWEI = 1_000_000_000n
/** The gas price the harness reads, and its estimate of each transaction. */
const PRICE = 2n * GWEI
const GAS = 300_000n

let account: Account

beforeAll(async () => {
  account = await smartAccount()
})

const stepIn = (store: ArmStore): DepositStep => {
  const { write } = store.state()
  if (write.status !== 'needsDeposit') {
    throw new Error(`expected the deposit step, got ${write.status}`)
  }
  return write.step
}

const outsideAmountOf = (step: DepositStep): bigint => {
  const outside = step.routes.find((route) => route.kind === 'outside')
  if (!outside) {
    throw new Error('expected the deposit from outside')
  }
  return outside.amount
}

const shortSave = async () => {
  const wired = wireSave(account, { ...HAPPY, gas: 'deposit', authorized: false, deployed: true })
  const store = await runSave(wired.steps)
  return { wired, store, step: stepIn(store) }
}

describe("the deposit step's Continue after a deposit of the amount asked", () => {
  it('sends the save at the same gas price', async () => {
    const { wired, store, step } = await shortSave()
    wired.reads.nativeBalance.mockResolvedValue(outsideAmountOf(step))

    await recheckGas(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })

  it('sends the save after the gas price rose by a third', async () => {
    const { wired, store, step } = await shortSave()
    wired.reads.nativeBalance.mockResolvedValue(outsideAmountOf(step))
    wired.reads.gasPrice.mockResolvedValue((PRICE * 133n) / 100n)

    await recheckGas(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })

  it('shows the step again, for the new amount asked less the balance, after a rise past the bar', async () => {
    const { wired, store, step } = await shortSave()
    const funded = outsideAmountOf(step)
    const risen = (PRICE * 140n) / 100n
    wired.reads.nativeBalance.mockResolvedValue(funded)
    wired.reads.gasPrice.mockResolvedValue(risen)

    await recheckGas(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })

    const again = stepIn(store)
    expect(again.balance).toBe(funded)
    expect(again.estimate.asked).toBe((GAS * risen * 150n) / 100n)
    expect(again.shortfall).toBe(again.estimate.asked - funded)
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })
})
