/**
 * The submission's run: the shared write machine for the gas check, the send
 * and the receipt, the claim of the submission on the live session, and after
 * a landed receipt the attempt read that decides whether the session lands.
 *
 *   idle ──start──▶ checkingGas: the session read, the attempt read, the prepare, the gas check
 *                     ├─ a claim on the session ─▶ followed (nothing sent)
 *                     ├─ this request's attempt started ─▶ the landing
 *                     ├─ another attempt runs ─▶ already running (no retry)
 *                     ├─ deposit ──▶ needsDeposit ──the balance read again──▶ the claim
 *                     └─ enough ───▶ the claim
 *                                     ├─ another page's claim ─▶ followed (nothing sent)
 *                                     └─ its own ──▶ submitting ──▶ failedNotSent | failedReverted | landed
 *   followed, a hash ──▶ its receipt, as after a send
 *   followed, no hash ──▶ judged on every read by where the wallet holds its
 *                         request: held in its queue, waited on as in flight;
 *                         broadcast, followed under that hash; held nowhere,
 *                         not sent (the claim released where it still carries
 *                         no hash, the start offered again)
 *   followed, the session wiped or gone ──▶ back to the checklist
 *   submitting with a hash, on arrival or check again, the claim older than
 *   `DROPPED_AFTER_MS`, two readings apart (a higher block, or
 *   `DROPPED_RECHECK_MS` later) that the node knows none of its hashes, and
 *   the manager no attempt ──▶ dropped: the claim released, the start offered again
 *   needsDeposit ──Back──▶ idle: the prepared start dropped
 *   a stored session of another request ──▶ back to the checklist, nothing claimed or landed
 *   reverted as already running ──▶ the attempt read: ours is the landing
 *   the prepare's set not the one verified ──▶ back to the checklist
 *   landed ──▶ confirming: the attempt read names this request's attempt ──▶ the session landed ──▶ landed
 *                         └──▶ unread ──reread──▶ confirming
 *
 * The session is read before anything is prepared, so a retry, a reload or a
 * second tab never sends a second submission for the same request: a claim
 * the session carries is followed, never sent again, and a page sends only
 * under the claim it wrote itself, with nothing awaited between the claim and
 * the hand-over to the wallet. The claim is released where the run ended with
 * nothing on its way to the chain (a send the wallet refused, a replaced
 * transaction, a revert). A send that may still land keeps it. The session
 * lands, and the screen reads landed, only after the attempt read agrees with
 * the request of this run. Every answer carries its run, so the answer of a
 * run the holder left behind moves nothing.
 */
import { providerReadFailure, readWithin } from '@web/modules/social-recovery/shared/client'
import type { SubmissionInFlightRecord } from '@web/modules/social-recovery/shared/records'
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

import { BALANCE_POLL_MS, FOLLOW_REREAD_MS, READ_LIMIT_MS } from './constants'
import { preparedRefusalRunning, revertedRunning } from './refusal'
import type {
  FollowedClaim,
  ClaimJudgement,
  SubmitEvent,
  SubmitState,
  SubmitSteps,
  SubmitStore
} from './types'

/** The submission before anything ran. */
export const initialSubmitState = (): SubmitState => ({
  write: initialWriteState('submission'),
  after: 'none'
})

const inRun = (state: SubmitState, run: number): boolean => state.write.run === run

/** Whether the run's start landed: its receipt, or its attempt found started while no page followed it. */
export const landedOf = (state: SubmitState): boolean =>
  state.write.status === 'landed' || !!state.landedUnseen

const landedIn = (state: SubmitState, run: number): boolean => inRun(state, run) && landedOf(state)

/** Whether the run submits with no hash yet: the wallet's window waits, or a followed claim is read. */
const awaitingHashIn = (state: SubmitState, run: number): boolean =>
  inRun(state, run) &&
  state.write.status === 'submitting' &&
  !state.write.transactionHash &&
  !state.landedUnseen

/** The hash of the run's start while it waits for its receipt. */
const pendingHashIn = (state: SubmitState, run: number) =>
  inRun(state, run) && state.write.status === 'submitting' && !state.landedUnseen
    ? state.write.transactionHash
    : undefined

/** The submission's reducer. Pure: an event a state does not take leaves it as it was (the same object). */
export const submitReducer = (state: SubmitState, event: SubmitEvent): SubmitState => {
  switch (event.type) {
    case 'write': {
      // The manager refused the start while another attempt runs: nothing starts it again.
      if (state.refusal) {
        return state
      }
      const write = writeReducer(state.write, event.event)
      if (write === state.write) {
        return state
      }
      if (write.run !== state.write.run) {
        return { write, after: 'none', ...(state.lookup ? { lookup: state.lookup } : {}) }
      }
      const next: SubmitState = { ...state, write }
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
    case 'lookup':
      if (
        !inRun(state, event.run) ||
        state.write.status !== 'idle' ||
        state.refusal ||
        state.lookup === event.reading
      ) {
        return state
      }
      return { ...state, lookup: event.reading }
    case 'prepared':
      if (!inRun(state, event.run) || state.write.status !== 'checkingGas') {
        return state
      }
      return { ...state, prepared: event.prepared }
    case 'claimed':
      if (!awaitingHashIn(state, event.run) || state.requestId || state.follow) {
        return state
      }
      return { ...state, requestId: event.requestId }
    case 'released': {
      if (!inRun(state, event.run) || !state.requestId) {
        return state
      }
      const { requestId, ...rest } = state
      return rest
    }
    case 'follow': {
      // From an idle run, or one whose send may still land, a new run follows
      // the claim; in a run whose own claim lost, the run follows it instead.
      const opens =
        inRun(state, event.run) &&
        !state.refusal &&
        !landedOf(state) &&
        (state.write.status === 'idle' || mayStillLand(state.write))
      if (!opens && (!awaitingHashIn(state, event.run) || state.requestId || state.follow)) {
        return state
      }
      const run = opens ? event.run + 1 : event.run
      const { claim } = event
      const hash = claim.transactionHash
      return {
        write: {
          status: 'submitting',
          write: 'submission',
          run,
          ...(hash
            ? { transactionHash: hash, sentHashes: [hash], startBlock: claim.startBlock }
            : {})
        },
        after: 'none',
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
        ...(state.lookup ? { lookup: state.lookup } : {}),
        ...(state.prepared ? { prepared: state.prepared } : {})
      }
    }
    case 'voided':
      // A followed claim that went, or that never went out: the start is offered again.
      if (!awaitingHashIn(state, event.run)) {
        return state
      }
      return { write: writeReducer(state.write, { type: 'reset' }), after: 'none', lookup: 'none' }
    case 'dropped':
      // A hash the node lost, with no attempt on the chain: the start is offered again.
      if (!pendingHashIn(state, event.run)) {
        return state
      }
      return {
        write: writeReducer(state.write, { type: 'reset' }),
        after: 'none',
        lookup: 'none',
        dropped: true
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
    case 'leftDeposit':
      // Nothing was claimed or sent on the deposit step: the run starts over
      // from the session read, the prepare and the verify the screen shows.
      if (!inRun(state, event.run) || state.write.status !== 'needsDeposit') {
        return state
      }
      return { write: writeReducer(state.write, { type: 'reset' }), after: 'none' }
    case 'toChecklist':
      if (
        !inRun(state, event.run) ||
        (state.write.status !== 'checkingGas' &&
          !awaitingHashIn(state, event.run) &&
          !(landedOf(state) && state.after === 'confirming'))
      ) {
        return state
      }
      return {
        write: writeReducer(state.write, { type: 'reset' }),
        after: 'none',
        toChecklist: true
      }
    case 'refused':
      if (
        !inRun(state, event.run) ||
        (state.write.status !== 'checkingGas' && !awaitingHashIn(state, event.run))
      ) {
        return state
      }
      return {
        write: writeReducer(state.write, { type: 'reset' }),
        after: 'none',
        refusal: 'already-running'
      }
    case 'balance':
      if (
        !inRun(state, event.run) ||
        state.write.status !== 'needsDeposit' ||
        state.balance === event.balance
      ) {
        return state
      }
      return { ...state, balance: event.balance }
    case 'landedUnseen': {
      const { write } = state
      if (
        !inRun(state, event.run) ||
        state.landedUnseen ||
        state.after !== 'none' ||
        !(
          write.status === 'checkingGas' ||
          write.status === 'submitting' ||
          mayStillLand(write) ||
          revertedRunning(write)
        )
      ) {
        return state
      }
      const { follow, ...rest } = state
      return { ...rest, landedUnseen: true }
    }
    case 'confirming':
      if (!landedIn(state, event.run) || (state.after !== 'none' && state.after !== 'unread')) {
        return state
      }
      return { ...state, after: 'confirming' }
    case 'unread':
      if (!landedIn(state, event.run) || state.after !== 'confirming') {
        return state
      }
      return { ...state, after: 'unread' }
    case 'landed':
      if (!landedIn(state, event.run) || state.after !== 'confirming') {
        return state
      }
      return { ...state, after: 'landed' }
    default:
      return state
  }
}

/** A store over the reducer, starting from `initial` or from nothing. */
export const createSubmitStore = (initial: SubmitState = initialSubmitState()): SubmitStore => {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    state: () => current,
    dispatch(event) {
      const next = submitReducer(current, event)
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

/**
 * Whether the run still has work in flight a new start must not repeat: the
 * reads before the send, the deposit step's reads, the send or its receipt
 * wait, a followed claim, or the landing.
 */
export const isLive = (state: SubmitState): boolean => {
  if (state.refusal) {
    return false
  }
  if (landedOf(state)) {
    return state.after === 'none' || state.after === 'confirming'
  }
  const { status } = state.write
  return status === 'checkingGas' || status === 'needsDeposit' || status === 'submitting'
}

/**
 * Whether the screen keeps the run when it leaves it, so the next arrival
 * takes it up: work in flight, a send that may still land, and a landing whose
 * attempt read did not answer. Every other ended run is dropped, and the next
 * arrival reads the session again. The deposit step is dropped too: nothing
 * was claimed on it, and a return prepares and verifies the start again.
 */
export const outlivesScreen = (state: SubmitState): boolean =>
  (isLive(state) && state.write.status !== 'needsDeposit') ||
  state.after === 'unread' ||
  (!landedOf(state) && mayStillLand(state.write))

/** Whether the screen reads the submission as landed: only after the attempt read agreed and the session landed. */
export const isLanded = (state: SubmitState): boolean => state.after === 'landed'

const writeEvent = (store: SubmitStore) => (event: WriteEvent) =>
  store.dispatch({ type: 'write', event })

// The steps of the screen attached to each store, while one is.
const ATTACHED = new WeakMap<SubmitStore, SubmitSteps>()

// The wake of a store's rest, so "check again" or a new screen reads at once.
const WAKES = new WeakMap<SubmitStore, () => void>()

// The stores whose followed claim is read now, and whose deposit step reads the balance now.
const FOLLOWING = new WeakSet<SubmitStore>()
const POLLING = new WeakSet<SubmitStore>()
const DROPPING = new WeakSet<SubmitStore>()
const RECHECKING = new WeakSet<SubmitStore>()

// The run and hash whose receipt each store waits for now.
const WAITING = new WeakMap<SubmitStore, string>()

/** Rests for `ms`, or until the holder asks to check again or a screen attaches. */
const rest = (store: SubmitStore, ms: number): Promise<void> =>
  new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const wake = () => {
      clearTimeout(timer)
      if (WAKES.get(store) === wake) {
        WAKES.delete(store)
      }
      resolve()
    }
    timer = setTimeout(wake, ms)
    WAKES.set(store, wake)
  })

/**
 * Whether the run ended with nothing on its way to the chain, so its claim
 * goes: a start never sent that cannot still land (refused, replaced), a read
 * before the send that failed, or a revert. A landing, a send that may still
 * land and a receipt wait keep it.
 */
const endedWithNothingInFlight = (state: SubmitState): boolean =>
  !landedOf(state) &&
  (state.write.status === 'failedReverted' ||
    state.write.status === 'gasReadError' ||
    (state.write.status === 'failedNotSent' && !mayStillLand(state.write)))

/** Releases the claim the run sent or followed where the run ended with nothing on its way to the chain. */
const releaseWhereEnded = async (store: SubmitStore, steps: SubmitSteps): Promise<void> => {
  const state = store.state()
  const requestId = state.requestId ?? state.followed
  if (!requestId || !endedWithNothingInFlight(state)) {
    return
  }
  store.dispatch({ type: 'released', run: state.write.run })
  await steps.release(requestId).catch(() => undefined)
}

/**
 * After a landing: the attempt read must name this request's attempt, under
 * its setup number; then the session lands as the countdown's record, with
 * the time the attempt becomes executable from that read. A read
 * that fails, that disagrees, or a landing that fails reads unread, with the
 * read again on offer, never landed.
 */
const settle = async (store: SubmitStore, steps: SubmitSteps, run: number): Promise<void> => {
  if (!landedIn(store.state(), run)) {
    return
  }
  // Only the settle whose event moved the run goes on, so a second one never reads or lands again.
  const before = store.state()
  store.dispatch({ type: 'confirming', run })
  if (store.state() === before) {
    return
  }
  let executableAt: number | null = null
  try {
    const read = await readWithin(() => steps.attemptRead(), READ_LIMIT_MS)
    executableAt = steps.attemptOf(read) === 'ours' ? read.attempt.consumableAfter : null
  } catch {
    executableAt = null
  }
  if (executableAt === null) {
    store.dispatch({ type: 'unread', run })
    return
  }
  let landing
  try {
    landing = await steps.land(executableAt)
  } catch {
    store.dispatch({ type: 'unread', run })
    return
  }
  if (landing === 'other-request') {
    store.dispatch({ type: 'toChecklist', run })
    return
  }
  store.dispatch({ type: 'landed', run })
}

/**
 * After a revert that names an attempt already running: the attempt read
 * decides whose. This request's own (its number, setup number and payload)
 * is the landing; another's, or a read that fails, keeps the refusal.
 */
const judgeRevert = async (store: SubmitStore, steps: SubmitSteps, run: number): Promise<void> => {
  if (!inRun(store.state(), run) || !revertedRunning(store.state().write)) {
    return
  }
  const attempt = await readWithin(() => steps.attemptRead(), READ_LIMIT_MS).then(
    (read) => steps.attemptOf(read),
    () => undefined
  )
  if (attempt === 'ours') {
    store.dispatch({ type: 'landedUnseen', run })
  }
}

/**
 * Whether the hash the run waits on was dropped: the claim it sends or
 * follows is older than `DROPPED_AFTER_MS` by the clock read before the
 * reads; the node knows none of the run's hashes, read with the chain's block
 * number; an earlier check kept such a reading of every one of these hashes,
 * and this one is `apartFrom` it; and the attempt read finds no attempt. A
 * first reading is kept, and the check ends there, so one node that lags
 * cannot let a second send out. The claim is then released, unless it
 * carries a hash the run does not know, and the start offered again. This
 * request's attempt found started is the landing. A known transaction, or a
 * read that fails, drops the kept reading; a run that moved meanwhile moves
 * nothing. Answers whether the check ended the wait.
 */
const checkDropped = async (store: SubmitStore, steps: SubmitSteps): Promise<boolean> => {
  const state = store.state()
  const { write } = state
  const { run } = write
  const hash = pendingHashIn(state, run)
  const requestId = state.requestId ?? state.followed
  if (!hash || !requestId || write.status !== 'submitting' || DROPPING.has(store)) {
    return false
  }
  const hashes = write.sentHashes ?? [hash]
  const unmoved = () => pendingHashIn(store.state(), run) === hash
  const notDropped = (): boolean => {
    store.dispatch({ type: 'unknownCleared', run })
    return false
  }
  DROPPING.add(store)
  try {
    const clock = steps.now()
    const read = await readWithin(() => steps.readSession(), READ_LIMIT_MS).catch(() => undefined)
    if (!unmoved()) {
      return false
    }
    const held =
      read?.status === 'present' && read.value.state === 'live' ? read.value.submission : undefined
    if (!held || held.requestId !== requestId || clock - held.claimedAt < DROPPED_AFTER_MS) {
      return notDropped()
    }
    const at = steps.now()
    const answers = await readWithin(
      () =>
        Promise.all([
          steps.blockNumber(),
          Promise.all(hashes.map((one) => steps.transactionKnown(one)))
        ]),
      READ_LIMIT_MS
    ).catch(() => undefined)
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
    const attempt = await readWithin(() => steps.attemptRead(), READ_LIMIT_MS).then(
      (answer) => steps.attemptOf(answer),
      () => undefined
    )
    if (!unmoved()) {
      return false
    }
    if (attempt === 'ours') {
      store.dispatch({ type: 'landedUnseen', run })
      await settle(store, steps, run)
      return true
    }
    if (attempt !== 'none') {
      return notDropped()
    }
    const released = await steps.releaseClaim(requestId, hashes).catch(() => undefined)
    if (!unmoved() || released?.status !== 'released') {
      return false
    }
    store.dispatch({ type: 'dropped', run })
    return true
  } finally {
    DROPPING.delete(store)
  }
}

/**
 * While a first reading that the node knows none of the run's transactions
 * is kept and a screen is attached: the check again after
 * `DROPPED_RECHECK_MS`, so the second reading comes with no press.
 */
const recheckDropped = async (store: SubmitStore): Promise<void> => {
  if (RECHECKING.has(store)) {
    return
  }
  RECHECKING.add(store)
  try {
    while (store.state().unknownReading) {
      // eslint-disable-next-line no-await-in-loop
      await rest(store, DROPPED_RECHECK_MS)
      const steps = ATTACHED.get(store)
      if (!steps || !store.state().unknownReading) {
        return
      }
      // eslint-disable-next-line no-await-in-loop
      if (await checkDropped(store, steps)) {
        return
      }
    }
  } finally {
    RECHECKING.delete(store)
  }
}

/**
 * Waits for the receipt of the hash the run holds, after the check for a
 * dropped hash, then releases where it ended, then the landing.
 */
const waitForReceipt = async (store: SubmitStore, steps: SubmitSteps): Promise<void> => {
  if (await checkDropped(store, steps)) {
    return
  }
  if (store.state().unknownReading) {
    recheckDropped(store).catch(() => undefined)
  }
  const state = store.state()
  const { run } = state.write
  const hash = pendingHashIn(state, run)
  const waiting = `${run}:${hash?.toLowerCase()}`
  if (!hash || WAITING.get(store) === waiting) {
    return
  }
  WAITING.set(store, waiting)
  try {
    const startBlock = state.write.status === 'submitting' ? state.write.startBlock : undefined
    await steps.waitAgain(hash, startBlock, writeEvent(store), run)
  } finally {
    if (WAITING.get(store) === waiting) {
      WAITING.delete(store)
    }
  }
  await judgeRevert(store, steps, run)
  await releaseWhereEnded(store, steps)
  await settle(store, steps, run)
}

/**
 * The judgement of a followed claim with no hash, by where the wallet holds
 * its request: still held in its queue, or a read that did not answer, it is
 * waited on as a send in flight; broadcast, the hash is written on the claim
 * and followed; held nowhere, the send did not go out (`claimReadingOf`), and
 * the claim is released where it still carries no hash. A claim that took a
 * hash meanwhile is followed under it.
 */
const judgeClaim = async (steps: SubmitSteps, follow: FollowedClaim): Promise<ClaimJudgement> => {
  const hold = await readWithin(() => steps.requestHold(follow.requestId), READ_LIMIT_MS).catch(
    () => undefined
  )
  if (!hold || hold.status === 'held') {
    return { status: 'wait' }
  }
  if (hold.status === 'broadcast') {
    await steps.markSent(follow, hold.transactionHash).catch(() => undefined)
    return { status: 'hashed', transactionHash: hold.transactionHash }
  }
  const released = await steps.releaseClaim(follow.requestId, []).catch(() => undefined)
  return released ?? { status: 'wait' }
}

/**
 * Reads the followed claim with no hash while a screen is attached: a hash
 * that arrives is waited on; a claim that went, or another page's claim in its
 * place, ends the follow (the latter is followed in turn); a session landed
 * under this request's attempt lands here too, and a session of another
 * request goes back to the checklist. On every read the claim is judged by
 * where the wallet holds its request, with no age: while the wallet's queue
 * still holds it, it is waited on; once the queue broadcast it, it is followed
 * under that hash; held nowhere, the send never went out, so the claim is
 * released and the start offered again. A read that fails is read again after
 * a rest, never taken as an answer.
 */
const readFollow = async (store: SubmitStore): Promise<void> => {
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
      const read = await readWithin(() => steps.readSession(), READ_LIMIT_MS).catch(() => undefined)
      if (store.state().follow !== follow) {
        // eslint-disable-next-line no-continue
        continue
      }
      if (
        read?.status === 'present' &&
        read.value.state === 'landed' &&
        steps.ownsSession(read.value)
      ) {
        store.dispatch({ type: 'landedUnseen', run })
        // eslint-disable-next-line no-await-in-loop
        await settle(store, steps, run)
        return
      }
      if (
        read?.status === 'absent' ||
        (read?.status === 'present' &&
          (read.value.state !== 'live' || !steps.ownsSession(read.value)))
      ) {
        store.dispatch({ type: 'toChecklist', run })
        return
      }
      const held: SubmissionInFlightRecord | undefined =
        read?.status === 'present' && read.value.state === 'live'
          ? read.value.submission
          : undefined
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
        const judged = await judgeClaim(steps, follow)
        if (store.state().follow !== follow) {
          // eslint-disable-next-line no-continue
          continue
        }
        if (judged.status === 'hashed') {
          writeEvent(store)({
            type: 'sent',
            run,
            transactionHash: judged.transactionHash,
            startBlock: follow.startBlock
          })
          waitAfter = true
          return
        }
        if (judged.status === 'released') {
          store.dispatch({ type: 'voided', run })
          return
        }
        if (judged.status === 'gone') {
          // eslint-disable-next-line no-continue
          continue
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await rest(store, FOLLOW_REREAD_MS)
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
  store: SubmitStore,
  steps: SubmitSteps,
  run: number,
  claim: SubmissionInFlightRecord
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

/**
 * The claim of the submission on the live session under a new request id,
 * with the block read before it, then the send under that claim; where the
 * session already carries a claim, it is followed and nothing is sent. Nothing
 * is awaited between the claim and the hand-over to the wallet.
 */
const claimAndSend = async (store: SubmitStore, steps: SubmitSteps, run: number): Promise<void> => {
  const { prepared } = store.state()
  if (!prepared || !awaitingHashIn(store.state(), run)) {
    return
  }
  const dispatch = writeEvent(store)
  let startBlock: number
  try {
    startBlock = await readWithin(() => steps.blockNumber(), READ_LIMIT_MS)
  } catch (error: unknown) {
    dispatch({ type: 'error', run, error })
    return
  }
  if (!awaitingHashIn(store.state(), run)) {
    return
  }
  const requestId = steps.newRequestId()
  const ours = { requestId, startBlock, claimedAt: steps.now() }
  let claim
  try {
    claim = await steps.claim(ours)
  } catch (error: unknown) {
    dispatch({ type: 'error', run, error })
    return
  }
  if (claim.status === 'other-request') {
    store.dispatch({ type: 'toChecklist', run })
    return
  }
  if (claim.status === 'followed') {
    await followClaim(store, steps, run, claim.submission)
    return
  }
  store.dispatch({ type: 'claimed', run, requestId })
  if (store.state().requestId !== requestId) {
    await steps.release(requestId).catch(() => undefined)
    return
  }
  // The hash is on the claim before the receipt wait starts, so a receipt
  // that ends the run cannot be followed by a write of the claim it released.
  let marked: Promise<void> = Promise.resolve()
  const sendDispatch = (event: WriteEvent) => {
    dispatch(event)
    // Only a hash the run took goes on the claim, never one of a run that ended.
    if (
      event.type === 'sent' &&
      event.run === run &&
      pendingHashIn(store.state(), run) === event.transactionHash
    ) {
      marked = steps.markSent(ours, event.transactionHash).catch(() => undefined)
    }
  }
  // The run may still add only while the live session is its own and holds
  // this request's claim with no hash: a page that arrived since may have
  // released the claim and started again.
  const canAdd = async (): Promise<boolean> => {
    if (!awaitingHashIn(store.state(), run) || store.state().requestId !== requestId) {
      return false
    }
    const read = await readWithin(() => steps.readSession(), READ_LIMIT_MS)
    if (
      read.status !== 'present' ||
      read.value.state !== 'live' ||
      !steps.ownsSession(read.value)
    ) {
      return false
    }
    const held = read.value.submission
    return held?.requestId === requestId && held.transactionHash === undefined
  }
  try {
    await steps.send(prepared, sendDispatch, run, startBlock, requestId, () => marked, canAdd)
  } catch (error: unknown) {
    dispatch({ type: 'error', run, error })
  }
  await judgeRevert(store, steps, run)
  await releaseWhereEnded(store, steps)
  await settle(store, steps, run)
}

// A gas check that does not answer within the limit is the gas check's own
// failure, with its retry, never a send refused.
const gasCheckLimit = (error: Error): Error => providerReadFailure('estimateGas', error)

/** The gas check of the run's prepared start; where the key holds enough, the claim and the send. */
const checkAndSend = async (store: SubmitStore, steps: SubmitSteps, run: number): Promise<void> => {
  const { prepared } = store.state()
  if (!prepared || !inRun(store.state(), run) || store.state().write.status !== 'checkingGas') {
    return
  }
  try {
    const check = await readWithin(() => steps.checkGas(prepared), READ_LIMIT_MS, gasCheckLimit)
    writeEvent(store)({ type: 'gasChecked', run, check })
  } catch (error: unknown) {
    writeEvent(store)({ type: 'error', run, error })
    return
  }
  if (store.state().write.status === 'needsDeposit') {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    pollDeposit(store).catch(() => undefined)
    return
  }
  await claimAndSend(store, steps, run)
}

/**
 * While the deposit step shows and a screen is attached: the gas check again
 * every `BALANCE_POLL_MS` on the same prepared start. Enough goes on to the
 * claim and the send by itself; short keeps the step with the latest balance;
 * a read that fails, or that does not answer within `READ_LIMIT_MS`, reads as
 * the gas check's failure, with its retry. The step stays as it is between
 * answered reads. A screen that went away during a read sends nothing.
 */
const pollDeposit = async (store: SubmitStore): Promise<void> => {
  if (POLLING.has(store)) {
    return
  }
  POLLING.add(store)
  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      await rest(store, BALANCE_POLL_MS)
      const steps = ATTACHED.get(store)
      const state = store.state()
      const { run } = state.write
      if (!steps || state.write.status !== 'needsDeposit' || !state.prepared) {
        return
      }
      let check
      try {
        const { prepared } = state
        // eslint-disable-next-line no-await-in-loop
        check = await readWithin(() => steps.checkGas(prepared), READ_LIMIT_MS, gasCheckLimit)
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
      // A screen that went away during the read, or another that took the
      // run meanwhile, takes the next read; this answer sends nothing.
      if (ATTACHED.get(store) !== steps) {
        // eslint-disable-next-line no-continue
        continue
      }
      if (check.kind === 'enough') {
        writeEvent(store)({ type: 'recheck' })
        writeEvent(store)({ type: 'gasChecked', run, check })
        POLLING.delete(store)
        // eslint-disable-next-line no-await-in-loop
        await claimAndSend(store, steps, run)
        return
      }
      store.dispatch({ type: 'balance', run, balance: check.step.balance })
    }
  } finally {
    POLLING.delete(store)
  }
}

/**
 * Starts the submission, from nothing or from a state that offers the retry:
 * the session read (a claim it carries is followed), the attempt read (this
 * request's attempt already started is the landing; another running is the
 * refusal), the prepare from the smallest set, the gas check, the claim and
 * the send. Does nothing while work is in flight, after the refusal, or after
 * a send that may still land.
 */
export const startSubmission = async (store: SubmitStore, steps: SubmitSteps): Promise<void> => {
  const state = store.state()
  if (
    state.refusal ||
    state.lookup === 'reading' ||
    isLive(state) ||
    landedOf(state) ||
    mayStillLand(state.write)
  ) {
    return
  }
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
    read = await readWithin(() => steps.readSession(), READ_LIMIT_MS)
  } catch (error: unknown) {
    fail(error)
    return
  }
  if (!stillChecking()) {
    return
  }
  if (read.status !== 'present' || read.value.state !== 'live') {
    fail(new Error('No live recovery session to submit.'))
    return
  }
  // Another tab abandoned this request and gathered another: nothing is sent.
  if (!steps.ownsSession(read.value)) {
    store.dispatch({ type: 'toChecklist', run })
    return
  }
  if (read.value.submission) {
    store.dispatch({ type: 'write', event: { type: 'reset' } })
    await followClaim(store, steps, run, read.value.submission)
    return
  }

  let attempt
  try {
    attempt = steps.attemptOf(await readWithin(() => steps.attemptRead(), READ_LIMIT_MS))
  } catch (error: unknown) {
    fail(error)
    return
  }
  if (!stillChecking()) {
    return
  }
  if (attempt === 'ours') {
    store.dispatch({ type: 'landedUnseen', run })
    await settle(store, steps, run)
    return
  }
  if (attempt === 'other') {
    store.dispatch({ type: 'refused', run })
    return
  }

  let outcome
  try {
    outcome = await steps.prepare()
  } catch (error: unknown) {
    if (preparedRefusalRunning(error)) {
      store.dispatch({ type: 'refused', run })
    } else {
      fail(error)
    }
    return
  }
  if (outcome.status === 'set-changed') {
    store.dispatch({ type: 'toChecklist', run })
    return
  }
  store.dispatch({ type: 'prepared', run, prepared: outcome.prepared })
  await checkAndSend(store, steps, run)
}

/**
 * Before the start is offered: reads the session and, where it carries a
 * claim, follows it in a new run with nothing sent. Reads once per idle run,
 * and again only after a read that failed.
 */
export const lookForClaim = async (store: SubmitStore, steps: SubmitSteps): Promise<void> => {
  const state = store.state()
  if (
    state.write.status !== 'idle' ||
    state.refusal ||
    (state.lookup !== undefined && state.lookup !== 'failed')
  ) {
    return
  }
  const { run } = state.write
  store.dispatch({ type: 'lookup', run, reading: 'reading' })
  let read
  try {
    read = await readWithin(() => steps.readSession(), READ_LIMIT_MS)
  } catch {
    store.dispatch({ type: 'lookup', run, reading: 'failed' })
    return
  }
  // A claim of another request is not followed; Start then reads that session and goes back.
  const claim =
    read.status === 'present' && read.value.state === 'live' && steps.ownsSession(read.value)
      ? read.value.submission
      : undefined
  if (!claim) {
    store.dispatch({ type: 'lookup', run, reading: 'none' })
    return
  }
  await followClaim(store, steps, run, claim)
}

/**
 * Attaches the steps of the screen that now holds the store: a followed claim
 * and the deposit step's reads go on through them, and stop while no screen
 * is attached.
 */
export const attachSteps = (store: SubmitStore, steps: SubmitSteps): void => {
  ATTACHED.set(store, steps)
  WAKES.get(store)?.()
  readFollow(store).catch(() => undefined)
  if (store.state().write.status === 'needsDeposit') {
    pollDeposit(store).catch(() => undefined)
  }
}

/** Detaches the steps of a screen that went away, where they are still the attached ones. */
export const detachSteps = (store: SubmitStore, steps: SubmitSteps): void => {
  if (ATTACHED.get(store) === steps) {
    ATTACHED.delete(store)
  }
}

/**
 * From a stalled receipt wait: checks for a dropped hash, then waits for the
 * same hash once more. From a followed claim with no hash: reads it again at
 * once. From a send that may still land: reads the session's claim and
 * follows it.
 */
export const checkAgain = async (store: SubmitStore, steps: SubmitSteps): Promise<void> => {
  const state = store.state()
  const { run } = state.write
  if (state.follow && awaitingHashIn(state, run)) {
    WAKES.get(store)?.()
    return
  }
  if (pendingHashIn(state, run)) {
    await waitForReceipt(store, steps)
    return
  }
  if (!mayStillLand(state.write) || landedOf(state)) {
    return
  }
  const read = await readWithin(() => steps.readSession(), READ_LIMIT_MS).catch(() => undefined)
  const owned = read?.status === 'present' && steps.ownsSession(read.value) ? read.value : undefined
  const claim = owned?.state === 'live' ? owned.submission : undefined
  if (owned?.state === 'landed') {
    store.dispatch({ type: 'landedUnseen', run })
    await settle(store, steps, run)
    return
  }
  if (claim && inRun(store.state(), run)) {
    await followClaim(store, steps, run, claim)
  }
}

/** Leaves the deposit step: the prepared start is dropped, and nothing was claimed or sent. */
export const leaveDeposit = (store: SubmitStore): void => {
  store.dispatch({ type: 'leftDeposit', run: store.state().write.run })
}

/** Reads the attempt again where the landing's read did not answer or disagreed. */
export const rereadLanding = async (store: SubmitStore, steps: SubmitSteps): Promise<void> => {
  if (store.state().after !== 'unread') {
    return
  }
  await settle(store, steps, store.state().write.run)
}
