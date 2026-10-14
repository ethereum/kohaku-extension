/**
 * @jest-environment jsdom
 *
 * The account the execution is sent from while the wallet has selected
 * another one, as on the logged-in route, where the wallet lists the account
 * being recovered and has it selected. The run hands the send port the
 * sending account itself, the key's own for a key's send and the receiving
 * smart account for its batch, and the screen hands the send port the
 * wallet's selection, so the port can select the sending account first.
 */
import type { ProviderTransactionReceipt } from '@web/modules/social-recovery/shared/client'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'
import type { Mounted, World } from '@web/modules/social-recovery/recovery/wait/__tests__/harness'
import {
  elapse,
  EXECUTE_CALL,
  mockWallet,
  mountWait,
  openWorld
} from '@web/modules/social-recovery/recovery/wait/__tests__/harness'

describe('the execution while the wallet has another account selected', () => {
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const executeOn = async (world: World) => {
    elapse(world.kit)
    const receipt = deferred<ProviderTransactionReceipt>()
    world.kit.receipts.wait.mockImplementation(() => receipt.promise)
    // The wallet selected the account being recovered, not the one that sends.
    mockWallet.selected = world.account
    view = await mountWait(world.account)
    await view.press('wait-execute')
  }

  it('sends from the receiving basic account’s own key, not from the selected account', async () => {
    const world = await openWorld({ receiving: 'basic' })
    await executeOn(world)
    expect(world.port.send).toHaveBeenCalledTimes(1)
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    const [key, transaction] = world.port.send.mock.calls[0]
    expect(key.addr).toBe(world.sendingKey)
    expect(transaction).toEqual(
      expect.objectContaining({ from: world.sendingKey, to: EXECUTE_CALL.target })
    )
    expect(mockWallet.requests?.selectedAccount()).toBe(world.account)
  })

  it('sends the receiving smart account’s own batch, not one of the selected account', async () => {
    const world = await openWorld({ receiving: 'smart' })
    await executeOn(world)
    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(world.port.send).not.toHaveBeenCalled()
    expect(world.port.sendAccountBatch.mock.calls[0][0]).toBe(world.entry.receivingAccount)
    expect(world.port.sendAccountBatch.mock.calls[0][0]).not.toBe(world.account)
    expect(mockWallet.requests?.selectedAccount()).toBe(world.account)
  })
})
