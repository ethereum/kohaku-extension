/**
 * The send port: one transaction sent from a key the keystore holds, addressed
 * by the keystore's own handle of address and key type. It signs nothing and
 * broadcasts nothing itself: the wallet's own request queue and action window
 * do both, as for a transaction the wallet builds itself.
 *
 * 1. It opens an activity session over the key's account on the chain, with
 *    `MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS` under a session id of its
 *    own, as the transfer screen does to follow the operation it sent.
 * 2. It dispatches `REQUESTS_CONTROLLER_ADD_USER_REQUEST` with a transaction
 *    request under an id of its own: the key's address as the account, the
 *    chain, the one call and `allowAccountSwitch`.
 * 3. The queue opens the action window on that request. The window's own
 *    sign screen estimates the transaction, shows it to the holder, and signs
 *    and broadcasts it only when the holder confirms. The port dispatches
 *    nothing to that screen.
 * 4. The wallet adds the operation it broadcast to the activity, its calls
 *    naming the request they came from. The port answers the transaction hash
 *    of its own call from there, where the key sent it as a transaction of its
 *    own.
 *
 * A refusal read from the queue (`refused`, `window-closed`, `timeout`) never
 * comes at once. The port first waits until the wallet neither signs nor
 * broadcasts, then keeps its session open for `SEND_SETTLE_MS`: a broadcast
 * with a key the keystore holds cannot be stopped once it began, so an
 * operation that names the request still answers its hash in that time.
 *
 * A request the port withdraws is not gone until the queue shows it gone and
 * the sign screen no longer holds it: the wallet drops a hidden tab's
 * dispatch, removes a request only from its waiting requests, not from those
 * that wait for an account switch, and a sign screen that pauses or signs
 * keeps the operation it froze. So after a withdrawal the port keeps following
 * until a queue state lists the request in neither list and the sign screen's
 * last state holds no operation that carries it, and only then counts its
 * settle period; until then, an operation that names it still answers its
 * hash. Except while the sign screen signs or pauses on the request, the port
 * sends the removal again when the request enters the waiting requests, when
 * the sign screen stops with the request still waiting and, where the caller
 * gives the page's document, when the page is shown again.
 *
 * The queue sends for an account the wallet lists, from that account's keys.
 * A key that is itself a basic account (an EOA the wallet lists, its own only
 * associated key) therefore sends its own transaction and pays its gas. Any
 * other key, such as the smart account's controlling key at the slot's index
 * plus 100000, cannot send through it, and the port refuses such a key with a
 * `not-wired` refusal.
 *
 * A batch of calls a smart account runs on itself goes the same way, as one
 * request for the account the wallet lists: the sign screen estimates it,
 * offers the fee options (the account's own native token, a listed basic
 * account's) and signs with the account's key. The port reads that
 * estimation from the `signAccountOp` controller state and hands each new
 * reading to the caller as data. An account the wallet does not list is
 * refused as `not-listed`. A listed basic account is refused as
 * `not-smart-account`: the wallet sends its calls as separate transactions,
 * not as one batch.
 *
 * A batch that arms the recovery kit carries the kit's mark in its request's
 * `meta.recoveryKit`, the manager and its audited actions. The wallet copies
 * it onto the operation it builds, and the sign screen then lets the account
 * grant an audited action its privilege beside the commit at that manager.
 * The port sets it only where the caller passes it, and never on a key's own
 * transaction.
 *
 * The queue joins every `calls` request of one account and chain into one
 * operation. So the port queues nothing where another `calls` request of the
 * account and chain is already in the queue, and except while the sign screen
 * that holds its request signs it or pauses on it withdraws its own request
 * where another one joins it, refusing with `other-request-pending` in both
 * cases.
 */
import { v4 as uuidv4 } from 'uuid'
import { isAddress, isHash } from 'viem'

import { Session } from '@ambire-common/classes/session'
import { EstimationStatus } from '@ambire-common/controllers/estimation/types'
import { getFeeSpeedIdentifier } from '@ambire-common/controllers/signAccountOp/helper'
import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import type { Account } from '@ambire-common/interfaces/account'
import type { SignAccountOpError } from '@ambire-common/interfaces/signAccountOp'
import type { SignUserRequest } from '@ambire-common/interfaces/userRequest'
import { isSmartAccount } from '@ambire-common/libs/account/account'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import type { FeePaymentOption } from '@ambire-common/libs/estimate/interfaces'
import { stringify } from '@ambire-common/libs/richJson/richJson'
import type { Address, Hex, PreparedCall } from '@web/modules/social-recovery/sdk-interfaces'

import { isVisible } from '@web/modules/social-recovery/shared/ceremony/visibility'

import { sameAddress } from './addresses'
import { ABSENCE_GRACE_MS, listedBasicAccountOf } from './signer'
import type {
  EstimationListener,
  FeeOption,
  FeeReading,
  FollowedRequest,
  GasEstimateCall,
  KeyHandle,
  MainStatusState,
  QueueLists,
  RecoveryKitMark,
  SendPort,
  SendPortOptions,
  SendRefusal,
  SendRefusalReason,
  SendRequestPort,
  SendRequestState,
  SettlingRefusal,
  SignAccountOpState,
  SubmittedOperation
} from './types'

/** The background action a `not-wired` key needs. It does not exist yet. */
export const MISSING_SEND_ACTION = 'KEYSTORE_CONTROLLER_SEND_WITH_KEY' as const

/**
 * Why the send port returned no transaction hash:
 *
 * - `not-wired`: the key is not itself a basic account the wallet lists;
 * - `not-listed`: the wallet does not list the account whose batch it was
 *   asked to send;
 * - `not-smart-account`: the account whose batch it was asked to send is a
 *   basic account, whose calls the wallet sends as separate transactions;
 * - `refused`: the request left the queue with no operation broadcast, since
 *   the holder rejected it or declined the account switch it waited for;
 * - `window-closed`: the holder closed the action window with the request
 *   still queued; the port withdraws it, so the wallet cannot send it later;
 * - `not-broadcast`: the operation the wallet submitted was rejected before it
 *   reached the chain, and names no transaction;
 * - `not-a-transaction`: the wallet submitted the request as an operation
 *   another party sends (a user operation or a sponsored one), so no
 *   transaction of the sender follows it, and its hash, where one comes, is
 *   not the call's; that operation may still reach the chain;
 * - `timeout`: no answer came in time; the port withdraws the request, or
 *   waits until the queue drops one that waited for an account switch, or
 *   until the sign screen stops signing or pausing on it;
 * - `other-request-pending`: another `calls` request of the same account and
 *   chain waits in the queue, which would join it to this one; the port
 *   queued nothing, or withdrew its request before the wallet signed it.
 */
export const SEND_REFUSAL_REASONS = [
  'not-wired',
  'not-listed',
  'not-smart-account',
  'refused',
  'window-closed',
  'not-broadcast',
  'not-a-transaction',
  'timeout',
  'other-request-pending'
] as const

const REFUSAL_MESSAGES: { readonly [R in SendRefusalReason]: string } = {
  'not-wired': `the request queue sends only from a key that is itself a basic account the wallet lists. Missing background action: ${MISSING_SEND_ACTION} { requestId, keyAddr, keyType, chainId, transaction }.`,
  'not-listed': 'the request queue sends only for an account the wallet lists.',
  'not-smart-account':
    'the account is a basic account, whose calls the wallet sends as separate transactions, not as one batch.',
  refused: 'the request left the queue and no transaction was broadcast.',
  'window-closed':
    'the action window closed with the request still queued, so the request was withdrawn and no transaction was broadcast.',
  'not-broadcast': 'the operation the wallet submitted was rejected before it reached the chain.',
  'not-a-transaction':
    'the wallet submitted the request as an operation another party sends, which names no transaction of the sender; that operation may still reach the chain.',
  timeout:
    'no answer came in time; the request is no longer queued and no transaction was broadcast.',
  'other-request-pending':
    'another request for the same account and chain waits in the queue, so the request was not queued or was withdrawn, and no transaction was broadcast.'
}

const refusalOf = (reason: SendRefusalReason, sender: string): SendRefusal => {
  const error = new Error(
    `No transaction of ${sender} to follow: ${REFUSAL_MESSAGES[reason]}`
  ) as SendRefusal
  error.name = 'SendRefusal'
  error.reason = reason
  return error
}

/** Whether a thrown value is a refusal of the send port, with one of its reasons. */
export const isSendRefusal = (value: unknown): value is SendRefusal =>
  value instanceof Error &&
  value.name === 'SendRefusal' &&
  (SEND_REFUSAL_REASONS as readonly unknown[]).includes((value as { reason?: unknown }).reason)

/** The refusal of a transaction from a key. */
export const sendRefusal = (reason: SendRefusalReason, key: KeyHandle): SendRefusal => {
  const error = refusalOf(reason, `key ${key.addr} (${key.type})`)
  error.key = { ...key }
  if (reason === 'not-wired') {
    error.missingAction = MISSING_SEND_ACTION
  }
  return error
}

/** The refusal of a batch an account runs. */
export const accountBatchRefusal = (reason: SendRefusalReason, account: Address): SendRefusal => {
  const error = refusalOf(reason, `account ${account}`)
  error.account = account
  return error
}

/**
 * How long the port waits for the holder to confirm and the wallet to
 * broadcast, a hardware key's included. Once the activity lists the operation
 * the wallet broadcast, the port waits for its transaction hash with no limit:
 * the wallet sent it.
 */
export const DEFAULT_SEND_TIMEOUT_MS = 10 * 60 * 1000

/**
 * How long the port keeps its session open before a refusal, once the wallet
 * neither signs nor broadcasts. The wallet lists a broadcast operation in the
 * activity right after its broadcast status leaves `BROADCASTING`, with no
 * network read between, and the background pushes each controller's state on
 * its next tick. The time is `ABSENCE_GRACE_MS`, the grace the request queue's
 * own moves already get.
 */
export const SEND_SETTLE_MS = ABSENCE_GRACE_MS

/** The broadcast statuses under which the wallet signs or broadcasts, so no refusal is final. */
const BUSY_STATUSES: readonly string[] = ['SIGNING', 'BROADCASTING']

/** The operations the sender sent as transactions of its own, whose hash is its call's. */
const TRANSACTION_OPERATIONS: readonly string[] = ['Transaction', 'MultipleTxns']

/** The activity page the port reads: the operation it sent is the newest of the account. */
const ACTIVITY_PAGE = { fromPage: 0, itemsPerPage: 10 }

/**
 * How long a reading of a request's state waits for the activity to answer
 * each page it asks for, before it reads `unread`.
 */
export const REQUEST_STATE_READ_MS = 10 * 1000

/**
 * The sign screen's statuses under which it may sign the operation it holds
 * as it stands: the sign controller signs, waits for the paymaster or signed
 * once the holder confirmed, or pauses for a warning or a hardware wallet.
 * While paused, the controller takes no new calls and can still sign the
 * operation it froze, so a request that joins then cannot enter it. The
 * controller leaves these statuses back to taking updates only where a
 * signature or its broadcast failed or the pause ended.
 */
const SIGNING_STATUSES: readonly SigningStatus[] = [
  SigningStatus.InProgress,
  SigningStatus.WaitingForPaymaster,
  SigningStatus.Done,
  SigningStatus.UpdatesPaused
]

/** The estimation statuses after which the sign screen holds its fee options or its error. */
const SETTLED_ESTIMATIONS: readonly string[] = [EstimationStatus.Success, EstimationStatus.Error]

/**
 * A request id no other page makes: the port's prefix and a random UUID. The
 * activity session takes the same id, so it is the port's own too. A caller
 * that must find its request again from another page takes one before the
 * send and passes it.
 */
export const newSendRequestId = (): string => `social-recovery-sender:${uuidv4()}`

/** Every request in the queue, those waiting for an account switch included. */
const queuedRequestsOf = (state: QueueLists) => [
  ...(state.userRequests ?? []),
  ...(state.userRequestsWaitingAccountSwitch ?? [])
]

/**
 * Whether the queue holds a `calls` request other than `id` for the account on
 * the chain, which the wallet would join into one operation with it.
 */
const otherCallsRequestIn = (
  state: QueueLists,
  id: string,
  account: Address,
  chainId: bigint
): boolean =>
  queuedRequestsOf(state).some(
    (queued) =>
      queued.id !== id &&
      queued.action?.kind === 'calls' &&
      queued.meta?.chainId === chainId &&
      sameAddress(queued.meta?.accountAddr, account)
  )

/**
 * The `calls` request the port adds to the queue for one listed account.
 * `request.account` must be the listed account's own address as the wallet
 * holds it, since the queue, the sign screen and the activity compare
 * addresses with exact case. For a key's own transaction, `meta.keyType`
 * carries the handle's key type beside the account address. Today the action
 * window does not read it: it picks the key among the account's keys, which
 * for a listed basic account all sign as the same address.
 */
const callsRequestOf = (
  request: FollowedRequest,
  chainId: bigint,
  windowId: number | undefined
): SignUserRequest => ({
  id: request.id,
  session: new Session({ windowId }),
  meta: {
    isSignAction: true,
    accountAddr: request.account,
    ...(request.keyType === undefined ? {} : { keyType: request.keyType }),
    chainId,
    ...(request.recoveryKit
      ? {
          recoveryKit: {
            manager: request.recoveryKit.manager,
            auditedActions: [...request.recoveryKit.auditedActions]
          }
        }
      : {})
  },
  action: { kind: 'calls', calls: request.calls.map((call) => ({ ...call })) }
})

/**
 * The transaction hash of the request's own calls in an operation. A call sent
 * as a transaction of its own carries it, and the request's last call is the
 * one sent last; calls sent in the operation's one transaction take the
 * operation's.
 */
const hashOf = (operation: SubmittedOperation, id: string): Hex | undefined => {
  const call = operation.calls?.filter((candidate) => candidate.fromUserRequestId === id).pop()
  const hash =
    operation.identifiedBy?.type === 'MultipleTxns' ? call?.txnId : call?.txnId ?? operation.txnId
  return typeof hash === 'string' && isHash(hash) ? hash : undefined
}

const isBusy = (state: MainStatusState): boolean =>
  BUSY_STATUSES.includes(state.statuses?.signAndBroadcastAccountOp ?? '')

/** Whether calls the wallet holds came from the request. */
const carriesRequest = (calls: SubmittedOperation['calls'], id: string): boolean =>
  !!calls?.some((call) => call.fromUserRequestId === id)

/**
 * Whether the sign screen holds an operation that carries the request, which
 * it could still sign. A screen that pauses or signs takes no calls update, so
 * its operation keeps a request the queue already dropped, and a pause that
 * ends does not take the dropped update back. A screen with no status is a
 * reset one, or one that has not yet reached ready to sign and still takes
 * every update.
 */
const holdsRequest = (state: SignAccountOpState, id: string): boolean =>
  !!state.status && carriesRequest(state.accountOp?.calls, id)

/** Whether the sign screen started to sign the operation that holds the request. */
const signsRequest = (state: SignAccountOpState, id: string): boolean =>
  !!state.status && SIGNING_STATUSES.includes(state.status.type) && holdsRequest(state, id)

/** Whether the wallet rejected the operation before it reached the chain, so it names no transaction. */
const neverBroadcast = (operation: SubmittedOperation): boolean =>
  operation.status === AccountOpStatus.Rejected

const isQueued = (port: SendRequestPort, id: string): boolean =>
  queuedRequestsOf(port.queue()).some((queued) => queued.id === id)

/** The state of a request whose operation the activity lists. */
const operationStateOf = (operation: SubmittedOperation, id: string): SendRequestState => {
  if (!TRANSACTION_OPERATIONS.includes(operation.identifiedBy?.type ?? '')) {
    return { status: 'untracked' }
  }
  const transactionHash = hashOf(operation, id)
  if (transactionHash) {
    return { status: 'broadcast', transactionHash }
  }
  return neverBroadcast(operation) ? { status: 'gone' } : { status: 'queued' }
}

/**
 * Where a request the send port queued stands, read from the queue the wallet
 * holds now and from the account's own activity on the chain, whichever
 * account the wallet has selected. The activity is read through a session of
 * its own, asked page by page, newest first, until a page lists the request's
 * operation or the list ends; the session is closed in every outcome. A page
 * the activity does not answer within `REQUEST_STATE_READ_MS` ends the read as
 * `unread`.
 */
export const sendRequestStateOf = (
  port: SendRequestPort,
  requestId: string,
  account: Address,
  chainId: number | bigint
): Promise<SendRequestState> => {
  if (isQueued(port, requestId)) {
    return Promise.resolve({ status: 'queued' })
  }
  // The activity keys its operations by the account's address with the
  // wallet's own case.
  const listed = port.accounts().find((candidate) => sameAddress(candidate.addr, account))
  const filters = { account: listed?.addr ?? account, chainId: BigInt(chainId) }
  const sessionId = `social-recovery-request-state:${uuidv4()}`
  return new Promise<SendRequestState>((resolve) => {
    let done = false
    let page = ACTIVITY_PAGE.fromPage
    let timer: ReturnType<typeof setTimeout> | undefined
    let unsubscribe: () => void = () => {}

    const finish = (state: SendRequestState) => {
      if (done) {
        return
      }
      done = true
      if (timer !== undefined) {
        clearTimeout(timer)
      }
      unsubscribe()
      port.dispatch({
        type: 'MAIN_CONTROLLER_ACTIVITY_RESET_ACC_OPS_FILTERS',
        params: { sessionId }
      })
      resolve(state)
    }
    const ask = () => {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => finish({ status: 'unread' }), REQUEST_STATE_READ_MS)
      port.dispatch({
        type: 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS',
        params: {
          sessionId,
          filters,
          pagination: { fromPage: page, itemsPerPage: ACTIVITY_PAGE.itemsPerPage }
        }
      })
    }

    unsubscribe = port.subscribe((update) => {
      if (done || update.controller !== 'activity') {
        return
      }
      const result = update.state.accountsOps?.[sessionId]?.result
      // A push from before the activity took the page asked for holds no
      // session, or the page before it.
      if (!result || (result.currentPage ?? ACTIVITY_PAGE.fromPage) !== page) {
        return
      }
      const operation = result.items?.find((item) => carriesRequest(item.calls, requestId))
      if (operation) {
        finish(operationStateOf(operation, requestId))
        return
      }
      if (page + 1 < (result.maxPages ?? 0)) {
        page += 1
        ask()
        return
      }
      // The queue may push a state between moving a request from one of its
      // lists to the other, so it is read once more before `gone`.
      finish(isQueued(port, requestId) ? { status: 'queued' } : { status: 'gone' })
    })
    ask()
  })
}

const sameFeeOption = (a: FeePaymentOption, b: FeePaymentOption): boolean =>
  sameAddress(a.paidBy, b.paidBy) &&
  a.token.address === b.token.address &&
  !!a.token.flags?.onGasTank === !!b.token.flags?.onGasTank

/** One fee option as the sign screen offers it, with the speeds the controller computed for it. */
const feeOptionOf = (
  state: SignAccountOpState,
  accountAddr: string,
  option: FeePaymentOption
): FeeOption[] => {
  if (!isAddress(option.paidBy, { strict: false })) {
    return []
  }
  const speeds =
    state.feeSpeeds?.[
      getFeeSpeedIdentifier(option, accountAddr, state.rbfAccountOps?.[option.paidBy] ?? null)
    ] ?? []
  const picked = speeds.find((speed) => speed.type === state.selectedFeeSpeed)
  return [
    {
      paidBy: option.paidBy,
      token: {
        address: option.token.address,
        symbol: option.token.symbol,
        decimals: option.token.decimals
      },
      balance: option.availableAmount,
      ...(picked ? { amount: picked.amount } : {}),
      ...(speeds.length
        ? { available: speeds.some((speed) => speed.amount <= option.availableAmount) }
        : {}),
      selected: !!state.selectedOption && sameFeeOption(state.selectedOption, option)
    }
  ]
}

/**
 * The estimation's own error, where it has one. The wallet titles it with its
 * message and gives its code only in the sign screen's errors, so the entry
 * there under the same title carries the code; where the sign screen shows
 * another error instead, the reading has the title alone.
 */
const estimationErrorOf = (state: SignAccountOpState): SignAccountOpError | undefined => {
  const message = state.estimation?.error?.message
  if (typeof message !== 'string' || !message) {
    return undefined
  }
  return state.errors?.find((shown) => shown.title === message) ?? { title: message }
}

/**
 * The sign screen's estimation of the request, once it settled; undefined
 * while it runs or where the sign screen holds another request.
 */
const feeReadingOf = (state: SignAccountOpState, id: string): FeeReading | undefined => {
  const { accountOp, estimation } = state
  if (!accountOp || !carriesRequest(accountOp.calls, id)) {
    return undefined
  }
  if (!SETTLED_ESTIMATIONS.includes(estimation?.status ?? '')) {
    return undefined
  }
  const options = (estimation?.availableFeeOptions ?? []).flatMap((option) =>
    feeOptionOf(state, accountOp.accountAddr, option)
  )
  const error = estimationErrorOf(state) ?? state.errors?.[0]
  if (!error) {
    return { options }
  }
  return { options, error: { title: error.title, ...(error.code ? { code: error.code } : {}) } }
}

/** Builds the send port over the request queue and the activity. */
export const createSendPort = (port: SendRequestPort, options: SendPortOptions): SendPort => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS
  const chainId = BigInt(options.chainId)
  const { visibility } = options

  /** Queues the request and follows it until the activity names its hash or a refusal settles. */
  const follow = (request: FollowedRequest): Promise<Hex> => {
    const { id, account, refusal, onEstimation } = request
    if (otherCallsRequestIn(port.queue(), id, account, chainId)) {
      return Promise.reject(refusal('other-request-pending'))
    }
    return new Promise<Hex>((resolve, reject) => {
      let done = false
      let broadcast = false
      let seen = false
      let windowSeen = false
      let waiting = false
      let timedOut = false
      let busy = false
      let signing = false
      let held = false
      let inRequests = false
      let listed = false
      let lastQueue: QueueLists | undefined
      let windowClosed = false
      let lastReading: string | undefined
      let settling: SettlingRefusal | undefined
      let unsubscribe: () => void = () => {}
      let timer: ReturnType<typeof setTimeout> | undefined
      let closed: ReturnType<typeof setTimeout> | undefined
      let settleTimer: ReturnType<typeof setTimeout> | undefined
      let onShown: (() => void) | undefined

      const remove = () =>
        port.dispatch({ type: 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST', params: { id } })

      const clearWaits = () => {
        if (timer !== undefined) {
          clearTimeout(timer)
        }
        if (closed !== undefined) {
          clearTimeout(closed)
        }
        if (settleTimer !== undefined) {
          clearTimeout(settleTimer)
        }
        timer = undefined
        closed = undefined
        settleTimer = undefined
      }
      const end = (): boolean => {
        if (done) {
          return false
        }
        done = true
        clearWaits()
        unsubscribe()
        if (visibility && onShown) {
          visibility.removeEventListener('visibilitychange', onShown)
        }
        onShown = undefined
        port.dispatch({
          type: 'MAIN_CONTROLLER_ACTIVITY_RESET_ACC_OPS_FILTERS',
          params: { sessionId: id }
        })
        return true
      }
      const succeed = (hash: Hex) => {
        if (end()) {
          resolve(hash)
        }
      }
      const fail = (reason: SendRefusalReason) => {
        if (end()) {
          reject(refusal(reason))
        }
      }
      // A refusal waits while the wallet signs or broadcasts, and while the
      // queue or the sign screen still holds a request the port withdrew, and
      // then for a full settle period after all of them stopped.
      const armSettle = () => {
        if (settleTimer !== undefined) {
          clearTimeout(settleTimer)
        }
        settleTimer = undefined
        if (settling === undefined || busy || !settling.confirmed) {
          return
        }
        const { reason } = settling
        settleTimer = setTimeout(() => fail(reason), SEND_SETTLE_MS)
      }
      // A withdrawal is confirmed while the last queue state lists the request
      // in neither list and the last sign screen state holds no operation that
      // carries it; a later state that holds it again takes the confirmation
      // back.
      const confirmWithdrawal = () => {
        if (settling === undefined || !settling.withdrawn) {
          return
        }
        const confirmed = !listed && !held
        if (confirmed !== settling.confirmed) {
          settling.confirmed = confirmed
          armSettle()
        }
      }
      // Until the withdrawal is confirmed the removal may have been dropped, so
      // it is sent again each time the request enters the waiting requests,
      // except while the sign screen signs or pauses on it.
      const followWithdrawal = (wasInRequests: boolean) => {
        if (settling === undefined || !settling.withdrawn) {
          return
        }
        confirmWithdrawal()
        if (inRequests && !wasInRequests && !signing) {
          remove()
        }
      }
      const settle = (reason: SendRefusalReason, withdraw: boolean) => {
        if (done || settling !== undefined) {
          return
        }
        // Before any queue state listed the request, the queue the page holds
        // now tells whether there is anything to withdraw.
        if (!seen) {
          listed = isQueued(port, id)
        }
        const confirmed = !withdraw || (!listed && !held)
        settling = { reason, withdrawn: withdraw, confirmed }
        if (timer !== undefined) {
          clearTimeout(timer)
        }
        if (closed !== undefined) {
          clearTimeout(closed)
        }
        timer = undefined
        closed = undefined
        if (withdraw) {
          remove()
          if (visibility && onShown === undefined) {
            onShown = () => {
              if (!done && settling?.withdrawn && inRequests && !signing && isVisible(visibility)) {
                remove()
              }
            }
            visibility.addEventListener('visibilitychange', onShown)
          }
        }
        armSettle()
      }

      // The queue withdraws a request only from its own list, never one that
      // waits for an account switch, so the timeout waits until the queue
      // takes it in or drops it. A withdrawal cannot stop a signature either,
      // so the timeout also waits while the sign screen signs or pauses on
      // this request, and applies once it stops with nothing broadcast.
      timer = setTimeout(() => {
        timer = undefined
        timedOut = true
        if (!waiting && !signing) {
          settle('timeout', true)
        }
      }, timeoutMs)

      unsubscribe = port.subscribe((update) => {
        if (done) {
          return
        }
        if (update.controller === 'signAccountOp') {
          const wasSigning = signing
          signing = signsRequest(update.state, id)
          held = holdsRequest(update.state, id)
          confirmWithdrawal()
          // A failed signature or the end of a pause takes the sign screen back
          // to taking updates with no push of the queue, so a time limit that
          // passed while it signed, a request that joined then, or a removal
          // held back then, is read from the last queue state.
          if (wasSigning && !signing && !broadcast) {
            const queue = lastQueue ?? port.queue()
            const queued = (queue.userRequests ?? []).some(
              (queuedRequest) => queuedRequest.id === id
            )
            if (settling !== undefined) {
              if (settling.withdrawn && !settling.confirmed && queued) {
                remove()
              }
            } else if (queued && timedOut) {
              settle('timeout', true)
            } else if (queued && windowClosed) {
              settle('window-closed', true)
            } else if (queued && otherCallsRequestIn(queue, id, account, chainId)) {
              settle('other-request-pending', true)
            }
          }
          if (!onEstimation) {
            return
          }
          const reading = feeReadingOf(update.state, id)
          if (!reading) {
            return
          }
          const serialized = stringify(reading)
          if (serialized === lastReading) {
            return
          }
          lastReading = serialized
          try {
            onEstimation(reading)
          } catch {
            // A listener that throws must not stop the push to the event bus's other listeners.
          }
          return
        }
        if (update.controller === 'main') {
          const next = isBusy(update.state)
          if (next !== busy) {
            busy = next
            armSettle()
          }
          return
        }
        if (update.controller === 'activity') {
          const operation = update.state.accountsOps?.[id]?.result?.items?.find((item) =>
            carriesRequest(item.calls, id)
          )
          if (!operation) {
            return
          }
          // The wallet broadcast the request: its absence from the queue and
          // the window closing no longer mean that nothing was sent.
          broadcast = true
          settling = undefined
          clearWaits()
          if (!TRANSACTION_OPERATIONS.includes(operation.identifiedBy?.type ?? '')) {
            fail('not-a-transaction')
            return
          }
          const hash = hashOf(operation, id)
          if (hash) {
            succeed(hash)
          } else if (neverBroadcast(operation)) {
            fail('not-broadcast')
          }
          return
        }
        lastQueue = update.state
        if (broadcast) {
          return
        }
        const { userRequests = [], userRequestsWaitingAccountSwitch = [] } = update.state
        const inQueue = userRequests.some((queued) => queued.id === id)
        const wasInRequests = inRequests
        inRequests = inQueue
        waiting = userRequestsWaitingAccountSwitch.some((queued) => queued.id === id)
        listed = inQueue || waiting
        if (settling !== undefined) {
          if (settling.withdrawn) {
            followWithdrawal(wasInRequests)
            return
          }
          // The queue moves a request between its two lists after an account
          // switch and may push a state between the two moves: a request the
          // port did not withdraw that is back in either list is still open.
          if (!inQueue && !waiting) {
            return
          }
          settling = undefined
          armSettle()
        }
        if (!inQueue && !waiting) {
          if (seen) {
            settle(timedOut ? 'timeout' : 'refused', false)
          }
          return
        }
        seen = true
        if (!inQueue) {
          return
        }
        if (timedOut && !signing) {
          settle('timeout', true)
          return
        }
        // Except while the sign screen that holds this request signs or pauses
        // on its operation, another request that joins it withdraws this one: the
        // holder would sign both together. The wallet's own signing status
        // covers every sign flow, so only the sign screen's status tells.
        if (!signing && otherCallsRequestIn(update.state, id, account, chainId)) {
          settle('other-request-pending', true)
          return
        }
        if (update.state.actions?.actionWindow?.windowProps) {
          windowSeen = true
          windowClosed = false
          if (closed !== undefined) {
            clearTimeout(closed)
          }
          closed = undefined
        } else if (windowSeen && closed === undefined) {
          // The queue keeps a transaction request when its window closes, so
          // the holder could still send it from the dashboard later. The port
          // withdraws it instead, once the window stays closed, and not while
          // the sign screen signs or pauses on this request, which a withdrawal
          // cannot stop: then it applies once that ends with nothing broadcast.
          closed = setTimeout(() => {
            closed = undefined
            if (signing) {
              windowClosed = true
            } else {
              settle('window-closed', true)
            }
          }, ABSENCE_GRACE_MS)
        }
      })

      port.dispatch({
        type: 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS',
        params: { sessionId: id, filters: { account, chainId }, pagination: { ...ACTIVITY_PAGE } }
      })
      port.dispatch({
        type: 'REQUESTS_CONTROLLER_ADD_USER_REQUEST',
        params: {
          userRequest: callsRequestOf(request, chainId, port.windowId()),
          allowAccountSwitch: true
        }
      })
    })
  }

  return Object.freeze({
    send(key: KeyHandle, transaction: GasEstimateCall): Promise<Hex> {
      if (!sameAddress(transaction.from, key.addr)) {
        return Promise.reject(
          new TypeError(
            `The transaction comes from ${transaction.from}, not from the sending key ${key.addr}.`
          )
        )
      }
      const listed = listedBasicAccountOf(port.accounts(), key)
      if (!listed) {
        return Promise.reject(sendRefusal('not-wired', key))
      }
      return follow({
        id: newSendRequestId(),
        // The queue, the sign screen and the activity compare addresses with
        // exact case, so the request carries the listed account's own address.
        account: listed.addr as Address,
        calls: [{ to: transaction.to, value: transaction.value ?? 0n, data: transaction.data }],
        keyType: key.type,
        refusal: (reason) => sendRefusal(reason, key)
      })
    },

    sendAccountBatch(
      account: Address,
      calls: readonly PreparedCall[],
      onEstimation?: EstimationListener,
      recoveryKit?: RecoveryKitMark,
      requestId?: string
    ): Promise<Hex> {
      const listed = port.accounts().find((candidate) => sameAddress(candidate.addr, account))
      if (!listed) {
        return Promise.reject(accountBatchRefusal('not-listed', account))
      }
      // The wallet reads an account's kind from the whole record, of which the
      // port holds the members that kind depends on.
      if (!isSmartAccount(listed as Account)) {
        return Promise.reject(accountBatchRefusal('not-smart-account', account))
      }
      return follow({
        id: requestId ?? newSendRequestId(),
        account: listed.addr as Address,
        calls: calls.map((call) => ({ to: call.target, value: call.value, data: call.data })),
        refusal: (reason) => accountBatchRefusal(reason, account),
        onEstimation,
        recoveryKit
      })
    }
  })
}
