/**
 * The save's run: the shared write machine for the gas check, the send and
 * the receipt, and after a landed receipt the check that decides whether the
 * save reads as saved.
 *
 *   idle ──start──▶ checkingGas: the setup read, the prepare, then the gas check
 *                     ├─ a setup found ─▶ already set up (the run ends, nothing sent)
 *                     ├─ deposit ──▶ needsDeposit ──recheck──▶ checkingGas: the setup read, the gas check
 *                     ├─ a refusal ─▶ failedNotSent (nothing sent)
 *                     └─ enough ───▶ the claim, the setup read again (time-limited)
 *                                     ├─ a setup found ─▶ already set up (the claim released)
 *                                     └─ none ─▶ the send's block: the claim's, else read (time-limited)
 *                                                ├─ unread ─▶ failedNotSent (the claim released)
 *                                                └─ known ──▶ the stored save read again (time-limited)
 *                                                             ├─ unread ───▶ failedNotSent (the claim released)
 *                                                             ├─ another's ─▶ followed (nothing sent or released)
 *                                                             ├─ none ─────▶ looked for again, then offered
 *                                                             ├─ its own, the claim old ─▶ failedNotSent (the claim released)
 *                                                             └─ its own ──▶ submitting ──▶ failedNotSent | failedReverted | landed
 *   failedNotSent that may still land ──a setup read finds one──▶ already set up
 *   submitting with a hash, its first receipt wait past its limit ──▶ stalled
 *   submitting with a hash, its receipt wait failed ──▶ one more wait, time-limited ──▶ stalled
 *                                                  stalled ──check again──▶ the wait again
 *   submitting with a hash, an hour after its broadcast, two checks a new block
 *   or a minute apart each reading none of its transactions known to the
 *   node, and the account no setup ──▶ dropped ──save again──▶
 *                                                  the stored save released, then a new start
 *   failedNotSent after a short estimation of the sign screen ──▶ the gas check again,
 *                                                  and the deposit step where it is short
 *   landed ──▶ confirming ──▶ saving (the records wiped) ──▶ saved
 *                         ├──▶ disagreed (the commitment, or the authorization)
 *                         └──▶ unread ──reread──▶ confirming
 *
 * Every start reads the account's setup before it prepares, so a retry, a
 * second tab or an operation that landed after all never sends a second
 * setup. After the gas check reads enough, the run stores the save in flight
 * on this device under a new request id, with the block read before it, and
 * sends only where that claim wrote it, a setup read after the claim still
 * finds none within its limit, and the stored save read just before the send
 * answers, within its limit, that it is still its own. That answer is believed
 * only while the claim is young, well before a page that follows the claim may
 * void it. The block the send starts from is known before that last read, so
 * nothing is read from the network between it and the send. A page
 * that finds a stored save, on arrival, as the loser of a claim or as a claim
 * no longer stored, sends nothing and follows it with
 * the draft and the prepared write it sent: under its hash it waits for the
 * receipt; with no hash it reads where the wallet holds the request, through
 * the screen attached now, and only while one is. The
 * stored save is released where the run ends with nothing on its way to the
 * chain, and the check's agreement removes it with the setup records. A
 * refusal whose operation may still land offers no retry, only a read of the
 * setup; a setup found then is checked as after a landed receipt. The records
 * are wiped, and the save reads as saved, only after the check agreed on a
 * landing of the run. A failed or disagreed save wipes nothing. Every event
 * after the write's carries its run, so the answer of a run the holder left
 * behind moves nothing.
 */
import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'
import { accountBatchRefusal } from '@web/modules/social-recovery/shared/client'
import type { FeeReading, SendRequestState } from '@web/modules/social-recovery/shared/client'
import type { RecordRead, SaveInFlightRecord } from '@web/modules/social-recovery/shared/records'
import {
  initialWriteState,
  mayStillLand,
  writeReducer
} from '@web/modules/social-recovery/shared/writes'
import type { WriteEvent, WriteMachineState } from '@web/modules/social-recovery/shared/writes'

import {
  CLAIM_SEND_LIMIT_MS,
  CLAIMED_SETUP_READ_MS,
  DROPPED_AFTER_MS,
  DROPPED_READ_MS,
  DROPPED_RECHECK_MS,
  FOLLOW_REREAD_MS,
  GONE_GRACE_MS,
  RECEIPT_WAIT_MS,
  SEND_BLOCK_READ_MS
} from './constants'
import { confirmOutcomeOf } from './outcome'
import type {
  ArmEvent,
  ArmState,
  ArmStore,
  ConfirmReadOptions,
  FollowAt,
  FollowHold,
  GoneCount,
  PreparedSave,
  SaveSteps,
  UnknownReading
} from './types'

/** The save before anything ran. */
export const initialArmState = (): ArmState => ({
  write: initialWriteState('save'),
  after: { stage: 'none' }
})

const inRun = (state: ArmState, run: number): boolean => state.write.run === run

/** Whether the run's batch landed: its receipt, or the account's setup where no page followed its hash. */
const landedOf = (state: ArmState): boolean =>
  state.write.status === 'landed' || !!state.landedUnseen

const landedIn = (state: ArmState, run: number): boolean => inRun(state, run) && landedOf(state)

/** Whether the run submits with no hash yet: the wallet's window waits, or a followed request is read. */
const awaitingHashIn = (state: ArmState, run: number): boolean =>
  inRun(state, run) &&
  state.write.status === 'submitting' &&
  !state.write.transactionHash &&
  !state.landedUnseen

/** The submitting state a followed save starts in, under its hash where the stored save holds one. */
const followedWriteOf = (
  write: WriteMachineState,
  run: number,
  transactionHash: Hex | undefined,
  startBlock: number | undefined
): WriteMachineState => ({
  status: 'submitting',
  write: write.write,
  run,
  ...(transactionHash ? { transactionHash } : {}),
  ...(transactionHash && startBlock !== undefined ? { startBlock } : {})
})

/** The hash of the run's batch while it waits for its receipt. */
const pendingHashIn = (state: ArmState, run: number) =>
  inRun(state, run) && state.write.status === 'submitting' ? state.write.transactionHash : undefined

/** Whether the run submits a hash that could still read as dropped. */
const droppableIn = (state: ArmState, run: number): boolean =>
  !!pendingHashIn(state, run) &&
  !state.dropped &&
  !state.landedUnseen &&
  state.after.stage === 'none'

/** The save's reducer. Pure: an event a state does not take leaves it as it was (the same object). */
export const armReducer = (state: ArmState, event: ArmEvent): ArmState => {
  switch (event.type) {
    case 'write': {
      // A run that found a setup on the account ends there: nothing starts it again.
      if (state.stop) {
        return state
      }
      const write = writeReducer(state.write, event.event)
      if (write === state.write) {
        return state
      }
      // A new run starts from nothing: its own prepare, its own landing.
      if (write.run !== state.write.run) {
        return {
          write,
          after: { stage: 'none' },
          ...(state.lookup ? { lookup: state.lookup } : {})
        }
      }
      const next: ArmState = { ...state, write }
      // A stalled wait ends with the write's submitting: whatever settled it answered.
      if (state.stalled && write.status !== 'submitting') {
        next.stalled = false
      }
      // A dropped save whose transaction settled after all is no longer dropped,
      // and a kept reading of its transactions no longer holds.
      if (state.dropped && write.status !== 'submitting') {
        delete next.dropped
      }
      if (state.unknownReading && write.status !== 'submitting') {
        delete next.unknownReading
      }
      // A followed request's reading ends with a hash, or with the write's submitting.
      if (state.follow && (write.status !== 'submitting' || write.transactionHash)) {
        delete next.follow
      }
      return next
    }
    case 'lookup':
      if (
        !inRun(state, event.run) ||
        state.write.status !== 'idle' ||
        state.stop ||
        state.lookup === event.reading
      ) {
        return state
      }
      return { ...state, lookup: event.reading }
    case 'claimed':
      if (!awaitingHashIn(state, event.run) || state.requestId) {
        return state
      }
      return { ...state, requestId: event.requestId }
    case 'follow': {
      // From the arrival, a new run follows the stored save; in a run whose
      // claim lost, the run follows it in place of its own.
      const fromArrival = state.write.status === 'idle' && !state.stop && inRun(state, event.run)
      if (!fromArrival && (!awaitingHashIn(state, event.run) || state.requestId)) {
        return state
      }
      const run = fromArrival ? event.run + 1 : event.run
      return {
        write: followedWriteOf(state.write, run, event.transactionHash, event.startBlock),
        after: { stage: 'none' },
        prepared: event.prepared,
        requestId: event.requestId,
        ...(state.lookup ? { lookup: state.lookup } : {})
      }
    }
    case 'followed':
      if (!awaitingHashIn(state, event.run) || !state.requestId || state.follow === event.reading) {
        return state
      }
      return { ...state, follow: event.reading }
    case 'landedUnseen': {
      const { write } = state
      if (
        !inRun(state, event.run) ||
        !state.prepared ||
        state.landedUnseen ||
        state.after.stage !== 'none' ||
        !(mayStillLand(write) || write.status === 'submitting')
      ) {
        return state
      }
      const { follow, stalled, dropped, unknownReading, ...rest } = state
      return { ...rest, landedUnseen: true }
    }
    case 'released': {
      if (!inRun(state, event.run) || !state.requestId) {
        return state
      }
      const { requestId, ...rest } = state
      return rest
    }
    case 'voided':
      // A followed request no page can find, with no setup on the account, or
      // a claim no longer stored at its send: the stored save is read again
      // before the save is offered.
      if (!awaitingHashIn(state, event.run) || !state.requestId) {
        return state
      }
      return {
        write: writeReducer(state.write, { type: 'reset' }),
        after: { stage: 'none' }
      }
    case 'unknownRead':
      if (!droppableIn(state, event.run)) {
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
    case 'dropped': {
      if (!droppableIn(state, event.run)) {
        return state
      }
      const { unknownReading, ...rest } = state
      return { ...rest, dropped: true }
    }
    case 'droppedReleased':
      // The holder saves again: the dropped save's stored save is gone, and
      // the next start reads and claims as any start does.
      if (!inRun(state, event.run) || !state.dropped) {
        return state
      }
      return {
        write: writeReducer(state.write, { type: 'reset' }),
        after: { stage: 'none' },
        lookup: 'none'
      }
    case 'alreadySetUp':
      // Taken while the run reads the setup before it prepares, or after its
      // claim and before its send.
      if (
        !inRun(state, event.run) ||
        (state.write.status !== 'checkingGas' && !awaitingHashIn(state, event.run))
      ) {
        return state
      }
      return {
        write: writeReducer(state.write, { type: 'reset' }),
        after: { stage: 'none' },
        stop: 'already-set-up'
      }
    case 'prepared':
      if (!inRun(state, event.run) || state.write.status !== 'checkingGas' || state.prepared) {
        return state
      }
      return { ...state, prepared: event.prepared }
    case 'estimated':
      if (!inRun(state, event.run) || state.write.status !== 'submitting') {
        return state
      }
      return { ...state, estimation: event.reading }
    case 'waitStalled':
      if (!pendingHashIn(state, event.run) || state.stalled) {
        return state
      }
      return { ...state, stalled: true }
    case 'waitResumed':
      if (!inRun(state, event.run) || !state.stalled) {
        return state
      }
      return { ...state, stalled: false }
    case 'confirming':
      if (
        !landedIn(state, event.run) ||
        (state.after.stage !== 'none' && state.after.stage !== 'unread')
      ) {
        return state
      }
      return { ...state, after: { stage: 'confirming' } }
    case 'confirmed': {
      if (!landedIn(state, event.run) || state.after.stage !== 'confirming') {
        return state
      }
      const { outcome } = event
      if (outcome.kind === 'agreed') {
        return { ...state, after: { stage: 'saving' } }
      }
      if (outcome.kind === 'disagreed') {
        return { ...state, after: { stage: 'disagreed', check: outcome.check } }
      }
      return { ...state, after: { stage: 'unread' } }
    }
    case 'wiped':
      if (!landedIn(state, event.run) || state.after.stage !== 'saving') {
        return state
      }
      return { ...state, after: { stage: 'saved' } }
    default:
      return state
  }
}

/** A store over the reducer, starting from `initial` or from nothing. */
export const createArmStore = (initial: ArmState = initialArmState()): ArmStore => {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    state: () => current,
    dispatch(event) {
      const next = armReducer(current, event)
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
 * Whether the run still has work in flight that a new start must not repeat:
 * the setup read, the prepare or the gas check, the send or its receipt wait,
 * a followed request, or the check after the landing and the wipe. A dropped
 * save has none: its stored save stays, and the next arrival reads it again.
 */
export const isLive = (state: ArmState): boolean => {
  const { write, after } = state
  if (state.stop || state.dropped) {
    return false
  }
  if (landedOf(state)) {
    return after.stage === 'none' || after.stage === 'confirming' || after.stage === 'saving'
  }
  return write.status === 'checkingGas' || write.status === 'submitting'
}

/**
 * Whether the screen keeps the run when it leaves it, so the next arrival
 * takes it up instead of reading the chain and offering a new save: a run with
 * work in flight; a refusal whose operation may still reach the chain, which a
 * new save could repeat while the setup read finds nothing yet; and a landed
 * batch whose check did not answer, which holds the hash and the reread that
 * leads to saved and the wipe of the records. Every other ended run is dropped.
 */
export const outlivesScreen = (state: ArmState): boolean =>
  isLive(state) ||
  (!state.stop &&
    (state.after.stage === 'unread' || (!landedOf(state) && mayStillLand(state.write))))

const writeEvent = (store: ArmStore) => (event: WriteEvent) =>
  store.dispatch({ type: 'write', event })

/**
 * Whether the run ended with nothing on its way to the chain, so its stored
 * save in flight goes: a save never sent that cannot still land (refused,
 * replaced, refused for another request), a revert, or a landing whose check
 * disagreed. A send that may still land, a receipt wait in flight or stalled,
 * and a check that did not answer keep it.
 */
const endedWithNothingInFlight = (state: ArmState): boolean => {
  const { write, after } = state
  if (after.stage === 'disagreed') {
    return true
  }
  if (landedOf(state)) {
    return false
  }
  return (
    write.status === 'failedReverted' || (write.status === 'failedNotSent' && !mayStillLand(write))
  )
}

/** Releases the run's stored save in flight where the run ended with nothing on its way to the chain. */
const releaseWhereEnded = async (store: ArmStore, steps: SaveSteps): Promise<void> => {
  const state = store.state()
  const { requestId } = state
  if (!requestId || !endedWithNothingInFlight(state)) {
    return
  }
  store.dispatch({ type: 'released', run: state.write.run })
  await steps.release(requestId).catch(() => undefined)
}

// The receipt waits a store holds open, by hash, so a second wait on a hash takes up the first.
const OPEN_WAITS = new WeakMap<ArmStore, Map<string, Promise<void>>>()

const openWaitsOf = (store: ArmStore): Map<string, Promise<void>> => {
  const held = OPEN_WAITS.get(store)
  if (held) {
    return held
  }
  const created = new Map<string, Promise<void>>()
  OPEN_WAITS.set(store, created)
  return created
}

/** Holds `waiting` as the open wait of `hash` until it settles; answers the held wait. */
const holdWait = (store: ArmStore, hash: Hex, waiting: Promise<void>): Promise<void> => {
  const waits = openWaitsOf(store)
  const key = hash.toLowerCase()
  const held: Promise<void> = waiting.finally(() => {
    if (waits.get(key) === held) {
      waits.delete(key)
    }
  })
  waits.set(key, held)
  return held
}

const dropWait = (store: ArmStore, hash: Hex): void => {
  openWaitsOf(store).delete(hash.toLowerCase())
}

// The wake of a followed request's rest, so "check again" or a new screen reads at once.
const WAKES = new WeakMap<ArmStore, () => void>()

/** Rests for `ms`, until `moved` resolves, or until the holder asks to check again or a screen attaches. */
const rest = (store: ArmStore, ms: number, moved?: Promise<void>): Promise<void> =>
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
    moved?.then(wake, wake)
  })

/** The answer of `read`, rejected where it does not answer within `limitMs`; a later answer moves nothing. */
const readWithin = <T>(read: () => Promise<T>, named: string, limitMs: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`The ${named} did not answer in ${limitMs} ms.`)),
      limitMs
    )
    read().then(
      (answer) => {
        clearTimeout(timer)
        resolve(answer)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })

/** Reads the account's setup at the start of a run; a setup found ends the run with nothing prepared. */
const noSetupYet = async (store: ArmStore, steps: SaveSteps, run: number): Promise<boolean> => {
  try {
    if (await steps.hasSetup()) {
      store.dispatch({ type: 'alreadySetUp', run })
      return false
    }
  } catch (error: unknown) {
    writeEvent(store)({ type: 'error', run, error })
    return false
  }
  return inRun(store.state(), run) && store.state().write.status === 'checkingGas'
}

/**
 * After a landing: the check, then the wipe where it agreed. A wipe that
 * fails still reads as saved, since the setup is live on chain. A check that
 * disagreed releases the stored save in flight.
 */
const settle = async (
  store: ArmStore,
  steps: SaveSteps,
  run: number,
  options: ConfirmReadOptions
): Promise<void> => {
  try {
    const { prepared } = store.state()
    if (!prepared || !landedIn(store.state(), run)) {
      return
    }
    // Only the settle whose event moved the run goes on, so a second one never reads or wipes again.
    const before = store.state()
    store.dispatch({ type: 'confirming', run })
    if (store.state() === before || store.state().after.stage !== 'confirming') {
      return
    }
    const outcome = await confirmOutcomeOf(() => steps.confirm(prepared), {
      ...options,
      newBlock: steps.newBlock
    })
    const confirming = store.state()
    store.dispatch({ type: 'confirmed', run, outcome })
    if (
      outcome.kind !== 'agreed' ||
      store.state() === confirming ||
      store.state().after.stage !== 'saving'
    ) {
      return
    }
    try {
      await steps.wipe()
    } catch {
      // The setup is live whether or not this device could drop its draft.
    }
    store.dispatch({ type: 'wiped', run })
  } finally {
    await releaseWhereEnded(store, steps)
  }
}

// The steps of the screen attached to each store, set when a screen takes the store up.
const ATTACHED = new WeakMap<ArmStore, SaveSteps>()

// The steps of a screen that went away: their queue and accounts no longer change.
const DETACHED = new WeakSet<SaveSteps>()

/**
 * The steps a read of the store goes through: those of the screen attached
 * now, else `steps` while their screen is still there, else none.
 */
const liveStepsOf = (store: ArmStore, steps: SaveSteps): SaveSteps | undefined => {
  const attached = ATTACHED.get(store)
  if (attached && !DETACHED.has(attached)) {
    return attached
  }
  return DETACHED.has(steps) ? undefined : steps
}

// The one check for a dropped save of each store, while one reads.
const DROP_CHECKS = new WeakMap<ArmStore, Promise<boolean>>()

/** Every hash the run's batch went out under, and the stored save's, each once. */
const sentHashesIn = (write: WriteMachineState, stored: Hex | undefined): Hex[] => {
  const sent = write.status === 'submitting' ? write.sentHashes ?? [] : []
  const current = write.status === 'submitting' ? write.transactionHash : undefined
  const all = [...sent, ...(current ? [current] : []), ...(stored ? [stored] : [])]
  return all.filter(
    (hash, at) => all.findIndex((other) => other.toLowerCase() === hash.toLowerCase()) === at
  )
}

/** Whether `hash` is one of `hashes`, in any case. */
const hashIn = (hashes: readonly Hex[], hash: Hex): boolean =>
  hashes.some((held) => held.toLowerCase() === hash.toLowerCase())

/** Whether the kept reading read every hash `reading` asked for. */
const coveredBy = (kept: UnknownReading, reading: UnknownReading): boolean =>
  reading.hashes.every((hash) => hashIn(kept.hashes, hash))

/**
 * Whether `reading` read a higher block number than `kept`, or came
 * `DROPPED_RECHECK_MS` after it. A lower number is a backend that lags.
 */
const apartFrom = (kept: UnknownReading, reading: UnknownReading): boolean =>
  reading.block > kept.block || reading.at - kept.at >= DROPPED_RECHECK_MS

/**
 * The check for a dropped save, through the steps `liveStepsOf` names, in
 * order: the stored save still names the run's request and holds a hash, and
 * its broadcast (its claim, where it holds no time of the broadcast) is older
 * than `DROPPED_AFTER_MS`; the node knows none of the run's transactions,
 * read with the chain's block number; an earlier check kept such a reading of
 * every one of these hashes, and this one is `apartFrom` it; the account holds no
 * setup. All of these read the run as dropped. A first reading is kept, and
 * the check ends there. A setup found is checked as after a landed receipt.
 * A stored save that holds no hash while the run holds one gets the hash
 * written again, so its broadcast counts from that write. Every other end of
 * the check, a known transaction, or a read that fails or passes its limit,
 * drops the kept reading. A screen that went away, or a run that moved
 * meanwhile, moves nothing. `known` is the stored save as just read, where
 * the caller holds it. Answers whether the check ended the wait: dropped, or
 * landed.
 */
const readDropped = async (
  store: ArmStore,
  steps: SaveSteps,
  run: number,
  options: ConfirmReadOptions,
  known: SaveInFlightRecord | undefined
): Promise<boolean> => {
  const through = liveStepsOf(store, steps)
  const { write, requestId } = store.state()
  if (
    !through ||
    !requestId ||
    !droppableIn(store.state(), run) ||
    write.status !== 'submitting' ||
    !write.transactionHash
  ) {
    return false
  }
  const { transactionHash } = write
  const unmoved = (): boolean =>
    liveStepsOf(store, steps) === through &&
    droppableIn(store.state(), run) &&
    store.state().requestId === requestId &&
    pendingHashIn(store.state(), run) === transactionHash
  const notDropped = (): boolean => {
    store.dispatch({ type: 'unknownCleared', run })
    return false
  }
  let record = known
  if (!record) {
    const stored = await through.readInFlight().catch(() => undefined)
    if (!unmoved()) {
      return false
    }
    if (stored?.status !== 'present') {
      return notDropped()
    }
    record = stored.value
  }
  if (record.requestId !== requestId) {
    return notDropped()
  }
  if (!record.transactionHash) {
    // As the send writes it: the record keeps its claim's block, else takes the send's.
    const startBlock = record.startBlock === undefined ? write.startBlock : undefined
    await through.markSent(requestId, transactionHash, startBlock).catch(() => undefined)
    if (!unmoved()) {
      return false
    }
    return notDropped()
  }
  if (Date.now() - (record.sentAt ?? record.claimedAt) < DROPPED_AFTER_MS) {
    return notDropped()
  }
  const hashes = sentHashesIn(store.state().write, record.transactionHash)
  const at = Date.now()
  const answers = await Promise.all([
    readWithin(() => through.blockNumber(), 'block read', DROPPED_READ_MS),
    Promise.all(
      hashes.map((hash) =>
        readWithin(() => through.transactionKnown(hash), 'transaction read', DROPPED_READ_MS)
      )
    )
  ]).catch(() => undefined)
  if (!unmoved()) {
    return false
  }
  if (!answers || answers[1].some((answer) => answer !== 'unknown')) {
    return notDropped()
  }
  const reading: UnknownReading = { at, block: answers[0], hashes }
  // A reading too close to the kept one leaves the kept one as it is, so the
  // minute counts from the first; one that asked for a hash the kept one did
  // not read starts the count again.
  const kept = store.state().unknownReading
  if (!kept || !coveredBy(kept, reading)) {
    store.dispatch({ type: 'unknownRead', run, reading })
    return false
  }
  if (!apartFrom(kept, reading)) {
    return false
  }
  const found = await readWithin(() => through.hasSetup(), 'setup read', DROPPED_READ_MS).catch(
    () => undefined
  )
  if (!unmoved()) {
    return false
  }
  if (found === undefined) {
    return notDropped()
  }
  if (found) {
    store.dispatch({ type: 'landedUnseen', run })
    await settle(store, through, run, options)
    return true
  }
  store.dispatch({ type: 'dropped', run })
  return !!store.state().dropped
}

/**
 * Runs the check for a dropped save, or takes up the one the store runs now.
 * A check that ends unanswered after another screen attached runs once more,
 * through the steps attached now.
 */
const checkDropped = (
  store: ArmStore,
  steps: SaveSteps,
  run: number,
  options: ConfirmReadOptions,
  known?: SaveInFlightRecord
): Promise<boolean> => {
  const running = DROP_CHECKS.get(store)
  if (running) {
    return running
  }
  const through = liveStepsOf(store, steps)
  const checking: Promise<boolean> = readDropped(store, steps, run, options, known)
    .then((ended) => {
      const now = liveStepsOf(store, steps)
      if (ended || !now || now === through) {
        return ended
      }
      return readDropped(store, now, run, options, undefined)
    })
    .finally(() => {
      if (DROP_CHECKS.get(store) === checking) {
        DROP_CHECKS.delete(store)
      }
    })
  DROP_CHECKS.set(store, checking)
  return checking
}

/** Resolves true when `work` settles within `limitMs`, false when the limit passes first. */
const settlesWithin = (work: Promise<void>, limitMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), limitMs)
    work.then(
      () => {
        clearTimeout(timer)
        resolve(true)
      },
      () => {
        clearTimeout(timer)
        resolve(true)
      }
    )
  })

/**
 * One more wait for the receipt of the hash the run holds, where its wait
 * failed and the batch may still land, or where the run follows a stored hash;
 * a wait already open on that hash is taken up rather than a second one
 * opened. A wait that fails again, or runs past `RECEIPT_WAIT_MS`, leaves the
 * run stalled under its hash until the holder asks to check again, and the
 * stall checks for a dropped save once. A wait past
 * its limit goes on: a receipt it brings later is taken while the run still
 * submits that hash, and the check follows.
 */
const waitForReceipt = async (
  store: ArmStore,
  steps: SaveSteps,
  run: number,
  options: ConfirmReadOptions
): Promise<void> => {
  const transactionHash = pendingHashIn(store.state(), run)
  const { write } = store.state()
  if (!transactionHash || write.status !== 'submitting') {
    return
  }
  // Where a reading of the transaction unknown is kept, a wait that reads it
  // known drops that reading.
  const onKnown = (): void => {
    if (pendingHashIn(store.state(), run) === transactionHash) {
      store.dispatch({ type: 'unknownCleared', run })
    }
  }
  const waiting =
    openWaitsOf(store).get(transactionHash.toLowerCase()) ??
    holdWait(
      store,
      transactionHash,
      steps.waitAgain(
        transactionHash,
        write.startBlock,
        writeEvent(store),
        run,
        store.state().unknownReading ? onKnown : undefined
      )
    )
  const inTime = await settlesWithin(waiting, RECEIPT_WAIT_MS)
  store.dispatch({ type: 'waitStalled', run })
  // A wait that ended with the hash still unsettled may have ended on a
  // transaction the node no longer knows.
  if (inTime) {
    await checkDropped(store, steps, run, options)
    return
  }
  waiting
    .then(async () => {
      if (store.state().after.stage === 'none') {
        await settle(store, steps, run, options)
      }
      await checkDropped(store, steps, run, options)
    })
    .catch(() => undefined)
  // A stall is a check too, so a save past its hour gets its next reading with no press.
  await checkDropped(store, steps, run, options)
}

/** Waits for the receipt of the run's hash, then the check where it landed. */
const reattach = async (
  store: ArmStore,
  steps: SaveSteps,
  run: number,
  options: ConfirmReadOptions
): Promise<void> => {
  await waitForReceipt(store, steps, run, options)
  await settle(store, steps, run, options)
}

/** Whether the run still follows `requestId` with no hash. */
const stillFollowing = (store: ArmStore, run: number, requestId: string): boolean =>
  awaitingHashIn(store.state(), run) && store.state().requestId === requestId

// The follow each store holds of a stored save with no hash.
const FOLLOWS = new WeakMap<ArmStore, FollowHold>()

// The one reading of each store's follow, while one reads.
const READING = new WeakMap<ArmStore, symbol>()

/** The steps a follow reads through, by the rule of `liveStepsOf`. */
const followStepsOf = (store: ArmStore, hold: FollowHold): SaveSteps | undefined =>
  liveStepsOf(store, hold.steps)

/**
 * Where the follow read by `reading` stands now: its hold and the steps it
 * reads through. Where the run no longer follows the request, the hold is
 * dropped; where no screen is there to read through, the hold is kept. Either
 * way the reading stops at once, so the next screen that attaches can start
 * another.
 */
const followNow = (store: ArmStore, reading: symbol): FollowAt | undefined => {
  if (READING.get(store) !== reading) {
    return undefined
  }
  const hold = FOLLOWS.get(store)
  if (!hold || !stillFollowing(store, hold.run, hold.requestId)) {
    FOLLOWS.delete(store)
    READING.delete(store)
    return undefined
  }
  const steps = followStepsOf(store, hold)
  if (!steps) {
    READING.delete(store)
    return undefined
  }
  return { hold, steps }
}

/** Whether the follow still reads the same hold through the same steps as `at`. */
const stillAt = (store: ArmStore, reading: symbol, at: FollowAt): boolean => {
  const now = followNow(store, reading)
  return !!now && now.hold === at.hold && now.steps === at.steps
}

/** Ends the follow: its hold goes and its reading stops. */
const endFollow = (store: ArmStore, reading: symbol): void => {
  FOLLOWS.delete(store)
  if (READING.get(store) === reading) {
    READING.delete(store)
  }
}

/**
 * One step of the follow of the stored save in flight the store holds with
 * no hash, by where the wallet holds its request: still queued, read again
 * when the queue changes; broadcast, its hash stored and its receipt waited
 * for; on a route the wallet cannot follow, the may-still-land state; a read
 * that did not answer, read again after a rest or on "check again", never
 * taken as gone; gone, the account's setup read: a setup found landed while no
 * page watched and is checked as after a receipt. Where none is found, the
 * stored save is void once a gone reading began `GONE_GRACE_MS` or more after
 * the first gone reading since the last other reading, timed by when each
 * reading began, not by when the setup read after it answered; it is then
 * released. Each step reads through
 * the steps `followNow` names; an answer read through steps that are no
 * longer those is dropped and the step reads again, and the count of gone
 * readings starts again. Answers the steps of a void, where the stored save
 * was void.
 */
const followStep = async (
  store: ArmStore,
  reading: symbol,
  options: ConfirmReadOptions,
  gone?: GoneCount
): Promise<SaveSteps | undefined> => {
  const at = followNow(store, reading)
  if (!at) {
    return undefined
  }
  const { hold, steps } = at
  const { run, requestId } = hold
  const readAt = Date.now()
  const state: SendRequestState = await steps
    .requestState(requestId)
    .catch((): SendRequestState => ({ status: 'unread' }))
  if (!stillAt(store, reading, at)) {
    return followStep(store, reading, options)
  }
  if (state.status === 'broadcast') {
    endFollow(store, reading)
    // With no block given, the record keeps the one read before the send.
    const stored = await steps.markSent(requestId, state.transactionHash).catch(() => undefined)
    if (!stillFollowing(store, run, requestId)) {
      return undefined
    }
    const recorded =
      stored?.status === 'present' && stored.value.requestId === requestId
        ? stored.value.startBlock
        : undefined
    const startBlock = recorded ?? hold.startBlock
    writeEvent(store)({
      type: 'sent',
      run,
      transactionHash: state.transactionHash,
      ...(startBlock !== undefined ? { startBlock } : {})
    })
    await reattach(store, steps, run, options)
    return undefined
  }
  if (state.status === 'untracked') {
    endFollow(store, reading)
    writeEvent(store)({
      type: 'error',
      run,
      error: accountBatchRefusal('not-a-transaction', steps.account)
    })
    return undefined
  }
  if (state.status === 'queued') {
    store.dispatch({ type: 'followed', run, reading: 'queued' })
    await rest(store, FOLLOW_REREAD_MS, steps.queueMoved(FOLLOW_REREAD_MS))
    return followStep(store, reading, options)
  }
  if (state.status === 'unread') {
    store.dispatch({ type: 'followed', run, reading: 'unread' })
    await rest(store, FOLLOW_REREAD_MS)
    return followStep(store, reading, options)
  }
  const since = gone && gone.hold === hold && gone.steps === steps ? gone.since : readAt
  const found = await steps.hasSetup().catch(() => undefined)
  if (!stillAt(store, reading, at)) {
    return followStep(store, reading, options)
  }
  if (found) {
    endFollow(store, reading)
    store.dispatch({ type: 'landedUnseen', run })
    await settle(store, steps, run, options)
    return undefined
  }
  if (found === false && readAt - since >= GONE_GRACE_MS) {
    endFollow(store, reading)
    store.dispatch({ type: 'voided', run })
    await steps.release(requestId).catch(() => undefined)
    return steps
  }
  store.dispatch({ type: 'followed', run, reading: 'gone' })
  await rest(store, FOLLOW_REREAD_MS)
  return followStep(store, reading, options, { hold, steps, since })
}

/**
 * Reads the follow the store holds, where one is held and no reading of it
 * runs: one reading per store at any time. It reads only while a screen is
 * there to read through, and stops, with the hold kept, while none is; the
 * next screen that attaches starts it again. Answers the steps of a void,
 * where the stored save was void, so the caller looks for a stored save again
 * before the save is offered.
 */
const readFollow = async (
  store: ArmStore,
  options: ConfirmReadOptions
): Promise<SaveSteps | undefined> => {
  if (!FOLLOWS.has(store) || READING.has(store)) {
    return undefined
  }
  const reading = Symbol('follow')
  READING.set(store, reading)
  try {
    return await followStep(store, reading, options)
  } finally {
    if (READING.get(store) === reading) {
      READING.delete(store)
    }
  }
}

/**
 * Follows a stored save in flight in place of a send: from the arrival in a
 * new run, or in the run whose claim it beat or that no longer holds its own.
 * The check runs with the draft and the prepared write the stored save sent.
 * Under its hash the run waits for the receipt and checks as after its own
 * send; with no hash it follows the request. Nothing is sent. Answers the
 * steps of a void, where the stored save was void.
 */
const followSave = async (
  store: ArmStore,
  steps: SaveSteps,
  run: number,
  record: SaveInFlightRecord,
  options: ConfirmReadOptions
): Promise<SaveSteps | undefined> => {
  const before = store.state()
  store.dispatch({
    type: 'follow',
    run,
    requestId: record.requestId,
    prepared: steps.followedSave(record),
    ...(record.transactionHash ? { transactionHash: record.transactionHash } : {}),
    ...(record.startBlock !== undefined ? { startBlock: record.startBlock } : {})
  })
  if (store.state() === before) {
    return undefined
  }
  const followed = store.state().write.run
  if (record.transactionHash) {
    if (!(await checkDropped(store, steps, followed, options, record))) {
      await reattach(store, steps, followed, options)
    }
    return undefined
  }
  FOLLOWS.set(store, {
    steps,
    run: followed,
    requestId: record.requestId,
    ...(record.startBlock !== undefined ? { startBlock: record.startBlock } : {})
  })
  return readFollow(store, options)
}

/**
 * Before the save is offered: reads the save in flight stored on this device
 * and, where one is, follows it in a new run with nothing sent. Reads once per
 * run held, and again only after a read that failed.
 */
export const lookForSave = async (
  store: ArmStore,
  steps: SaveSteps,
  options: ConfirmReadOptions = {}
): Promise<void> => {
  const state = store.state()
  if (
    state.write.status !== 'idle' ||
    state.stop ||
    (state.lookup !== undefined && state.lookup !== 'failed')
  ) {
    return
  }
  const { run } = state.write
  store.dispatch({ type: 'lookup', run, reading: 'reading' })
  let read
  try {
    read = await steps.readInFlight()
  } catch {
    store.dispatch({ type: 'lookup', run, reading: 'failed' })
    return
  }
  if (read.status !== 'present') {
    store.dispatch({ type: 'lookup', run, reading: 'none' })
    return
  }
  // A void save may have let another page store its own: the save is offered only where none is.
  const voidedThrough = await followSave(store, steps, run, read.value, options)
  if (voidedThrough) {
    await lookForSave(store, voidedThrough, options)
  }
}

/**
 * Marks the steps of a screen that went away: a follow reading through them
 * stops at its next step, with nothing read, voided or released, and keeps
 * its hold for the next screen.
 */
export const detachSteps = (steps: SaveSteps): void => {
  DETACHED.add(steps)
}

/**
 * Attaches the steps of the screen that now holds the store: a follow of a
 * stored save with no hash reads through them from its next step, and one
 * stopped while no screen was there starts again, with its count of gone
 * readings from nothing.
 */
export const attachSteps = async (
  store: ArmStore,
  steps: SaveSteps,
  options: ConfirmReadOptions = {}
): Promise<void> => {
  DETACHED.delete(steps)
  ATTACHED.set(store, steps)
  WAKES.get(store)?.()
  const voidedThrough = await readFollow(store, options)
  if (voidedThrough) {
    await lookForSave(store, voidedThrough, options)
    return
  }
  // A wait that ended while no screen was attached checked nothing.
  const { run } = store.state().write
  if (pendingHashIn(store.state(), run)) {
    await checkDropped(store, steps, run, options)
  }
}

/** Whether the sign screen's estimation read no fee option the payer could cover, or an error. */
const shortAtSigning = (reading: FeeReading | undefined): boolean =>
  !!reading &&
  (reading.error !== undefined || !reading.options.some(({ available }) => available === true))

/**
 * After the sign screen read the batch short of gas and the save was not
 * sent: the gas check again on the same prepared save. Where the key is short,
 * a new run that reads the setup again shows the deposit step; where the
 * check reads enough, the not-sent state stays as it was.
 */
const recheckAfterShortSigning = async (
  store: ArmStore,
  steps: SaveSteps,
  run: number,
  prepared: PreparedSave
): Promise<void> => {
  const check = await steps.checkGas(prepared).catch(() => null)
  if (
    check?.kind !== 'deposit' ||
    !inRun(store.state(), run) ||
    store.state().write.status !== 'failedNotSent'
  ) {
    return
  }
  writeEvent(store)({ type: 'start' })
  const next = store.state().write.run
  if (next !== run + 1 || !(await noSetupYet(store, steps, next))) {
    return
  }
  store.dispatch({ type: 'prepared', run: next, prepared })
  writeEvent(store)({ type: 'gasChecked', run: next, check })
}

/** The send of a claimed save under its request id, with the first receipt wait's limit. */
const sendClaimed = async (
  store: ArmStore,
  steps: SaveSteps,
  run: number,
  prepared: PreparedSave,
  requestId: string,
  claimBlock: number | undefined,
  sendBlock: number
): Promise<boolean> => {
  const dispatch = writeEvent(store)
  // The first receipt wait runs inside the send; its limit starts when the hash arrives.
  let limit: ReturnType<typeof setTimeout> | undefined
  let ranOut = false
  let sentHash: Hex | undefined
  let sending: Promise<void> | undefined
  const sendDispatch = (event: WriteEvent) => {
    dispatch(event)
    if (event.type !== 'sent' || event.run !== run) {
      return
    }
    sentHash = event.transactionHash
    if (sending) {
      holdWait(store, event.transactionHash, sending).catch(() => undefined)
    }
    // The stored save keeps its claim's block where it holds one, else takes the send's.
    steps
      .markSent(requestId, event.transactionHash, claimBlock === undefined ? sendBlock : undefined)
      .catch(() => undefined)
    if (limit === undefined) {
      limit = setTimeout(() => {
        ranOut = true
        store.dispatch({ type: 'waitStalled', run })
      }, RECEIPT_WAIT_MS)
    }
  }
  try {
    sending = steps.send(prepared, sendDispatch, run, requestId, sendBlock, (reading) =>
      store.dispatch({ type: 'estimated', run, reading })
    )
    await sending
  } catch (error: unknown) {
    dispatch({ type: 'error', run, error })
  } finally {
    clearTimeout(limit)
    if (sentHash) {
      dropWait(store, sentHash)
    }
  }
  return ranOut
}

/** Follows a stored save in place of the run's own send, and looks again where it was void. */
const followInstead = async (
  store: ArmStore,
  steps: SaveSteps,
  run: number,
  record: SaveInFlightRecord,
  options: ConfirmReadOptions
): Promise<void> => {
  const voidedThrough = await followSave(store, steps, run, record, options)
  if (voidedThrough) {
    await lookForSave(store, voidedThrough, options)
  }
}

/**
 * A claimed run whose stored save is no longer its own: it sends nothing and
 * releases nothing. It follows the stored save another page holds now; where
 * none is stored, the save is looked for again before it is offered.
 */
const yieldClaim = async (
  store: ArmStore,
  steps: SaveSteps,
  run: number,
  stored: RecordRead<SaveInFlightRecord>,
  options: ConfirmReadOptions
): Promise<void> => {
  if (stored.status === 'present') {
    store.dispatch({ type: 'released', run })
    await followInstead(store, steps, run, stored.value, options)
    return
  }
  store.dispatch({ type: 'voided', run })
  await lookForSave(store, steps, options)
}

/**
 * The gas check of the run's prepared save; where the key holds enough, the
 * claim of the save in flight, then the send under the claim's id, or, where
 * another page's save is stored, that save followed with nothing sent; then
 * the check.
 */
const checkAndSend = async (
  store: ArmStore,
  steps: SaveSteps,
  run: number,
  options: ConfirmReadOptions
): Promise<void> => {
  const { prepared } = store.state()
  if (!prepared || !inRun(store.state(), run) || store.state().write.status !== 'checkingGas') {
    return
  }
  const dispatch = writeEvent(store)
  try {
    const check = await steps.checkGas(prepared)
    dispatch({ type: 'gasChecked', run, check })
  } catch (error: unknown) {
    dispatch({ type: 'error', run, error })
    return
  }
  if (!awaitingHashIn(store.state(), run)) {
    return
  }
  // The receipt wait of any page that follows this save scans from the block read before the claim.
  const claimBlock = await steps.blockNumber().catch(() => undefined)
  if (!awaitingHashIn(store.state(), run)) {
    return
  }
  const requestId = steps.newRequestId()
  let claim
  try {
    claim = await steps.claim(prepared, requestId, claimBlock)
  } catch (error: unknown) {
    dispatch({ type: 'error', run, error })
    return
  }
  if (!claim.claimed) {
    await followInstead(store, steps, run, claim.record.value, options)
    return
  }
  store.dispatch({ type: 'claimed', run, requestId })
  if (store.state().requestId !== requestId) {
    await steps.release(requestId).catch(() => undefined)
    return
  }
  // Another page's save may have landed, and its stored save left, after this
  // run's first setup read: the claim then finds no record, so the setup is
  // read once more before the send. A read past its limit counts as one that
  // threw, so a page that follows this claim does not wait on it for long.
  let landedMeanwhile: boolean
  try {
    landedMeanwhile = await readWithin(() => steps.hasSetup(), 'setup read', CLAIMED_SETUP_READ_MS)
  } catch (error: unknown) {
    dispatch({ type: 'error', run, error })
    await releaseWhereEnded(store, steps)
    return
  }
  if (landedMeanwhile) {
    store.dispatch({ type: 'alreadySetUp', run })
    await steps.release(requestId).catch(() => undefined)
    return
  }
  // The block the send's receipt wait starts from is known before the stored
  // save is read again, so no network read sits between that read and the
  // send: the claim's block, else one read within its limit. A read that
  // fails, answers no usable block or passes its limit ends the run as a
  // failed setup read does.
  let sendBlock: number
  if (claimBlock !== undefined) {
    sendBlock = claimBlock
  } else {
    try {
      sendBlock = await readWithin(() => steps.blockNumber(), 'block read', SEND_BLOCK_READ_MS)
    } catch (error: unknown) {
      dispatch({ type: 'error', run, error })
      await releaseWhereEnded(store, steps)
      return
    }
  }
  // A page that read this claim gone for longer than its grace may have
  // voided it, and the holder saved there under another claim: the run sends
  // only while the stored save is still its own, and else goes on as a page
  // that arrives, with nothing sent and nothing released. A read past its
  // limit ends the run as a failed setup read does.
  let stored: RecordRead<SaveInFlightRecord>
  try {
    stored = await readWithin(() => steps.readInFlight(), 'stored save read', SEND_BLOCK_READ_MS)
  } catch (error: unknown) {
    dispatch({ type: 'error', run, error })
    await releaseWhereEnded(store, steps)
    return
  }
  if (stored.status !== 'present' || stored.value.requestId !== requestId) {
    await yieldClaim(store, steps, run, stored, options)
    return
  }
  // An answer is believed only while the claim is young: a follower voids
  // no sooner than its grace after the claim, so an answer that arrives later
  // may show a claim already voided and saved on another page.
  if (Date.now() - stored.value.claimedAt >= CLAIM_SEND_LIMIT_MS) {
    dispatch({
      type: 'error',
      run,
      error: new Error(
        `The stored save answered ${CLAIM_SEND_LIMIT_MS} ms or more after the claim.`
      )
    })
    await releaseWhereEnded(store, steps)
    return
  }
  if (!stillFollowing(store, run, requestId)) {
    await steps.release(requestId).catch(() => undefined)
    return
  }
  // Nothing is awaited from the stored save's read to the send's hand-over.
  const ranOut = await sendClaimed(store, steps, run, prepared, requestId, claimBlock, sendBlock)
  // Past the first wait's limit, the holder's check again is the next wait, not one started here.
  if (!ranOut) {
    await waitForReceipt(store, steps, run, options)
  } else {
    await checkDropped(store, steps, run, options)
  }
  await releaseWhereEnded(store, steps)
  const after = store.state()
  if (
    inRun(after, run) &&
    after.write.status === 'failedNotSent' &&
    !after.write.replaced &&
    !mayStillLand(after.write) &&
    shortAtSigning(after.estimation)
  ) {
    await recheckAfterShortSigning(store, steps, run, prepared)
    return
  }
  await settle(store, steps, run, options)
}

/**
 * Starts the save, from nothing or from a state that offers the retry: a new
 * run reads the account's setup, prepares the save again, runs the gas check,
 * claims the save in flight and sends. A setup already on the account ends
 * the run with nothing prepared; a refusal of the prepare reads as never sent.
 * Does nothing where the save cannot start, nor after a refusal whose
 * operation may still land.
 */
export const startSave = async (
  store: ArmStore,
  steps: SaveSteps,
  options: ConfirmReadOptions = {}
): Promise<void> => {
  if (mayStillLand(store.state().write)) {
    return
  }
  await releaseWhereEnded(store, steps)
  const before = store.state().write.run
  writeEvent(store)({ type: 'start' })
  const { run } = store.state().write
  if (run === before || !(await noSetupYet(store, steps, run))) {
    return
  }
  try {
    const prepared = await steps.prepare()
    store.dispatch({ type: 'prepared', run, prepared })
  } catch (error: unknown) {
    writeEvent(store)({ type: 'error', run, error })
    return
  }
  await checkAndSend(store, steps, run, options)
}

/**
 * From the deposit blocker: the account's setup read again, then the gas check
 * again on the same prepared save, then the claim and the send. A setup found
 * meanwhile, by another tab, ends the run with nothing checked or sent.
 */
export const recheckGas = async (
  store: ArmStore,
  steps: SaveSteps,
  options: ConfirmReadOptions = {}
): Promise<void> => {
  if (store.state().write.status !== 'needsDeposit') {
    return
  }
  writeEvent(store)({ type: 'recheck' })
  const { run } = store.state().write
  if (!(await noSetupYet(store, steps, run))) {
    return
  }
  await checkAndSend(store, steps, run, options)
}

/**
 * From a refusal whose operation may still land: where a read of the account's
 * setup found one, the save landed while no page followed it, and the check
 * runs with the run's save as after a landed receipt. No setup moves nothing.
 */
export const endWhereSetUp = async (
  store: ArmStore,
  steps: SaveSteps,
  hasSetup: boolean,
  options: ConfirmReadOptions = {}
): Promise<void> => {
  const { write } = store.state()
  if (!hasSetup || !mayStillLand(write) || store.state().landedUnseen) {
    return
  }
  store.dispatch({ type: 'landedUnseen', run: write.run })
  await settle(store, steps, write.run, options)
}

/**
 * From a refusal whose operation may still land: reads the account's setup
 * again. A setup found leads to the check; no setup, or a read that fails,
 * leaves the run as it was, with nothing sent.
 */
export const checkSetupAgain = async (
  store: ArmStore,
  steps: SaveSteps,
  options: ConfirmReadOptions = {}
): Promise<void> => {
  if (!mayStillLand(store.state().write) || store.state().landedUnseen) {
    return
  }
  const { run } = store.state().write
  let found: boolean
  try {
    found = await steps.hasSetup()
  } catch {
    return
  }
  if (inRun(store.state(), run)) {
    await endWhereSetUp(store, steps, found, options)
  }
}

/**
 * From a stalled receipt wait: checks for a dropped save first; where it does
 * not read dropped, waits for the same hash once more, taking up the wait
 * still open on it, then the check where it landed. From a followed request
 * whose read did not answer: reads it again at once.
 */
export const checkReceiptAgain = async (
  store: ArmStore,
  steps: SaveSteps,
  options: ConfirmReadOptions = {}
): Promise<void> => {
  const state = store.state()
  const { run } = state.write
  if (state.follow === 'unread' && awaitingHashIn(state, run)) {
    WAKES.get(store)?.()
    return
  }
  if (!state.stalled || !pendingHashIn(state, run)) {
    return
  }
  store.dispatch({ type: 'waitResumed', run })
  if (await checkDropped(store, steps, run, options)) {
    return
  }
  await reattach(store, steps, run, options)
}

/** Reads the check again where it did not answer. */
export const rereadConfirmation = async (
  store: ArmStore,
  steps: SaveSteps,
  options: ConfirmReadOptions = {}
): Promise<void> => {
  if (store.state().after.stage !== 'unread') {
    return
  }
  await settle(store, steps, store.state().write.run, options)
}

// The stores whose holder pressed "save again", while its release runs.
const SAVING_AGAIN = new WeakSet<ArmStore>()

/**
 * From a dropped save: releases its stored save in flight by the run's
 * request id, then starts a new save through the ordinary start, with its
 * setup read before the prepare, its claim, its setup read after the claim
 * and its read of the stored save before the send. A release that fails
 * starts nothing and leaves the save dropped. A press while one runs does
 * nothing.
 */
export const saveAgain = async (
  store: ArmStore,
  steps: SaveSteps,
  options: ConfirmReadOptions = {}
): Promise<void> => {
  const state = store.state()
  const { requestId } = state
  const { run } = state.write
  if (!state.dropped || !requestId || SAVING_AGAIN.has(store)) {
    return
  }
  SAVING_AGAIN.add(store)
  try {
    await steps.release(requestId)
  } catch {
    SAVING_AGAIN.delete(store)
    return
  }
  store.dispatch({ type: 'droppedReleased', run })
  SAVING_AGAIN.delete(store)
  if (!inRun(store.state(), run) || store.state().write.status !== 'idle') {
    return
  }
  await startSave(store, steps, options)
}

/** Whether the save reads as saved: only after the check agreed and the wipe ran. */
export const isSaved = (state: ArmState): boolean => state.after.stage === 'saved'
