/**
 * The wallet joins every `calls` request of one account and chain into one
 * operation, so the holder would sign another request together with the
 * port's own. The port queues nothing where another such request already
 * waits, and withdraws its own request where one joins it before the wallet
 * signs it. The id the caller gives is the id the port queues and follows.
 */
import { Wallet } from 'ethers'

import { EstimationStatus } from '@ambire-common/controllers/estimation/types'
import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import type { SignUserRequest } from '@ambire-common/interfaces/userRequest'
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import {
  activityListing,
  addedRequest,
  advance,
  basicAccount,
  BATCH,
  CONTROLLING_KEY,
  dispatched,
  flush,
  KeyHandle,
  mainStatus,
  newSendRequestId,
  operationFor,
  QueuedFor,
  queuedRequest,
  queueHolding,
  requestsPush,
  SEND_SETTLE_MS,
  SendPort,
  SendRefusal,
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
const OTHER_ACCOUNT = new Wallet(`0x${'66'.repeat(32)}`).address as Address
const TRANSACTION = { from: KEY, to: SMART_ACCOUNT, data: '0x1a2b3c4d' as Hex }
const HASH: Hex = `0x${'ab'.repeat(32)}`

const ADD = 'REQUESTS_CONTROLLER_ADD_USER_REQUEST'
const REMOVE = 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST'

/**
 * The sign screen's statuses under which it may sign the operation it holds
 * as it stands, the pause for a warning first, as the screen moves through
 * them.
 */
const SIGNING = [
  SigningStatus.UpdatesPaused,
  SigningStatus.InProgress,
  SigningStatus.WaitingForPaymaster,
  SigningStatus.Done
]
const NOT_SIGNING = Object.values(SigningStatus).filter((status) => !SIGNING.includes(status))

const actionsOf = (dispatch: jest.Mock) => dispatched<SendRequestAction>(dispatch)
const removals = (dispatch: jest.Mock) => actionsOf(dispatch).filter((a) => a.type === REMOVE)

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

/** A `calls` request a dapp queued for the account on the test chain, in the account's lower case. */
const dappCalls = (account: Address) =>
  queuedRequest('dapp-request', { account: account.toLowerCase() })

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
    describe('another request of the account already in the queue', () => {
      const BLOCKING: [string, (a: Address) => ReturnType<typeof queueHolding>][] = [
        ['in the queue', (a) => queueHolding([dappCalls(a)])],
        ['waiting for an account switch', (a) => queueHolding([], [dappCalls(a)])]
      ]
      BLOCKING.forEach(([where, queue]) =>
        it(`refuses as other-request-pending with a request ${where}, dispatching nothing and following nothing`, async () => {
          const q = sendQueueOver(accounts())
          q.queue = queue(account)
          const send = track(start(q.sender))
          await flush()
          expect(send.status).toBe('rejected')
          const caught = send.value as SendRefusal
          expect(caught).toBeInstanceOf(Error)
          expect(caught.name).toBe('SendRefusal')
          expect(caught.reason).toBe('other-request-pending')
          expect(caught.message).toContain(account)
          expect(q.dispatch).not.toHaveBeenCalled()
          expect(q.listeners()).toBe(0)
        })
      )

      const NOT_BLOCKING: [string, QueuedFor][] = [
        ['of another account', { account: OTHER_ACCOUNT }],
        ['of the account on another chain', { account, chainId: 1n }],
        ['of the account that is not a calls request', { account, kind: 'message' }],
        ['of the account that signs typed data', { account, kind: 'typedMessage' }]
      ]
      NOT_BLOCKING.forEach(([label, facts]) =>
        it(`queues its request beside a request ${label}`, () => {
          const q = sendQueueOver(accounts())
          q.queue = queueHolding([queuedRequest('dapp-request', facts)], [])
          const send = track(start(q.sender))
          expect(actionsOf(q.dispatch).map((a) => a.type)).toContain(ADD)
          expect(send.status).toBe('pending')
        })
      )

      it('queues its request over an empty queue the wallet has not filled yet', () => {
        const q = sendQueueOver(accounts())
        q.queue = {}
        start(q.sender).catch(() => undefined)
        expect(actionsOf(q.dispatch).map((a) => a.type)).toContain(ADD)
      })
    })

    describe('another request of the account that joins its own', () => {
      const sending = () => {
        const q = sendQueueOver(accounts())
        const send = track(start(q.sender))
        const id = String(addedRequest(q.dispatch).userRequest.id)
        const own = queuedRequest(id, { account })
        return { q, send, id, own }
      }
      /** The queue once the removal landed: the dapp's request alone. */
      const gone = () => requestsPush(queueHolding([dappCalls(account)]))
      /**
       * The send stays pending past the settle period while no queue state
       * showed its request gone, and refuses one settle period after one does.
       * Where the sign screen still holds an operation that carries the
       * request, the send also stays pending after the queue state, until
       * `release`, the sign screen's push that no longer carries it.
       */
      const refusesOnceGone = async (
        q: SendWorld,
        send: TrackedSend,
        release?: SendRequestUpdate
      ) => {
        await advance(SEND_SETTLE_MS * 3)
        expect(send.status).toBe('pending')
        expect(q.listeners()).toBe(1)
        q.push(gone())
        if (release) {
          await advance(SEND_SETTLE_MS * 3)
          expect(send.status).toBe('pending')
          expect(q.listeners()).toBe(1)
          q.push(release)
        }
        await advance(SEND_SETTLE_MS - 1)
        expect(send.status).toBe('pending')
        await advance(1)
        expect(send.status).toBe('rejected')
        expect((send.value as SendRefusal).reason).toBe('other-request-pending')
        expect(q.listeners()).toBe(0)
      }

      it('withdraws its own request and refuses as other-request-pending a settle period after the queue shows it gone', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own])))
        await flush()
        expect(removals(q.dispatch)).toEqual([])
        q.push(requestsPush(queueHolding([own, dappCalls(account)])))
        expect(removals(q.dispatch)).toEqual([{ type: REMOVE, params: { id } }])
        await refusesOnceGone(q, send)
      })

      it('withdraws its own request for another one that waits for an account switch', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own], [dappCalls(account)])))
        expect(removals(q.dispatch)).toEqual([{ type: REMOVE, params: { id } }])
        await advance(SEND_SETTLE_MS * 3)
        expect(send.status).toBe('pending')
        q.push(requestsPush(queueHolding([], [dappCalls(account)])))
        await advance(SEND_SETTLE_MS)
        expect((send.value as SendRefusal).reason).toBe('other-request-pending')
      })

      it('withdraws while the sign screen holds the joined operation but the wallet has not started to sign', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own])))
        q.push(
          signAccountOpPush({
            accountOp: {
              accountAddr: account,
              calls: [{ fromUserRequestId: id }, { fromUserRequestId: 'dapp-request' }]
            },
            estimation: { status: EstimationStatus.Loading }
          })
        )
        q.push(mainStatus('INITIAL'))
        q.push(requestsPush(queueHolding([own, dappCalls(account)])))
        expect(removals(q.dispatch)).toEqual([{ type: REMOVE, params: { id } }])
        await refusesOnceGone(q, send)
      })

      /** The sign screen holding an operation whose calls came from these requests, at a signing status. */
      const signScreen = (ids: string[], status?: SigningStatus) =>
        signAccountOpPush({
          accountOp: {
            accountAddr: account,
            calls: ids.map((fromUserRequestId) => ({ fromUserRequestId }))
          },
          ...(status ? { status: { type: status } } : {})
        })
      const joined = (own: SignUserRequest) => queueHolding([own, dappCalls(account)])
      const withdrawal = (id: string) => [{ type: REMOVE, params: { id } }]

      SIGNING.forEach((status) =>
        it(`withdraws nothing for a join while the sign screen signs its request at ${status}, and answers the hash`, async () => {
          const { q, send, id, own } = sending()
          q.push(requestsPush(queueHolding([own])))
          q.push(signScreen([id], status))
          q.push(mainStatus('SIGNING'))
          q.push(requestsPush(joined(own)))
          q.push(mainStatus('BROADCASTING'))
          q.push(requestsPush(joined(own)))
          await advance(SEND_SETTLE_MS * 3)
          expect(removals(q.dispatch)).toEqual([])
          expect(send.status).toBe('pending')
          q.push(activityListing(id, operationFor(id, { hash: HASH })))
          await flush()
          expect(send).toEqual({ status: 'resolved', value: HASH })
        })
      )

      NOT_SIGNING.forEach((status) =>
        it(`withdraws for a join while the sign screen holds its request at ${status}`, async () => {
          const { q, send, id, own } = sending()
          q.push(requestsPush(queueHolding([own])))
          q.push(signScreen([id], status))
          q.push(requestsPush(joined(own)))
          expect(removals(q.dispatch)).toEqual(withdrawal(id))
          await refusesOnceGone(q, send, signScreen(['dapp-request'], status))
        })
      )

      it('withdraws for a join while the wallet signs another flow and the sign screen shows no signing status for its request, refusing once the wallet stops', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own])))
        q.push(signScreen([id], SigningStatus.ReadyToSign))
        q.push(mainStatus('SIGNING'))
        q.push(requestsPush(joined(own)))
        expect(removals(q.dispatch)).toEqual(withdrawal(id))
        q.push(gone())
        q.push(signScreen(['dapp-request'], SigningStatus.ReadyToSign))
        await advance(SEND_SETTLE_MS * 3)
        expect(send.status).toBe('pending')
        q.push(mainStatus('SUCCESS'))
        await advance(SEND_SETTLE_MS - 1)
        expect(send.status).toBe('pending')
        await advance(1)
        expect((send.value as SendRefusal).reason).toBe('other-request-pending')
      })

      it('still answers the hash the activity names where it withdrew while the wallet signed', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own])))
        q.push(signScreen([id]))
        q.push(mainStatus('SIGNING'))
        q.push(requestsPush(joined(own)))
        expect(removals(q.dispatch)).toEqual(withdrawal(id))
        await advance(SEND_SETTLE_MS * 3)
        expect(send.status).toBe('pending')
        q.push(activityListing(id, operationFor(id, { hash: HASH })))
        await flush()
        expect(send).toEqual({ status: 'resolved', value: HASH })
      })

      SIGNING.forEach((status) =>
        it(`withdraws for a join while the sign screen signs another request's operation at ${status}`, async () => {
          const { q, send, id, own } = sending()
          q.push(requestsPush(queueHolding([own])))
          q.push(signScreen(['elsewhere'], status))
          q.push(mainStatus('SIGNING'))
          q.push(requestsPush(joined(own)))
          expect(removals(q.dispatch)).toEqual(withdrawal(id))
          q.push(mainStatus('SUCCESS'))
          await refusesOnceGone(q, send)
        })
      )

      /** Each push that ends the signing, and whether its operation still carries the request. */
      const ENDINGS: [string, (id: string) => SendRequestUpdate, boolean][] = [
        ['back at ready to sign', (id) => signScreen([id], SigningStatus.ReadyToSign), true],
        [
          "at another request's operation",
          () => signScreen(['elsewhere'], SigningStatus.InProgress),
          false
        ],
        ['reset', () => signAccountOpPush({}), false]
      ]
      ENDINGS.forEach(([ending, push, carries]) =>
        it(`withdraws once, on the push of the sign screen ${ending}, for a join the queue already holds`, async () => {
          const { q, send, id, own } = sending()
          q.push(requestsPush(queueHolding([own])))
          q.push(signScreen([id], SigningStatus.InProgress))
          q.queue = joined(own)
          q.push(requestsPush(q.queue))
          expect(removals(q.dispatch)).toEqual([])
          q.push(push(id))
          expect(removals(q.dispatch)).toEqual(withdrawal(id))
          q.push(push(id))
          q.push(requestsPush(q.queue))
          expect(removals(q.dispatch)).toEqual(withdrawal(id))
          await refusesOnceGone(
            q,
            send,
            carries ? signScreen(['dapp-request'], SigningStatus.ReadyToSign) : undefined
          )
        })
      )

      it('withdraws nothing for a join while the sign screen pauses on its request, and withdraws once when the pause ends back at ready to sign', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own])))
        q.push(signScreen([id], SigningStatus.UpdatesPaused))
        q.queue = joined(own)
        q.push(requestsPush(q.queue))
        await advance(SEND_SETTLE_MS * 3)
        expect(removals(q.dispatch)).toEqual([])
        expect(send.status).toBe('pending')
        q.push(signScreen([id], SigningStatus.ReadyToSign))
        expect(removals(q.dispatch)).toEqual(withdrawal(id))
        q.push(signScreen([id], SigningStatus.ReadyToSign))
        q.push(requestsPush(q.queue))
        expect(removals(q.dispatch)).toEqual(withdrawal(id))
        await refusesOnceGone(q, send, signScreen(['dapp-request'], SigningStatus.ReadyToSign))
      })

      it('withdraws nothing for a join while the sign screen pauses on its request, and answers the hash the holder signs from the pause', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own])))
        q.push(signScreen([id], SigningStatus.UpdatesPaused))
        q.queue = joined(own)
        q.push(requestsPush(q.queue))
        q.push(signScreen([id], SigningStatus.InProgress))
        q.push(mainStatus('SIGNING'))
        q.push(requestsPush(q.queue))
        await advance(SEND_SETTLE_MS * 3)
        expect(removals(q.dispatch)).toEqual([])
        expect(send.status).toBe('pending')
        q.push(activityListing(id, operationFor(id, { hash: HASH })))
        await flush()
        expect(removals(q.dispatch)).toEqual([])
        expect(send).toEqual({ status: 'resolved', value: HASH })
      })

      it('withdraws for a join on a later push of the queue, after a failed signature found none', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own])))
        q.queue = queueHolding([own])
        q.push(signScreen([id], SigningStatus.InProgress))
        q.push(signScreen([id], SigningStatus.ReadyToSign))
        expect(removals(q.dispatch)).toEqual([])
        q.push(requestsPush(joined(own)))
        expect(removals(q.dispatch)).toEqual(withdrawal(id))
        await refusesOnceGone(q, send, signAccountOpPush({}))
      })

      it('stops the check again once the sign screen signs anew after a failed signature', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own])))
        q.queue = queueHolding([own])
        q.push(signScreen([id], SigningStatus.InProgress))
        q.push(signScreen([id], SigningStatus.ReadyToSign))
        q.push(signScreen([id], SigningStatus.InProgress))
        q.queue = joined(own)
        q.push(requestsPush(q.queue))
        await advance(SEND_SETTLE_MS * 3)
        expect(removals(q.dispatch)).toEqual([])
        expect(send.status).toBe('pending')
        q.push(signScreen([id], SigningStatus.ReadyToSign))
        expect(removals(q.dispatch)).toEqual(withdrawal(id))
      })

      it('withdraws nothing when the signing ends after the activity lists the broadcast operation, and answers its hash', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own])))
        q.push(signScreen([id], SigningStatus.Done))
        q.push(activityListing(id, operationFor(id)))
        q.queue = joined(own)
        q.push(signAccountOpPush({}))
        q.push(requestsPush(q.queue))
        expect(removals(q.dispatch)).toEqual([])
        q.push(activityListing(id, operationFor(id, { hash: HASH })))
        await flush()
        expect(send).toEqual({ status: 'resolved', value: HASH })
      })

      it('withdraws nothing when the signing ends while a refusal already settles, and keeps that refusal', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own])))
        q.push(signScreen([id], SigningStatus.InProgress))
        q.push(requestsPush(queueHolding([])))
        q.queue = joined(own)
        q.push(signScreen([id], SigningStatus.ReadyToSign))
        expect(removals(q.dispatch)).toEqual([])
        await advance(SEND_SETTLE_MS)
        expect((send.value as SendRefusal).reason).toBe('refused')
      })

      it('withdraws nothing while the sign screen moves from one signing status to the next, a join in the queue', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own])))
        q.queue = joined(own)
        SIGNING.forEach((status) => q.push(signScreen([id], status)))
        SIGNING.forEach((status) => q.push(signScreen([id], status)))
        expect(removals(q.dispatch)).toEqual([])
        q.push(activityListing(id, operationFor(id, { hash: HASH })))
        await flush()
        expect(send).toEqual({ status: 'resolved', value: HASH })
      })

      it('withdraws nothing when the signing ends where the queue no longer holds its request, and answers the hash', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own])))
        q.push(signScreen([id], SigningStatus.Done))
        q.queue = queueHolding([dappCalls(account)])
        q.push(signAccountOpPush({}))
        expect(removals(q.dispatch)).toEqual([])
        q.push(activityListing(id, operationFor(id, { hash: HASH })))
        await flush()
        expect(send).toEqual({ status: 'resolved', value: HASH })
      })

      it('still withdraws where the wallet signed with no sign screen push for its request', async () => {
        const { q, send, id, own } = sending()
        q.push(requestsPush(queueHolding([own])))
        q.push(mainStatus('SIGNING'))
        q.push(mainStatus('SUCCESS'))
        q.push(requestsPush(queueHolding([own, dappCalls(account)])))
        expect(removals(q.dispatch)).toEqual([{ type: REMOVE, params: { id } }])
        await refusesOnceGone(q, send)
      })

      const NOT_JOINING: [string, QueuedFor][] = [
        ['of another account', { account: OTHER_ACCOUNT }],
        ['of the account on another chain', { account, chainId: 1n }],
        ['of the account that is not a calls request', { account, kind: 'message' }]
      ]
      NOT_JOINING.forEach(([label, facts]) =>
        it(`withdraws nothing for a request ${label}`, async () => {
          const { q, send, own } = sending()
          q.push(requestsPush(queueHolding([own, queuedRequest('dapp-request', facts)])))
          await advance(SEND_SETTLE_MS * 3)
          expect(removals(q.dispatch)).toEqual([])
          expect(send.status).toBe('pending')
        })
      )

      it('never reads its own request, queued as a calls request of the account, as another one', async () => {
        const { q, send, own } = sending()
        q.push(requestsPush(queueHolding([own], [own])))
        q.push(requestsPush(queueHolding([own, own])))
        await advance(SEND_SETTLE_MS * 3)
        expect(removals(q.dispatch)).toEqual([])
        expect(send.status).toBe('pending')
      })
    })
  })
)

describe('the request id the caller gives', () => {
  it('is the id the batch is queued under, the activity session follows and the answer is matched by', async () => {
    const q = sendQueueOver([smartAccount(SMART_ACCOUNT, CONTROLLING_KEY)])
    const requestId = newSendRequestId()
    const send = track(
      q.sender.sendAccountBatch(SMART_ACCOUNT, BATCH, undefined, undefined, requestId)
    )
    expect(addedRequest(q.dispatch).userRequest.id).toBe(requestId)
    expect(actionsOf(q.dispatch)[0]).toMatchObject({ params: { sessionId: requestId } })
    q.push(requestsPush(queueHolding([queuedRequest(requestId, { account: SMART_ACCOUNT })])))
    q.push(activityListing(requestId, operationFor('social-recovery-sender:other', { hash: HASH })))
    await flush()
    expect(send.status).toBe('pending')
    q.push(activityListing(requestId, operationFor(requestId, { hash: HASH })))
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
  })

  it('is the id the port withdraws', async () => {
    const q = sendQueueOver([smartAccount(SMART_ACCOUNT, CONTROLLING_KEY)])
    const requestId = newSendRequestId()
    q.sender
      .sendAccountBatch(SMART_ACCOUNT, BATCH, undefined, undefined, requestId)
      .catch(() => undefined)
    const own = queuedRequest(requestId, { account: SMART_ACCOUNT })
    q.push(requestsPush(queueHolding([own, dappCalls(SMART_ACCOUNT)])))
    expect(removals(q.dispatch)).toEqual([{ type: REMOVE, params: { id: requestId } }])
  })

  it('may already sit in the queue as its own, which does not block the send', () => {
    const q = sendQueueOver([smartAccount(SMART_ACCOUNT, CONTROLLING_KEY)])
    const requestId = newSendRequestId()
    q.queue = queueHolding([queuedRequest(requestId, { account: SMART_ACCOUNT })])
    q.sender
      .sendAccountBatch(SMART_ACCOUNT, BATCH, undefined, undefined, requestId)
      .catch(() => undefined)
    expect(addedRequest(q.dispatch).userRequest.id).toBe(requestId)
  })

  it('where none is given, the port makes a fresh one for each send', () => {
    const q = sendQueueOver([smartAccount(SMART_ACCOUNT, CONTROLLING_KEY)])
    q.sender.sendAccountBatch(SMART_ACCOUNT, BATCH).catch(() => undefined)
    q.sender.sendAccountBatch(SMART_ACCOUNT, BATCH).catch(() => undefined)
    const ids = actionsOf(q.dispatch)
      .filter((a) => a.type === ADD)
      .map((a) => (a.type === ADD ? a.params.userRequest.id : undefined))
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
    ids.forEach((id) => expect(String(id)).toMatch(/^social-recovery-sender:[0-9a-f-]{36}$/))
  })

  it('comes fresh from each call of the maker', () => {
    const ids = Array.from({ length: 100 }, () => newSendRequestId())
    expect(new Set(ids).size).toBe(ids.length)
  })
})
