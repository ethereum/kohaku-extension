/**
 * The UI's own send port reads the queue through its getter, from the
 * `requests` controller state the screen holds, as it is.
 */
import {
  BATCH,
  CONTROLLING_KEY,
  createSendPort,
  flush,
  type HeldRequestQueue,
  newSendRequestId,
  queuedRequest,
  queueHolding,
  type SendRefusal,
  sendRequestPort,
  sendRequestStateOf,
  SEPOLIA,
  SMART_ACCOUNT,
  smartAccount,
  track
} from '@web/modules/social-recovery/shared/client/__tests__/harness'

let held: HeldRequestQueue = {}

const portOverTheHeldQueue = () => {
  const dispatch = jest.fn()
  const port = sendRequestPort(
    dispatch,
    () => [smartAccount(SMART_ACCOUNT, CONTROLLING_KEY)],
    () => held
  )
  return { dispatch, port }
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
  held = {}
})

describe('the send port over the queue the screen holds, read through its getter', () => {
  it('reads a request the held queue keeps waiting for an account switch as queued, reading no activity', async () => {
    const id = newSendRequestId()
    held = queueHolding([], [queuedRequest(id, { account: SMART_ACCOUNT })])
    const { dispatch, port } = portOverTheHeldQueue()
    await expect(sendRequestStateOf(port, id, SMART_ACCOUNT, SEPOLIA)).resolves.toEqual({
      status: 'queued'
    })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("refuses a batch beside a calls request of the account on the chain in the held queue, by the request's own kind, account and chain", async () => {
    held = queueHolding([queuedRequest('dapp-request', { account: SMART_ACCOUNT.toLowerCase() })])
    const { dispatch, port } = portOverTheHeldQueue()
    const send = track(
      createSendPort(port, { chainId: SEPOLIA }).sendAccountBatch(SMART_ACCOUNT, BATCH)
    )
    await flush()
    expect(send.status).toBe('rejected')
    expect((send.value as SendRefusal).reason).toBe('other-request-pending')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('queues a batch beside a request of the account that is not a calls request', async () => {
    held = queueHolding([
      queuedRequest('dapp-request', { account: SMART_ACCOUNT, kind: 'typedMessage' })
    ])
    const { dispatch, port } = portOverTheHeldQueue()
    const send = track(
      createSendPort(port, { chainId: SEPOLIA }).sendAccountBatch(SMART_ACCOUNT, BATCH)
    )
    await flush()
    expect(send.status).toBe('pending')
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REQUESTS_CONTROLLER_ADD_USER_REQUEST' })
    )
  })
})
