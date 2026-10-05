/**
 * The send port sends one transaction from a key the keystore holds. It signs
 * and broadcasts nothing itself: it adds a transaction request to the request
 * queue, which lands in the action window, and answers the transaction hash of
 * its own call once the activity lists the operation the wallet broadcast.
 * The queue, the activity and the wallet's broadcast status are the fakes of
 * harness.ts, driven by hand.
 *
 * Where the wallet has no transaction of the key under the request, the port
 * rejects with a `SendRefusal` naming why. A refusal read from the queue never
 * comes while the wallet signs or broadcasts, nor before a settle period after
 * it stopped, since an operation that names the request may still come.
 */
import { Wallet } from 'ethers'

import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import eventBus from '@web/extension-services/event/eventBus'
import { addressOf } from '@web/modules/social-recovery/sdk-doubles'
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import {
  ABSENCE_GRACE_MS,
  accountFor,
  activityListing,
  activityOf,
  addedRequest,
  advance,
  basicAccount,
  BroadcastStatus,
  createSendPort,
  DEFAULT_SEND_TIMEOUT_MS,
  dispatched,
  flush,
  KeyHandle,
  mainStatus,
  OperationKind,
  operationFor,
  operationOf,
  queuedWith,
  queueOver,
  SEND_SETTLE_MS,
  SendRefusal,
  SendRefusalReason,
  SendRequestAction,
  sendQueueOver,
  sendRequestPort,
  SendWorld,
  SEPOLIA,
  smartAccount,
  thrownBy,
  track,
  waitingForSwitch,
  WINDOW_ID
} from './harness'

const WALLET = new Wallet(`0x${'11'.repeat(32)}`)
/** The sending key, a basic account the wallet lists. */
const KEY = WALLET.address as Address
const HANDLE: KeyHandle = { addr: KEY, type: 'internal' }
const OTHER_KEY = new Wallet(`0x${'22'.repeat(32)}`).address as Address

const MANAGER = addressOf('manager')
const TRANSACTION = { from: KEY, to: MANAGER, data: '0x1a2b3c4d' as Hex }

const HASH: Hex = `0x${'ab'.repeat(32)}`
const OTHER_HASH: Hex = `0x${'cd'.repeat(32)}`

const ADD = 'REQUESTS_CONTROLLER_ADD_USER_REQUEST'
const REMOVE = 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST'
const OPEN_SESSION = 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS'
const CLOSE_SESSION = 'MAIN_CONTROLLER_ACTIVITY_RESET_ACC_OPS_FILTERS'

const actionsOf = (dispatch: jest.Mock) => dispatched<SendRequestAction>(dispatch)
const typesOf = (dispatch: jest.Mock) => actionsOf(dispatch).map((a) => a.type)
const withdrew = (q: SendWorld, id: string | number) =>
  actionsOf(q.dispatch).some((a) => a.type === REMOVE && String(a.params.id) === String(id))

/** Sends TRANSACTION from HANDLE over a queue listing KEY, and answers the request id the port queued. */
const sending = (options: Parameters<typeof sendQueueOver>[1] = {}) => {
  const q = sendQueueOver([basicAccount(KEY)], options)
  const send = track(q.sender.send(HANDLE, TRANSACTION))
  const { id } = addedRequest(q.dispatch).userRequest
  return { q, send, id }
}

const reasonOf = (value: unknown) => (value as SendRefusal).reason

/** The port settled with a refusal for `reason`, for the key it was asked to send from. */
const expectRefusal = (seen: { status: string; value?: unknown }, reason: SendRefusalReason) => {
  expect(seen.status).toBe('rejected')
  expect(seen.value).toBeInstanceOf(Error)
  expect((seen.value as SendRefusal).name).toBe('SendRefusal')
  expect(reasonOf(seen.value)).toBe(reason)
  expect((seen.value as SendRefusal).key).toEqual(HANDLE)
}

/** The three refusals the port reads from the queue, each brought about the way the holder or the wait brings it. */
const QUEUE_REFUSALS: {
  reason: SendRefusalReason
  /** Brings the refusal about once the request is queued with its window open. */
  bring: (q: SendWorld, id: string | number) => Promise<void>
}[] = [
  {
    reason: 'refused',
    bring: async (q) => {
      q.push(queuedWith('closed'))
    }
  },
  {
    reason: 'window-closed',
    bring: async (q, id) => {
      q.push(queuedWith('closed', id))
      await advance(ABSENCE_GRACE_MS)
    }
  },
  {
    reason: 'timeout',
    bring: async () => {
      await advance(DEFAULT_SEND_TIMEOUT_MS)
    }
  }
]

// Every test runs on fake timers, so a send a test leaves pending never keeps
// the port's ten-minute wait alive after the test.
beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('the send port over the request queue', () => {
  it("adds one transaction request for the key's listed account, carrying the transaction", () => {
    const q = sendQueueOver([basicAccount(KEY)])
    q.sender.send(HANDLE, { ...TRANSACTION, value: 5n }).catch(() => undefined)
    const { userRequest, allowAccountSwitch } = addedRequest(q.dispatch)
    expect(allowAccountSwitch).toBe(true)
    expect(userRequest.meta).toEqual({
      isSignAction: true,
      accountAddr: KEY,
      keyType: 'internal',
      chainId: BigInt(SEPOLIA)
    })
    expect(userRequest.action).toEqual({
      kind: 'calls',
      calls: [{ to: MANAGER, value: 5n, data: TRANSACTION.data }]
    })
    expect(userRequest.session.windowId).toBe(WINDOW_ID)
  })

  it('sends no value where the transaction names none', () => {
    const q = sendQueueOver([basicAccount(KEY)])
    q.sender.send(HANDLE, TRANSACTION).catch(() => undefined)
    expect(addedRequest(q.dispatch).userRequest.action).toEqual({
      kind: 'calls',
      calls: [{ to: MANAGER, value: 0n, data: TRANSACTION.data }]
    })
  })

  it("follows the key's account on the chain in an activity session of the request's own id", () => {
    const { q, id } = sending()
    const [open] = actionsOf(q.dispatch)
    expect(open).toEqual({
      type: OPEN_SESSION,
      params: {
        sessionId: id,
        filters: { account: KEY, chainId: BigInt(SEPOLIA) },
        pagination: expect.objectContaining({ fromPage: 0 })
      }
    })
    expect(typesOf(q.dispatch)).toEqual([OPEN_SESSION, ADD])
  })

  it('answers the hash of its call once the activity lists the operation the wallet broadcast', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('open', id))
    q.push(queuedWith('closed'))
    q.push(activityListing(id, operationFor(id, { hash: HASH, callHash: HASH })))
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
    expect(actionsOf(q.dispatch)).toEqual([
      expect.objectContaining({ type: OPEN_SESSION }),
      expect.objectContaining({ type: ADD }),
      { type: CLOSE_SESSION, params: { sessionId: id } }
    ])
    expect(q.listeners()).toBe(0)
  })

  it("names the listed account's checksum address for a key given in lower case", async () => {
    const q = sendQueueOver([basicAccount(KEY)])
    const lower = KEY.toLowerCase() as Address
    expect(lower).not.toBe(KEY)
    const send = track(q.sender.send({ addr: lower, type: 'internal' }, TRANSACTION))
    const { userRequest } = addedRequest(q.dispatch)
    expect(userRequest.meta.accountAddr).toBe(KEY)
    const [open] = actionsOf(q.dispatch)
    expect(open.type === OPEN_SESSION && open.params.filters.account).toBe(KEY)
    q.push(activityListing(userRequest.id, operationFor(userRequest.id, { callHash: HASH })))
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
  })

  it("answers its own call's hash over the operation's where the two differ", async () => {
    const { q, send, id } = sending()
    q.push(activityListing(id, operationFor(id, { hash: OTHER_HASH, callHash: HASH })))
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
  })

  it("answers the operation's hash for its one transaction where its call carries none", async () => {
    const { q, send, id } = sending()
    q.push(activityListing(id, operationFor(id, { hash: HASH })))
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
  })

  it('ignores the operations of other requests and of other sessions', async () => {
    const { q, send, id } = sending()
    q.push(activityListing(id, operationFor('dapp-request', { hash: OTHER_HASH })))
    q.push(activityListing('another-page', operationFor(id, { hash: OTHER_HASH })))
    await flush()
    expect(send.status).toBe('pending')
    q.push(
      activityListing(
        id,
        operationFor('dapp-request', { hash: OTHER_HASH }),
        operationFor(id, { hash: HASH })
      )
    )
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
  })

  it('keeps waiting while its listed operation carries no transaction hash yet', async () => {
    const { q, send, id } = sending()
    q.push(activityListing(id, operationFor(id, { status: AccountOpStatus.Pending })))
    q.push(activityListing(id, operationFor(id, { hash: 'not-a-hash' })))
    await flush()
    expect(send.status).toBe('pending')
    q.push(activityListing(id, operationFor(id, { hash: HASH })))
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
  })

  it('settles once: a later update changes nothing, and it unsubscribes', async () => {
    const { q, send, id } = sending()
    q.push(activityListing(id, operationFor(id, { hash: HASH })))
    await flush()
    expect(q.listeners()).toBe(0)
    q.push(activityListing(id, operationFor(id, { hash: OTHER_HASH })))
    q.push(queuedWith('closed'))
    await advance(DEFAULT_SEND_TIMEOUT_MS * 2)
    expect(send).toEqual({ status: 'resolved', value: HASH })
    expect(typesOf(q.dispatch)).toEqual([OPEN_SESSION, ADD, CLOSE_SESSION])
  })

  it('gives each request an id of its own', () => {
    const q = sendQueueOver([basicAccount(KEY)])
    q.sender.send(HANDLE, TRANSACTION).catch(() => undefined)
    q.sender.send(HANDLE, TRANSACTION).catch(() => undefined)
    const ids = actionsOf(q.dispatch).flatMap((a) =>
      a.type === ADD ? [String(a.params.userRequest.id)] : []
    )
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  it('answers each of two sends the wallet batched into one operation the hash of its own call', async () => {
    const q = sendQueueOver([basicAccount(KEY)])
    const first = track(q.sender.send(HANDLE, TRANSACTION))
    const second = track(q.sender.send(HANDLE, { ...TRANSACTION, data: '0x5e6f7a8b' }))
    const [firstId, secondId] = actionsOf(q.dispatch).flatMap((a) =>
      a.type === ADD ? [a.params.userRequest.id] : []
    )
    const batch = operationOf(
      [
        { requestId: firstId, callHash: HASH },
        { requestId: secondId, callHash: OTHER_HASH }
      ],
      { kind: 'MultipleTxns', hash: OTHER_HASH }
    )
    q.push(activityOf({ [firstId]: [batch], [secondId]: [batch] }))
    await flush()
    expect(first).toEqual({ status: 'resolved', value: HASH })
    expect(second).toEqual({ status: 'resolved', value: OTHER_HASH })
  })

  it('refuses a transaction from another address than the key, before it queues anything', async () => {
    const q = sendQueueOver([basicAccount(KEY), basicAccount(OTHER_KEY)])
    const caught = await thrownBy(q.sender.send(HANDLE, { ...TRANSACTION, from: OTHER_KEY }))
    expect(caught).toBeInstanceOf(TypeError)
    expect(q.dispatch).not.toHaveBeenCalled()
    expect(q.listeners()).toBe(0)
  })
})

describe('the refusals', () => {
  it('refuses as refused once its request stays out of the queue for the settle period, and withdraws nothing', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('open', id))
    q.push(queuedWith('closed'))
    await advance(SEND_SETTLE_MS - 1)
    expect(send.status).toBe('pending')
    await advance(1)
    expectRefusal(send, 'refused')
    expect(typesOf(q.dispatch)).toEqual([OPEN_SESSION, ADD, CLOSE_SESSION])
    expect(q.listeners()).toBe(0)
  })

  it('does not refuse a request that moves to the account-switch list within the settle period', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('none', id))
    q.push(queuedWith('none'))
    await advance(SEND_SETTLE_MS - 1)
    q.push(waitingForSwitch(id))
    await advance(SEND_SETTLE_MS * 2)
    expect(send.status).toBe('pending')
  })

  it('does not refuse a request no queue state has held yet', async () => {
    const { q, send } = sending()
    q.push(queuedWith('open', 'dapp-request'))
    await advance(SEND_SETTLE_MS * 2)
    expect(send.status).toBe('pending')
  })

  it('withdraws its request once the window stays closed for the grace, and refuses as window-closed after the settle period', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('open', id))
    q.push(queuedWith('closed', id))
    await advance(ABSENCE_GRACE_MS - 1)
    expect(withdrew(q, id)).toBe(false)
    await advance(1)
    expect(actionsOf(q.dispatch)).toContainEqual({ type: REMOVE, params: { id } })
    expect(send.status).toBe('pending')
    await advance(SEND_SETTLE_MS)
    expectRefusal(send, 'window-closed')
    expect(actionsOf(q.dispatch)).toContainEqual({ type: CLOSE_SESSION, params: { sessionId: id } })
    expect(q.listeners()).toBe(0)
  })

  it('withdraws nothing when the window opens again within the grace', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('open', id))
    q.push(queuedWith('closed', id))
    await advance(ABSENCE_GRACE_MS - 1)
    q.push(queuedWith('open', id))
    await advance(ABSENCE_GRACE_MS * 2)
    expect(send.status).toBe('pending')
    expect(typesOf(q.dispatch)).not.toContain(REMOVE)
  })

  it('does not read a window that never opened as closed', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('none', id))
    q.push(queuedWith('closed', id))
    await advance(ABSENCE_GRACE_MS * 2)
    expect(send.status).toBe('pending')
    expect(typesOf(q.dispatch)).not.toContain(REMOVE)
  })

  it('refuses as not-broadcast when the activity lists its operation rejected with no hash', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('open', id))
    q.push(activityListing(id, operationFor(id, { status: AccountOpStatus.Rejected })))
    await flush()
    expectRefusal(send, 'not-broadcast')
    expect(typesOf(q.dispatch)).toEqual([OPEN_SESSION, ADD, CLOSE_SESSION])
    expect(q.listeners()).toBe(0)
  })

  it('withdraws its request once the wait passes with no answer, and refuses as timeout after the settle period', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('open', id))
    await advance(DEFAULT_SEND_TIMEOUT_MS - 1)
    expect(withdrew(q, id)).toBe(false)
    await advance(1)
    expect(actionsOf(q.dispatch)).toContainEqual({ type: REMOVE, params: { id } })
    expect(send.status).toBe('pending')
    await advance(SEND_SETTLE_MS)
    expectRefusal(send, 'timeout')
    expect(actionsOf(q.dispatch)).toContainEqual({ type: CLOSE_SESSION, params: { sessionId: id } })
    expect(q.listeners()).toBe(0)
  })

  it('takes a shorter wait from its options', async () => {
    const { send } = sending({ timeoutMs: 1000 })
    await advance(1000 + SEND_SETTLE_MS)
    expectRefusal(send, 'timeout')
  })

  it('keeps the refusal of a request it withdrew, though a queue state still lists it before the withdrawal lands', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('open', id))
    await advance(DEFAULT_SEND_TIMEOUT_MS)
    q.push(queuedWith('open', id))
    await advance(SEND_SETTLE_MS)
    expectRefusal(send, 'timeout')
  })

  describe('a key that is not itself a basic account the wallet lists', () => {
    const controllingKey = addressOf('controlling-key-at-index-plus-100000')
    const KEYS: [string, SendWorld['accounts']][] = [
      [
        'the controlling key of a smart account',
        [smartAccount(addressOf('smart-account'), controllingKey)]
      ],
      ['a key the wallet does not list', [basicAccount(KEY)]]
    ]
    KEYS.forEach(([title, accounts]) =>
      it(`refuses ${title} as not-wired, naming the missing background action, and dispatches nothing`, async () => {
        const q = sendQueueOver(accounts)
        const key: KeyHandle = { addr: controllingKey, type: 'internal' }
        const caught = await thrownBy(q.sender.send(key, { ...TRANSACTION, from: controllingKey }))
        const refusal = caught as SendRefusal
        expect(refusal).toBeInstanceOf(Error)
        expect(refusal.name).toBe('SendRefusal')
        expect(refusal.reason).toBe('not-wired')
        expect(refusal.missingAction).toBe('KEYSTORE_CONTROLLER_SEND_WITH_KEY')
        expect(refusal.message).toContain('KEYSTORE_CONTROLLER_SEND_WITH_KEY')
        expect(refusal.key).toEqual(key)
        expect(q.dispatch).not.toHaveBeenCalled()
        expect(q.listeners()).toBe(0)
      })
    )
  })
})

describe('while the wallet signs or broadcasts', () => {
  const BUSY: BroadcastStatus[] = ['SIGNING', 'BROADCASTING']

  QUEUE_REFUSALS.forEach(({ reason, bring }) =>
    BUSY.forEach((busy) =>
      it(`holds the ${reason} refusal while the wallet reads ${busy}, and for the settle period after`, async () => {
        const { q, send, id } = sending()
        q.push(queuedWith('open', id))
        q.push(mainStatus(busy))
        await bring(q, id)
        await advance(SEND_SETTLE_MS * 10)
        expect(send.status).toBe('pending')
        q.push(mainStatus('SUCCESS'))
        await advance(SEND_SETTLE_MS - 1)
        expect(send.status).toBe('pending')
        await advance(1)
        expectRefusal(send, reason)
      })
    )
  )

  QUEUE_REFUSALS.forEach(({ reason, bring }) =>
    it(`answers the hash of an operation naming the request that comes within the settle period, rather than the ${reason} refusal`, async () => {
      const { q, send, id } = sending()
      q.push(queuedWith('open', id))
      q.push(mainStatus('BROADCASTING'))
      await bring(q, id)
      q.push(mainStatus('SUCCESS'))
      await advance(SEND_SETTLE_MS - 1)
      q.push(activityListing(id, operationFor(id, { hash: HASH })))
      await flush()
      expect(send).toEqual({ status: 'resolved', value: HASH })
      await advance(SEND_SETTLE_MS * 2)
      expect(send).toEqual({ status: 'resolved', value: HASH })
    })
  )

  it('answers the hash of an operation that comes while the wallet still broadcasts, its request already gone', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('open', id))
    q.push(mainStatus('BROADCASTING'))
    q.push(queuedWith('closed'))
    await advance(SEND_SETTLE_MS * 10)
    q.push(activityListing(id, operationFor(id, { callHash: HASH })))
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
  })

  it('counts a full settle period again once the wallet signs anew within it', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('open', id))
    q.push(queuedWith('closed'))
    await advance(SEND_SETTLE_MS - 1)
    q.push(mainStatus('SIGNING'))
    await advance(SEND_SETTLE_MS * 5)
    q.push(mainStatus('INITIAL'))
    await advance(SEND_SETTLE_MS - 1)
    expect(send.status).toBe('pending')
    await advance(1)
    expectRefusal(send, 'refused')
  })

  it('reopens the wait, with no withdrawal, for a request that comes back to the queue within the settle period', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('open', id))
    q.push(queuedWith('closed'))
    await advance(SEND_SETTLE_MS - 1)
    q.push(queuedWith('open', id))
    await advance(SEND_SETTLE_MS * 10)
    expect(send.status).toBe('pending')
    expect(withdrew(q, id)).toBe(false)
    q.push(activityListing(id, operationFor(id, { hash: HASH })))
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
  })
})

describe('a request that waits for an account switch', () => {
  it('only marks a timeout while the request waits for the switch, and withdraws nothing', async () => {
    const { q, send, id } = sending()
    q.push(waitingForSwitch(id))
    await advance(DEFAULT_SEND_TIMEOUT_MS + SEND_SETTLE_MS * 10)
    expect(send.status).toBe('pending')
    expect(withdrew(q, id)).toBe(false)
  })

  it('withdraws the request once it enters the queue after the timeout, and refuses as timeout after the settle period', async () => {
    const { q, send, id } = sending()
    q.push(waitingForSwitch(id))
    await advance(DEFAULT_SEND_TIMEOUT_MS)
    q.push(queuedWith('open', id))
    expect(actionsOf(q.dispatch)).toContainEqual({ type: REMOVE, params: { id } })
    await advance(SEND_SETTLE_MS - 1)
    expect(send.status).toBe('pending')
    await advance(1)
    expectRefusal(send, 'timeout')
  })

  it('refuses as timeout with no withdrawal once the queue drops the request after the timeout', async () => {
    const { q, send, id } = sending()
    q.push(waitingForSwitch(id))
    await advance(DEFAULT_SEND_TIMEOUT_MS)
    q.push(queuedWith('none'))
    await advance(SEND_SETTLE_MS)
    expectRefusal(send, 'timeout')
    expect(withdrew(q, id)).toBe(false)
  })

  it('refuses as refused with no withdrawal when the holder declines the switch before the timeout', async () => {
    const { q, send, id } = sending()
    q.push(waitingForSwitch(id))
    q.push(queuedWith('none'))
    await advance(SEND_SETTLE_MS)
    expectRefusal(send, 'refused')
    expect(withdrew(q, id)).toBe(false)
  })
})

describe('what each refusal says', () => {
  const CASES: {
    title: string
    reason: SendRefusalReason
    /** Whether the wallet listed an operation under the request. */
    listed: boolean
    bring: (q: SendWorld, id: string | number) => Promise<void>
  }[] = [
    {
      title: 'the holder rejected the request',
      reason: 'refused',
      listed: false,
      bring: async (q, id) => {
        q.push(queuedWith('open', id))
        q.push(queuedWith('closed'))
      }
    },
    {
      title: 'the window closed on the queued request',
      reason: 'window-closed',
      listed: false,
      bring: async (q, id) => {
        q.push(queuedWith('open', id))
        q.push(queuedWith('closed', id))
        await advance(ABSENCE_GRACE_MS)
      }
    },
    {
      title: 'the wait passed with the request queued',
      reason: 'timeout',
      listed: false,
      bring: async (q, id) => {
        q.push(queuedWith('open', id))
        await advance(DEFAULT_SEND_TIMEOUT_MS)
      }
    },
    {
      title: 'the wait passed and the queue dropped the request that waited for a switch',
      reason: 'timeout',
      listed: false,
      bring: async (q, id) => {
        q.push(waitingForSwitch(id))
        await advance(DEFAULT_SEND_TIMEOUT_MS)
        q.push(queuedWith('none'))
      }
    },
    {
      title: 'the wallet rejected its operation before the chain',
      reason: 'not-broadcast',
      listed: true,
      bring: async (q, id) => {
        q.push(activityListing(id, operationFor(id, { status: AccountOpStatus.Rejected })))
      }
    },
    {
      title: 'the wallet submitted a user operation',
      reason: 'not-a-transaction',
      listed: true,
      bring: async (q, id) => {
        q.push(activityListing(id, operationFor(id, { kind: 'UserOperation' })))
      }
    }
  ]

  CASES.forEach(({ title, reason, listed, bring }) =>
    it(`says only what is true when ${title}`, async () => {
      const { q, send, id } = sending()
      await bring(q, id)
      await advance(SEND_SETTLE_MS)
      expectRefusal(send, reason)
      const { message } = send.value as SendRefusal
      expect(message).toContain(KEY)
      if (/withdrawn/.test(message)) expect(withdrew(q, id)).toBe(true)
      if (/no transaction was broadcast/.test(message)) expect(listed).toBe(false)
      expect(/may still reach the chain/.test(message)).toBe(reason === 'not-a-transaction')
    })
  )
})

describe('an operation another party sends', () => {
  const OTHERS: OperationKind[] = ['UserOperation', 'Relayer', 'PrivacyPoolsRelayer']

  OTHERS.forEach((kind) =>
    it(`refuses an operation identified as ${kind} as not-a-transaction, though it names a hash`, async () => {
      const { q, send, id } = sending()
      q.push(queuedWith('open', id))
      q.push(activityListing(id, operationFor(id, { kind, hash: HASH, callHash: HASH })))
      await flush()
      expectRefusal(send, 'not-a-transaction')
      expect(withdrew(q, id)).toBe(false)
      expect(q.listeners()).toBe(0)
    })
  )

  it('never answers the bundle hash of a user operation first listed with no hash', async () => {
    const { q, send, id } = sending()
    q.push(activityListing(id, operationFor(id, { kind: 'UserOperation' })))
    await flush()
    q.push(activityListing(id, operationFor(id, { kind: 'UserOperation', hash: HASH })))
    await flush()
    expectRefusal(send, 'not-a-transaction')
  })

  it("answers only its call's own hash for an operation of several transactions, never the operation's", async () => {
    const { q, send, id } = sending()
    q.push(activityListing(id, operationFor(id, { kind: 'MultipleTxns', hash: OTHER_HASH })))
    await flush()
    expect(send.status).toBe('pending')
    q.push(
      activityListing(
        id,
        operationFor(id, { kind: 'MultipleTxns', hash: OTHER_HASH, callHash: HASH })
      )
    )
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
  })
})

describe('once the activity lists the broadcast operation', () => {
  it('stops the timeout and waits for its hash with no limit', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('open', id))
    await advance(DEFAULT_SEND_TIMEOUT_MS - 1)
    q.push(activityListing(id, operationFor(id)))
    await advance(DEFAULT_SEND_TIMEOUT_MS * 3)
    expect(send.status).toBe('pending')
    expect(typesOf(q.dispatch)).not.toContain(REMOVE)
    q.push(activityListing(id, operationFor(id, { hash: HASH })))
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
  })

  it('reads neither the request leaving the queue nor the window closing as a refusal', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('open', id))
    q.push(activityListing(id, operationFor(id)))
    q.push(queuedWith('closed', id))
    q.push(queuedWith('closed'))
    await advance(ABSENCE_GRACE_MS * 3)
    expect(send.status).toBe('pending')
    expect(typesOf(q.dispatch)).not.toContain(REMOVE)
    q.push(activityListing(id, operationFor(id, { callHash: HASH })))
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
  })

  it('still refuses as not-broadcast when the wallet later marks the operation rejected with no hash', async () => {
    const { q, send, id } = sending()
    q.push(activityListing(id, operationFor(id)))
    await flush()
    expect(send.status).toBe('pending')
    q.push(activityListing(id, operationFor(id, { status: AccountOpStatus.Rejected })))
    await flush()
    expectRefusal(send, 'not-broadcast')
  })

  it('does not refuse a request the queue dropped just before the activity listed its operation', async () => {
    const { q, send, id } = sending()
    q.push(queuedWith('open', id))
    q.push(queuedWith('closed'))
    await advance(SEND_SETTLE_MS - 1)
    q.push(activityListing(id, operationFor(id)))
    await advance(SEND_SETTLE_MS * 2)
    expect(send.status).toBe('pending')
    q.push(activityListing(id, operationFor(id, { hash: HASH })))
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
  })
})

describe('what the port asks of the wallet', () => {
  it('signs nothing itself: it dispatches only the queue and activity actions, and the viem account still refuses a transaction', async () => {
    const { q, send, id } = sending()
    q.push(activityListing(id, operationFor(id, { hash: HASH })))
    await flush()
    expect(send.status).toBe('resolved')
    const types = typesOf(q.dispatch) as string[]
    types.forEach((t) => expect([ADD, REMOVE, OPEN_SESSION, CLOSE_SESSION]).toContain(t))
    expect(types.filter((t) => /KEYSTORE|SIGN|BROADCAST|PRIVATE_KEY|SEED/.test(t))).toEqual([])

    const signQueue = queueOver([basicAccount(KEY)])
    const account = accountFor(signQueue.signer, HANDLE)
    const caught = await thrownBy(
      account.signTransaction({ chainId: SEPOLIA, to: MANAGER, value: 0n, data: TRANSACTION.data })
    )
    expect(caught).toBeInstanceOf(Error)
    expect(signQueue.dispatch).not.toHaveBeenCalled()
  })
})

describe("the UI's own port over the event bus", () => {
  const CONTROLLERS = ['requests', 'activity', 'main']
  const listenerCounts = () => CONTROLLERS.map((type) => eventBus.events[type]?.length ?? 0)

  it('holds a refusal while the background pushes a broadcast in progress, answers the hash it then pushes, and leaves no listener behind', async () => {
    const before = listenerCounts()
    const dispatch = jest.fn()
    const sender = createSendPort(
      sendRequestPort(dispatch, () => [basicAccount(KEY)], WINDOW_ID),
      { chainId: SEPOLIA }
    )
    const send = track(sender.send(HANDLE, TRANSACTION))
    const { userRequest } = addedRequest(dispatch)
    expect(userRequest.session.windowId).toBe(WINDOW_ID)
    eventBus.emit('requests', queuedWith('open', userRequest.id).state)
    eventBus.emit('main', mainStatus('BROADCASTING').state)
    eventBus.emit('requests')
    eventBus.emit('activity')
    await advance(SEND_SETTLE_MS * 10)
    expect(send.status).toBe('pending')
    eventBus.emit(
      'activity',
      activityListing(userRequest.id, operationFor(userRequest.id, { hash: HASH })).state
    )
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
    expect(listenerCounts()).toEqual(before)
  })

  it('refuses a key while the wallet lists no accounts yet', async () => {
    const dispatch = jest.fn()
    const sender = createSendPort(
      sendRequestPort(dispatch, () => undefined),
      { chainId: SEPOLIA }
    )
    const caught = await thrownBy(sender.send(HANDLE, TRANSACTION))
    expect(reasonOf(caught)).toBe('not-wired')
    expect(dispatch).not.toHaveBeenCalled()
  })
})
