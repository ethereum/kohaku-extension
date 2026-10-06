/**
 * A page that did not queue a request reads where it stands: from the queue
 * the wallet holds now, then from the account's own activity on the chain,
 * read through an activity session of its own, page by page, over the UI's
 * own port on the event bus.
 */
import eventBus from '@web/extension-services/event/eventBus'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import {
  advance,
  basicAccount,
  CONTROLLING_KEY,
  dispatched,
  flush,
  HeldRequestQueue,
  ListedAccount,
  newSendRequestId,
  operationFor,
  operationOf,
  queuedRequest,
  queueHolding,
  REQUEST_STATE_READ_MS,
  SendRequestAction,
  sendRequestPort,
  sendRequestStateOf,
  SEPOLIA,
  SMART_ACCOUNT,
  smartAccount,
  SubmittedOperation,
  track
} from '@web/modules/social-recovery/shared/client/__tests__/harness'

const HASH: Hex = `0x${'ab'.repeat(32)}`
const CALL_HASH: Hex = `0x${'cd'.repeat(32)}`
const SELECTED = basicAccount(CONTROLLING_KEY)

const SET = 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS'
const RESET = 'MAIN_CONTROLLER_ACTIVITY_RESET_ACC_OPS_FILTERS'
const CONTROLLERS = ['requests', 'activity', 'main', 'signAccountOp']

const ID = newSendRequestId()
const OTHER_ID = newSendRequestId()

const listenerCount = () =>
  CONTROLLERS.reduce((sum, controller) => sum + (eventBus.events[controller]?.length ?? 0), 0)

/**
 * The UI's own port over a queue the test sets, the selected account listed
 * first and the smart account after it, as the wallet holds them.
 */
const wallet = () => {
  const held: { queue?: HeldRequestQueue; accounts: ListedAccount[] } = {
    accounts: [SELECTED, smartAccount(SMART_ACCOUNT, CONTROLLING_KEY)]
  }
  const dispatch = jest.fn()
  const port = sendRequestPort(
    dispatch,
    () => held.accounts,
    () => held.queue
  )
  const actions = () => dispatched<SendRequestAction>(dispatch)
  const asks = () => actions().flatMap((a) => (a.type === SET ? [a.params] : []))
  const sessionId = () => {
    const [first] = asks()
    if (!first) {
      throw new Error('The reading opened no activity session.')
    }
    return first.sessionId
  }
  /** Pushes one page of a session's operations, as the activity controller does. */
  const page = (
    items: SubmittedOperation[],
    { currentPage = 0, maxPages = 1, session = sessionId() } = {}
  ) =>
    eventBus.emit('activity', {
      accountsOps: { [session]: { result: { items, currentPage, maxPages } } }
    })
  /** Replaces the queue the wallet holds now. */
  const holdInQueue = (queue: HeldRequestQueue) => {
    held.queue = queue
  }
  return { held, dispatch, port, actions, asks, sessionId, page, holdInQueue }
}

const reading = (port: ReturnType<typeof wallet>['port'], account: Address = SMART_ACCOUNT) =>
  track(sendRequestStateOf(port, ID, account, SEPOLIA))

let before: number

beforeEach(() => {
  jest.useFakeTimers()
  before = listenerCount()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe("a queued request's state, read by another page", () => {
  describe('the queue, read first', () => {
    it('reads queued where the queue holds the request, opening no session and dispatching nothing', async () => {
      const { held, dispatch, port } = wallet()
      held.queue = queueHolding([
        queuedRequest(OTHER_ID, { account: SMART_ACCOUNT }),
        queuedRequest(ID, { account: SMART_ACCOUNT })
      ])
      const state = reading(port)
      await flush()
      expect(state).toEqual({ status: 'resolved', value: { status: 'queued' } })
      expect(dispatch).not.toHaveBeenCalled()
      expect(listenerCount()).toBe(before)
    })

    it('reads queued where the request waits for an account switch, dispatching nothing', async () => {
      const { held, dispatch, port } = wallet()
      held.queue = queueHolding([], [queuedRequest(ID, { account: SMART_ACCOUNT })])
      const state = reading(port)
      await flush()
      expect(state).toEqual({ status: 'resolved', value: { status: 'queued' } })
      expect(dispatch).not.toHaveBeenCalled()
    })

    it('reads the activity where the queue holds only other requests', async () => {
      const { held, port, asks, page } = wallet()
      held.queue = queueHolding(
        [queuedRequest(OTHER_ID, { account: SMART_ACCOUNT })],
        [queuedRequest(OTHER_ID, { account: SMART_ACCOUNT })]
      )
      const state = reading(port)
      expect(asks()).toHaveLength(1)
      page([operationFor(ID, { hash: HASH })])
      await flush()
      expect(state).toEqual({
        status: 'resolved',
        value: { status: 'broadcast', transactionHash: HASH }
      })
    })
  })

  describe('the session it opens', () => {
    it("filters by the account in the wallet's own letter case and the chain, whichever account is selected", () => {
      const { port, asks, sessionId } = wallet()
      reading(port, SMART_ACCOUNT.toLowerCase() as Address)
      expect(asks()).toEqual([
        {
          sessionId: sessionId(),
          filters: { account: SMART_ACCOUNT, chainId: BigInt(SEPOLIA) },
          pagination: { fromPage: 0, itemsPerPage: 10 }
        }
      ])
    })

    it('filters by the account as given where the wallet does not list it', () => {
      const { held, port, asks } = wallet()
      held.accounts = [SELECTED]
      const lower = SMART_ACCOUNT.toLowerCase() as Address
      reading(port, lower)
      expect(asks()[0].filters).toEqual({ account: lower, chainId: BigInt(SEPOLIA) })
    })

    it("is a session of its own, not the request's, and ignores the request's own session and the selected account's", async () => {
      const { port, sessionId, page } = wallet()
      const state = reading(port)
      expect(sessionId()).not.toBe(ID)
      page([operationFor(ID, { hash: HASH })], { session: ID })
      page([operationFor(ID, { hash: HASH })], { session: 'dashboard' })
      await flush()
      expect(state.status).toBe('pending')
      page([])
      await flush()
      expect(state).toEqual({ status: 'resolved', value: { status: 'gone' } })
    })

    it('takes a new session for each reading', () => {
      const first = wallet()
      const second = wallet()
      reading(first.port)
      reading(second.port)
      expect(first.sessionId()).not.toBe(second.sessionId())
    })
  })

  describe('the operation the activity lists', () => {
    Object.values(AccountOpStatus).forEach((status) =>
      it(`reads broadcast with the operation's hash where a transaction carrying the request is ${status}`, async () => {
        const { port, page } = wallet()
        const state = reading(port)
        page([
          operationFor(OTHER_ID, { hash: CALL_HASH }),
          operationFor(ID, { hash: HASH, status })
        ])
        await flush()
        expect(state).toEqual({
          status: 'resolved',
          value: { status: 'broadcast', transactionHash: HASH }
        })
      })
    )

    it("reads broadcast with the call's own hash where the wallet sent each call as its own transaction", async () => {
      const { port, page } = wallet()
      const state = reading(port)
      page([
        operationOf(
          [
            { requestId: OTHER_ID, callHash: HASH },
            { requestId: ID, callHash: CALL_HASH }
          ],
          { kind: 'MultipleTxns', hash: HASH }
        )
      ])
      await flush()
      expect(state).toEqual({
        status: 'resolved',
        value: { status: 'broadcast', transactionHash: CALL_HASH }
      })
    })

    it("reads queued, not the operation's hash, where its own call of several transactions has none yet", async () => {
      const { port, page } = wallet()
      const state = reading(port)
      page([
        operationOf([{ requestId: OTHER_ID, callHash: HASH }, { requestId: ID }], {
          kind: 'MultipleTxns',
          hash: HASH
        })
      ])
      await flush()
      expect(state).toEqual({ status: 'resolved', value: { status: 'queued' } })
    })

    it('reads gone where a transaction carrying the request was rejected with no hash', async () => {
      const { port, page } = wallet()
      const state = reading(port)
      page([operationFor(ID, { status: AccountOpStatus.Rejected })])
      await flush()
      expect(state).toEqual({ status: 'resolved', value: { status: 'gone' } })
    })

    Object.values(AccountOpStatus)
      .filter((status) => status !== AccountOpStatus.Rejected)
      .forEach((status) =>
        it(`reads queued where a transaction carrying the request is ${status} with no hash yet`, async () => {
          const { port, page } = wallet()
          const state = reading(port)
          page([operationFor(ID, { status })])
          await flush()
          expect(state).toEqual({ status: 'resolved', value: { status: 'queued' } })
        })
      )

    const OTHER_ROUTES = ['UserOperation', 'Relayer'] as const
    OTHER_ROUTES.forEach((kind) =>
      [HASH, undefined].forEach((hash) =>
        it(`reads untracked where the wallet submitted the request as a ${kind}, ${
          hash ? 'with a hash' : 'with no hash'
        }`, async () => {
          const { port, page } = wallet()
          const state = reading(port)
          page([operationFor(ID, { kind, hash })])
          await flush()
          expect(state).toEqual({ status: 'resolved', value: { status: 'untracked' } })
        })
      )
    )

    it('reads gone where the queue and every page of the activity lack the request', async () => {
      const { port, page } = wallet()
      const state = reading(port)
      page([operationFor(OTHER_ID, { hash: HASH })])
      await flush()
      expect(state).toEqual({ status: 'resolved', value: { status: 'gone' } })
    })
  })

  describe('the pages it reads', () => {
    it('asks the next page, ten at a time, until a later page lists the request', async () => {
      const { port, asks, page } = wallet()
      const state = reading(port)
      const others = Array.from({ length: 10 }, () =>
        operationFor(newSendRequestId(), { hash: HASH })
      )
      page(others, { currentPage: 0, maxPages: 4 })
      expect(asks().map((a) => a.pagination)).toEqual([
        { fromPage: 0, itemsPerPage: 10 },
        { fromPage: 1, itemsPerPage: 10 }
      ])
      page(others, { currentPage: 1, maxPages: 4 })
      await flush()
      expect(state.status).toBe('pending')
      page([operationFor(ID, { hash: CALL_HASH })], { currentPage: 2, maxPages: 4 })
      await flush()
      expect(state).toEqual({
        status: 'resolved',
        value: { status: 'broadcast', transactionHash: CALL_HASH }
      })
      expect(asks().map((a) => a.pagination?.fromPage)).toEqual([0, 1, 2])
      expect(new Set(asks().map((a) => a.sessionId)).size).toBe(1)
    })

    it('stops at the last page and reads gone, asking no page past it', async () => {
      const { port, asks, page } = wallet()
      const state = reading(port)
      page([operationFor(OTHER_ID)], { currentPage: 0, maxPages: 2 })
      page([operationFor(OTHER_ID)], { currentPage: 1, maxPages: 2 })
      await flush()
      expect(state).toEqual({ status: 'resolved', value: { status: 'gone' } })
      expect(asks().map((a) => a.pagination?.fromPage)).toEqual([0, 1])
    })

    it('reads gone over an empty activity', async () => {
      const { port, asks, page } = wallet()
      const state = reading(port)
      page([], { currentPage: 0, maxPages: 0 })
      await flush()
      expect(state).toEqual({ status: 'resolved', value: { status: 'gone' } })
      expect(asks()).toHaveLength(1)
    })

    it('ignores a push of a page other than the one it asked for', async () => {
      const { port, asks, page } = wallet()
      const state = reading(port)
      page([], { currentPage: 0, maxPages: 2 })
      page([operationFor(ID, { hash: HASH })], { currentPage: 0, maxPages: 2 })
      await flush()
      expect(state.status).toBe('pending')
      expect(asks()).toHaveLength(2)
      page([], { currentPage: 1, maxPages: 2 })
      await flush()
      expect(state).toEqual({ status: 'resolved', value: { status: 'gone' } })
    })

    it('ignores a push that holds no result for its session yet', async () => {
      const { port, sessionId } = wallet()
      const state = reading(port)
      eventBus.emit('activity', { accountsOps: { [sessionId()]: {} } })
      eventBus.emit('activity', {})
      eventBus.emit('activity')
      await flush()
      expect(state.status).toBe('pending')
    })
  })

  describe('the queue, read again before gone', () => {
    it('reads queued where the request reached the queue while the activity was read', async () => {
      const { held, port, page } = wallet()
      const state = reading(port)
      held.queue = queueHolding([queuedRequest(ID, { account: SMART_ACCOUNT })])
      page([])
      await flush()
      expect(state).toEqual({ status: 'resolved', value: { status: 'queued' } })
    })

    it('reads queued where the request moved to wait for an account switch while the activity was read', async () => {
      const { held, port, page } = wallet()
      const state = reading(port)
      held.queue = queueHolding([], [queuedRequest(ID, { account: SMART_ACCOUNT })])
      page([])
      await flush()
      expect(state).toEqual({ status: 'resolved', value: { status: 'queued' } })
    })
  })

  describe('the time limit', () => {
    it('reads unread where the first page does not come within the limit, and never gone', async () => {
      const { port } = wallet()
      const state = reading(port)
      await advance(REQUEST_STATE_READ_MS - 1)
      expect(state.status).toBe('pending')
      await advance(1)
      expect(state).toEqual({ status: 'resolved', value: { status: 'unread' } })
    })

    it('counts the limit again for each page it asks', async () => {
      const { port, page } = wallet()
      const state = reading(port)
      await advance(REQUEST_STATE_READ_MS - 1)
      page([], { currentPage: 0, maxPages: 2 })
      await advance(REQUEST_STATE_READ_MS - 1)
      expect(state.status).toBe('pending')
      await advance(1)
      expect(state).toEqual({ status: 'resolved', value: { status: 'unread' } })
    })

    it('ignores a page that comes after the limit', async () => {
      const { port, page } = wallet()
      const state = reading(port)
      await advance(REQUEST_STATE_READ_MS)
      page([operationFor(ID, { hash: HASH })])
      await flush()
      expect(state).toEqual({ status: 'resolved', value: { status: 'unread' } })
    })

    it('leaves no timer once it answered', async () => {
      const { port, page } = wallet()
      reading(port)
      page([operationFor(ID, { hash: HASH })])
      await flush()
      expect(jest.getTimerCount()).toBe(0)
    })
  })

  describe('the session closed in every outcome', () => {
    const OUTCOMES: [string, (w: ReturnType<typeof wallet>) => Promise<void>, string][] = [
      ['broadcast', async ({ page }) => page([operationFor(ID, { hash: HASH })]), 'broadcast'],
      [
        'untracked',
        async ({ page }) => page([operationFor(ID, { kind: 'UserOperation' })]),
        'untracked'
      ],
      ['queued from the activity', async ({ page }) => page([operationFor(ID)]), 'queued'],
      [
        'gone from a rejected transaction',
        async ({ page }) => page([operationFor(ID, { status: AccountOpStatus.Rejected })]),
        'gone'
      ],
      ['gone at the end of the list', async ({ page }) => page([]), 'gone'],
      [
        'queued from the queue read again',
        async ({ holdInQueue, page }) => {
          holdInQueue(queueHolding([queuedRequest(ID, { account: SMART_ACCOUNT })]))
          page([])
        },
        'queued'
      ],
      [
        'unread on a later page',
        async ({ page }) => {
          page([], { currentPage: 0, maxPages: 2 })
          await advance(REQUEST_STATE_READ_MS)
        },
        'unread'
      ]
    ]
    OUTCOMES.forEach(([label, answer, status]) =>
      it(`closes its session, removes its listeners and dispatches nothing else, reading ${label}`, async () => {
        const w = wallet()
        const state = reading(w.port)
        expect(listenerCount()).toBeGreaterThan(before)
        await answer(w)
        await flush()
        expect(state.status).toBe('resolved')
        expect((state.value as { status: string }).status).toBe(status)
        const sessionId = w.sessionId()
        const actions = w.actions()
        expect(
          actions.every(
            (a) => (a.type === SET || a.type === RESET) && a.params.sessionId === sessionId
          )
        ).toBe(true)
        expect(actions.filter((a) => a.type === RESET)).toEqual([
          { type: RESET, params: { sessionId } }
        ])
        expect(actions[actions.length - 1].type).toBe(RESET)
        expect(listenerCount()).toBe(before)

        w.page([operationFor(ID, { hash: HASH })], { currentPage: 1, maxPages: 3 })
        await advance(REQUEST_STATE_READ_MS * 2)
        expect(w.actions()).toHaveLength(actions.length)
      })
    )
  })
})
