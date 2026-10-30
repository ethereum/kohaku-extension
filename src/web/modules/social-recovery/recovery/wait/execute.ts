/**
 * The execution's run: the shared write machine for the gas check, the
 * deposit step, the send and the receipt, and the claim of the execution on
 * the countdown's record.
 *
 *   idle ──start──▶ checkingGas: the countdown read, the prepare, the gas check
 *                     (and where it reads enough, the block the claim starts from)
 *                     ├─ a claim on the countdown ─▶ followed (nothing sent)
 *                     ├─ deposit ──▶ needsDeposit ──the balance read again──▶ the claim
 *                     └─ enough ───▶ the claim
 *                                     ├─ another page's claim ─▶ followed (nothing sent)
 *                                     └─ its own ──▶ submitting ──▶ failedNotSent | failedReverted | landed
 *   followed, a hash ──▶ its receipt, as after a send
 *   followed, no hash ──▶ judged on every read by where the wallet holds its
 *                         request: held in its queue, waited on as in flight;
 *                         broadcast, followed under that hash; held nowhere,
 *                         not sent (the claim released where it still carries
 *                         no hash, execute offered again)
 *
 * The countdown is read before anything is prepared, so a retry, a reload or
 * a second tab never sends a second execution for the same attempt: a claim
 * the countdown carries is followed, never sent again, and a page sends only
 * under the claim it wrote itself, with nothing awaited between the claim and
 * the hand-over to the wallet. The claim is released where the run ended with
 * nothing on its way to the chain (a send the wallet refused, a replaced
 * transaction, a revert, a send no node knows at two readings apart past the
 * dropped age). A send that may still land, and a landed one, keep it until
 * the countdown ends.
 *
 * The run keeps its own countdown, the one that names the attempt it was
 * started for by its id, its setup number and its payload hash, matched on
 * those three values on every read and before every write. A countdown of
 * another attempt reads as gone for the run: nothing is claimed, written or
 * released on it, the prepared execution is dropped (it cannot serve another
 * attempt), a run with nothing on its way starts over, a send already out
 * keeps its hash for its receipt wait, and the screen reads the countdown
 * again.
 *
 * The store is kept per chain, account and attempt while work is in flight,
 * so a second press or a remount takes up the run instead of starting one. A
 * landed receipt is not the screen's done: the wait's poll reads the attempt
 * consumed before the done screen renders. Every answer carries its run, so
 * the answer of a run left behind moves nothing.
 */
import type {
  ExecutionInFlightClaim,
  ExecutionInFlightRecord
} from '@web/modules/social-recovery/shared/records'
import {
  apartFrom,
  claimReadingOf,
  coversHashes,
  DROPPED_AFTER_MS,
  DROPPED_RECHECK_MS,
  initialWriteState,
  mayStillLand,
  writeReducer
} from '@web/modules/social-recovery/shared/writes'
import type { UnknownReading, WriteEvent } from '@web/modules/social-recovery/shared/writes'
import { providerReadFailure, readWithin, within } from '@web/modules/social-recovery/shared/client'
import type { Hex, PreparedCall } from '@kohaku-eth/social-recovery'
import { FOLLOW_REREAD_MS, READ_LIMIT_MS } from '@web/modules/social-recovery/recovery/submit'

import { EXECUTE_BALANCE_POLL_MS } from './constants'
import type { ExecuteEvent, ExecuteState, ExecuteSteps, ExecuteStore } from './types'

/** The execution before anything ran. */
export const initialExecuteState = (): ExecuteState => ({ write: initialWriteState('execution') })

const inRun = (state: ExecuteState, run: number): boolean => state.write.run === run

/** Whether the run sends with no hash yet: the wallet's window waits, or a followed claim is read. */
const awaitingHashIn = (state: ExecuteState, run: number): boolean =>
  inRun(state, run) && state.write.status === 'submitting' && !state.write.transactionHash

/** The hash the run sends or follows and waits on, where it has one. */
const pendingHashIn = (state: ExecuteState, run: number): Hex | undefined =>
  inRun(state, run) && state.write.status === 'submitting' ? state.write.transactionHash : undefined

/** The execution's reducer. Pure: an event a state does not take leaves it as it was (the same object). */
export const executeReducer = (state: ExecuteState, event: ExecuteEvent): ExecuteState => {
  switch (event.type) {
    case 'write': {
      const write = writeReducer(state.write, event.event)
      if (write === state.write) {
        return state
      }
      if (write.run !== state.write.run || write.status === 'idle') {
        return { write }
      }
      const next: ExecuteState = { ...state, write }
      if (state.follow && (write.status !== 'submitting' || write.transactionHash)) {
        delete next.follow
      }
      if (write.status !== 'needsDeposit') {
        delete next.balance
      }
      // A kept reading of the run's transactions holds only while the run submits them.
      if (write.status !== 'submitting') {
        delete next.unknownReading
      }
      return next
    }
    case 'prepared':
      if (!inRun(state, event.run) || state.write.status !== 'checkingGas') {
        return state
      }
      return { ...state, prepared: event.prepared }
    case 'balance':
      if (
        !inRun(state, event.run) ||
        state.write.status !== 'needsDeposit' ||
        state.balance === event.balance
      ) {
        return state
      }
      return { ...state, balance: event.balance }
    case 'claimed':
      if (!awaitingHashIn(state, event.run) || state.requestId || state.followed) {
        return state
      }
      return { ...state, requestId: event.requestId }
    case 'released': {
      if (!inRun(state, event.run) || (!state.requestId && !state.followed)) {
        return state
      }
      const { requestId, followed, ...rest } = state
      return rest
    }
    case 'follow': {
      // From an idle run, or one whose send may still land, a new run follows
      // the claim; in a run whose own claim lost, the run follows it instead.
      const opens =
        inRun(state, event.run) && (state.write.status === 'idle' || mayStillLand(state.write))
      if (!opens && (!awaitingHashIn(state, event.run) || state.requestId || state.followed)) {
        return state
      }
      const run = opens ? event.run + 1 : event.run
      const { claim } = event
      const hash = claim.transactionHash
      return {
        write: {
          status: 'submitting',
          write: 'execution',
          run,
          ...(hash
            ? { transactionHash: hash, sentHashes: [hash], startBlock: claim.startBlock }
            : {})
        },
        followed: claim.requestId,
        ...(hash
          ? {}
          : {
              follow: {
                requestId: claim.requestId,
                startBlock: claim.startBlock,
                claimedAt: claim.claimedAt
              }
            }),
        ...(state.prepared ? { prepared: state.prepared } : {})
      }
    }
    case 'voided':
      // A followed claim that went, or that never went out: execute is offered again.
      if (!awaitingHashIn(state, event.run) || !state.follow) {
        return state
      }
      return { write: writeReducer(state.write, { type: 'reset' }) }
    case 'replaced': {
      if (!inRun(state, event.run) || state.replaced) {
        return state
      }
      // A send already out keeps its hash for the receipt wait; anything else starts over.
      const { write } = state
      const out =
        (write.status === 'submitting' && !!write.transactionHash) ||
        write.status === 'landed' ||
        mayStillLand(write)
      return { write: out ? write : writeReducer(write, { type: 'reset' }), replaced: true }
    }
    case 'unknownRead':
      if (!pendingHashIn(state, event.run)) {
        return state
      }
      return { ...state, unknownReading: event.reading }
    case 'unknownCleared': {
      if (!inRun(state, event.run) || !state.unknownReading) {
        return state
      }
      const { unknownReading, ...rest } = state
      return rest
    }
    default:
      return state
  }
}

/** A store over the reducer. */
export const createExecuteStore = (initial: ExecuteState = initialExecuteState()): ExecuteStore => {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    state: () => current,
    dispatch(event) {
      const next = executeReducer(current, event)
      if (next !== current) {
        current = next
        listeners.forEach((listener) => listener())
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

/** Whether the run has work in flight a new start must not repeat. */
export const isExecuting = (state: ExecuteState): boolean => {
  const { status } = state.write
  return status === 'checkingGas' || status === 'needsDeposit' || status === 'submitting'
}

/** Whether the screen keeps the run when it leaves it: work in flight, a landing, or a send that may still land. */
export const outlivesWait = (state: ExecuteState): boolean =>
  isExecuting(state) || state.write.status === 'landed' || mayStillLand(state.write)

// The steps of the screen attached to each store, while one is.
const ATTACHED = new WeakMap<ExecuteStore, ExecuteSteps>()
const POLLING = new WeakSet<ExecuteStore>()
const DROP_CHECKS = new WeakSet<ExecuteStore>()
const RECHECKING = new WeakSet<ExecuteStore>()
const FOLLOWING = new WeakSet<ExecuteStore>()
const WAITING = new WeakSet<ExecuteStore>()
const SENDING = new WeakSet<ExecuteStore>()
// The idle run whose countdown was read for a claim, so each idle run reads it once.
const LOOKED = new WeakMap<ExecuteStore, number>()

export const detachExecuteSteps = (store: ExecuteStore, steps: ExecuteSteps): void => {
  if (ATTACHED.get(store) === steps) {
    ATTACHED.delete(store)
  }
}

const writeEvent = (store: ExecuteStore) => (event: WriteEvent) =>
  store.dispatch({ type: 'write', event })

const rest = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * Whether the run ended with nothing on its way to the chain, so its claim
 * goes: a send never made that cannot still land (refused, replaced), a read
 * before the send that failed, or a revert. A landing, a send that may still
 * land and a receipt wait keep it.
 */
const endedWithNothingInFlight = (state: ExecuteState): boolean =>
  state.write.status === 'failedReverted' ||
  state.write.status === 'gasReadError' ||
  (state.write.status === 'failedNotSent' && !mayStillLand(state.write))

/** Releases the claim the run sent or followed where the run ended with nothing on its way to the chain. */
const releaseWhereEnded = async (store: ExecuteStore, steps: ExecuteSteps): Promise<void> => {
  const state = store.state()
  const requestId = state.requestId ?? state.followed
  if (!requestId || !endedWithNothingInFlight(state)) {
    return
  }
  store.dispatch({ type: 'released', run: state.write.run })
  await steps.release(requestId).catch(() => undefined)
}

/** Waits for the receipt of the hash the run follows, then releases where it ended. */
const waitForReceipt = async (store: ExecuteStore, steps: ExecuteSteps): Promise<void> => {
  const state = store.state()
  const { write } = state
  if (write.status !== 'submitting' || !write.transactionHash || WAITING.has(store)) {
    return
  }
  WAITING.add(store)
  try {
    await steps.waitAgain(write.transactionHash, write.startBlock, writeEvent(store), write.run)
  } finally {
    WAITING.delete(store)
  }
  await releaseWhereEnded(store, steps)
}

/**
 * Reads the followed claim with no hash while a screen is attached: a hash
 * that arrives is waited on; a claim that went, or another page's claim in its
 * place, ends the follow (the latter is followed in turn). On every read the
 * claim is judged by where the wallet holds its request, with no age: while
 * the wallet's queue still holds it, it is waited on; once the queue broadcast
 * it, its hash is written on the claim and followed; held nowhere, the send
 * never went out (`claimReadingOf`), so the claim is released where it still
 * carries no hash and execute offered again. A read that fails, or that does
 * not answer within `READ_LIMIT_MS`, is read again after a rest, never taken
 * as an answer.
 */
const readFollow = async (store: ExecuteStore): Promise<void> => {
  if (FOLLOWING.has(store)) {
    return
  }
  FOLLOWING.add(store)
  let waitAfter = false
  try {
    for (;;) {
      const steps = ATTACHED.get(store)
      const state = store.state()
      const { follow } = state
      const { run } = state.write
      if (!steps || !follow || !awaitingHashIn(state, run)) {
        return
      }
      // eslint-disable-next-line no-await-in-loop
      const read = await steps.readCountdown().catch(() => undefined)
      if (store.state().follow !== follow) {
        // eslint-disable-next-line no-continue
        continue
      }
      if (read?.status === 'replaced') {
        store.dispatch({ type: 'replaced', run })
        return
      }
      const held: ExecutionInFlightRecord | undefined =
        read?.status === 'present' ? read.value.execution : undefined
      if (read && !held) {
        store.dispatch({ type: 'voided', run })
        return
      }
      if (held && held.requestId !== follow.requestId) {
        store.dispatch({ type: 'voided', run })
        store.dispatch({ type: 'follow', run, claim: held })
        if (held.transactionHash) {
          waitAfter = true
          return
        }
        // eslint-disable-next-line no-continue
        continue
      }
      if (held?.transactionHash) {
        writeEvent(store)({
          type: 'sent',
          run,
          transactionHash: held.transactionHash,
          startBlock: held.startBlock
        })
        waitAfter = true
        return
      }
      if (held) {
        // eslint-disable-next-line no-await-in-loop
        const hold = await within(() => steps.requestHold(follow.requestId), READ_LIMIT_MS)
        if (store.state().follow !== follow) {
          // eslint-disable-next-line no-continue
          continue
        }
        if (hold?.status === 'broadcast') {
          // eslint-disable-next-line no-await-in-loop
          const marked = await steps.markSent(follow, hold.transactionHash).catch(() => undefined)
          if (marked === 'replaced') {
            store.dispatch({ type: 'replaced', run })
            return
          }
          writeEvent(store)({
            type: 'sent',
            run,
            transactionHash: hold.transactionHash,
            startBlock: follow.startBlock
          })
          waitAfter = true
          return
        }
        if (hold?.status === 'free') {
          // eslint-disable-next-line no-await-in-loop
          const released = await steps.releaseClaim(follow.requestId, []).catch(() => undefined)
          if (store.state().follow !== follow) {
            // eslint-disable-next-line no-continue
            continue
          }
          if (released?.status === 'replaced') {
            store.dispatch({ type: 'replaced', run })
            return
          }
          if (released?.status === 'released') {
            store.dispatch({ type: 'voided', run })
            return
          }
          if (released?.status === 'hashed') {
            writeEvent(store)({
              type: 'sent',
              run,
              transactionHash: released.transactionHash,
              startBlock: follow.startBlock
            })
            waitAfter = true
            return
          }
          if (released?.status === 'gone') {
            // eslint-disable-next-line no-continue
            continue
          }
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await rest(FOLLOW_REREAD_MS)
    }
  } finally {
    FOLLOWING.delete(store)
    if (waitAfter) {
      const steps = ATTACHED.get(store)
      if (steps) {
        waitForReceipt(store, steps).catch(() => undefined)
      }
    }
  }
}

/** Follows a claim in place of a send: under its hash its receipt is waited on, with none it is read. */
const followClaim = async (
  store: ExecuteStore,
  steps: ExecuteSteps,
  run: number,
  claim: ExecutionInFlightRecord
): Promise<void> => {
  const before = store.state()
  store.dispatch({ type: 'follow', run, claim })
  if (store.state() === before) {
    return
  }
  if (claimReadingOf(claim).kind === 'inFlight') {
    await waitForReceipt(store, steps)
    return
  }
  await readFollow(store)
}

// A gas check that does not answer in time is the gas check's read failure, with its retry.
const gasCheckLimit = (error: Error): Error => providerReadFailure('estimateGas', error)

/** The gas check, rejected as a read failure where it does not answer within `READ_LIMIT_MS`. */
const checkGasWithin = (steps: ExecuteSteps, prepared: PreparedCall) =>
  readWithin(() => steps.checkGas(prepared), READ_LIMIT_MS, gasCheckLimit)

/**
 * The chain's latest block, read while the gas check still runs: a read that
 * fails, or that does not answer within `READ_LIMIT_MS`, is the gas check's
 * read failure with its retry, never a send refused.
 */
const startBlockOf = async (steps: ExecuteSteps): Promise<number> => {
  const block = await within(() => steps.blockNumber(), READ_LIMIT_MS)
  if (block === undefined) {
    throw providerReadFailure('block', new Error(`No usable answer in ${READ_LIMIT_MS} ms.`))
  }
  return block
}

/**
 * The claim of the execution on the countdown under a new request id, with
 * the block read before it, then the send under that claim; where the
 * countdown already carries a claim, it is followed and nothing is sent.
 * Nothing is awaited between the claim and the hand-over to the wallet. The
 * hash is written on the claim before the run's end releases it.
 */
const claimAndSend = async (
  store: ExecuteStore,
  steps: ExecuteSteps,
  run: number,
  startBlock: number
): Promise<void> => {
  const { prepared } = store.state()
  if (!prepared || !awaitingHashIn(store.state(), run)) {
    return
  }
  const dispatch = writeEvent(store)
  const claim: ExecutionInFlightClaim = {
    requestId: steps.newRequestId(),
    startBlock,
    claimedAt: steps.now()
  }
  let written
  try {
    written = await steps.claim(claim)
  } catch (error: unknown) {
    dispatch({ type: 'error', run, error })
    return
  }
  if (written === 'replaced') {
    store.dispatch({ type: 'replaced', run })
    return
  }
  if (!written.claimed) {
    await followClaim(store, steps, run, written.execution)
    return
  }
  store.dispatch({ type: 'claimed', run, requestId: claim.requestId })
  if (store.state().requestId !== claim.requestId) {
    await steps.release(claim.requestId).catch(() => undefined)
    return
  }
  let marking: Promise<void> = Promise.resolve()
  const sendDispatch = (event: WriteEvent) => {
    dispatch(event)
    if (event.type === 'sent' && event.run === run) {
      marking = steps.markSent(claim, event.transactionHash).then(
        (answer) => {
          if (answer === 'replaced') {
            store.dispatch({ type: 'replaced', run })
          }
        },
        () => undefined
      )
    }
  }
  // The run may still add only while the countdown holds this request's
  // claim with no hash: a page that arrived since may have released the
  // claim and executed again.
  const canAdd = async (): Promise<boolean> => {
    if (!awaitingHashIn(store.state(), run) || store.state().requestId !== claim.requestId) {
      return false
    }
    const read = await within(() => steps.readCountdown(), READ_LIMIT_MS)
    const held = read?.status === 'present' ? read.value.execution : undefined
    return held?.requestId === claim.requestId && held.transactionHash === undefined
  }
  SENDING.add(store)
  try {
    await steps.send(prepared, sendDispatch, run, startBlock, claim.requestId, canAdd)
  } catch (error: unknown) {
    dispatch({ type: 'error', run, error })
  } finally {
    SENDING.delete(store)
  }
  await marking
  await releaseWhereEnded(store, steps)
}

/**
 * While the deposit step shows and a screen is attached: the gas check again
 * every `EXECUTE_BALANCE_POLL_MS` on the same prepared call. Enough goes on to
 * the claim and the send by itself; short keeps the step with the latest
 * balance; a read that fails, or that does not answer within `READ_LIMIT_MS`,
 * reads as the gas check's failure, with its retry.
 */
const pollDeposit = async (store: ExecuteStore): Promise<void> => {
  if (POLLING.has(store)) {
    return
  }
  POLLING.add(store)
  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      await rest(EXECUTE_BALANCE_POLL_MS)
      const steps = ATTACHED.get(store)
      const state = store.state()
      const { run } = state.write
      if (!steps || state.write.status !== 'needsDeposit' || !state.prepared) {
        return
      }
      let check
      try {
        // eslint-disable-next-line no-await-in-loop
        check = await checkGasWithin(steps, state.prepared)
      } catch (error: unknown) {
        if (inRun(store.state(), run) && store.state().write.status === 'needsDeposit') {
          writeEvent(store)({ type: 'recheck' })
          writeEvent(store)({ type: 'error', run, error })
        }
        return
      }
      if (!inRun(store.state(), run) || store.state().write.status !== 'needsDeposit') {
        return
      }
      if (check.kind === 'enough') {
        writeEvent(store)({ type: 'recheck' })
        let startBlock: number
        try {
          // eslint-disable-next-line no-await-in-loop
          startBlock = await startBlockOf(steps)
        } catch (error: unknown) {
          writeEvent(store)({ type: 'error', run, error })
          return
        }
        if (!inRun(store.state(), run) || store.state().write.status !== 'checkingGas') {
          return
        }
        writeEvent(store)({ type: 'gasChecked', run, check })
        POLLING.delete(store)
        // eslint-disable-next-line no-await-in-loop
        await claimAndSend(store, steps, run, startBlock)
        return
      }
      store.dispatch({ type: 'balance', run, balance: check.step.balance })
    }
  } finally {
    POLLING.delete(store)
  }
}

/**
 * Whether the hashes the run waits on were dropped: the claim the run sends
 * or follows is older than `DROPPED_AFTER_MS` by the clock read before the
 * reads; the node knows none of them, read with the chain's block number; an
 * earlier check kept such a reading of every one of these hashes, and this
 * one is `apartFrom` it; and the manager's events name no consume of the
 * attempt since the claim's block. A first reading is kept, and the check
 * ends there, so one node that lags cannot let a second execution out. The
 * claim is then released, unless it carries a hash the run does not know,
 * and execute is offered again. A claim that is not the run's or is younger
 * than the age, a known transaction, a read that fails or does not answer
 * within `READ_LIMIT_MS`, or a consumed attempt drops the kept reading; a run
 * that moved meanwhile moves nothing. Answers whether the check released the
 * run.
 */
const readDropped = async (store: ExecuteStore, steps: ExecuteSteps): Promise<boolean> => {
  const state = store.state()
  const { write } = state
  const { run } = write
  const hash = pendingHashIn(state, run)
  const requestId = state.requestId ?? state.followed
  if (!hash || !requestId || write.status !== 'submitting' || DROP_CHECKS.has(store)) {
    return false
  }
  const hashes = write.sentHashes ?? [hash]
  const unmoved = () => store.state().write === write
  const notDropped = (): boolean => {
    store.dispatch({ type: 'unknownCleared', run })
    return false
  }
  DROP_CHECKS.add(store)
  try {
    const clock = steps.now()
    const read = await within(() => steps.readCountdown(), READ_LIMIT_MS)
    if (!unmoved()) {
      return false
    }
    if (read?.status === 'replaced') {
      store.dispatch({ type: 'replaced', run })
      return false
    }
    const held = read?.status === 'present' ? read.value.execution : undefined
    if (!held || held.requestId !== requestId || clock - held.claimedAt < DROPPED_AFTER_MS) {
      return notDropped()
    }
    const at = steps.now()
    const answers = await within(
      () =>
        Promise.all([
          steps.blockNumber(),
          Promise.all(hashes.map((one) => steps.transactionKnown(one)))
        ]),
      READ_LIMIT_MS
    )
    if (!unmoved()) {
      return false
    }
    if (!answers || answers[1].some((answer) => answer !== 'unknown')) {
      return notDropped()
    }
    const reading: UnknownReading = { at, block: answers[0], hashes }
    // A reading too close to the kept one leaves the kept one as it is, so the
    // wait counts from the first; one that asked for a hash the kept one did
    // not read starts the count again.
    const kept = store.state().unknownReading
    if (!kept || !coversHashes(kept, reading)) {
      store.dispatch({ type: 'unknownRead', run, reading })
      return false
    }
    if (!apartFrom(kept, reading)) {
      return false
    }
    const consumed = await within(() => steps.consumedSince(held.startBlock), READ_LIMIT_MS)
    if (!unmoved()) {
      return false
    }
    if (consumed !== false) {
      return notDropped()
    }
    const released = await steps.releaseClaim(requestId, hashes).catch(() => undefined)
    if (!unmoved()) {
      return false
    }
    if (released?.status === 'replaced') {
      store.dispatch({ type: 'replaced', run })
      return false
    }
    if (released?.status !== 'released') {
      return false
    }
    writeEvent(store)({ type: 'reset' })
    return true
  } finally {
    DROP_CHECKS.delete(store)
  }
}

/**
 * While a first reading that the node knows none of the run's transactions
 * is kept and a screen is attached: the check again after
 * `DROPPED_RECHECK_MS`, so the second reading comes with no poll.
 */
const recheckDropped = async (store: ExecuteStore): Promise<void> => {
  if (RECHECKING.has(store)) {
    return
  }
  RECHECKING.add(store)
  try {
    while (store.state().unknownReading) {
      // eslint-disable-next-line no-await-in-loop
      await rest(DROPPED_RECHECK_MS)
      const steps = ATTACHED.get(store)
      if (!steps || !store.state().unknownReading) {
        return
      }
      // eslint-disable-next-line no-await-in-loop
      if (await readDropped(store, steps)) {
        return
      }
    }
  } finally {
    RECHECKING.delete(store)
  }
}

/**
 * Before execute is offered: reads the countdown and, where it carries a
 * claim, follows it in a new run with nothing sent. Reads once per idle run,
 * and again after a read that failed.
 */
const lookForClaim = async (store: ExecuteStore, steps: ExecuteSteps): Promise<void> => {
  const state = store.state()
  const { run } = state.write
  if (state.write.status !== 'idle' || LOOKED.get(store) === run) {
    return
  }
  LOOKED.set(store, run)
  const read = await steps.readCountdown().catch(() => undefined)
  if (!read) {
    if (LOOKED.get(store) === run) {
      LOOKED.delete(store)
    }
    return
  }
  if (read.status === 'replaced') {
    store.dispatch({ type: 'replaced', run })
    return
  }
  const claim = read.status === 'present' ? read.value.execution : undefined
  if (claim) {
    await followClaim(store, steps, run, claim)
  }
}

/**
 * Attaches the steps of the screen that now holds the store: a claim the
 * countdown carries is looked for, and a followed claim and the deposit
 * step's reads go on through them.
 */
export const attachExecuteSteps = (store: ExecuteStore, steps: ExecuteSteps): void => {
  ATTACHED.set(store, steps)
  lookForClaim(store, steps).catch(() => undefined)
  readFollow(store).catch(() => undefined)
  if (store.state().write.status === 'needsDeposit') {
    pollDeposit(store).catch(() => undefined)
  }
  if (store.state().unknownReading) {
    recheckDropped(store).catch(() => undefined)
  }
}

/**
 * Starts the execution, from nothing or from a state that offers the retry:
 * the countdown read (a claim it carries is followed), the prepare, the gas
 * check, then the deposit step or the claim and the send. The write machine
 * refuses the start while work is in flight, after a landing, and after a
 * send that may still land; a refused start does nothing.
 */
export const startExecution = async (store: ExecuteStore, steps: ExecuteSteps): Promise<void> => {
  await releaseWhereEnded(store, steps)
  const before = store.state().write.run
  writeEvent(store)({ type: 'start' })
  const { run } = store.state().write
  if (run === before) {
    return
  }
  const fail = (error: unknown) => writeEvent(store)({ type: 'error', run, error })
  const stillChecking = () =>
    inRun(store.state(), run) && store.state().write.status === 'checkingGas'

  let read
  try {
    read = await steps.readCountdown()
  } catch (error: unknown) {
    fail(error)
    return
  }
  if (!stillChecking()) {
    return
  }
  if (read.status === 'replaced') {
    store.dispatch({ type: 'replaced', run })
    return
  }
  if (read.status !== 'present') {
    fail(new Error('No countdown to execute.'))
    return
  }
  if (read.value.execution) {
    writeEvent(store)({ type: 'reset' })
    await followClaim(store, steps, run, read.value.execution)
    return
  }

  try {
    const prepared = await steps.prepare()
    store.dispatch({ type: 'prepared', run, prepared })
  } catch (error: unknown) {
    fail(error)
    return
  }
  const { prepared } = store.state()
  if (!prepared || !stillChecking()) {
    return
  }
  let check
  let startBlock: number | undefined
  try {
    check = await checkGasWithin(steps, prepared)
    if (check.kind === 'enough' && stillChecking()) {
      startBlock = await startBlockOf(steps)
    }
  } catch (error: unknown) {
    fail(error)
    return
  }
  if (!stillChecking()) {
    return
  }
  writeEvent(store)({ type: 'gasChecked', run, check })
  if (store.state().write.status === 'needsDeposit') {
    pollDeposit(store).catch(() => undefined)
    return
  }
  if (startBlock !== undefined) {
    await claimAndSend(store, steps, run, startBlock)
  }
}

/**
 * Waits on the run's hash once more where its receipt wait ended in an error
 * that kept the hash: the send may still land, so its receipt is asked for
 * again rather than left unread. Nothing happens while the send itself, or
 * another wait on the hash, is still running.
 */
export const checkReceiptAgain = async (
  store: ExecuteStore,
  steps: ExecuteSteps
): Promise<void> => {
  if (SENDING.has(store)) {
    return
  }
  await waitForReceipt(store, steps)
}

/**
 * The dropped reading, called where the attempt read still disagrees with a
 * send (the attempt is not consumed): a first reading that the node knows
 * none of the run's hashes is kept and read again by itself while a screen is
 * attached; a second one apart from it releases the claim and offers execute
 * again. Answers whether the check released the run.
 */
export const checkDropped = async (store: ExecuteStore, steps: ExecuteSteps): Promise<boolean> => {
  const released = await readDropped(store, steps)
  if (!released && store.state().unknownReading) {
    recheckDropped(store).catch(() => undefined)
  }
  return released
}
