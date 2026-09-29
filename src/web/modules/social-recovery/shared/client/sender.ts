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
 * The queue sends for an account the wallet lists, from that account's keys.
 * A key that is itself a basic account (an EOA the wallet lists, its own only
 * associated key) therefore sends its own transaction and pays its gas. Any
 * other key, such as the smart account's controlling key at the slot's index
 * plus 100000, cannot send through it, and the port refuses such a key with a
 * `not-wired` refusal.
 */
import { v4 as uuidv4 } from 'uuid'
import { isHash } from 'viem'

import { Session } from '@ambire-common/classes/session'
import type { SignUserRequest } from '@ambire-common/interfaces/userRequest'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import { sameAddress } from './addresses'
import { ABSENCE_GRACE_MS, listedBasicAccountOf } from './signer'
import type {
  GasEstimateCall,
  KeyHandle,
  MainStatusState,
  SendPort,
  SendPortOptions,
  SendRefusal,
  SendRefusalReason,
  SendRequestPort,
  SettlingRefusal,
  SubmittedOperation
} from './types'

/** The background action a `not-wired` key needs. It does not exist yet. */
export const MISSING_SEND_ACTION = 'KEYSTORE_CONTROLLER_SEND_WITH_KEY' as const

/**
 * Why the send port returned no transaction hash of the key:
 *
 * - `not-wired`: the key is not itself a basic account the wallet lists;
 * - `refused`: the request left the queue with no operation broadcast, since
 *   the holder rejected it or declined the account switch it waited for;
 * - `window-closed`: the holder closed the action window with the request
 *   still queued; the port withdraws it, so the wallet cannot send it later;
 * - `not-broadcast`: the operation the wallet submitted was rejected before it
 *   reached the chain, and names no transaction;
 * - `not-a-transaction`: the wallet submitted the request as an operation
 *   another party sends (a user operation or a sponsored one), so no
 *   transaction of the key follows it, and its hash, where one comes, is not
 *   the call's; that operation may still reach the chain;
 * - `timeout`: no answer came in time; the port withdraws the request, or
 *   waits until the queue drops one that waited for an account switch.
 */
export const SEND_REFUSAL_REASONS = [
  'not-wired',
  'refused',
  'window-closed',
  'not-broadcast',
  'not-a-transaction',
  'timeout'
] as const

const REFUSAL_MESSAGES: { readonly [R in SendRefusalReason]: string } = {
  'not-wired': `the request queue sends only from a key that is itself a basic account the wallet lists. Missing background action: ${MISSING_SEND_ACTION} { requestId, keyAddr, keyType, chainId, transaction }.`,
  refused: 'the request left the queue and no transaction was broadcast.',
  'window-closed':
    'the action window closed with the request still queued, so the request was withdrawn and no transaction was broadcast.',
  'not-broadcast': 'the operation the wallet submitted was rejected before it reached the chain.',
  'not-a-transaction':
    'the wallet submitted the request as an operation another party sends, which names no transaction of this key; that operation may still reach the chain.',
  timeout:
    'no answer came in time; the request is no longer queued and no transaction was broadcast.'
}

export const sendRefusal = (reason: SendRefusalReason, key: KeyHandle): SendRefusal => {
  const error = new Error(
    `No transaction of key ${key.addr} (${key.type}) to follow: ${REFUSAL_MESSAGES[reason]}`
  ) as SendRefusal
  error.name = 'SendRefusal'
  error.reason = reason
  error.key = { ...key }
  if (reason === 'not-wired') error.missingAction = MISSING_SEND_ACTION
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

/** The operations the key sent as transactions of its own, whose hash is its call's. */
const TRANSACTION_OPERATIONS: readonly string[] = ['Transaction', 'MultipleTxns']

/** The activity page the port reads: the operation it sent is the newest of the account. */
const ACTIVITY_PAGE = { fromPage: 0, itemsPerPage: 10 }

/**
 * A request id no other page makes: the port's prefix and a random UUID. The
 * activity session takes the same id, so it is the port's own too.
 */
const nextRequestId = (): string => `social-recovery-sender:${uuidv4()}`

/**
 * The transaction request the port adds to the queue for one key and one
 * transaction. `meta.keyType` carries the handle's key type beside the account
 * address, so the key type travels with the request. Today the action window
 * does not read it: it picks the key among the account's keys, which for a
 * listed basic account all sign as the same address. `key.addr` must be the
 * listed account's own address as the wallet holds it, since the queue, the
 * sign screen and the activity compare addresses with exact case.
 */
const sendRequestOf = (
  id: string,
  key: KeyHandle,
  chainId: bigint,
  transaction: GasEstimateCall,
  windowId: number | undefined
): SignUserRequest => ({
  id,
  session: new Session({ windowId }),
  meta: { isSignAction: true, accountAddr: key.addr, keyType: key.type, chainId },
  action: {
    kind: 'calls',
    calls: [{ to: transaction.to, value: transaction.value ?? 0n, data: transaction.data }]
  }
})

/**
 * The transaction hash of the request's own call in an operation. A call sent
 * as a transaction of its own carries it; one sent in the operation's one
 * transaction takes the operation's.
 */
const hashOf = (operation: SubmittedOperation, id: string): Hex | undefined => {
  const call = operation.calls?.find((candidate) => candidate.fromUserRequestId === id)
  const hash =
    operation.identifiedBy?.type === 'MultipleTxns' ? call?.txnId : call?.txnId ?? operation.txnId
  return typeof hash === 'string' && isHash(hash) ? hash : undefined
}

const isBusy = (state: MainStatusState): boolean =>
  BUSY_STATUSES.includes(state.statuses?.signAndBroadcastAccountOp ?? '')

/** Builds the send port over the request queue and the activity. */
export const createSendPort = (port: SendRequestPort, options: SendPortOptions): SendPort => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS
  const chainId = BigInt(options.chainId)

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
      // The queue, the sign screen and the activity compare addresses with
      // exact case, so the request carries the listed account's own address.
      const account = listed.addr as Address
      const id = nextRequestId()
      return new Promise<Hex>((resolve, reject) => {
        let done = false
        let broadcast = false
        let seen = false
        let windowSeen = false
        let waiting = false
        let timedOut = false
        let busy = false
        let settling: SettlingRefusal | undefined
        let unsubscribe: () => void = () => {}
        let timer: ReturnType<typeof setTimeout> | undefined
        let closed: ReturnType<typeof setTimeout> | undefined
        let settleTimer: ReturnType<typeof setTimeout> | undefined

        const clearWaits = () => {
          if (timer !== undefined) clearTimeout(timer)
          if (closed !== undefined) clearTimeout(closed)
          if (settleTimer !== undefined) clearTimeout(settleTimer)
          timer = undefined
          closed = undefined
          settleTimer = undefined
        }
        const end = (): boolean => {
          if (done) return false
          done = true
          clearWaits()
          unsubscribe()
          port.dispatch({
            type: 'MAIN_CONTROLLER_ACTIVITY_RESET_ACC_OPS_FILTERS',
            params: { sessionId: id }
          })
          return true
        }
        const succeed = (hash: Hex) => {
          if (end()) resolve(hash)
        }
        const fail = (reason: SendRefusalReason) => {
          if (end()) reject(sendRefusal(reason, key))
        }
        // A refusal waits while the wallet signs or broadcasts, and then for a
        // full settle period after it stopped.
        const armSettle = () => {
          if (settleTimer !== undefined) clearTimeout(settleTimer)
          settleTimer = undefined
          if (settling === undefined || busy) return
          const { reason } = settling
          settleTimer = setTimeout(() => fail(reason), SEND_SETTLE_MS)
        }
        const settle = (reason: SendRefusalReason, withdraw: boolean) => {
          if (done || settling !== undefined) return
          settling = { reason, withdrawn: withdraw }
          if (timer !== undefined) clearTimeout(timer)
          if (closed !== undefined) clearTimeout(closed)
          timer = undefined
          closed = undefined
          if (withdraw) {
            port.dispatch({ type: 'REQUESTS_CONTROLLER_REMOVE_USER_REQUEST', params: { id } })
          }
          armSettle()
        }

        // The queue withdraws a request only from its own list, never one that
        // waits for an account switch, so the timeout waits until the queue
        // takes it in or drops it.
        timer = setTimeout(() => {
          timer = undefined
          timedOut = true
          if (!waiting) settle('timeout', true)
        }, timeoutMs)

        unsubscribe = port.subscribe((update) => {
          if (done) return
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
              item.calls?.some((call) => call.fromUserRequestId === id)
            )
            if (!operation) return
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
            if (hash) succeed(hash)
            else if (operation.status === AccountOpStatus.Rejected) fail('not-broadcast')
            return
          }
          if (broadcast) return
          const { userRequests = [], userRequestsWaitingAccountSwitch = [] } = update.state
          const inQueue = userRequests.some((request) => request.id === id)
          waiting = userRequestsWaitingAccountSwitch.some((request) => request.id === id)
          if (settling !== undefined) {
            // The queue moves a request between its two lists after an account
            // switch and may push a state between the two moves: a request the
            // port did not withdraw that is back in either list is still open.
            if (settling.withdrawn || (!inQueue && !waiting)) return
            settling = undefined
            armSettle()
          }
          if (!inQueue && !waiting) {
            if (seen) settle(timedOut ? 'timeout' : 'refused', false)
            return
          }
          seen = true
          if (!inQueue) return
          if (timedOut) {
            settle('timeout', true)
            return
          }
          if (update.state.actions?.actionWindow?.windowProps) {
            windowSeen = true
            if (closed !== undefined) clearTimeout(closed)
            closed = undefined
          } else if (windowSeen && closed === undefined) {
            // The queue keeps a transaction request when its window closes, so
            // the holder could still send it from the dashboard later. The port
            // withdraws it instead, once the window stays closed.
            closed = setTimeout(() => {
              closed = undefined
              settle('window-closed', true)
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
            userRequest: sendRequestOf(
              id,
              { addr: account, type: key.type },
              chainId,
              transaction,
              port.windowId()
            ),
            allowAccountSwitch: true
          }
        })
      })
    }
  })
}
