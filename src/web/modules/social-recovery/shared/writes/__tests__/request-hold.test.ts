/**
 * Where the wallet holds the request a stored claim was queued under, read by
 * a page that did not queue it, over the UI's own port on the event bus: the
 * sign screen can still hold a request the queue dropped, and a key the wallet
 * no longer lists can still have a request in the queue.
 */
import eventBus from '@web/extension-services/event/eventBus'
import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import {
  advance,
  basicAccount,
  CONTROLLING_KEY,
  dispatched,
  flush,
  HeldWallet,
  newSendRequestId,
  queuedRequest,
  queueHolding,
  REQUEST_STATE_READ_MS,
  SendRequestAction,
  sendRequestPort,
  SEPOLIA,
  SMART_ACCOUNT,
  smartAccount,
  track
} from '@web/modules/social-recovery/shared/client/__tests__/harness'
import { requestHoldOf } from '@web/modules/social-recovery/shared/writes'

const SET = 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS'
const INIT = 'INIT_CONTROLLER_STATE'

/** The UI's own port over a wallet the test sets; asked for the sign screen's state, it pushes the one set. */
const wallet = () => {
  const held: HeldWallet = {
    accounts: [basicAccount(CONTROLLING_KEY), smartAccount(SMART_ACCOUNT, CONTROLLING_KEY)],
    signer: null
  }
  const dispatch = jest.fn((action: SendRequestAction) => {
    const { signer } = held
    if (action.type === INIT && signer !== 'silent') {
      eventBus.emit('signAccountOp', signer)
    }
  })
  const port = sendRequestPort(
    dispatch,
    () => held.accounts,
    () => held.queue,
    () => undefined
  )
  const actions = () => dispatched<SendRequestAction>(dispatch)
  /** Pushes an empty first and last page of the activity session the reading opened. */
  const emptyActivity = () => {
    const sessionId = actions().flatMap((a) => (a.type === SET ? [a.params.sessionId] : []))[0]
    eventBus.emit('activity', {
      accountsOps: { [sessionId]: { result: { items: [], currentPage: 0, maxPages: 1 } } }
    })
  }
  return { held, port, actions, emptyActivity }
}

/** A sign screen that signs a batch of the requests `ids`, which takes no calls update. */
const signing = (ids: string[]) => ({
  accountOp: {
    accountAddr: SMART_ACCOUNT,
    calls: ids.map((fromUserRequestId) => ({ fromUserRequestId }))
  },
  status: { type: SigningStatus.InProgress }
})

beforeEach(() => jest.useFakeTimers())
afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe("a claim's request, read where the account is listed", () => {
  it('reads held where the sign screen still signs a batch that carries the request the queue dropped', async () => {
    const id = newSendRequestId()
    const other = newSendRequestId()
    const { held, port, emptyActivity } = wallet()
    held.signer = signing([id, other])
    held.queue = queueHolding([queuedRequest(other, { account: SMART_ACCOUNT })])
    const hold = track(requestHoldOf(port, id, SMART_ACCOUNT, SEPOLIA))
    emptyActivity()
    await flush()
    expect(hold).toEqual({ status: 'resolved', value: { status: 'held' } })
  })
})

describe("a claim's request, read where the wallet no longer lists the key that queued it", () => {
  it('reads held where the queue still holds the request', async () => {
    const id = newSendRequestId()
    const { held, port, actions } = wallet()
    held.queue = queueHolding([queuedRequest(id, { account: CONTROLLING_KEY })])
    const hold = track(requestHoldOf(port, id, undefined, SEPOLIA))
    await flush()
    expect(hold).toEqual({ status: 'resolved', value: { status: 'held' } })
    expect(actions()).toEqual([])
  })

  it('reads held where the sign screen still holds the request', async () => {
    const id = newSendRequestId()
    const { held, port } = wallet()
    held.signer = signing([id])
    const hold = track(requestHoldOf(port, id, undefined, SEPOLIA))
    await flush()
    expect(hold).toEqual({ status: 'resolved', value: { status: 'held' } })
  })

  it('reads free, with no activity read, where neither the queue nor the sign screen holds the request', async () => {
    const id = newSendRequestId()
    const other = newSendRequestId()
    const { held, port, actions } = wallet()
    held.signer = signing([other])
    held.queue = queueHolding([queuedRequest(other, { account: CONTROLLING_KEY })])
    const hold = track(requestHoldOf(port, id, undefined, SEPOLIA))
    await flush()
    expect(hold).toEqual({ status: 'resolved', value: { status: 'free' } })
    expect(actions().map((a) => a.type)).toEqual([INIT])
  })

  it('throws, with no activity read, where the queue does not hold the request and the sign screen never answers', async () => {
    const id = newSendRequestId()
    const { held, port, actions } = wallet()
    held.signer = 'silent'
    const hold = track(requestHoldOf(port, id, undefined, SEPOLIA))
    await flush()
    expect(hold.status).toBe('pending')
    await advance(REQUEST_STATE_READ_MS)
    expect(hold.status).toBe('rejected')
    expect(actions().map((a) => a.type)).toEqual([INIT])
  })
})
