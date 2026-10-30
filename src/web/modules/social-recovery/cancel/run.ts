/**
 * The cancel's run: the shared write machine for the gas check, the send and
 * the receipt, and around it the reads that keep the cancel from being sent
 * twice or shown as done before the chain agrees.
 *
 *   idle ──start──▶ checkingGas: a stored cancel? ─yes─▶ followed (nothing sent)
 *                     └─ the attempt read ─ gone ─▶ idle with the gone reading (nothing sent)
 *                        └─ open ─▶ the prepare, the gas check
 *                                    ├─ deposit ─▶ needsDeposit ──recheck──▶ checkingGas
 *                                    └─ enough ─▶ the send's block, the claim
 *                                                 ├─ another's ─▶ followed (nothing sent)
 *                                                 └─ its own ─▶ the attempt read again
 *                                                               ├─ gone ─▶ idle with the gone reading (the claim released)
 *                                                               └─ open ─▶ submitting ─▶ landed | failedNotSent | failedReverted
 *   landed ──▶ the receipt's own cancel log names the attempt it ended; where the receipt's logs
 *              cannot be read, reads from the receipt's block ──▶ cancelled | otherRoad | unread
 *   failedReverted ──▶ reads until the attempt read names how it had ended (attemptRead)
 *
 * The cancel is stored on this device, under the lock of its key, before the
 * request goes to the wallet, and the wallet adds the request only while that
 * claim is still this run's with no hash and younger than its send limit.
 * While the wallet holds that request unsigned, the run reads the attempt
 * every few seconds and withdraws the request once the attempt ended or
 * another one is open, so a late signature never cancels a newer attempt. A
 * page that finds a stored cancel, on arrival or as the loser of a claim,
 * sends nothing and follows it: under its hash it waits for the receipt; with
 * no hash it reads where the wallet holds the request each round, and the
 * attempt every few rounds. Broadcast, it follows the hash. Held while the
 * attempt reads ended or another one open, the page withdraws the request, so
 * no stale signature can cancel a newer attempt; until the wallet holds it no
 * more, the claim stays, since the holder may still sign it, and the ending is
 * shown beside the follow. Held nowhere with the attempt ended or another one
 * open, the claim is released and the page shows the cancelled terminal or
 * the reading. Held nowhere and never broadcast past the send limit, the
 * cancel reads as not sent, so the claim is released and the start offered
 * again; a younger claim is waited on, since its page may still add the
 * request. Sent as an operation the wallet cannot follow to a hash, the cancel
 * may still land at any time, so the claim stays until the claim's attempt
 * ends: the cancelled terminal where the owner's cancel ended it, or a later
 * attempt, else the other road's reading. While another attempt is open
 * meanwhile, the ending is shown beside the follow and no cancel of the newer
 * attempt is offered; past the untracked bound with an attempt still open, the
 * operation did not land, so the claim is released and the reading shown. The
 * claim is released once the run ends with nothing on its way to the chain,
 * or once the receipt came back. A refusal whose operation may still reach the
 * chain keeps it until such a follow releases it.
 *
 * Every answer carries the run it belongs to, so the answer of a run the
 * holder left behind moves nothing. Two decisions read the device's clock,
 * the same exception the setup save has: the claim's send limit, which the
 * wallet asks right before it adds the request, and the untracked bound,
 * which releases the claim of an operation the wallet cannot follow to a hash
 * while an attempt still reads open. Both are bounded by the claim's age,
 * stamped when the claim was stored. No other decision reads the clock.
 */
import {
  isProviderReadFailure,
  providerReadFailure,
  readWithin
} from '@web/modules/social-recovery/shared/client'
import {
  canRetry,
  initialWriteState,
  receiptOf,
  writeReducer
} from '@web/modules/social-recovery/shared/writes'
import type { WriteEvent, WriteMachineState } from '@web/modules/social-recovery/shared/writes'
import type { Hex } from '@kohaku-eth/social-recovery'
import type { WatcherReading } from '@web/modules/social-recovery/watcher'

import {
  AFTER_READ_PAUSE_MS,
  AFTER_READ_TRIES,
  CLAIMED_READ_MS,
  FOLLOW_ATTEMPT_ROUNDS,
  FOLLOW_POLL_MS,
  OWN_SEND_READ_MS,
  RECEIPT_LOGS_READ_MS,
  SEND_BLOCK_READ_MS
} from './constants'
import { attemptAfterOf, standingOf } from './readings'
import type {
  CancelClaim,
  CancelState,
  CancelSteps,
  CancelStore,
  LandingOutcome,
  OwnSendWatch
} from './types'

export const initialCancelState = (): CancelState => ({
  write: initialWriteState('cancel'),
  after: { stage: 'none' }
})

export const createCancelStore = (): CancelStore => {
  let current = initialCancelState()
  const listeners = new Set<() => void>()
  return {
    state: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    update: (change) => {
      const next = change(current)
      if (next !== current) {
        current = next
        listeners.forEach((listener) => listener())
      }
    }
  }
}

/** The run's state after one write event; a new run starts from nothing but its target. */
export const applyWrite = (state: CancelState, event: WriteEvent): CancelState => {
  const write = writeReducer(state.write, event)
  if (write === state.write) {
    return state
  }
  if (write.run !== state.write.run) {
    return {
      write,
      after: { stage: 'none' },
      ...(state.target !== undefined ? { target: state.target } : {})
    }
  }
  const next: CancelState = { ...state, write }
  if (write.status !== 'submitting') {
    delete next.stalled
    delete next.follow
    delete next.followGone
  } else if (write.transactionHash) {
    delete next.follow
    delete next.followGone
  }
  return next
}

const dispatchTo =
  (store: CancelStore) =>
  (event: WriteEvent): void =>
    store.update((state) => applyWrite(state, event))

const inRun = (store: CancelStore, run: number): boolean => store.state().write.run === run

const changeInRun = (
  store: CancelStore,
  run: number,
  change: (state: CancelState) => CancelState
): void => store.update((state) => (state.write.run === run ? change(state) : state))

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const asReadFailure = (error: unknown) =>
  isProviderReadFailure(error) ? error : providerReadFailure('call', error)

/**
 * The steps of the screen attached to each store now; a followed request is
 * read only through them, so a screen that builds its steps again takes up
 * the follow in flight.
 */
const LIVE = new WeakMap<CancelStore, CancelSteps>()

/** The stores whose followed request is being read, so one loop reads it. */
const FOLLOWING = new WeakSet<CancelStore>()

// ---------------------------------------------------------------------------
// After the receipt
// ---------------------------------------------------------------------------

/**
 * Reads after a landed cancel, from the receipt's block, until the reads name
 * the attempt the cancel ended, a bounded number of times.
 */
const readAfterLanding = async (
  store: CancelStore,
  steps: CancelSteps,
  run: number,
  tries = AFTER_READ_TRIES
): Promise<void> => {
  const state = store.state()
  const { target, write } = state
  if (target === undefined || write.run !== run || write.status !== 'landed') {
    return
  }
  changeInRun(store, run, (current) => ({ ...current, after: { stage: 'reading' } }))
  const landedBlock = write.receipt.blockNumber ?? state.startBlock
  let outcome: LandingOutcome | undefined
  if (landedBlock !== undefined) {
    const startBlock = state.startBlock ?? landedBlock
    const cancelled = await readWithin(
      () => steps.receiptCancel(write.receipt.transactionHash, startBlock),
      RECEIPT_LOGS_READ_MS
    ).catch(() => undefined)
    outcome = await steps
      .readLanding({
        target,
        ...(state.targetAttempt ? { known: state.targetAttempt } : {}),
        startBlock,
        landedBlock,
        transactionHash: write.receipt.transactionHash,
        ...(cancelled ? { cancelled } : {})
      })
      .catch(() => undefined)
  }
  if (outcome) {
    changeInRun(store, run, (current) => ({ ...current, after: outcome }))
    return
  }
  if (tries <= 1) {
    changeInRun(store, run, (current) => ({ ...current, after: { stage: 'unread' } }))
    return
  }
  await pause(AFTER_READ_PAUSE_MS)
  await readAfterLanding(store, steps, run, tries - 1)
}

/**
 * Reads after a reverted cancel until the attempt read names how the attempt
 * stands, and after an execution the controller, a bounded number of times.
 */
const readAfterRevert = async (
  store: CancelStore,
  steps: CancelSteps,
  run: number,
  tries = AFTER_READ_TRIES
): Promise<void> => {
  const { target } = store.state()
  if (target === undefined || !inRun(store, run)) {
    return
  }
  const reading = await steps.readAttempt().catch(() => undefined)
  const attemptAfter = reading ? attemptAfterOf(reading, target) : undefined
  if (attemptAfter) {
    dispatchTo(store)({ type: 'attemptRead', run, attemptAfter })
  }
  const complete =
    !!attemptAfter && (attemptAfter.ended !== 'executed' || !!attemptAfter.controller)
  if (complete || tries <= 1) {
    return
  }
  await pause(AFTER_READ_PAUSE_MS)
  await readAfterRevert(store, steps, run, tries - 1)
}

/** What follows the end of a run's send or wait: the claim, and the reads after the receipt. */
const settle = async (
  store: CancelStore,
  steps: CancelSteps,
  run: number,
  requestId: string
): Promise<void> => {
  const { write } = store.state()
  if (write.run !== run) {
    return
  }
  const release = () => steps.claims.release(requestId).catch(() => undefined)
  switch (write.status) {
    case 'landed':
      await release()
      await readAfterLanding(store, steps, run)
      return
    case 'failedReverted':
      await release()
      await readAfterRevert(store, steps, run)
      return
    case 'failedNotSent':
      // A cancel that may still reach the chain keeps its claim, so no page sends another.
      if (!write.mayStillLand) {
        await release()
      }
      return
    case 'submitting':
      if (write.transactionHash) {
        changeInRun(store, run, (state) => ({ ...state, stalled: true }))
      }
      return
    default:
      await release()
  }
}

/** Waits for the receipt of a hash of the run, then settles the run. */
const waitHash = async (
  store: CancelStore,
  steps: CancelSteps,
  run: number,
  transactionHash: Hex,
  startBlock: number,
  requestId: string
): Promise<void> => {
  const dispatch = dispatchTo(store)
  try {
    const receipt = receiptOf(await steps.wait(transactionHash, startBlock))
    // A receipt with no status reads neither way, so the write keeps its hash.
    if (receipt) {
      dispatch({ type: 'receipt', run, receipt })
    }
  } catch (error: unknown) {
    dispatch({ type: 'error', run, error, transactionHash })
  }
  await settle(store, steps, run, requestId)
}

// ---------------------------------------------------------------------------
// A stored cancel, followed
// ---------------------------------------------------------------------------

/** The submitting state a followed cancel starts in, under its hash where the claim holds one. */
const followedWriteOf = (run: number, claim: CancelClaim): WriteMachineState => ({
  status: 'submitting',
  write: 'cancel',
  run,
  ...(claim.transactionHash
    ? {
        transactionHash: claim.transactionHash,
        sentHashes: [claim.transactionHash],
        startBlock: claim.startBlock
      }
    : {})
})

/**
 * Ends the follow of a stored cancel whose attempt reads gone while the wallet
 * holds its request nowhere: a hash another page wrote meanwhile is followed;
 * else the claim is released, and the page shows the cancelled terminal where
 * the owner's cancel ended the attempt `endedId` (the claim's own by default),
 * or the reading otherwise (its ending, or the attempt now open).
 */
const endFollow = async (
  store: CancelStore,
  steps: CancelSteps,
  run: number,
  claim: CancelClaim,
  reading: WatcherReading,
  endedId: bigint = claim.attemptId
): Promise<void> => {
  const stored = await steps.claims.read().catch(() => undefined)
  if (stored?.requestId === claim.requestId && stored.transactionHash) {
    dispatchTo(store)({
      type: 'sent',
      run,
      transactionHash: stored.transactionHash,
      startBlock: claim.startBlock
    })
    await waitHash(store, steps, run, stored.transactionHash, claim.startBlock, claim.requestId)
    return
  }
  await steps.claims.release(claim.requestId).catch(() => undefined)
  const ended = reading.ended?.attemptId === endedId ? reading.ended : undefined
  const own = ended?.road === 'cancelled' && ended.cancelledBy === 'cancelByOwner'
  changeInRun(store, run, (state) => {
    const { follow, requestId, ...rest } = applyWrite(state, { type: 'reset' })
    return own
      ? { ...rest, after: { stage: 'cancelled', attemptId: endedId } }
      : { ...rest, gone: reading }
  })
}

/**
 * The attempt the owner's cancel ended in a reading, where it is the claim's
 * attempt or one opened after it: an operation the wallet cannot follow to a
 * hash cancels whichever attempt is open when it lands.
 */
const ownerCancelSince = (
  reading: WatcherReading | undefined,
  claim: CancelClaim
): bigint | undefined => {
  const ended = reading?.ended
  return ended?.road === 'cancelled' &&
    ended.cancelledBy === 'cancelByOwner' &&
    ended.attemptId >= claim.attemptId
    ? ended.attemptId
    : undefined
}

/**
 * Reads where the wallet holds a followed request with no hash, through the
 * steps of the screen attached to the store now, each round, and the attempt
 * every few rounds, each read bounded: broadcast, it follows the hash; held
 * nowhere with the attempt ended or another one open, the follow ends
 * (`endFollow`); held, or a read with no answer, it reads again a moment
 * later. Held where a fresh read of the attempt finds it ended or another one
 * open, it withdraws the request, and the next round that reads it held
 * nowhere ends the follow; until then, or where the withdrawal fails, the
 * ending is shown beside the follow while the claim stays, since the holder
 * may still sign the request. Held nowhere while the claim is younger than its
 * send limit, it reads again; held nowhere past it, the cancel was not sent,
 * so the claim is released and the start offered again.
 *
 * Sent as an operation the wallet cannot follow to a hash, the cancel may
 * still land at any time, against whichever attempt is open then. The follow
 * ends with the cancelled terminal once the owner's cancel ended the claim's
 * attempt or a later one, and with the reading once the claim's attempt ended
 * by another road with no other one open. While another attempt is open, the
 * claim stays and the ending of the claim's attempt is shown beside the
 * follow, with no cancel of the newer attempt offered. Past the claim's bound
 * with an attempt still open, the operation evidently did not land: the claim
 * is released and the reading shown, with its cancel offered.
 */
const followHold = async (
  store: CancelStore,
  run: number,
  claim: CancelClaim,
  round = 0
): Promise<void> => {
  const steps = LIVE.get(store)
  const current = store.state().write
  if (!steps || current.run !== run || current.status !== 'submitting' || current.transactionHash) {
    FOLLOWING.delete(store)
    return
  }
  const readsAttempt = round % FOLLOW_ATTEMPT_ROUNDS === 0
  const [hold, reading] = await Promise.all([
    steps.requestHold(claim.requestId).catch(() => undefined),
    readsAttempt
      ? readWithin(steps.readAttempt, CLAIMED_READ_MS).catch(() => undefined)
      : Promise.resolve(undefined)
  ])
  if (!inRun(store, run)) {
    FOLLOWING.delete(store)
    return
  }
  // Between two reads of the attempt, the last one stands.
  let followGone = store.state().followGone
  if (reading) {
    followGone = standingOf(reading, claim.attemptId).kind === 'gone' ? reading : undefined
  }
  if (hold?.status === 'free' && followGone) {
    FOLLOWING.delete(store)
    await endFollow(store, steps, run, claim, followGone)
    return
  }
  const untracked = hold?.status === 'untracked'
  if (untracked) {
    const landedOn = ownerCancelSince(followGone, claim)
    if (followGone && (landedOn !== undefined || !followGone.attempt)) {
      FOLLOWING.delete(store)
      await endFollow(store, steps, run, claim, followGone, landedOn)
      return
    }
    if (reading?.attempt && steps.claims.untrackedFollowMs(claim) <= 0) {
      FOLLOWING.delete(store)
      await steps.claims.release(claim.requestId).catch(() => undefined)
      changeInRun(store, run, (state) => {
        const { follow, requestId, ...rest } = applyWrite(state, { type: 'reset' })
        return { ...rest, gone: reading }
      })
      return
    }
  }
  if (reading && followGone && hold?.status === 'held') {
    try {
      steps.withdrawRequest(claim.requestId)
    } catch {
      // The follow goes on: the holder may still sign the request.
    }
  }
  const sendable = steps.claims.sendableMs(claim)
  if (!hold || hold.status === 'held' || untracked || (hold.status === 'free' && sendable > 0)) {
    changeInRun(store, run, (state) => {
      const { followGone: shown, ...rest } = state
      return { ...rest, follow: hold ? 'held' : 'unread', ...(followGone ? { followGone } : {}) }
    })
    await pause(hold?.status === 'free' ? Math.min(sendable, FOLLOW_POLL_MS) : FOLLOW_POLL_MS)
    await followHold(store, run, claim, round + 1)
    return
  }
  FOLLOWING.delete(store)
  // Another page may have written the hash meanwhile: the claim's hash wins.
  const stored = await steps.claims.read().catch(() => undefined)
  const storedHash = stored?.requestId === claim.requestId ? stored.transactionHash : undefined
  const transactionHash = hold.status === 'broadcast' ? hold.transactionHash : storedHash
  if (transactionHash) {
    await steps.claims.markSent(claim.requestId, transactionHash).catch(() => undefined)
    dispatchTo(store)({ type: 'sent', run, transactionHash, startBlock: claim.startBlock })
    await waitHash(store, steps, run, transactionHash, claim.startBlock, claim.requestId)
    return
  }
  await steps.claims.release(claim.requestId).catch(() => undefined)
  changeInRun(store, run, (state) => {
    const { follow, requestId, ...rest } = applyWrite(state, { type: 'reset' })
    return rest
  })
}

/** Follows a stored cancel in a run of its own, sending nothing. */
export const followClaim = async (
  store: CancelStore,
  steps: CancelSteps,
  claim: CancelClaim
): Promise<void> => {
  const run = store.state().write.run + 1
  store.update(() => ({
    write: followedWriteOf(run, claim),
    target: claim.attemptId,
    after: { stage: 'none' },
    requestId: claim.requestId,
    startBlock: claim.startBlock,
    // Until the wallet answers, a request with no hash reads as held.
    ...(claim.transactionHash ? {} : { follow: 'held' as const })
  }))
  if (claim.transactionHash) {
    await waitHash(store, steps, run, claim.transactionHash, claim.startBlock, claim.requestId)
    return
  }
  FOLLOWING.add(store)
  await followHold(store, run, claim)
}

// ---------------------------------------------------------------------------
// The send
// ---------------------------------------------------------------------------

/**
 * Follows the run's own request while the wallet holds it unsigned: every few
 * seconds it reads the attempt, each read bounded, and where the attempt
 * ended or another one is open while the wallet still holds the request, it
 * withdraws the request, so a late signature never cancels a newer attempt,
 * and shows the ending beside the send. It reads nothing once the send
 * answered a hash or settled.
 */
const watchOwnSend = (
  store: CancelStore,
  steps: CancelSteps,
  run: number,
  target: bigint,
  requestId: string
): OwnSendWatch => {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let wake: () => void = () => {}
  let ending: WatcherReading | undefined
  const waiting = () => {
    const { write } = store.state()
    return !stopped && write.run === run && write.status === 'submitting' && !write.transactionHash
  }
  const round = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      wake = resolve
      timer = setTimeout(resolve, OWN_SEND_READ_MS)
    })
    if (!waiting()) {
      return
    }
    const live = LIVE.get(store) ?? steps
    const [reading, hold] = await Promise.all([
      readWithin(live.readAttempt, CLAIMED_READ_MS).catch(() => undefined),
      live.requestHold(requestId).catch(() => undefined)
    ])
    if (!waiting()) {
      return
    }
    if (reading) {
      ending = standingOf(reading, target).kind === 'gone' ? reading : undefined
      const shown = ending
      changeInRun(store, run, (state) => {
        if (!shown && !state.followGone) {
          return state
        }
        const { followGone, ...rest } = state
        return shown ? { ...rest, followGone: shown } : rest
      })
      if (shown && hold?.status === 'held') {
        try {
          live.withdrawRequest(requestId)
        } catch {
          // The send goes on: the holder may still sign the request.
        }
      }
    }
    await round()
  }
  round().catch(() => undefined)
  return {
    stop: () => {
      stopped = true
      clearTimeout(timer)
      wake()
    },
    gone: () => ending
  }
}

/** The attempt read, the gas check, the claim, the read again and the send of one run. */
const checkAndSend = async (
  store: CancelStore,
  steps: CancelSteps,
  run: number,
  target: bigint
): Promise<void> => {
  const dispatch = dispatchTo(store)
  const fail = (error: unknown) => dispatch({ type: 'error', run, error })
  const gone = (reading: WatcherReading) =>
    changeInRun(store, run, (state) => ({ ...applyWrite(state, { type: 'reset' }), gone: reading }))

  let reading: WatcherReading
  try {
    reading = await steps.readAttempt()
  } catch (error: unknown) {
    fail(asReadFailure(error))
    return
  }
  if (!inRun(store, run)) {
    return
  }
  const standing = standingOf(reading, target)
  if (standing.kind !== 'open') {
    gone(reading)
    return
  }
  changeInRun(store, run, (state) => ({ ...state, targetAttempt: standing.attempt }))
  try {
    const prepared = await steps.prepare()
    const check = await steps.checkGas(prepared)
    dispatch({ type: 'gasChecked', run, check })
    const checked = store.state().write
    if (checked.run !== run || checked.status !== 'submitting') {
      return
    }
    let startBlock: number
    try {
      startBlock = await readWithin(() => steps.blockNumber(), SEND_BLOCK_READ_MS)
    } catch (error: unknown) {
      fail(providerReadFailure('block', error))
      return
    }
    const requestId = steps.newRequestId()
    const answer = await steps.claims.claim({ attemptId: target, requestId, startBlock })
    if (!answer.claimed) {
      if (inRun(store, run)) {
        await followClaim(store, steps, answer.held)
      }
      return
    }
    changeInRun(store, run, (state) => ({ ...state, requestId, startBlock }))
    const release = () => steps.claims.release(requestId).catch(() => undefined)
    // Read again once the claim is stored: a cancel another page landed meanwhile is not sent twice.
    let again: WatcherReading
    try {
      again = await readWithin(steps.readAttempt, CLAIMED_READ_MS)
    } catch (error: unknown) {
      await release()
      fail(asReadFailure(error))
      return
    }
    if (!inRun(store, run)) {
      await release()
      return
    }
    if (standingOf(again, target).kind !== 'open') {
      await release()
      gone(again)
      return
    }
    const watch = watchOwnSend(store, steps, run, target, requestId)
    try {
      await steps.send({
        prepared,
        run,
        requestId,
        startBlock,
        canAdd: () => steps.claims.canStillSend(requestId),
        dispatch: (event) => {
          dispatch(event)
          if (event.type === 'sent' && event.run === run) {
            steps.claims.markSent(requestId, event.transactionHash).catch(() => undefined)
          }
        }
      })
    } finally {
      watch.stop()
    }
    await settle(store, steps, run, requestId)
    // A request withdrawn, or refused, after its attempt ended shows that ending: nothing was sent.
    const ending = watch.gone()
    if (ending) {
      changeInRun(store, run, (state) =>
        state.write.status === 'failedNotSent' && !state.write.mayStillLand
          ? { ...applyWrite(state, { type: 'reset' }), gone: ending }
          : state
      )
    }
  } catch (error: unknown) {
    fail(error)
  }
}

/** Starts the cancel of `target`: from idle, or from a state that offers the retry. */
export const startCancel = async (
  store: CancelStore,
  steps: CancelSteps,
  target: bigint
): Promise<void> => {
  const { write } = store.state()
  if (write.status !== 'idle' && !canRetry(write)) {
    return
  }
  store.update((state) => ({ ...applyWrite(state, { type: 'start' }), target }))
  const { run } = store.state().write
  let held: CancelClaim | undefined
  try {
    held = await steps.claims.read()
  } catch (error: unknown) {
    dispatchTo(store)({ type: 'error', run, error: asReadFailure(error) })
    return
  }
  if (held) {
    if (inRun(store, run)) {
      await followClaim(store, steps, held)
    }
    return
  }
  await checkAndSend(store, steps, run, target)
}

/** From the deposit step: the attempt read and the gas check again, in the same run. */
export const recheckCancel = async (store: CancelStore, steps: CancelSteps): Promise<void> => {
  const { write, target } = store.state()
  if (write.status !== 'needsDeposit' || target === undefined) {
    return
  }
  dispatchTo(store)({ type: 'recheck' })
  await checkAndSend(store, steps, write.run, target)
}

/**
 * Waits again for a stalled receipt, reads again after a landing the reads did
 * not confirm, or reads the attempt again where the run found it gone; a read
 * that fails keeps the reading shown.
 */
export const checkCancelAgain = async (store: CancelStore, steps: CancelSteps): Promise<void> => {
  const state = store.state()
  const { write, requestId } = state
  if (write.status === 'landed' && state.after.stage === 'unread') {
    await readAfterLanding(store, steps, write.run)
    return
  }
  if (write.status === 'idle' && state.gone) {
    const reading = await steps.readAttempt().catch(() => undefined)
    if (reading) {
      changeInRun(store, write.run, (current) =>
        current.write.status === 'idle' && current.gone ? { ...current, gone: reading } : current
      )
    }
    return
  }
  if (
    write.status === 'submitting' &&
    write.transactionHash &&
    state.stalled &&
    requestId !== undefined
  ) {
    const { run, transactionHash } = write
    changeInRun(store, run, (current) => {
      const { stalled, ...rest } = current
      return rest
    })
    const startBlock = write.startBlock ?? (await steps.blockNumber())
    await waitHash(store, steps, run, transactionHash, startBlock, requestId)
  }
}

/**
 * Attaches a screen's steps. A run that never started follows a cancel
 * stored on this device; a followed request whose reads paused with no screen
 * attached is read again through these steps, and a follow in flight reads
 * through them from its next round.
 */
export const attachCancelSteps = async (store: CancelStore, steps: CancelSteps): Promise<void> => {
  LIVE.set(store, steps)
  const state = store.state()
  const untouched = state.write.status === 'idle' && state.write.run === 0 && !state.gone
  const pausedFollow =
    state.write.status === 'submitting' &&
    !state.write.transactionHash &&
    state.follow !== undefined &&
    !FOLLOWING.has(store)
  if (!untouched && !pausedFollow) {
    return
  }
  const held = await steps.claims.read().catch(() => undefined)
  if (!held) {
    return
  }
  const now = store.state()
  if (untouched && now.write.status === 'idle' && now.write.run === 0) {
    await followClaim(store, steps, held)
  } else if (
    pausedFollow &&
    now.write.run === state.write.run &&
    held.requestId === now.requestId
  ) {
    FOLLOWING.add(store)
    await followHold(store, now.write.run, held)
  }
}

/** Detaches a screen's steps from the store, unless the store holds newer steps already. */
export const detachCancelSteps = (store: CancelStore, steps: CancelSteps): void => {
  if (LIVE.get(store) === steps) {
    LIVE.delete(store)
  }
}

/** Whether a run must outlive the screen that shows it: something is on its way, or being read. */
export const outlivesScreen = (state: CancelState): boolean =>
  state.write.status === 'checkingGas' ||
  state.write.status === 'submitting' ||
  (state.write.status === 'landed' && state.after.stage === 'reading')
