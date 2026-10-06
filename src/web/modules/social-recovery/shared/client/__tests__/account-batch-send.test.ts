/**
 * The send port sends a batch of calls a listed smart account runs on itself
 * as one `calls` request for that account, and follows it as it follows a
 * key's own transaction: the refusals and the answers from the activity are
 * read for both in send-port.test.ts. Here: the account the port refuses, the
 * request it queues, and the reading of the sign screen's estimation it hands
 * to the caller from the `signAccountOp` state the background pushes.
 */
import { Wallet } from 'ethers'
import { zeroAddress } from 'viem'

import { EstimationStatus } from '@ambire-common/controllers/estimation/types'
import type { FeeSpeed, SpeedCalc } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import type { FeePaymentOption } from '@ambire-common/libs/estimate/interfaces'
import eventBus from '@web/extension-services/event/eventBus'
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import {
  activityListing,
  addedRequest,
  advance,
  basicAccount,
  BATCH,
  CONTROLLING_KEY,
  createSendPort,
  dispatched,
  FeeReading,
  flush,
  operationFor,
  queuedWith,
  SEND_SETTLE_MS,
  SendRefusal,
  SendRequestAction,
  sendQueueOver,
  sendRequestPort,
  SEPOLIA,
  SignAccountOpState,
  signAccountOpPush,
  SMART_ACCOUNT,
  smartAccount,
  thrownBy,
  track,
  WINDOW_ID
} from '@web/modules/social-recovery/shared/client/__tests__/harness'

/** A basic account the wallet lists, which the sign screen offers as a payer. */
const PAYER = new Wallet(`0x${'55'.repeat(32)}`).address as Address

const HASH: Hex = `0x${'ab'.repeat(32)}`

const ADD = 'REQUESTS_CONTROLLER_ADD_USER_REQUEST'
const OPEN_SESSION = 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS'

const actionsOf = (dispatch: jest.Mock) => dispatched<SendRequestAction>(dispatch)

const LISTED = () => [smartAccount(SMART_ACCOUNT, CONTROLLING_KEY), basicAccount(PAYER)]

/** Sends BATCH for SMART_ACCOUNT over a queue listing it, and answers the request id the port queued. */
const sendingBatch = (onEstimation?: (reading: FeeReading) => void) => {
  const q = sendQueueOver(LISTED())
  const send = track(q.sender.sendAccountBatch(SMART_ACCOUNT, BATCH, onEstimation))
  const id = String(addedRequest(q.dispatch).userRequest.id)
  return { q, send, id }
}

const NATIVE = { address: zeroAddress, symbol: 'ETH', decimals: 18, flags: { onGasTank: false } }

/** One fee option as the estimation offers it. */
const feeOption = (paidBy: Address, availableAmount: bigint): FeePaymentOption =>
  ({ paidBy, availableAmount, gasUsed: 90_000n, addedNative: 0n, token: NATIVE } as never)

/** The account's own native token, too little for any speed. */
const OWN = feeOption(SMART_ACCOUNT, 5n * 10n ** 14n)
/** The listed basic account's native token, enough for every speed. */
const BY_PAYER = feeOption(PAYER, 10n ** 18n)

const speeds = (slow: bigint, medium: bigint, fast: bigint): SpeedCalc[] =>
  [
    { type: 'slow', amount: slow },
    { type: 'medium', amount: medium },
    { type: 'fast', amount: fast }
  ] as never

/**
 * The fee speeds as the controller keys them: the account's own token under
 * its address, and a native token another account pays under `EOA`.
 */
const FEE_SPEEDS: SignAccountOpState['feeSpeeds'] = {
  [`${SMART_ACCOUNT}:${zeroAddress}:eth:feeToken`]: speeds(
    10n ** 15n,
    2n * 10n ** 15n,
    6n * 10n ** 15n
  ),
  [`EOA:${zeroAddress}:eth:feeToken`]: speeds(3n * 10n ** 15n, 4n * 10n ** 15n, 8n * 10n ** 15n)
}

/** The sign screen's state for the operation whose calls came from `requestId`. */
const signScreen = (
  requestId: string,
  overrides: Partial<SignAccountOpState> = {},
  status: EstimationStatus = EstimationStatus.Success
): SignAccountOpState => ({
  accountOp: { accountAddr: SMART_ACCOUNT, calls: [{ fromUserRequestId: requestId }] },
  estimation: { status, availableFeeOptions: [OWN, BY_PAYER] },
  feeSpeeds: FEE_SPEEDS,
  selectedFeeSpeed: 'medium' as FeeSpeed,
  selectedOption: BY_PAYER,
  errors: [],
  ...overrides
})

const TOKEN = { address: zeroAddress, symbol: 'ETH', decimals: 18 }

/** The reading of `signScreen` with no error: each option with its balance, the medium speed's amount and whether a speed fits. */
const READING: FeeReading = {
  options: [
    {
      paidBy: SMART_ACCOUNT,
      token: TOKEN,
      balance: 5n * 10n ** 14n,
      amount: 2n * 10n ** 15n,
      available: false,
      selected: false
    },
    {
      paidBy: PAYER,
      token: TOKEN,
      balance: 10n ** 18n,
      amount: 4n * 10n ** 15n,
      available: true,
      selected: true
    }
  ]
}

const INSUFFICIENT = { title: 'Insufficient funds to cover the fee.', code: 'INSUFFICIENT_FUNDS' }

/** The error the estimation itself failed with, and the entry the sign screen shows for it. */
const REVERTS = 'The transaction will fail because it reverted onchain.'
const REVERTS_SHOWN = { title: REVERTS, code: 'ESTIMATION_REVERTED' }

/** The settled, failed estimation of the request, carrying its own error. */
const failedWith = (error: unknown): SignAccountOpState['estimation'] =>
  ({ status: EstimationStatus.Error, availableFeeOptions: [], error } as never)

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe("a listed smart account's batch", () => {
  it("adds one calls request for the account, in the account's own case, carrying every call's target, value and data", () => {
    const q = sendQueueOver(LISTED())
    const lower = SMART_ACCOUNT.toLowerCase() as Address
    expect(lower).not.toBe(SMART_ACCOUNT)
    q.sender.sendAccountBatch(lower, BATCH).catch(() => undefined)
    const { userRequest, allowAccountSwitch } = addedRequest(q.dispatch)
    expect(allowAccountSwitch).toBe(true)
    expect(userRequest.meta).toEqual({
      isSignAction: true,
      accountAddr: SMART_ACCOUNT,
      chainId: BigInt(SEPOLIA)
    })
    expect(userRequest.action).toEqual({
      kind: 'calls',
      calls: [
        { to: BATCH[0].target, value: 3n, data: '0xaaaa0001' },
        { to: BATCH[1].target, value: 0n, data: '0xbbbb0002' }
      ]
    })
    expect(userRequest.session.windowId).toBe(WINDOW_ID)
    const [open, add, ...rest] = actionsOf(q.dispatch)
    expect(rest).toEqual([])
    expect(add.type).toBe(ADD)
    expect(open).toEqual({
      type: OPEN_SESSION,
      params: {
        sessionId: String(userRequest.id),
        filters: { account: SMART_ACCOUNT, chainId: BigInt(SEPOLIA) },
        pagination: expect.objectContaining({ fromPage: 0 })
      }
    })
  })

  it("answers the hash of the operation the activity lists under the request's id", async () => {
    const { q, send, id } = sendingBatch()
    q.push(queuedWith('open', id))
    q.push(activityListing(id, operationFor('dapp-request', { hash: `0x${'cd'.repeat(32)}` })))
    await flush()
    expect(send.status).toBe('pending')
    q.push(activityListing(id, operationFor(id, { hash: HASH })))
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
    expect(q.listeners()).toBe(0)
  })

  const UNLISTED: [string, () => ReturnType<typeof LISTED>][] = [
    ['while the wallet lists no account', () => []],
    [
      'that the wallet does not list, though it lists its controlling key',
      () => [basicAccount(CONTROLLING_KEY)]
    ]
  ]
  UNLISTED.forEach(([title, accounts]) =>
    it(`refuses an account ${title} as not-listed, and dispatches nothing`, async () => {
      const q = sendQueueOver(accounts())
      const caught = (await thrownBy(
        q.sender.sendAccountBatch(SMART_ACCOUNT, BATCH)
      )) as SendRefusal
      expect(caught).toBeInstanceOf(Error)
      expect(caught.name).toBe('SendRefusal')
      expect(caught.reason).toBe('not-listed')
      expect(caught.account).toBe(SMART_ACCOUNT)
      expect(caught.message).toContain(SMART_ACCOUNT)
      expect(caught.missingAction).toBeUndefined()
      expect(q.dispatch).not.toHaveBeenCalled()
      expect(q.listeners()).toBe(0)
    })
  )

  it('refuses a listed basic account as not-smart-account, and dispatches nothing and follows nothing', async () => {
    const q = sendQueueOver(LISTED())
    const heard = jest.fn()
    const caught = (await thrownBy(q.sender.sendAccountBatch(PAYER, BATCH, heard))) as SendRefusal
    expect(caught).toBeInstanceOf(Error)
    expect(caught.name).toBe('SendRefusal')
    expect(caught.reason).toBe('not-smart-account')
    expect(caught.account).toBe(PAYER)
    expect(caught.message).toContain(PAYER)
    expect(caught.missingAction).toBeUndefined()
    expect(q.dispatch).not.toHaveBeenCalled()
    expect(q.listeners()).toBe(0)
    expect(heard).not.toHaveBeenCalled()
  })

  it('sends for a listed smart account listed after a basic account', () => {
    const q = sendQueueOver([basicAccount(PAYER), smartAccount(SMART_ACCOUNT, CONTROLLING_KEY)])
    q.sender.sendAccountBatch(SMART_ACCOUNT, BATCH).catch(() => undefined)
    expect(addedRequest(q.dispatch).userRequest.meta.accountAddr).toBe(SMART_ACCOUNT)
    expect(q.listeners()).toBe(1)
  })

  it('reads the listing before the kind: an unlisted account is not-listed, a listed basic one not-smart-account', async () => {
    const q = sendQueueOver([basicAccount(PAYER)])
    const unlisted = (await thrownBy(
      q.sender.sendAccountBatch(CONTROLLING_KEY, BATCH)
    )) as SendRefusal
    expect(unlisted.reason).toBe('not-listed')
    const basic = (await thrownBy(q.sender.sendAccountBatch(PAYER, BATCH))) as SendRefusal
    expect(basic.reason).toBe('not-smart-account')
    expect(q.dispatch).not.toHaveBeenCalled()
    expect(q.listeners()).toBe(0)
  })
})

describe("the reading of the sign screen's estimation", () => {
  it('hands the options and the error the settled estimation carries', async () => {
    const heard = jest.fn()
    const { q, id } = sendingBatch(heard)
    q.push(signAccountOpPush(signScreen(id, { errors: [INSUFFICIENT] })))
    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard).toHaveBeenCalledWith({ ...READING, error: INSUFFICIENT })
  })

  it('hands an error with no code as its title alone', () => {
    const heard = jest.fn()
    const { q, id } = sendingBatch(heard)
    q.push(signAccountOpPush(signScreen(id, { errors: [{ title: 'The estimation failed.' }] })))
    expect(heard.mock.calls[0][0]).toEqual({
      ...READING,
      error: { title: 'The estimation failed.' }
    })
  })

  it("prefers the estimation's own error, with the code of the entry the sign screen shows under its title", () => {
    const heard = jest.fn()
    const { q, id } = sendingBatch(heard)
    q.push(
      signAccountOpPush(
        signScreen(id, {
          estimation: failedWith(new Error(REVERTS)),
          errors: [INSUFFICIENT, REVERTS_SHOWN]
        })
      )
    )
    expect(heard.mock.calls).toEqual([[{ options: [], error: REVERTS_SHOWN }]])
  })

  it("hands the estimation's own error as its title alone where the sign screen shows no entry under that title", () => {
    const heard = jest.fn()
    const { q, id } = sendingBatch(heard)
    q.push(
      signAccountOpPush(
        signScreen(id, { estimation: failedWith(new Error(REVERTS)), errors: [INSUFFICIENT] })
      )
    )
    q.push(signAccountOpPush(signScreen(id, { estimation: failedWith(new Error(REVERTS)) })))
    expect(heard.mock.calls).toEqual([[{ options: [], error: { title: REVERTS } }]])
    expect(heard.mock.calls[0][0].error).not.toHaveProperty('code')
  })

  const NO_MESSAGE: [string, unknown][] = [
    ['an empty message', new Error('')],
    ['a message that is not text', { message: 42 }],
    ['no message', {}],
    ['a null error', null]
  ]
  NO_MESSAGE.forEach(([title, error]) =>
    it(`hands the sign screen's first error for an estimation error with ${title}`, () => {
      const heard = jest.fn()
      const { q, id } = sendingBatch(heard)
      q.push(
        signAccountOpPush(
          signScreen(id, { estimation: failedWith(error), errors: [INSUFFICIENT, REVERTS_SHOWN] })
        )
      )
      expect(heard.mock.calls).toEqual([[{ options: [], error: INSUFFICIENT }]])
    })
  )

  it('hands the error of an estimation that failed, with no option', () => {
    const heard = jest.fn()
    const { q, id } = sendingBatch(heard)
    const failed = { status: EstimationStatus.Error, availableFeeOptions: [] }
    q.push(signAccountOpPush(signScreen(id, { estimation: failed, errors: [INSUFFICIENT] })))
    expect(heard.mock.calls).toEqual([[{ options: [], error: INSUFFICIENT }]])
  })

  it('hands no error where the sign screen shows none', () => {
    const heard = jest.fn()
    const { q, id } = sendingBatch(heard)
    q.push(signAccountOpPush(signScreen(id)))
    expect(heard.mock.calls).toEqual([[READING]])
    expect(heard.mock.calls[0][0]).not.toHaveProperty('error')
  })

  it('reports neither amount nor availability for an option whose speeds the controller has not computed', () => {
    const heard = jest.fn()
    const { q, id } = sendingBatch(heard)
    q.push(signAccountOpPush(signScreen(id, { feeSpeeds: {} })))
    const [[reading]] = heard.mock.calls
    expect(reading.options).toEqual([
      { paidBy: SMART_ACCOUNT, token: TOKEN, balance: 5n * 10n ** 14n, selected: false },
      { paidBy: PAYER, token: TOKEN, balance: 10n ** 18n, selected: true }
    ])
  })

  it('reads the option the holder picked and the amount of the speed the holder picked', () => {
    const heard = jest.fn()
    const { q, id } = sendingBatch(heard)
    q.push(
      signAccountOpPush(
        signScreen(id, { selectedOption: OWN, selectedFeeSpeed: 'fast' as FeeSpeed })
      )
    )
    const [[reading]] = heard.mock.calls
    expect(reading.options.map((option: { selected: boolean }) => option.selected)).toEqual([
      true,
      false
    ])
    expect(reading.options.map((option: { amount?: bigint }) => option.amount)).toEqual([
      6n * 10n ** 15n,
      8n * 10n ** 15n
    ])
  })

  const UNSETTLED = [EstimationStatus.Initial, EstimationStatus.Loading]
  UNSETTLED.forEach((status) =>
    it(`hands nothing while the estimation reads ${status}`, () => {
      const heard = jest.fn()
      const { q, id } = sendingBatch(heard)
      q.push(signAccountOpPush(signScreen(id, {}, status)))
      q.push(signAccountOpPush(signScreen(id, { estimation: undefined })))
      expect(heard).not.toHaveBeenCalled()
      q.push(signAccountOpPush(signScreen(id)))
      expect(heard).toHaveBeenCalledTimes(1)
    })
  )

  it("hands nothing for the estimation of another request's operation", () => {
    const heard = jest.fn()
    const { q } = sendingBatch(heard)
    q.push(signAccountOpPush(signScreen('dapp-request', { errors: [INSUFFICIENT] })))
    q.push(signAccountOpPush({ ...signScreen('dapp-request'), accountOp: undefined }))
    expect(heard).not.toHaveBeenCalled()
  })

  it('hands each reading once, and again only once it changed', () => {
    const heard = jest.fn()
    const { q, id } = sendingBatch(heard)
    q.push(signAccountOpPush(signScreen(id)))
    q.push(signAccountOpPush(signScreen(id)))
    q.push(signAccountOpPush(signScreen(id, {}, EstimationStatus.Loading)))
    q.push(signAccountOpPush(signScreen(id)))
    expect(heard).toHaveBeenCalledTimes(1)
    q.push(signAccountOpPush(signScreen(id, { selectedOption: OWN })))
    q.push(signAccountOpPush(signScreen(id, { selectedOption: OWN })))
    expect(heard).toHaveBeenCalledTimes(2)
    q.push(signAccountOpPush(signScreen(id, { selectedOption: OWN, errors: [INSUFFICIENT] })))
    expect(heard).toHaveBeenCalledTimes(3)
    expect(heard.mock.calls[2][0].error).toEqual(INSUFFICIENT)
  })

  const RESET: [string, (id: string) => SignAccountOpState][] = [
    [
      'still holding the operation',
      (id) =>
        signScreen(id, {
          estimation: { status: EstimationStatus.Initial, availableFeeOptions: [], error: null },
          errors: []
        })
    ],
    [
      'with no operation',
      () => ({
        estimation: { status: EstimationStatus.Initial, availableFeeOptions: [], error: null }
      })
    ]
  ]
  RESET.forEach(([title, reset]) =>
    it(`hands no new reading when the sign screen closes and its state resets, ${title}, and still answers the hash`, async () => {
      const heard = jest.fn()
      const { q, send, id } = sendingBatch(heard)
      q.push(signAccountOpPush(signScreen(id, { errors: [INSUFFICIENT] })))
      expect(heard).toHaveBeenCalledTimes(1)
      q.push(signAccountOpPush(reset(id)))
      expect(heard).toHaveBeenCalledTimes(1)
      q.push(activityListing(id, operationFor(id, { hash: HASH })))
      await flush()
      expect(send).toEqual({ status: 'resolved', value: HASH })
      expect(heard).toHaveBeenCalledTimes(1)
    })
  )

  it('reads an empty sign screen state as no reading, and still answers the hash', async () => {
    const heard = jest.fn()
    const { q, send, id } = sendingBatch(heard)
    expect(() => q.push(signAccountOpPush({}))).not.toThrow()
    expect(heard).not.toHaveBeenCalled()
    q.push(activityListing(id, operationFor(id, { hash: HASH })))
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
  })

  it('follows the request the same with no listener, and hands nothing once the send settled', async () => {
    const quiet = sendingBatch()
    expect(() => quiet.q.push(signAccountOpPush(signScreen(quiet.id)))).not.toThrow()
    quiet.q.push(activityListing(quiet.id, operationFor(quiet.id, { hash: HASH })))
    await flush()
    expect(quiet.send).toEqual({ status: 'resolved', value: HASH })

    const heard = jest.fn()
    const { q, send, id } = sendingBatch(heard)
    q.push(queuedWith('open', id))
    q.push(queuedWith('closed'))
    await advance(SEND_SETTLE_MS)
    expect(send.status).toBe('rejected')
    q.push(signAccountOpPush(signScreen(id)))
    expect(heard).not.toHaveBeenCalled()
  })
})

describe("the UI's own port over the event bus", () => {
  it('reads the sign screen the background pushes, takes a null or missing push as an empty state with no reading, and leaves no listener behind', async () => {
    const before = eventBus.events.signAccountOp?.length ?? 0
    const dispatch = jest.fn()
    const sender = createSendPort(
      sendRequestPort(dispatch, LISTED, () => undefined, WINDOW_ID),
      {
        chainId: SEPOLIA
      }
    )
    const heard = jest.fn()
    const send = track(sender.sendAccountBatch(SMART_ACCOUNT, BATCH, heard))
    const id = String(addedRequest(dispatch).userRequest.id)
    expect(() => eventBus.emit('signAccountOp', null)).not.toThrow()
    expect(() => eventBus.emit('signAccountOp')).not.toThrow()
    expect(heard).not.toHaveBeenCalled()
    eventBus.emit('signAccountOp', signScreen(id))
    expect(heard.mock.calls).toEqual([[READING]])
    eventBus.emit('activity', activityListing(id, operationFor(id, { hash: HASH })).state)
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
    expect(eventBus.events.signAccountOp?.length ?? 0).toBe(before)
  })

  it("keeps a listener's throw inside the port, so the bus's later listeners still hear the push and the send still follows", async () => {
    const before = eventBus.events.signAccountOp?.length ?? 0
    const dispatch = jest.fn()
    const sender = createSendPort(
      sendRequestPort(dispatch, LISTED, () => undefined, WINDOW_ID),
      {
        chainId: SEPOLIA
      }
    )
    const heard = jest.fn().mockImplementationOnce(() => {
      throw new Error('the listener failed')
    })
    const send = track(sender.sendAccountBatch(SMART_ACCOUNT, BATCH, heard))
    const id = String(addedRequest(dispatch).userRequest.id)
    const later = jest.fn()
    eventBus.addEventListener('signAccountOp', later)

    const first = signScreen(id)
    expect(() => eventBus.emit('signAccountOp', first)).not.toThrow()
    expect(heard.mock.calls).toEqual([[READING]])
    expect(later.mock.calls).toEqual([[first, undefined]])

    eventBus.emit('signAccountOp', signScreen(id, { selectedOption: OWN }))
    expect(heard).toHaveBeenCalledTimes(2)
    expect(heard.mock.calls[1][0]).not.toEqual(READING)
    expect(later).toHaveBeenCalledTimes(2)

    eventBus.emit('activity', activityListing(id, operationFor(id, { hash: HASH })).state)
    await flush()
    expect(send).toEqual({ status: 'resolved', value: HASH })
    eventBus.removeEventListener('signAccountOp', later)
    expect(eventBus.events.signAccountOp?.length ?? 0).toBe(before)
  })

  it('refuses an account while the wallet lists no accounts yet', async () => {
    const dispatch = jest.fn()
    const sender = createSendPort(
      sendRequestPort(
        dispatch,
        () => undefined,
        () => undefined
      ),
      { chainId: SEPOLIA }
    )
    const caught = (await thrownBy(sender.sendAccountBatch(SMART_ACCOUNT, BATCH))) as SendRefusal
    expect(caught.reason).toBe('not-listed')
    expect(dispatch).not.toHaveBeenCalled()
  })
})
