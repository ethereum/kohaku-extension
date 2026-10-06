/**
 * A request the send port withdraws is gone only once the wallet's queue
 * shows it gone and the sign screen no longer holds an operation that carries
 * it. The wallet drops every action a hidden tab dispatches while its pushes
 * still reach that tab, it removes a request only from its waiting requests,
 * never from those that wait for an account switch, and a sign screen that
 * pauses or signs keeps the operation it froze. So the port refuses a
 * withdrawn send only a settle period after both let go of the request, sends
 * the removal again when it can arrive and the sign screen neither signs nor
 * pauses on it, and until then still answers the hash of an operation that
 * carries the request.
 *
 * The fake dispatch records every action and applies none, so a dropped
 * removal is a test that never pushes a queue without the request.
 */
import { Wallet } from 'ethers'

import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import type { SignUserRequest } from '@ambire-common/interfaces/userRequest'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import {
  ABSENCE_GRACE_MS,
  activityListing,
  addedRequest,
  advance,
  basicAccount,
  BATCH,
  CONTROLLING_KEY,
  DEFAULT_SEND_TIMEOUT_MS,
  dispatched,
  fakeVisibility,
  flush,
  HeldAndPushedQueue,
  KeyHandle,
  mainStatus,
  operationFor,
  operationOf,
  queuedRequest,
  queueHolding,
  requestsPush,
  SEND_SETTLE_MS,
  SendPort,
  SendPortOptions,
  SendRefusal,
  SendRefusalReason,
  SendRequestAction,
  SendRequestUpdate,
  sendQueueOver,
  SendWorld,
  signAccountOpPush,
  SMART_ACCOUNT,
  smartAccount,
  track,
  TrackedSend
} from '@web/modules/social-recovery/shared/client/__tests__/harness'

const KEY = new Wallet(`0x${'11'.repeat(32)}`).address as Address
const HANDLE: KeyHandle = { addr: KEY, type: 'internal' }
const TRANSACTION = { from: KEY, to: SMART_ACCOUNT, data: '0x1a2b3c4d' as Hex }
const HASH: Hex = `0x${'ab'.repeat(32)}`

const REMOVE = 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST'
const CLOSE_SESSION = 'MAIN_CONTROLLER_ACTIVITY_RESET_ACC_OPS_FILTERS'

const actionsOf = (q: SendWorld) => dispatched<SendRequestAction>(q.dispatch)
const removals = (q: SendWorld) => actionsOf(q).filter((a) => a.type === REMOVE)
const closedSession = (q: SendWorld) => actionsOf(q).some((a) => a.type === CLOSE_SESSION)
const reasonOf = (send: TrackedSend) => (send.value as SendRefusal).reason

/** The queue holding these requests with the action window closed. */
const closedWindow = (
  requests: SignUserRequest[],
  waiting: SignUserRequest[] = []
): HeldAndPushedQueue => ({
  ...queueHolding(requests, waiting),
  actions: { actionWindow: { windowProps: null } }
})

const SUBJECTS = [
  {
    title: "a key's own transaction",
    account: KEY,
    accounts: () => [basicAccount(KEY)],
    start: (sender: SendPort) => sender.send(HANDLE, TRANSACTION)
  },
  {
    title: "a listed smart account's batch",
    account: SMART_ACCOUNT,
    accounts: () => [smartAccount(SMART_ACCOUNT, CONTROLLING_KEY)],
    start: (sender: SendPort) => sender.sendAccountBatch(SMART_ACCOUNT, BATCH)
  }
]

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
})

SUBJECTS.forEach(({ title, account, accounts, start }) =>
  describe(title, () => {
    /** A `calls` request a dapp queued for the same account on the test chain. */
    const dapp = queuedRequest('dapp-request', { account: account.toLowerCase() })

    const sending = (options: Partial<SendPortOptions> = {}) => {
      const q = sendQueueOver(accounts(), options)
      const send = track(start(q.sender))
      const id = String(addedRequest(q.dispatch).userRequest.id)
      const own = queuedRequest(id, { account })
      return { q, send, id, own }
    }

    /** The sign screen holding the operation of these requests at a status. */
    const signScreen = (ids: string[], status: SigningStatus) =>
      signAccountOpPush({
        accountOp: {
          accountAddr: account,
          calls: ids.map((fromUserRequestId) => ({ fromUserRequestId }))
        },
        status: { type: status }
      })

    /**
     * Each reason the port withdraws for: how it comes about, the queue that
     * still lists the request, the queue where it waits for an account switch,
     * and the queue once the removal landed.
     */
    const WITHDRAWALS: {
      reason: SendRefusalReason
      withdraw: (q: SendWorld, own: SignUserRequest) => Promise<void>
      listed: (own: SignUserRequest) => HeldAndPushedQueue
      waiting: (own: SignUserRequest) => HeldAndPushedQueue
      gone: () => HeldAndPushedQueue
    }[] = [
      {
        reason: 'other-request-pending',
        withdraw: async (q, own) => {
          q.show(queueHolding([own]))
          q.show(queueHolding([own, dapp]))
        },
        listed: (own) => queueHolding([own, dapp]),
        waiting: (own) => queueHolding([dapp], [own]),
        gone: () => queueHolding([dapp])
      },
      {
        reason: 'timeout',
        withdraw: async (q, own) => {
          q.show(queueHolding([own]))
          await advance(DEFAULT_SEND_TIMEOUT_MS)
        },
        listed: (own) => queueHolding([own]),
        waiting: (own) => queueHolding([], [own]),
        gone: () => queueHolding([])
      },
      {
        reason: 'window-closed',
        withdraw: async (q, own) => {
          q.show(queueHolding([own]))
          q.show(closedWindow([own]))
          await advance(ABSENCE_GRACE_MS)
        },
        listed: (own) => closedWindow([own]),
        waiting: (own) => closedWindow([], [own]),
        gone: () => closedWindow([])
      }
    ]

    /** The send refuses for `reason` exactly one settle period from now, and leaves nothing behind. */
    const refusesOneSettleLater = async (
      q: SendWorld,
      send: TrackedSend,
      reason: SendRefusalReason
    ) => {
      await advance(SEND_SETTLE_MS - 1)
      expect(send.status).toBe('pending')
      expect(q.listeners()).toBe(1)
      await advance(1)
      expect(send.status).toBe('rejected')
      expect(reasonOf(send)).toBe(reason)
      expect(q.listeners()).toBe(0)
      expect(closedSession(q)).toBe(true)
      expect(jest.getTimerCount()).toBe(0)
    }

    WITHDRAWALS.forEach(({ reason, withdraw, listed, waiting, gone }) =>
      describe(`a withdrawal for ${reason}`, () => {
        it('stays pending and subscribed well past the settle period while the queue still lists the request, and answers the hash of an operation that carries it', async () => {
          const { q, send, id, own } = sending()
          await withdraw(q, own)
          expect(removals(q)).toEqual([{ type: REMOVE, params: { id } }])
          for (let i = 0; i < 5; i++) {
            q.show(listed(own))
            // eslint-disable-next-line no-await-in-loop
            await advance(SEND_SETTLE_MS * 4)
          }
          expect(send.status).toBe('pending')
          expect(q.listeners()).toBe(1)
          expect(closedSession(q)).toBe(false)
          expect(removals(q)).toHaveLength(1)
          q.push(
            activityListing(
              id,
              operationOf([{ requestId: id }, { requestId: 'dapp-request' }], { hash: HASH })
            )
          )
          await flush()
          expect(send).toEqual({ status: 'resolved', value: HASH })
          expect(q.listeners()).toBe(0)
          expect(jest.getTimerCount()).toBe(0)
        })

        it('refuses exactly one settle period after a queue state shows the request gone, not before', async () => {
          const { q, send, own } = sending()
          await withdraw(q, own)
          q.show(listed(own))
          await advance(SEND_SETTLE_MS * 3)
          expect(send.status).toBe('pending')
          q.show(gone())
          await refusesOneSettleLater(q, send, reason)
        })

        it('counts the settle period from the first queue state without the request, not from a later one', async () => {
          const { q, send, own } = sending()
          await withdraw(q, own)
          q.show(gone())
          await advance(SEND_SETTLE_MS - 2)
          q.show(gone())
          await advance(1)
          expect(send.status).toBe('pending')
          await advance(1)
          expect(reasonOf(send)).toBe(reason)
        })

        it('still answers the hash of an operation that comes within the settle period after the confirmation', async () => {
          const { q, send, id, own } = sending()
          await withdraw(q, own)
          q.show(gone())
          await advance(SEND_SETTLE_MS - 1)
          q.push(activityListing(id, operationFor(id, { hash: HASH })))
          await flush()
          expect(send).toEqual({ status: 'resolved', value: HASH })
          expect(jest.getTimerCount()).toBe(0)
        })

        it('stops the settle period and sends the removal again for a request a later push lists again', async () => {
          const { q, send, id, own } = sending()
          await withdraw(q, own)
          q.show(gone())
          await advance(SEND_SETTLE_MS - 1)
          q.show(listed(own))
          expect(removals(q)).toEqual([
            { type: REMOVE, params: { id } },
            { type: REMOVE, params: { id } }
          ])
          await advance(SEND_SETTLE_MS * 3)
          expect(send.status).toBe('pending')
          expect(q.listeners()).toBe(1)
          q.show(gone())
          await refusesOneSettleLater(q, send, reason)
          expect(removals(q)).toHaveLength(2)
        })

        it('sends the removal again once when the request moves from the account-switch list into the waiting requests', async () => {
          const { q, send, id, own } = sending()
          await withdraw(q, own)
          q.show(waiting(own))
          await advance(SEND_SETTLE_MS * 3)
          expect(send.status).toBe('pending')
          expect(removals(q)).toHaveLength(1)
          q.show(listed(own))
          expect(removals(q)).toEqual([
            { type: REMOVE, params: { id } },
            { type: REMOVE, params: { id } }
          ])
          q.show(listed(own))
          expect(removals(q)).toHaveLength(2)
          q.show(gone())
          await refusesOneSettleLater(q, send, reason)
        })

        it('sends the removal again once the hidden page is shown with the request still listed', async () => {
          const page = fakeVisibility('hidden')
          const { q, send, id, own } = sending({ visibility: page.source })
          await withdraw(q, own)
          q.show(listed(own))
          await advance(SEND_SETTLE_MS * 3)
          expect(removals(q)).toHaveLength(1)
          page.show()
          expect(removals(q)).toEqual([
            { type: REMOVE, params: { id } },
            { type: REMOVE, params: { id } }
          ])
          expect(send.status).toBe('pending')
          q.show(gone())
          await refusesOneSettleLater(q, send, reason)
          expect(page.listeners()).toBe(0)
        })
      })
    )

    describe("the page's visibility", () => {
      const joinedWithdrawal = (options: Partial<SendPortOptions> = {}) => {
        const sent = sending(options)
        sent.q.show(queueHolding([sent.own]))
        sent.q.show(queueHolding([sent.own, dapp]))
        expect(removals(sent.q)).toHaveLength(1)
        return sent
      }

      it('sends nothing more when the page is shown after the queue showed the request gone', async () => {
        const page = fakeVisibility('hidden')
        const { q, send } = joinedWithdrawal({ visibility: page.source })
        q.show(queueHolding([dapp]))
        page.show()
        expect(removals(q)).toHaveLength(1)
        await refusesOneSettleLater(q, send, 'other-request-pending')
      })

      it('sends nothing more when the page is shown while the request waits for an account switch', async () => {
        const page = fakeVisibility('hidden')
        const { q, send, own } = joinedWithdrawal({ visibility: page.source })
        q.show(queueHolding([dapp], [own]))
        page.show()
        expect(removals(q)).toHaveLength(1)
        expect(send.status).toBe('pending')
      })

      it('sends nothing on a change that leaves the page hidden', async () => {
        const page = fakeVisibility('hidden')
        const { q, send, own } = joinedWithdrawal({ visibility: page.source })
        q.show(queueHolding([own, dapp]))
        page.hide()
        expect(removals(q)).toHaveLength(1)
        expect(send.status).toBe('pending')
      })

      it('sends the removal again on each showing while the request stays listed', async () => {
        const page = fakeVisibility('hidden')
        const { q, own } = joinedWithdrawal({ visibility: page.source })
        page.show()
        page.hide()
        q.show(queueHolding([own, dapp]))
        page.show()
        expect(removals(q)).toHaveLength(3)
      })

      it('without a page given, sends the removal once while the request stays listed, throws nothing, and refuses once it is gone', async () => {
        const { q, send, own } = joinedWithdrawal()
        for (let i = 0; i < 3; i++) {
          q.show(queueHolding([own, dapp]))
          // eslint-disable-next-line no-await-in-loop
          await advance(SEND_SETTLE_MS * 3)
        }
        expect(removals(q)).toHaveLength(1)
        expect(send.status).toBe('pending')
        q.show(queueHolding([dapp]))
        await refusesOneSettleLater(q, send, 'other-request-pending')
      })

      it('adds its listener only at the withdrawal, once', async () => {
        const page = fakeVisibility('hidden')
        const { q, own } = sending({ visibility: page.source })
        q.show(queueHolding([own]))
        await advance(SEND_SETTLE_MS * 3)
        expect(page.listeners()).toBe(0)
        q.show(queueHolding([own, dapp]))
        expect(page.listeners()).toBe(1)
        q.show(queueHolding([dapp]))
        q.show(queueHolding([own, dapp]))
        await advance(DEFAULT_SEND_TIMEOUT_MS)
        expect(page.listeners()).toBe(1)
      })

      it('adds no listener for a send that ends with no withdrawal', async () => {
        const page = fakeVisibility('hidden')
        const { q, send, id, own } = sending({ visibility: page.source })
        q.show(queueHolding([own]))
        q.push(activityListing(id, operationFor(id, { hash: HASH })))
        await flush()
        expect(send.status).toBe('resolved')
        expect(page.listeners()).toBe(0)
      })

      it('adds no listener and sends no removal for a refusal that withdraws nothing', async () => {
        const page = fakeVisibility('hidden')
        const { q, send, own } = sending({ visibility: page.source })
        q.show(queueHolding([own]))
        q.show(queueHolding([]))
        expect(page.listeners()).toBe(0)
        page.show()
        expect(removals(q)).toEqual([])
        await refusesOneSettleLater(q, send, 'refused')
      })

      const ENDINGS: {
        ending: string
        end: (q: SendWorld, id: string) => Promise<void>
        status: TrackedSend['status']
      }[] = [
        {
          ending: 'a refusal',
          end: async (q) => {
            q.show(queueHolding([dapp]))
            await advance(SEND_SETTLE_MS)
          },
          status: 'rejected'
        },
        {
          ending: 'a hash',
          end: async (q, id) => {
            q.push(activityListing(id, operationFor(id, { hash: HASH })))
            await flush()
          },
          status: 'resolved'
        },
        {
          ending: 'an operation another party sends',
          end: async (q, id) => {
            q.push(activityListing(id, operationFor(id, { kind: 'UserOperation' })))
            await flush()
          },
          status: 'rejected'
        },
        {
          ending: 'an operation the wallet rejected',
          end: async (q, id) => {
            q.push(activityListing(id, operationFor(id, { status: AccountOpStatus.Rejected })))
            await flush()
          },
          status: 'rejected'
        }
      ]
      ENDINGS.forEach(({ ending, end, status }) =>
        it(`removes its listener and leaves no timer once the send ends with ${ending}`, async () => {
          const page = fakeVisibility('hidden')
          const { q, send, id } = joinedWithdrawal({ visibility: page.source })
          expect(page.listeners()).toBe(1)
          await end(q, id)
          expect(send.status).toBe(status)
          expect(page.listeners()).toBe(0)
          expect(q.listeners()).toBe(0)
          expect(jest.getTimerCount()).toBe(0)
          page.show()
          expect(removals(q)).toHaveLength(1)
        })
      )
    })

    describe('a withdrawal before any queue state listed the request', () => {
      it('refuses a settle period after the time limit, with no further push, where the queue the page holds lists it in neither list', async () => {
        const page = fakeVisibility('hidden')
        const { q, send, id } = sending({ visibility: page.source })
        await advance(DEFAULT_SEND_TIMEOUT_MS)
        expect(removals(q)).toEqual([{ type: REMOVE, params: { id } }])
        await refusesOneSettleLater(q, send, 'timeout')
        expect(page.listeners()).toBe(0)
      })

      it('waits for the sign screen to let go of the request where the queue the page holds lists it in neither list', async () => {
        const { q, send, id } = sending()
        q.push(signScreen([id], SigningStatus.ReadyToSign))
        await advance(DEFAULT_SEND_TIMEOUT_MS)
        expect(removals(q)).toEqual([{ type: REMOVE, params: { id } }])
        await advance(SEND_SETTLE_MS * 10)
        expect(send.status).toBe('pending')
        expect(q.listeners()).toBe(1)
        q.push(signAccountOpPush({}))
        await refusesOneSettleLater(q, send, 'timeout')
      })

      const HELD: [string, (own: SignUserRequest) => HeldAndPushedQueue][] = [
        ['among the waiting requests', (own) => queueHolding([own])],
        ['among those that wait for an account switch', (own) => queueHolding([], [own])]
      ]
      HELD.forEach(([where, held]) =>
        it(`waits for a queue state without the request where the queue the page holds lists it ${where}`, async () => {
          const { q, send, own } = sending()
          q.queue = held(own)
          await advance(DEFAULT_SEND_TIMEOUT_MS + SEND_SETTLE_MS * 5)
          expect(send.status).toBe('pending')
          q.show(queueHolding([]))
          await refusesOneSettleLater(q, send, 'timeout')
        })
      )
    })

    describe('the window closed while the sign screen signs or pauses on the request', () => {
      ;[SigningStatus.InProgress, SigningStatus.UpdatesPaused].forEach((status) =>
        it(`withdraws nothing at ${status}, and withdraws once the signing ends back at ready to sign with the request still queued`, async () => {
          const { q, send, id, own } = sending()
          q.show(queueHolding([own]))
          q.show(closedWindow([own]))
          q.push(signScreen([id], status))
          await advance(ABSENCE_GRACE_MS * 3 + SEND_SETTLE_MS * 3)
          q.show(closedWindow([own]))
          await advance(ABSENCE_GRACE_MS * 3)
          expect(removals(q)).toEqual([])
          expect(send.status).toBe('pending')
          q.push(signScreen([id], SigningStatus.ReadyToSign))
          expect(removals(q)).toEqual([{ type: REMOVE, params: { id } }])
          await advance(SEND_SETTLE_MS * 3)
          expect(send.status).toBe('pending')
          q.show(closedWindow([]))
          await advance(SEND_SETTLE_MS * 3)
          expect(send.status).toBe('pending')
          q.push(signAccountOpPush({}))
          await refusesOneSettleLater(q, send, 'window-closed')
        })
      )

      it('withdraws nothing where the window closes after the signing began, until the signing ends', async () => {
        const { q, send, id, own } = sending()
        q.show(queueHolding([own]))
        q.push(signScreen([id], SigningStatus.InProgress))
        q.show(closedWindow([own]))
        await advance(ABSENCE_GRACE_MS * 3)
        expect(removals(q)).toEqual([])
        q.push(signScreen([id], SigningStatus.ReadyToSign))
        expect(removals(q)).toEqual([{ type: REMOVE, params: { id } }])
        q.show(closedWindow([]))
        await advance(SEND_SETTLE_MS * 3)
        expect(send.status).toBe('pending')
        q.push(signAccountOpPush({}))
        await refusesOneSettleLater(q, send, 'window-closed')
      })

      it('answers the hash when the holder signs from the sign screen after the window closed', async () => {
        const { q, send, id, own } = sending()
        q.show(queueHolding([own]))
        q.show(closedWindow([own]))
        q.push(signScreen([id], SigningStatus.InProgress))
        q.push(mainStatus('BROADCASTING'))
        await advance(ABSENCE_GRACE_MS * 3)
        q.push(activityListing(id, operationFor(id, { hash: HASH })))
        await flush()
        expect(send).toEqual({ status: 'resolved', value: HASH })
        expect(removals(q)).toEqual([])
        expect(jest.getTimerCount()).toBe(0)
      })

      it('withdraws nothing when the window shows again before the signing ends', async () => {
        const { q, send, id, own } = sending()
        q.show(queueHolding([own]))
        q.show(closedWindow([own]))
        q.push(signScreen([id], SigningStatus.InProgress))
        await advance(ABSENCE_GRACE_MS * 3)
        q.show(queueHolding([own]))
        q.push(signScreen([id], SigningStatus.ReadyToSign))
        await advance(ABSENCE_GRACE_MS * 3)
        expect(removals(q)).toEqual([])
        expect(send.status).toBe('pending')
      })

      it('withdraws nothing when the signing ends where the queue no longer holds the request', async () => {
        const { q, send, id, own } = sending()
        q.show(queueHolding([own]))
        q.show(closedWindow([own]))
        q.push(signScreen([id], SigningStatus.Done))
        q.push(mainStatus('BROADCASTING'))
        await advance(ABSENCE_GRACE_MS * 3)
        q.show(closedWindow([]))
        q.push(signAccountOpPush({}))
        expect(removals(q)).toEqual([])
        q.push(activityListing(id, operationFor(id, { hash: HASH })))
        await flush()
        expect(send).toEqual({ status: 'resolved', value: HASH })
      })

      it('withdraws for the time limit where it also passed while the sign screen signed', async () => {
        const { q, send, id, own } = sending()
        q.show(queueHolding([own]))
        q.show(closedWindow([own]))
        q.push(signScreen([id], SigningStatus.InProgress))
        await advance(DEFAULT_SEND_TIMEOUT_MS)
        q.push(signScreen([id], SigningStatus.ReadyToSign))
        expect(removals(q)).toEqual([{ type: REMOVE, params: { id } }])
        q.show(closedWindow([]))
        await advance(SEND_SETTLE_MS * 3)
        expect(send.status).toBe('pending')
        q.push(signAccountOpPush({}))
        await refusesOneSettleLater(q, send, 'timeout')
      })

      it('withdraws for the closed window rather than for a request that joined while it signed', async () => {
        const { q, send, id, own } = sending()
        q.show(queueHolding([own]))
        q.show(closedWindow([own]))
        q.push(signScreen([id], SigningStatus.InProgress))
        await advance(ABSENCE_GRACE_MS)
        q.show(closedWindow([own, dapp]))
        expect(removals(q)).toEqual([])
        q.push(signScreen([id], SigningStatus.ReadyToSign))
        expect(removals(q)).toEqual([{ type: REMOVE, params: { id } }])
        q.show(closedWindow([dapp]))
        await advance(SEND_SETTLE_MS * 3)
        expect(send.status).toBe('pending')
        q.push(signScreen(['dapp-request'], SigningStatus.ReadyToSign))
        await refusesOneSettleLater(q, send, 'window-closed')
      })
    })

    describe('a removal a hidden tab cannot send', () => {
      /**
       * The save waits in the wallet, the holder moves to a dapp's tab, and
       * the dapp queues calls for the same account and chain. The wallet
       * drops the port's removal, so the request stays queued with the
       * dapp's.
       */
      const hiddenJoin = async () => {
        const page = fakeVisibility('visible')
        const sent = sending({ visibility: page.source })
        sent.q.show(queueHolding([sent.own]))
        page.hide()
        sent.q.show(queueHolding([sent.own, dapp]))
        expect(removals(sent.q)).toEqual([{ type: REMOVE, params: { id: sent.id } }])
        for (let i = 0; i < 10; i++) {
          sent.q.show(queueHolding([sent.own, dapp]))
          // eslint-disable-next-line no-await-in-loop
          await advance(SEND_SETTLE_MS * 2)
        }
        expect(sent.send.status).toBe('pending')
        expect(sent.q.listeners()).toBe(1)
        expect(closedSession(sent.q)).toBe(false)
        expect(removals(sent.q)).toHaveLength(1)
        return { ...sent, page }
      }

      it('never reads the send as not sent, and answers the hash when the holder signs the joined operation', async () => {
        const { q, send, id, page } = await hiddenJoin()
        q.push(signScreen([id, 'dapp-request'], SigningStatus.InProgress))
        q.push(mainStatus('SIGNING'))
        q.push(mainStatus('BROADCASTING'))
        await advance(SEND_SETTLE_MS * 3)
        expect(send.status).toBe('pending')
        q.push(
          activityListing(
            id,
            operationOf([{ requestId: id }, { requestId: 'dapp-request' }], { hash: HASH })
          )
        )
        await flush()
        expect(send).toEqual({ status: 'resolved', value: HASH })
        expect(page.listeners()).toBe(0)
        expect(q.listeners()).toBe(0)
        expect(jest.getTimerCount()).toBe(0)
      })

      it('sends the removal again once the tab is shown, and refuses exactly one settle period after the queue shows it gone', async () => {
        const { q, send, id, page } = await hiddenJoin()
        page.show()
        expect(removals(q)).toEqual([
          { type: REMOVE, params: { id } },
          { type: REMOVE, params: { id } }
        ])
        await advance(SEND_SETTLE_MS * 3)
        expect(send.status).toBe('pending')
        q.show(queueHolding([dapp]))
        await refusesOneSettleLater(q, send, 'other-request-pending')
        expect(page.listeners()).toBe(0)
      })
    })

    describe('a sign screen that still holds a withdrawn request', () => {
      /** The port withdrew its request for a dapp's that joined it, the sign screen not yet signing. */
      const withdrawnForJoin = (options: Partial<SendPortOptions> = {}) => {
        const sent = sending(options)
        sent.q.show(queueHolding([sent.own]))
        sent.q.show(queueHolding([sent.own, dapp]))
        expect(removals(sent.q)).toEqual([{ type: REMOVE, params: { id: sent.id } }])
        return sent
      }
      /** The sign screen's operation, which the queue joined from the two requests. */
      const joinedScreen = (id: string, status: SigningStatus) =>
        signScreen([id, 'dapp-request'], status)
      /** The holder signs from the sign screen and the wallet broadcasts and lists the operation. */
      const holderSigns = async (q: SendWorld, id: string) => {
        q.push(joinedScreen(id, SigningStatus.InProgress))
        q.push(mainStatus('SIGNING'))
        q.push(joinedScreen(id, SigningStatus.Done))
        q.push(mainStatus('BROADCASTING'))
        q.push(signAccountOpPush({}))
        q.push(mainStatus('SUCCESS'))
        await advance(SEND_SETTLE_MS - 1)
        q.push(
          activityListing(
            id,
            operationOf([{ requestId: id }, { requestId: 'dapp-request' }], { hash: HASH })
          )
        )
        await flush()
      }

      describe('the save tab hidden at a join, then the sign screen paused on the joined operation', () => {
        /**
         * The save tab is hidden, a dapp's request joins the save's, and the
         * wallet drops the port's removal. The holder presses Sign; a warning
         * shows, so the sign screen pauses on the joined operation. Then the
         * holder looks at the save tab.
         */
        const pausedAfterHiddenJoin = () => {
          const page = fakeVisibility('visible')
          const sent = sending({ visibility: page.source })
          sent.q.show(queueHolding([sent.own]))
          page.hide()
          sent.q.show(queueHolding([sent.own, dapp]))
          expect(removals(sent.q)).toHaveLength(1)
          sent.q.push(joinedScreen(sent.id, SigningStatus.UpdatesPaused))
          page.show()
          expect(removals(sent.q)).toHaveLength(1)
          return { ...sent, page }
        }

        it('sends no removal while paused, and answers the hash when the holder signs from the pause after the queue dropped the request', async () => {
          const { q, send, id, page } = pausedAfterHiddenJoin()
          q.show(queueHolding([dapp]))
          await advance(SEND_SETTLE_MS * 10)
          expect(send.status).toBe('pending')
          expect(q.listeners()).toBe(1)
          expect(closedSession(q)).toBe(false)
          await holderSigns(q, id)
          expect(send).toEqual({ status: 'resolved', value: HASH })
          expect(removals(q)).toHaveLength(1)
          expect(page.listeners()).toBe(0)
          expect(q.listeners()).toBe(0)
          expect(jest.getTimerCount()).toBe(0)
        })

        const LETTING_GO: [string, (q: SendWorld) => void, (q: SendWorld) => void][] = [
          [
            'the queue first, then the sign screen',
            (q) => q.show(queueHolding([dapp])),
            (q) => q.push(signScreen(['dapp-request'], SigningStatus.ReadyToSign))
          ],
          [
            'the sign screen first, then the queue',
            (q) => q.push(signAccountOpPush({})),
            (q) => q.show(queueHolding([dapp]))
          ]
        ]
        LETTING_GO.forEach(([order, first, second]) =>
          it(`sends the removal once when the pause ends at ready to sign, and refuses one settle period after the later of the two letting go, ${order}`, async () => {
            const { q, send, id, own, page } = pausedAfterHiddenJoin()
            q.show(queueHolding([own, dapp]))
            expect(removals(q)).toHaveLength(1)
            q.push(joinedScreen(id, SigningStatus.ReadyToSign))
            expect(removals(q)).toEqual([
              { type: REMOVE, params: { id } },
              { type: REMOVE, params: { id } }
            ])
            q.push(joinedScreen(id, SigningStatus.ReadyToSign))
            q.show(queueHolding([own, dapp]))
            expect(removals(q)).toHaveLength(2)
            first(q)
            await advance(SEND_SETTLE_MS * 10)
            expect(send.status).toBe('pending')
            expect(q.listeners()).toBe(1)
            second(q)
            await refusesOneSettleLater(q, send, 'other-request-pending')
            expect(removals(q)).toHaveLength(2)
            expect(page.listeners()).toBe(0)
          })
        )
      })

      const LET_GO: [string, (id: string) => SendRequestUpdate][] = [
        ['a reset state', () => signAccountOpPush({})],
        [
          "another request's operation",
          () => signScreen(['dapp-request'], SigningStatus.ReadyToSign)
        ],
        [
          'an operation with no status',
          (id) =>
            signAccountOpPush({
              accountOp: { accountAddr: account, calls: [{ fromUserRequestId: id }] },
              status: null
            })
        ],
        ['no operation', () => signAccountOpPush({ status: { type: SigningStatus.ReadyToSign } })]
      ]

      ;[SigningStatus.ReadyToSign, SigningStatus.UpdatesPaused, SigningStatus.InProgress].forEach(
        (status) =>
          describe(`a queue state without the request while the sign screen holds it at ${status}`, () => {
            const heldAfterQueueDropped = () => {
              const sent = withdrawnForJoin()
              sent.q.push(joinedScreen(sent.id, status))
              sent.q.show(queueHolding([dapp]))
              return sent
            }

            it('stays pending and subscribed well past the settle period, and answers the hash of a later operation', async () => {
              const { q, send, id } = heldAfterQueueDropped()
              await advance(SEND_SETTLE_MS * 10)
              expect(send.status).toBe('pending')
              expect(q.listeners()).toBe(1)
              expect(closedSession(q)).toBe(false)
              q.push(
                activityListing(
                  id,
                  operationOf([{ requestId: id }, { requestId: 'dapp-request' }], { hash: HASH })
                )
              )
              await flush()
              expect(send).toEqual({ status: 'resolved', value: HASH })
              expect(removals(q)).toHaveLength(1)
              expect(jest.getTimerCount()).toBe(0)
            })

            LET_GO.forEach(([how, push]) =>
              it(`refuses one settle period after a sign screen push with ${how}`, async () => {
                const { q, send, id } = heldAfterQueueDropped()
                await advance(SEND_SETTLE_MS * 10)
                expect(send.status).toBe('pending')
                q.push(push(id))
                await refusesOneSettleLater(q, send, 'other-request-pending')
                expect(removals(q)).toHaveLength(1)
              })
            )
          })
      )

      it('takes the confirmation back for a sign screen push that carries the request again within the settle period', async () => {
        const { q, send, id } = withdrawnForJoin()
        q.show(queueHolding([dapp]))
        await advance(SEND_SETTLE_MS - 1)
        q.push(joinedScreen(id, SigningStatus.ReadyToSign))
        await advance(SEND_SETTLE_MS * 10)
        expect(send.status).toBe('pending')
        expect(q.listeners()).toBe(1)
        q.push(signAccountOpPush({}))
        await refusesOneSettleLater(q, send, 'other-request-pending')
      })

      it('answers the hash where the sign screen carries the request again within the settle period and the holder signs it', async () => {
        const { q, send, id } = withdrawnForJoin()
        q.push(joinedScreen(id, SigningStatus.ReadyToSign))
        q.show(queueHolding([dapp]))
        q.push(signAccountOpPush({}))
        await advance(SEND_SETTLE_MS - 1)
        q.push(joinedScreen(id, SigningStatus.InProgress))
        await advance(SEND_SETTLE_MS * 10)
        expect(send.status).toBe('pending')
        q.push(activityListing(id, operationFor(id, { hash: HASH })))
        await flush()
        expect(send).toEqual({ status: 'resolved', value: HASH })
      })

      it('never refuses where the removal lands just as the holder presses Sign, and answers the hash', async () => {
        const { q, send, id, own } = sending()
        q.show(queueHolding([own]))
        q.push(signScreen([id], SigningStatus.ReadyToSign))
        q.show(queueHolding([own, dapp]))
        expect(removals(q)).toHaveLength(1)
        q.show(queueHolding([dapp]))
        // The wallet's own signing status comes some time after the sign screen's.
        q.push(signScreen([id], SigningStatus.InProgress))
        await advance(SEND_SETTLE_MS * 3)
        expect(send.status).toBe('pending')
        await holderSigns(q, id)
        expect(send).toEqual({ status: 'resolved', value: HASH })
        expect(removals(q)).toHaveLength(1)
        expect(q.listeners()).toBe(0)
        expect(jest.getTimerCount()).toBe(0)
      })
      ;[
        SigningStatus.UpdatesPaused,
        SigningStatus.InProgress,
        SigningStatus.WaitingForPaymaster,
        SigningStatus.Done
      ].forEach((status) =>
        it(`sends no removal by a queue push or by the page shown while the sign screen is at ${status}, and sends it once the signing ends with the request still waiting`, async () => {
          const page = fakeVisibility('hidden')
          const { q, send, id, own } = withdrawnForJoin({ visibility: page.source })
          q.push(joinedScreen(id, status))
          page.show()
          q.show(queueHolding([dapp], [own]))
          q.show(queueHolding([own, dapp]))
          page.hide()
          page.show()
          await advance(SEND_SETTLE_MS * 10)
          expect(removals(q)).toHaveLength(1)
          expect(send.status).toBe('pending')
          q.push(joinedScreen(id, SigningStatus.ReadyToSign))
          expect(removals(q)).toEqual([
            { type: REMOVE, params: { id } },
            { type: REMOVE, params: { id } }
          ])
        })
      )

      describe('the queue the port last saw pushed, when the signing ends', () => {
        it('sends no removal where the last push no longer lists the request, though the getter still does', async () => {
          const { q, send, id } = withdrawnForJoin()
          q.push(joinedScreen(id, SigningStatus.InProgress))
          q.push(requestsPush(queueHolding([dapp])))
          q.push(joinedScreen(id, SigningStatus.ReadyToSign))
          expect(removals(q)).toHaveLength(1)
          q.push(signScreen(['dapp-request'], SigningStatus.ReadyToSign))
          await refusesOneSettleLater(q, send, 'other-request-pending')
        })

        it('sends the removal again where the last push still lists the request, though the getter no longer does', async () => {
          const { q, send, id } = withdrawnForJoin()
          q.push(joinedScreen(id, SigningStatus.InProgress))
          q.queue = queueHolding([dapp])
          q.push(joinedScreen(id, SigningStatus.ReadyToSign))
          expect(removals(q)).toEqual([
            { type: REMOVE, params: { id } },
            { type: REMOVE, params: { id } }
          ])
          await advance(SEND_SETTLE_MS * 10)
          expect(send.status).toBe('pending')
        })
      })
    })
  })
)
