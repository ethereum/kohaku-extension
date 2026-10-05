/**
 * One table over every combination of the save's inputs: how the arrival
 * reads (the review's gate, the account's facts, the client, the recovery
 * password in memory) and, where the arrival lets the save start, how each
 * edge of the run answers (the setup read at the start, authorized before or
 * not, the account's code, the prepare, the gas check, the send, the receipt
 * and the check after it), and then whether the holder starts the save a
 * second time with the setup read answering a setup or none.
 *
 * The rows are the cross product with three rules that prune what cannot
 * happen or cannot be read:
 *
 * 1. A save that never starts reads none of the run's edges, so an arrival
 *    other than ready takes one row, with every edge set to answer as a
 *    successful save would, so a save that started anyway would show.
 * 2. A refused send leaves no transaction, so no receipt and no check follow
 *    it; a reverted or replaced transaction leaves nothing to check. The
 *    receipt is crossed only with a sent batch, and the check only with a
 *    landed receipt.
 * 3. A setup read that finds a setup or throws ends the run before any other
 *    edge, so each takes one row with the other edges of a successful save.
 *
 * The save starts on a ready arrival alone, as the screen starts it; the
 * screen's own test checks that it does. After the run, the table also tries
 * the moves the screen offers short of a fresh save (the gas check again from
 * the deposit blocker, the check again where it did not answer), then the
 * second start where the row asks for one, with every edge but the setup read
 * now answering as a successful save would.
 *
 * For every row: the save reads as saved, the saved screen shows and the six
 * records are wiped once if and only if a receipt landed and the check read
 * the setup landed and authorized for that run. No start sends more than one
 * batch, and a start whose setup read finds a setup prepares, estimates and
 * sends nothing. Nothing is sent unless the arrival was ready, the setup read
 * found none, the prepare answered and the gas check answered enough; what is
 * sent is the prepared calls in order, with the recovery kit's mark. After a
 * landed batch the check is read up to its deciding read and no further, so a
 * setup no read finds is read once and once after every new block. The save
 * in flight stays stored after the row only where its operation may still
 * land or its landing's check did not answer.
 */
import type { Account } from '@ambire-common/interfaces/account'
import { recoveryKitMarkOf, SEND_REFUSAL_REASONS } from '@web/modules/social-recovery/shared/client'

import {
  armScreenOf,
  callsOf,
  createArmStore,
  isSaved,
  recheckGas,
  rereadConfirmation,
  startSave
} from '@web/modules/social-recovery/setup/arm'

import {
  arrivalFor,
  CLIENT_CASES,
  CONFIRM_CASES,
  confirmAgrees,
  confirmation,
  confirmReadsOf,
  crossProduct,
  DESCRIPTOR,
  FACTS_CASES,
  GAS_CASES,
  GATE_CASES,
  HAPPY,
  landedReceipt,
  RETRIES,
  runSave,
  setupStateOf,
  SHORT_TIMEOUT_MS,
  smartAccount,
  TX_HASH,
  wireSave
} from '@web/modules/social-recovery/setup/arm/__tests__/harness'
import type {
  ArrivalCase,
  Retry,
  Row,
  SaveScript,
  WiredSave
} from '@web/modules/social-recovery/setup/arm/__tests__/harness'

/** The send, the receipt and the check, pruned by the second rule. */
const AFTER_GAS: Pick<SaveScript, 'send' | 'receipt' | 'confirm'>[] = [
  ...SEND_REFUSAL_REASONS.map((send) => ({
    send,
    receipt: 'landed' as const,
    confirm: 'agreed' as const
  })),
  { send: 'sent', receipt: 'reverted', confirm: 'agreed' },
  { send: 'sent', receipt: 'replaced', confirm: 'agreed' },
  ...CONFIRM_CASES.map((confirm) => ({
    send: 'sent' as const,
    receipt: 'landed' as const,
    confirm
  }))
]

const READY: ArrivalCase = { gate: 'passes', facts: 'ready', client: 'ready', passwordHeld: true }

const ARRIVALS = crossProduct({
  gate: GATE_CASES,
  facts: FACTS_CASES,
  client: CLIENT_CASES,
  passwordHeld: [true, false]
})

const FIRST_RUNS: SaveScript[] = [
  ...crossProduct({
    authorized: [false, true],
    deployed: [true, false],
    prepare: ['answers', 'refuses'] as const,
    gas: GAS_CASES,
    after: AFTER_GAS
  }).map(({ after, ...rest }) => ({ ...rest, ...after, setup: 'none' as const })),
  { ...HAPPY, authorized: false, deployed: true, setup: 'set-up' },
  { ...HAPPY, authorized: false, deployed: true, setup: 'throws' }
]

const sameArrival = (one: ArrivalCase, other: ArrivalCase) =>
  one.gate === other.gate &&
  one.facts === other.facts &&
  one.client === other.client &&
  one.passwordHeld === other.passwordHeld

const ROWS: Row[] = [
  ...ARRIVALS.filter((arrival) => !sameArrival(arrival, READY)).map((arrival) => ({
    arrival,
    script: { ...HAPPY, authorized: false, deployed: true },
    retry: 'none' as const
  })),
  ...crossProduct({ script: FIRST_RUNS, retry: RETRIES }).map(({ script, retry }) => ({
    arrival: READY,
    script,
    retry
  }))
]

/**
 * Whether the first run ends where a second start opens a new run, read from
 * the script alone: a failure that offers the retry. A setup found, a deposit
 * step, a refusal whose operation may still land and a landed batch offer
 * none.
 */
const offersRetry = (script: SaveScript): boolean => {
  if (script.setup !== 'none') {
    return script.setup === 'throws'
  }
  if (script.prepare === 'refuses') {
    return true
  }
  if (script.gas !== 'enough') {
    return script.gas === 'read-fails'
  }
  if (script.send !== 'sent') {
    return script.send !== 'not-a-transaction'
  }
  return script.receipt !== 'landed'
}

/** Every edge but the setup read now answers as a successful save would. */
const healEdges = (wired: WiredSave, retry: Retry) => {
  wired.setupState.mockResolvedValue(setupStateOf(retry === 'set-up'))
  wired.prepareCommitSetup.mockResolvedValue(wired.prepared)
  wired.reads.nativeBalance.mockResolvedValue(10n ** 18n)
  wired.port.sendAccountBatch.mockResolvedValue(TX_HASH)
  wired.receipts.wait.mockImplementation(async (hash) => landedReceipt(hash))
  wired.confirmSetup.mockResolvedValue(confirmation(true, true))
}

const json = (value: unknown) =>
  JSON.stringify(value, (_, held) => (typeof held === 'bigint' ? `${held}n` : held))

const describeRow = ({ arrival, script, retry }: Row) => json({ ...arrival, ...script, retry })

let account: Account

beforeAll(async () => {
  account = await smartAccount()
})

describe('every combination of the save inputs', () => {
  it('has one row per arrival that never starts, and one per first run of a ready arrival and second start', () => {
    expect(ARRIVALS).toHaveLength(9 * 6 * 4 * 2)
    // Nine refusals of the port, two failed receipts and eight answers of the check.
    expect(AFTER_GAS).toHaveLength(9 + 2 + 8)
    expect(FIRST_RUNS).toHaveLength(2 * 2 * 2 * 3 * 19 + 2)
    expect(ROWS).toHaveLength(431 + 458 * 3)
  })

  it('reads saved, shows the saved screen and wipes the records only after a landed, agreed save, and sends at most one batch per start', async () => {
    const failures: string[] = []
    const fail = (row: Row, what: string) => failures.push(`${what} :: ${describeRow(row)}`)

    const check = async (row: Row) => {
      const { arrival, script, retry } = row
      const wired = wireSave(account, script)
      const store = createArmStore()
      const ready = arrivalFor(arrival, account).kind === 'ready'
      const sendsOf = () => wired.port.sendAccountBatch.mock.calls.length
      let firstSends = 0
      let secondSends = 0
      if (ready) {
        await runSave(wired.steps, store)
        await recheckGas(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
        await rereadConfirmation(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
        firstSends = sendsOf()
        if (retry !== 'none') {
          const prepares = wired.prepareCommitSetup.mock.calls.length
          const estimates = wired.reads.estimateGas.mock.calls.length
          const setupReads = wired.setupState.mock.calls.length
          healEdges(wired, retry)
          await startSave(store, wired.steps, { timeoutMs: SHORT_TIMEOUT_MS })
          secondSends = sendsOf() - firstSends
          const started = wired.setupState.mock.calls.length > setupReads
          if (started !== offersRetry(script)) {
            fail(row, `the second start read the setup: ${started}`)
          }
          if (retry === 'set-up') {
            if (wired.prepareCommitSetup.mock.calls.length !== prepares) {
              fail(row, 'a start that found a setup prepared the commit')
            }
            if (wired.reads.estimateGas.mock.calls.length !== estimates) {
              fail(row, 'a start that found a setup ran the gas check')
            }
            if (secondSends !== 0) {
              fail(row, 'a start that found a setup sent a batch')
            }
            if (started && store.state().stop !== 'already-set-up') {
              fail(row, 'a start that found a setup did not end as already set up')
            }
          }
        }
      }

      const firstSent =
        ready && script.setup === 'none' && script.prepare === 'answers' && script.gas === 'enough'
      const firstLanded = firstSent && script.send === 'sent' && script.receipt === 'landed'
      const secondSent = ready && retry === 'no-setup' && offersRetry(script)
      const saved = (firstLanded && confirmAgrees(script.confirm)) || secondSent
      const landed = firstLanded || secondSent
      const state = store.state()

      if (ready !== sameArrival(arrival, READY)) {
        fail(row, `the arrival read ready: ${ready}`)
      }
      if (isSaved(state) !== saved) {
        fail(row, `isSaved answered ${isSaved(state)}`)
      }
      if ((armScreenOf(state) === 'saved') !== saved) {
        fail(row, `the screen is ${armScreenOf(state)}`)
      }
      if (wired.saveSetup.mock.calls.length !== (saved ? 1 : 0)) {
        fail(row, `the records were wiped ${wired.saveSetup.mock.calls.length} times`)
      }
      if (firstSends !== (firstSent ? 1 : 0)) {
        fail(row, `the first start sent ${firstSends} batches`)
      }
      if (secondSends !== (secondSent ? 1 : 0)) {
        fail(row, `the second start sent ${secondSends} batches`)
      }
      if (wired.port.send.mock.calls.length !== 0) {
        fail(row, 'a key sent a transaction alone')
      }
      if (!ready && wired.prepareCommitSetup.mock.calls.length !== 0) {
        fail(row, 'a save that never started prepared its commit')
      }
      if (!ready && wired.setupState.mock.calls.length !== 0) {
        fail(row, 'a save that never started read the setup')
      }
      wired.port.sendAccountBatch.mock.calls.forEach(([sentFor, calls, , mark], index) => {
        if (sentFor !== wired.account) {
          fail(row, 'the batch was sent for another account')
        }
        if (json(calls) !== json(callsOf(wired.prepared))) {
          fail(row, 'the calls sent are not the prepared calls in order')
        }
        if (json(mark) !== json(recoveryKitMarkOf(DESCRIPTOR))) {
          fail(row, 'the batch went without the recovery kit mark')
        }
        const sentAt = wired.port.sendAccountBatch.mock.invocationCallOrder[index]
        const checkedBefore = wired.reads.nativeBalance.mock.invocationCallOrder.filter(
          (order) => order < sentAt
        ).length
        const readBefore = wired.setupState.mock.invocationCallOrder.filter(
          (order) => order < sentAt
        ).length
        if (checkedBefore < index + 1) {
          fail(row, 'a batch was sent before the gas check read the key')
        }
        if (readBefore < index + 1) {
          fail(row, 'a batch was sent before the start read the setup')
        }
      })
      if (saved) {
        const lastCheck = Math.max(...wired.confirmSetup.mock.invocationCallOrder)
        if (!(wired.saveSetup.mock.invocationCallOrder[0] > lastCheck)) {
          fail(row, 'the records were wiped before the check answered')
        }
      }
      const unanswered = script.confirm === 'throws' || script.confirm === 'no-answer'
      const inFlight =
        firstSent && (script.send === 'not-a-transaction' || (firstLanded && unanswered))
      if ((await wired.inFlight.read()).status !== (inFlight ? 'present' : 'absent')) {
        fail(row, `the stored save in flight reads ${inFlight ? 'absent' : 'present'}`)
      }
      if (!landed && wired.confirmSetup.mock.calls.length !== 0) {
        fail(row, 'the check ran with no landed receipt')
      }
      // An unanswered check is read once more by the screen's reread after the run.
      const reread = unanswered ? 1 : 0
      const reads = confirmReadsOf(script.confirm) + reread
      if (firstLanded && wired.confirmSetup.mock.calls.length !== reads) {
        fail(row, `the check was read ${wired.confirmSetup.mock.calls.length} times`)
      }
    }

    await ROWS.reduce(async (before, row) => {
      await before
      await check(row)
    }, Promise.resolve())

    expect(failures).toEqual([])
  })
})
