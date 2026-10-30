/**
 * The account a send is queued against. The wallet opens the sign window only
 * for a request of the account it has selected, so the drives run the client's
 * real send port over a fake wallet and read what it dispatched: a key's
 * transaction is queued against the key's own basic account and a batch
 * against its account, whichever account the wallet had selected; where that
 * account is not the selected one, the port selects it first and adds its
 * request once the wallet pushes the selection, and only once.
 */
import type { Address } from '@kohaku-eth/social-recovery'
import {
  type AddGate,
  createSendPort,
  DEFAULT_SEND_TIMEOUT_MS,
  type ListedAccount,
  SEND_SETTLE_MS,
  type SendPort,
  type SendRequestAction,
  type SendRequestPort,
  type SendRequestUpdate
} from '@web/modules/social-recovery/shared/client'

import {
  ACCOUNT,
  advanceTimersAsync,
  driveAccountBatch,
  driveSend,
  drivenMachine,
  fakeReceiptWait,
  KEY,
  ownerTransaction,
  providerReceipt,
  SAVE,
  type ScriptedWallet,
  type SendKind,
  submittingFor,
  TX_HASH
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'
import type { DispatchArgs } from '@web/modules/social-recovery/shared/writes/__tests__/harness'

const CHAIN_ID = 11155111
const SELECT = 'MAIN_CONTROLLER_SELECT_ACCOUNT'
const ADD = 'REQUESTS_CONTROLLER_ADD_USER_REQUEST'
const REMOVE = 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST'
const REQUEST_ID = 'social-recovery-sender:the-batch'

const KEY_ACCOUNT: ListedAccount = { addr: KEY.addr, associatedKeys: [KEY.addr], creation: null }
const SMART_ACCOUNT: ListedAccount = {
  addr: ACCOUNT,
  associatedKeys: ['0x2b0f5e98ee98adc9865745e98802f333f72f6ef5'],
  creation: {
    factoryAddr: '0x0000000000000000000000000000000000000fac',
    bytecode: '0x00',
    salt: `0x${'00'.repeat(32)}`
  }
}
const OTHER: Address = '0x3333333333333333333333333333333333333333'

/** A wallet that lists the key's basic account and the smart account, with `selected` selected. */
const walletWith = (selected: string | undefined) => {
  const listeners = new Set<(update: SendRequestUpdate) => void>()
  const wallet: ScriptedWallet = {
    selected,
    dispatch: jest.fn<void, DispatchArgs>(),
    push: (update: SendRequestUpdate) => [...listeners].forEach((listener) => listener(update)),
    /** The wallet selects `addr` and pushes its selection. */
    select: (addr: string) => {
      wallet.selected = addr
      wallet.push({ controller: 'selectedAccount', state: { account: { addr } } })
    }
  }
  const port: SendRequestPort = {
    dispatch: wallet.dispatch,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    accounts: () => [KEY_ACCOUNT, SMART_ACCOUNT],
    queue: () => ({}),
    selectedAccount: () => wallet.selected,
    windowId: () => undefined
  }
  return { wallet, sender: createSendPort(port, { chainId: CHAIN_ID }) }
}

const actionsOf = (dispatch: jest.Mock): SendRequestAction[] =>
  dispatch.mock.calls.map((call) => call[0] as SendRequestAction)

const typesOf = (dispatch: jest.Mock) => actionsOf(dispatch).map((action) => action.type)

/** The account of every request the port added to the queue. */
const queuedAccountsOf = (dispatch: jest.Mock) =>
  actionsOf(dispatch).flatMap((action) =>
    action.type === ADD ? [action.params.userRequest.meta.accountAddr] : []
  )

const requestIdOf = (dispatch: jest.Mock): string => {
  const add = actionsOf(dispatch).find((action) => action.type === ADD)
  if (!add || add.type !== ADD) {
    throw new Error('The port added no request.')
  }
  return String(add.params.userRequest.id)
}

/** The wallet broadcasts the request's call and lists it in the activity. */
const broadcast = (wallet: ScriptedWallet, id: string) =>
  wallet.push({
    controller: 'activity',
    state: {
      accountsOps: {
        [id]: {
          result: {
            items: [
              {
                identifiedBy: { type: 'Transaction' },
                status: 'pending',
                txnId: TX_HASH,
                calls: [{ fromUserRequestId: id, txnId: TX_HASH }]
              } as never
            ]
          }
        }
      }
    }
  })

/** A key's own transaction, which the wallet queues against the key's basic account. */
const KEY_SEND: SendKind = {
  account: KEY_ACCOUNT.addr,
  other: SMART_ACCOUNT.addr,
  drive: (sender: SendPort) => {
    const machine = drivenMachine(submittingFor('submission'))
    const done = driveSend({
      dispatch: machine.dispatch,
      run: machine.state().run,
      receipts: fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) }),
      port: sender,
      key: KEY,
      transaction: ownerTransaction('submission')
    })
    return { machine, done }
  }
}

/** An account's batch, which the wallet queues against the account. */
const BATCH_SEND: SendKind = {
  account: SMART_ACCOUNT.addr,
  other: KEY_ACCOUNT.addr,
  drive: (sender: SendPort) => {
    const machine = drivenMachine(submittingFor('save'))
    const done = driveAccountBatch({
      dispatch: machine.dispatch,
      run: machine.state().run,
      receipts: fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) }),
      port: sender,
      account: ACCOUNT,
      calls: SAVE.calls,
      requestId: REQUEST_ID
    })
    return { machine, done }
  }
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

/** The cases every send kind runs: where it is queued, and when it selects its account first. */
const sendingAccountCases = ({ account, other, drive }: SendKind) => {
  it('is queued against its sending account at once where the wallet selected that account', async () => {
    const { wallet, sender } = walletWith(account)
    const { machine, done } = drive(sender)
    await advanceTimersAsync(0)
    expect(typesOf(wallet.dispatch)).not.toContain(SELECT)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([account])
    broadcast(wallet, requestIdOf(wallet.dispatch))
    await done
    expect(machine.events.map((event) => event.type)).toEqual(['sent', 'receipt'])
  })

  it('selects its sending account first where the wallet selected another, and queues it once the selection lands', async () => {
    const { wallet, sender } = walletWith(other)
    const { machine, done } = drive(sender)
    await advanceTimersAsync(0)
    expect(actionsOf(wallet.dispatch).filter((action) => action.type === SELECT)).toEqual([
      { type: SELECT, params: { accountAddr: account } }
    ])
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([])

    // A push that still names another account adds nothing.
    wallet.push({ controller: 'selectedAccount', state: { account: { addr: OTHER } } })
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([])

    wallet.select(account)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([account])
    // Another push of the same selection never adds the request a second time.
    wallet.select(account)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([account])

    broadcast(wallet, requestIdOf(wallet.dispatch))
    await done
    expect(machine.events.map((event) => event.type)).toEqual(['sent', 'receipt'])
    expect(typesOf(wallet.dispatch).filter((type) => type === SELECT)).toHaveLength(1)
  })

  it('reads that nothing was sent where the selection never lands, and adds nothing later', async () => {
    const { wallet, sender } = walletWith(undefined)
    const { machine, done } = drive(sender)
    await advanceTimersAsync(11 * 60 * 1000)
    await done
    expect(machine.events.map((event) => event.type)).toEqual(['error'])
    expect(typesOf(wallet.dispatch)).not.toContain(REMOVE)

    wallet.select(account)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([])
  })
}

describe("the send of a key's own transaction", () => {
  sendingAccountCases(KEY_SEND)

  it('is queued under the request id it is given', async () => {
    const { wallet, sender } = walletWith(KEY_ACCOUNT.addr)
    const machine = drivenMachine(submittingFor('submission'))
    const done = driveSend({
      dispatch: machine.dispatch,
      run: machine.state().run,
      receipts: fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) }),
      port: sender,
      key: KEY,
      transaction: ownerTransaction('submission'),
      requestId: REQUEST_ID
    })
    await advanceTimersAsync(0)
    expect(requestIdOf(wallet.dispatch)).toBe(REQUEST_ID)
    broadcast(wallet, REQUEST_ID)
    await done
    expect(machine.events.map((event) => event.type)).toEqual(['sent', 'receipt'])
  })
})

describe("the send of an account's batch", () => {
  sendingAccountCases(BATCH_SEND)
})

describe('a selection that never lands while the wallet signs another operation', () => {
  it('reads a timeout at its limit and the settle period, with nothing added and nothing removed', async () => {
    const { wallet, sender } = walletWith(OTHER)
    const machine = drivenMachine(submittingFor('save'))
    const done = driveAccountBatch({
      dispatch: machine.dispatch,
      run: machine.state().run,
      receipts: fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) }),
      port: sender,
      account: ACCOUNT,
      calls: SAVE.calls,
      requestId: REQUEST_ID
    })
    await advanceTimersAsync(0)
    wallet.push({
      controller: 'main',
      state: { statuses: { signAndBroadcastAccountOp: 'SIGNING' } }
    })

    await advanceTimersAsync(DEFAULT_SEND_TIMEOUT_MS + SEND_SETTLE_MS + 1)
    await done
    expect(machine.events).toEqual([
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ reason: 'timeout' })
      })
    ])
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([])
    expect(typesOf(wallet.dispatch)).not.toContain(REMOVE)
  })
})

describe('the gate before an add', () => {
  const driveGated = (sender: SendPort, canAdd: AddGate) => {
    const machine = drivenMachine(submittingFor('save'))
    const done = driveAccountBatch({
      dispatch: machine.dispatch,
      run: machine.state().run,
      receipts: fakeReceiptWait({ value: providerReceipt(TX_HASH, 1) }),
      port: sender,
      account: ACCOUNT,
      calls: SAVE.calls,
      requestId: REQUEST_ID,
      canAdd
    })
    return { machine, done }
  }

  it('adds nothing and reads a timeout where the wallet selected the account already and it answers that the claim is gone', async () => {
    const { wallet, sender } = walletWith(SMART_ACCOUNT.addr)
    const canAdd = jest.fn(async () => false)
    const { machine, done } = driveGated(sender, canAdd)
    await advanceTimersAsync(0)
    expect(canAdd).toHaveBeenCalledTimes(1)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([])

    await advanceTimersAsync(SEND_SETTLE_MS + 1)
    await done
    expect(machine.events).toEqual([
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ reason: 'timeout' })
      })
    ])
    expect(typesOf(wallet.dispatch)).not.toContain(REMOVE)
  })

  it('adds the request once where the wallet selected the account already and it answers that the claim still holds', async () => {
    const { wallet, sender } = walletWith(SMART_ACCOUNT.addr)
    const canAdd = jest.fn(async () => true)
    const { machine, done } = driveGated(sender, canAdd)
    await advanceTimersAsync(0)
    expect(canAdd).toHaveBeenCalledTimes(1)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([SMART_ACCOUNT.addr])

    broadcast(wallet, REQUEST_ID)
    await done
    expect(machine.events.map((event) => event.type)).toEqual(['sent', 'receipt'])
  })

  it('adds nothing and reads a timeout where it answers that the claim is gone', async () => {
    const { wallet, sender } = walletWith(OTHER)
    const canAdd = jest.fn(async () => false)
    const { machine, done } = driveGated(sender, canAdd)
    await advanceTimersAsync(0)
    wallet.select(SMART_ACCOUNT.addr)
    await advanceTimersAsync(0)
    expect(canAdd).toHaveBeenCalledTimes(1)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([])

    await advanceTimersAsync(SEND_SETTLE_MS + 1)
    await done
    expect(machine.events).toEqual([
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ reason: 'timeout' })
      })
    ])
    expect(typesOf(wallet.dispatch)).not.toContain(REMOVE)
    wallet.select(SMART_ACCOUNT.addr)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([])
  })

  it('adds nothing where it throws', async () => {
    const { wallet, sender } = walletWith(OTHER)
    const { machine, done } = driveGated(sender, async () => {
      throw new Error('The storage did not answer.')
    })
    await advanceTimersAsync(0)
    wallet.select(SMART_ACCOUNT.addr)
    await advanceTimersAsync(SEND_SETTLE_MS + 1)
    await done
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([])
    expect(machine.events.map((event) => event.type)).toEqual(['error'])
  })

  it('adds the request once where it answers that the claim still holds', async () => {
    const { wallet, sender } = walletWith(OTHER)
    const canAdd = jest.fn(async () => true)
    const { machine, done } = driveGated(sender, canAdd)
    await advanceTimersAsync(0)
    wallet.select(SMART_ACCOUNT.addr)
    await advanceTimersAsync(0)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([SMART_ACCOUNT.addr])
    wallet.select(SMART_ACCOUNT.addr)
    await advanceTimersAsync(0)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([SMART_ACCOUNT.addr])
    expect(canAdd).toHaveBeenCalledTimes(1)

    broadcast(wallet, REQUEST_ID)
    await done
    expect(machine.events.map((event) => event.type)).toEqual(['sent', 'receipt'])
  })

  /** A gate whose answers the test gives, one read at a time. */
  const heldGate = () => {
    let answer: (holds: boolean) => void = () => {}
    const canAdd = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve
        })
    )
    return { canAdd, answer: (holds: boolean) => answer(holds) }
  }

  it('adds nothing on a yes where the user selected another account meanwhile, and asks again once the sending account is selected', async () => {
    const { wallet, sender } = walletWith(OTHER)
    const gate = heldGate()
    const { machine, done } = driveGated(sender, gate.canAdd)
    await advanceTimersAsync(0)
    wallet.select(SMART_ACCOUNT.addr)
    await advanceTimersAsync(0)
    expect(gate.canAdd).toHaveBeenCalledTimes(1)
    wallet.select(KEY_ACCOUNT.addr)
    await advanceTimersAsync(0)
    gate.answer(true)
    await advanceTimersAsync(0)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([])
    expect(typesOf(wallet.dispatch).filter((type) => type === SELECT)).toHaveLength(1)

    wallet.select(SMART_ACCOUNT.addr)
    await advanceTimersAsync(0)
    expect(gate.canAdd).toHaveBeenCalledTimes(2)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([])
    gate.answer(true)
    await advanceTimersAsync(0)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([SMART_ACCOUNT.addr])

    broadcast(wallet, REQUEST_ID)
    await done
    expect(machine.events.map((event) => event.type)).toEqual(['sent', 'receipt'])
  })

  it('adds nothing on a yes where the wallet selected the account already and the user selected another account during the read, and adds once the sending account is selected again', async () => {
    const { wallet, sender } = walletWith(SMART_ACCOUNT.addr)
    const gate = heldGate()
    const { machine, done } = driveGated(sender, gate.canAdd)
    await advanceTimersAsync(0)
    expect(gate.canAdd).toHaveBeenCalledTimes(1)
    wallet.select(KEY_ACCOUNT.addr)
    await advanceTimersAsync(0)
    gate.answer(true)
    await advanceTimersAsync(0)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([])
    expect(typesOf(wallet.dispatch)).not.toContain(SELECT)

    wallet.select(SMART_ACCOUNT.addr)
    await advanceTimersAsync(0)
    expect(gate.canAdd).toHaveBeenCalledTimes(2)
    gate.answer(true)
    await advanceTimersAsync(0)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([SMART_ACCOUNT.addr])

    broadcast(wallet, REQUEST_ID)
    await done
    expect(machine.events.map((event) => event.type)).toEqual(['sent', 'receipt'])
  })

  it('reads a timeout at its limit with nothing added and nothing removed where the sending account is never selected again', async () => {
    const { wallet, sender } = walletWith(OTHER)
    const gate = heldGate()
    const { machine, done } = driveGated(sender, gate.canAdd)
    await advanceTimersAsync(0)
    wallet.select(SMART_ACCOUNT.addr)
    await advanceTimersAsync(0)
    wallet.select(KEY_ACCOUNT.addr)
    await advanceTimersAsync(0)
    gate.answer(true)
    await advanceTimersAsync(DEFAULT_SEND_TIMEOUT_MS + SEND_SETTLE_MS + 1)
    await done
    expect(machine.events).toEqual([
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ reason: 'timeout' })
      })
    ])
    expect(gate.canAdd).toHaveBeenCalledTimes(1)
    expect(queuedAccountsOf(wallet.dispatch)).toEqual([])
    expect(typesOf(wallet.dispatch)).not.toContain(REMOVE)
  })
})
