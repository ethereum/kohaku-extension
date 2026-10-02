/**
 * - A retry is offered only for causes a retry can fix: the submission's
 *   acceptance errors and an execution whose attempt has ended offer none, and
 *   the execution's "still ready" sentence renders only for causes that leave
 *   the attempt ready (revertedExecuteGone otherwise). A misread failure has
 *   the holder retry a call that cannot land.
 * - The transfer route's amount includes the transfer's own fee, so after the
 *   transfer lands the check run again answers enough.
 * - A failed gas read renders its own line with the retry (gasCheckFailed).
 * - An owner write's transaction is tied to the prepared write: from the key,
 *   to the account the key operates or the account factory.
 * - A transaction another one replaced before it was mined never ran.
 */
import { DEPLOYLESS_SIMULATION_FROM } from '@ambire-common/consts/deploy'
import i18n from '@common/config/localization'
import { KIT_ERROR_NAMES, type KitErrorName } from '@web/modules/social-recovery/sdk-interfaces'
import { isProviderReadFailure } from '@web/modules/social-recovery/shared/client'

import {
  ACCOUNT,
  ACCOUNT_FACTORY,
  canRetry,
  causeKey,
  copyOfState,
  failThrown,
  failWithReceipt,
  GWEI,
  initialWriteState,
  KEY,
  kitError,
  mockReads,
  NO_RETRY_CAUSES,
  nodeRevert,
  OTHER_KEY,
  ownerTransaction,
  readingOf,
  renderWriteState,
  replacedBy,
  rpcReads,
  runGasCheck,
  sentFor,
  stepOf,
  text,
  transferTransactionOf,
  VALUE_TRANSFER_GAS,
  withRun,
  WRITE_KINDS,
  writeReducer,
  WRITES_KEYS,
  WriteState
} from './harness'

const REVERTED_AND_GONE = /\bthe gas it spent is gone\b/i
const STILL_READY = /\bthe recovery is still ready\b/i
// The execution's causes that leave the attempt ready: the wait has not ended,
// or a security stop holds a method the recovery used.
const LEAVE_THE_ATTEMPT_READY: KitErrorName[] = ['WaitNotOver', 'MethodVetoedSpend']

/** The retry as a holder meets it: offered on screen, and taken by the machine. */
const retry = (state: WriteState) => {
  const machine = withRun(state)
  return {
    offered: canRetry(state),
    shown: renderWriteState(state).retry !== undefined,
    takes: writeReducer(machine, { type: 'start' }) !== machine
  }
}

describe('a retry is offered only where a retry can fix the cause', () => {
  it('a submission rejected because an attempt already runs offers no retry', () => {
    const state = failWithReceipt('submission', kitError('AttemptAlreadyActive'))
    expect(retry(state)).toEqual({ offered: false, shown: false, takes: false })
    expect(text(copyOfState(state))).toContain(i18n.t(causeKey('AttemptAlreadyActive')))
  })

  it('an execution the chain calls not consumable offers no retry and renders revertedExecuteGone', () => {
    const state = failWithReceipt('execution', kitError('NotConsumable'))
    expect(retry(state)).toEqual({ offered: false, shown: false, takes: false })
    const lines = copyOfState(state)
    expect(lines).toContain(
      i18n.t(WRITES_KEYS.revertedExecuteGone, {
        cause: i18n.t(causeKey('NotConsumable'))
      })
    )
    expect(text(lines)).not.toMatch(STILL_READY)
    expect(text(lines)).toMatch(REVERTED_AND_GONE)
  })

  KIT_ERROR_NAMES.forEach((name) =>
    it(`execution, ${name}: "still ready" and the retry only where the cause leaves the attempt ready`, () => {
      const state = failWithReceipt('execution', kitError(name))
      const ready = LEAVE_THE_ATTEMPT_READY.includes(name)
      const reading = text(copyOfState(state))
      expect({ name, stillReady: STILL_READY.test(reading), retry: canRetry(state) }).toEqual({
        name,
        stillReady: ready,
        retry: ready
      })
    })
  )

  it('an execution revert with a cause the wallet cannot name keeps the attempt ready, with the retry', () => {
    const unnamed = failWithReceipt('execution')
    expect(text(copyOfState(unnamed))).toMatch(STILL_READY)
    expect(retry(unnamed)).toEqual({ offered: true, shown: true, takes: true })
  })

  it('a submission reverted with a cause it cannot name, or one a retry can fix, offers the retry', () => {
    expect(retry(failWithReceipt('submission'))).toEqual({
      offered: true,
      shown: true,
      takes: true
    })
    const fixable = KIT_ERROR_NAMES.find((name) => !NO_RETRY_CAUSES.submission.includes(name))
    expect(fixable).toBeDefined()
    if (fixable) expect(canRetry(failWithReceipt('submission', kitError(fixable)))).toBe(true)
  })

  WRITE_KINDS.forEach((write) =>
    it(`${write}: every cause the module lists as unfixable offers no retry`, () => {
      NO_RETRY_CAUSES[write].forEach((name) =>
        expect({ name, retry: canRetry(failWithReceipt(write, kitError(name))) }).toEqual({
          name,
          retry: false
        })
      )
    })
  )
})

describe("the transfer route carries the transfer's own fee", () => {
  const TRANSFER_GAS = 46_000n
  const WRITE_GAS = 180_000n
  const PRICE = 3n * GWEI
  const transferData = transferTransactionOf(ACCOUNT, KEY.addr).data
  const gas = (call: { data: string }) => (call.data === transferData ? TRANSFER_GAS : WRITE_GAS)
  // What the transfer costs the key when it lands at the fee of the check.
  const TRANSFER_COST = (TRANSFER_GAS + VALUE_TRANSFER_GAS) * PRICE

  ;(['save', 'cancel', 'submission', 'execution'] as const).forEach((write) =>
    it(`${write}: after the transfer lands, the check run again answers enough`, async () => {
      const before = 100_000n * GWEI
      const step = stepOf(
        await runGasCheck({ write, reads: mockReads({ balance: before, gas, price: PRICE }) })
      )
      const transfer = step.routes.find((route) => route.kind === 'transfer')
      if (!transfer) throw new Error('expected the transfer route')

      const after = before + transfer.amount - TRANSFER_COST
      const recheck = await runGasCheck({
        write,
        reads: mockReads({ balance: after, gas, price: PRICE })
      })
      expect(recheck.kind).toBe('enough')
    })
  )

  it('the shortfall alone would not do: without its fee the transfer leaves the key short', async () => {
    const before = 100_000n * GWEI
    const step = stepOf(
      await runGasCheck({
        write: 'submission',
        reads: mockReads({ balance: before, gas, price: PRICE })
      })
    )
    const withoutFee = before + step.shortfall - TRANSFER_COST
    const recheck = await runGasCheck({
      write: 'submission',
      reads: mockReads({ balance: withoutFee, gas, price: PRICE })
    })
    expect(recheck.kind).toBe('deposit')
  })

  it("the transfer's fee is estimated for the account's own operation, sent by the key to the account", async () => {
    const reads = mockReads({ balance: 0n, gas, price: PRICE })
    await runGasCheck({ write: 'submission', reads })
    const [call] = reads.estimateGas.mock.calls[1]
    expect(call.from.toLowerCase()).toBe(KEY.addr.toLowerCase())
    expect(call.to.toLowerCase()).toBe(ACCOUNT.toLowerCase())
  })
})

describe('a gas read that could not run renders gasCheckFailed with the retry', () => {
  const failed = async (answers: Parameters<typeof rpcReads>[0]) => {
    const reads = rpcReads(answers)
    const thrown = await runGasCheck({ write: 'submission', reads }).catch((error) => error)
    const checking = writeReducer(initialWriteState('submission'), { type: 'start' })
    return {
      thrown,
      state: writeReducer(checking, { type: 'error', run: checking.run, error: thrown })
    }
  }

  it('a failed balance read: gasReadError, the gasCheckFailed line, the retry runs the check again', async () => {
    const { thrown, state } = await failed({ balance: new Error('node down'), gas: 180_000n })
    expect(isProviderReadFailure(thrown)).toBe(true)
    expect(state.status).toBe('gasReadError')
    const rendered = renderWriteState(state)
    expect(rendered.lines).toEqual([i18n.t(WRITES_KEYS.gasCheckFailed)])
    expect(rendered.retry).toBe(i18n.t(WRITES_KEYS.tryAgain))
    expect(writeReducer(state, { type: 'start' }).status).toBe('checkingGas')
  })

  it('an estimate the node could not answer reads the same', async () => {
    const { state } = await failed({ balance: 0n, gas: new Error('socket hang up') })
    expect(state.status).toBe('gasReadError')
  })

  it('an estimate of a call that would revert is no failed read: nothing was sent', async () => {
    const { thrown, state } = await failed({ balance: 0n, gas: nodeRevert() })
    expect(isProviderReadFailure(thrown)).toBe(false)
    expect(readingOf(state)).toBe('notSent')
  })
})

describe("an owner write's transaction is tied to the prepared write", () => {
  it('a stale transaction whose to is not the account the key operates is refused, and nothing is read', async () => {
    const reads = mockReads({ balance: 0n, gas: 180_000n })
    const stale = { ...ownerTransaction('save'), to: OTHER_KEY.addr }
    await expect(runGasCheck({ write: 'save', reads, transaction: stale })).rejects.toThrow(
      TypeError
    )
    expect(reads.estimateGas).not.toHaveBeenCalled()
    expect(reads.nativeBalance).not.toHaveBeenCalled()
  })

  it('a transaction from another key than the sending key is refused', async () => {
    const reads = mockReads({ balance: 0n, gas: 180_000n })
    const other = ownerTransaction('cancel', OTHER_KEY.addr)
    await expect(runGasCheck({ write: 'cancel', reads, transaction: other })).rejects.toThrow(
      TypeError
    )
    expect(reads.estimateGas).not.toHaveBeenCalled()
  })

  it('a save that deploys the account goes to the account factory and is estimated', async () => {
    const reads = mockReads({ balance: 10n ** 18n, gas: 180_000n })
    const deploy = { ...ownerTransaction('save'), to: ACCOUNT_FACTORY }
    expect((await runGasCheck({ write: 'save', reads, transaction: deploy })).kind).toBe('enough')
    expect(reads.estimateGas.mock.calls[0][0]).toEqual({
      ...deploy,
      from: DEPLOYLESS_SIMULATION_FROM
    })
  })
})

describe('a transaction replaced before it was mined', () => {
  WRITE_KINDS.forEach((write) =>
    describe(write, () => {
      ;(['cancelled', 'replaced'] as const).forEach((reason) =>
        it(`${reason}: the write's call never ran, whatever the replacement did`, () => {
          ;([0, 1] as const).forEach((status) => {
            const state = failThrown(write, replacedBy(reason, status))
            expect({ status, reading: readingOf(state) }).toEqual({ status, reading: 'notSent' })
            expect(text(copyOfState(state))).not.toMatch(REVERTED_AND_GONE)
            expect(canRetry(state)).toBe(true)
          })
          const sent = sentFor(write)
          const machine = writeReducer(sent, {
            type: 'error',
            run: sent.run,
            error: replacedBy(reason, 1)
          })
          expect(readingOf(machine)).toBe('notSent')
        })
      )

      it('repriced: the same call at another fee settles by the replacement receipt', () => {
        const sent = sentFor(write)
        expect(
          readingOf(
            writeReducer(sent, { type: 'error', run: sent.run, error: replacedBy('repriced', 1) })
          )
        ).toBe('landed')
        expect(
          readingOf(
            writeReducer(sent, { type: 'error', run: sent.run, error: replacedBy('repriced', 0) })
          )
        ).toBe('reverted')
        expect(readingOf(failThrown(write, replacedBy('repriced', 0)))).toBe('reverted')
      })
    })
  )
})
