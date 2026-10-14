/**
 * @jest-environment jsdom
 *
 * The account the submission is sent from while the wallet has selected
 * another one, as on the logged-in route, where the wallet lists the account
 * being recovered and has it selected. The run hands the send port the
 * sending account itself, the key's own for a key's send and the receiving
 * smart account for its batch, and the screen hands the send port the
 * wallet's selection, so the port can select the sending account first.
 */
import type { Mounted, World } from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import {
  mockWallet,
  mountSubmit,
  openWorld,
  START_CALL
} from '@web/modules/social-recovery/recovery/submit/__tests__/harness'

describe('the submission while the wallet has another account selected', () => {
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const startOn = async (world: World) => {
    // The wallet selected the account being recovered, not the one that sends.
    mockWallet.selected = world.account
    view = await mountSubmit(world.account)
    await view.press('submit-verify-details')
    await view.press('submit-action')
  }

  it('sends from the receiving basic account’s own key, not from the selected account', async () => {
    const world = await openWorld({ route: 'logged-in', receiving: 'basic' })
    await startOn(world)
    expect(world.port.send).toHaveBeenCalledTimes(1)
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    const [key, transaction] = world.port.send.mock.calls[0]
    expect(key.addr).toBe(world.receiving.addr)
    expect(transaction).toEqual(
      expect.objectContaining({ from: world.receiving.addr, to: START_CALL.target })
    )
    expect(mockWallet.requests?.selectedAccount()).toBe(world.account)
  })

  it('sends the receiving smart account’s own batch, not one of the selected account', async () => {
    const world = await openWorld({ route: 'logged-in', receiving: 'smart' })
    await startOn(world)
    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(world.port.send).not.toHaveBeenCalled()
    expect(world.port.sendAccountBatch.mock.calls[0][0]).toBe(world.receiving.addr)
    expect(world.port.sendAccountBatch.mock.calls[0][0]).not.toBe(world.account)
    expect(mockWallet.requests?.selectedAccount()).toBe(world.account)
  })
})
