/**
 * A screen may reset a write, or retry it, while the answers of the run before
 * are still on their way. Each `start` opens a new run, and the machine takes
 * only the answers of the current run: a late receipt, error, hash, gas check
 * or attempt read of an earlier run leaves the state as it was. So a late
 * landed receipt of a cancel the holder left behind never hides the revert of
 * the cancel that followed it. Within the run, a receipt settles the write
 * only for a hash the wallet announced: the first one, or a repriced
 * replacement's.
 */
import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'

import {
  canRetry,
  CONTROLLER,
  depositStepFor,
  enoughCheck,
  initialWriteState,
  minedAndReverted,
  offersMoveFunds,
  readingOf,
  REPLACEMENT_HASH,
  sentFor,
  sentFrom,
  submittingFrom,
  TX_HASH,
  waitTimedOut,
  writeReducer
} from './harness'

const HASH_A = TX_HASH
const HASH_B: Hex = `0x${'b'.repeat(64)}`
const HASH_C: Hex = `0x${'c'.repeat(64)}`
/** The hash of another transaction from the same key, such as the transfer route's. */
const OTHER_HASH: Hex = `0x${'d'.repeat(64)}`

/** A cancel sent with hash A, reset by the holder, then sent again with hash B. */
const cancelSentAgain = () => {
  const first = sentFrom(initialWriteState('cancel'), HASH_A)
  const second = sentFrom(writeReducer(first, { type: 'reset' }), HASH_B)
  return { first, second }
}

/** A cancel whose first run reverted, retried, and sent again with hash B. */
const cancelRetried = () => {
  const sent = sentFrom(initialWriteState('cancel'), HASH_A)
  const reverted = writeReducer(sent, {
    type: 'receipt',
    run: sent.run,
    receipt: { transactionHash: HASH_A, status: 0 }
  })
  const second = sentFrom(reverted, HASH_B)
  return { first: sent, reverted, second }
}

describe('an answer of an earlier run', () => {
  it('each start opens a new run, and a reset keeps the count', () => {
    const { first, second } = cancelSentAgain()
    expect(second.run).toBeGreaterThan(first.run)
    expect(second).toMatchObject({ status: 'submitting', transactionHash: HASH_B })
    expect(writeReducer(second, { type: 'reset' }).run).toBe(second.run)
  })

  it('a late receipt from the previous run is ignored', () => {
    const { first, second } = cancelSentAgain()
    const late = writeReducer(second, {
      type: 'receipt',
      run: first.run,
      receipt: { transactionHash: HASH_A, status: 1 }
    })
    expect(late).toBe(second)
    expect(readingOf(late)).not.toBe('landed')
  })

  it('the reverted receipt of the current run reaches the reverted reading after a late landed receipt', () => {
    const { first, second } = cancelSentAgain()
    const late = writeReducer(second, {
      type: 'receipt',
      run: first.run,
      receipt: { transactionHash: HASH_A, status: 1 }
    })
    const settled = writeReducer(late, {
      type: 'receipt',
      run: second.run,
      receipt: { transactionHash: HASH_B, status: 0 }
    })
    expect(readingOf(settled)).toBe('reverted')
    expect(settled).toMatchObject({ transactionHash: HASH_B, run: second.run })
    expect(canRetry(settled)).toBe(true)
    expect(offersMoveFunds(settled)).toBe(true)
  })

  it('a late error from the previous run is ignored', () => {
    const { first, second } = cancelSentAgain()
    ;[waitTimedOut(HASH_A), minedAndReverted(HASH_A)].forEach((error) => {
      const late = writeReducer(second, { type: 'error', run: first.run, error })
      expect(late).toBe(second)
      expect(late).toMatchObject({
        status: 'submitting',
        transactionHash: HASH_B,
        run: second.run
      })
    })
    const checking = writeReducer(writeReducer(first, { type: 'reset' }), { type: 'start' })
    const lateWhileChecking = writeReducer(checking, {
      type: 'error',
      run: first.run,
      error: waitTimedOut(HASH_A)
    })
    expect(lateWhileChecking).toBe(checking)
    expect(lateWhileChecking).toMatchObject({ status: 'checkingGas', run: checking.run })
  })

  it('a late error from the run a retry left behind is ignored', () => {
    const { first, second } = cancelRetried()
    const late = writeReducer(second, {
      type: 'error',
      run: first.run,
      error: minedAndReverted(HASH_A)
    })
    expect(late).toBe(second)
    expect(late).toMatchObject({ status: 'submitting', transactionHash: HASH_B, run: second.run })
  })

  it('a late hash from the previous run is ignored, before and after the current run sent', () => {
    const { first, second } = cancelSentAgain()
    const resent = writeReducer(second, {
      type: 'sent',
      run: second.run,
      transactionHash: REPLACEMENT_HASH
    })
    expect(writeReducer(resent, { type: 'sent', run: first.run, transactionHash: HASH_A })).toBe(
      resent
    )

    const waiting = submittingFrom(writeReducer(first, { type: 'reset' }))
    expect(waiting).toMatchObject({ status: 'submitting', run: second.run })
    expect(waiting).not.toHaveProperty('transactionHash')
    expect(writeReducer(waiting, { type: 'sent', run: first.run, transactionHash: HASH_A })).toBe(
      waiting
    )
  })

  it('a late gas result from the previous run is ignored', async () => {
    const first = writeReducer(initialWriteState('cancel'), { type: 'start' })
    const checking = writeReducer(writeReducer(first, { type: 'reset' }), { type: 'start' })
    const deposit = { kind: 'deposit' as const, step: await depositStepFor('cancel', false) }
    expect(
      writeReducer(checking, { type: 'gasChecked', run: first.run, check: enoughCheck('cancel') })
    ).toBe(checking)
    expect(writeReducer(checking, { type: 'gasChecked', run: first.run, check: deposit })).toBe(
      checking
    )
    expect(
      writeReducer(checking, {
        type: 'gasChecked',
        run: checking.run,
        check: enoughCheck('cancel')
      }).status
    ).toBe('submitting')
  })

  it('a late attempt read from the previous run does not judge the current cancel again', () => {
    const { reverted, second } = cancelRetried()
    const current = writeReducer(second, {
      type: 'receipt',
      run: second.run,
      receipt: { transactionHash: HASH_B, status: 0 }
    })
    const executed = { ended: 'executed' as const, controller: CONTROLLER }
    expect(
      writeReducer(current, { type: 'attemptRead', run: reverted.run, attemptAfter: executed })
    ).toBe(current)
    expect(
      writeReducer(current, { type: 'attemptRead', run: current.run, attemptAfter: executed })
    ).toMatchObject({ cause: { kind: 'attemptGone', ended: 'executed' }, run: current.run })
  })
})

describe('a start while a run is under way', () => {
  it('during the gas check changes nothing, and the check still answers', () => {
    const checking = writeReducer(initialWriteState('cancel'), { type: 'start' })
    expect(writeReducer(checking, { type: 'start' })).toBe(checking)
    expect(
      writeReducer(checking, {
        type: 'gasChecked',
        run: checking.run,
        check: enoughCheck('cancel')
      }).status
    ).toBe('submitting')
  })

  it('at the deposit step changes nothing, and the recheck still answers', async () => {
    const checking = writeReducer(initialWriteState('cancel'), { type: 'start' })
    const needsDeposit = writeReducer(checking, {
      type: 'gasChecked',
      run: checking.run,
      check: { kind: 'deposit', step: await depositStepFor('cancel', false) }
    })
    expect(needsDeposit.status).toBe('needsDeposit')
    expect(writeReducer(needsDeposit, { type: 'start' })).toBe(needsDeposit)
    const rechecking = writeReducer(needsDeposit, { type: 'recheck' })
    expect(
      writeReducer(rechecking, {
        type: 'gasChecked',
        run: checking.run,
        check: enoughCheck('cancel')
      }).status
    ).toBe('submitting')
  })

  it('while submitting, before and after the hash, changes nothing, and the receipt still settles', () => {
    const submitting = submittingFrom(initialWriteState('cancel'))
    expect(writeReducer(submitting, { type: 'start' })).toBe(submitting)
    const sent = writeReducer(submitting, {
      type: 'sent',
      run: submitting.run,
      transactionHash: HASH_A
    })
    expect(writeReducer(sent, { type: 'start' })).toBe(sent)
    const landed = writeReducer(sent, {
      type: 'receipt',
      run: sent.run,
      receipt: { transactionHash: HASH_A, status: 1 }
    })
    expect(readingOf(landed)).toBe('landed')
    expect(landed).toMatchObject({ transactionHash: HASH_A, run: sent.run })
  })
})

describe('an answer of the current run', () => {
  it('a repriced replacement receipt within the current run still lands', () => {
    const { second } = cancelSentAgain()
    const resent = writeReducer(second, {
      type: 'sent',
      run: second.run,
      transactionHash: REPLACEMENT_HASH
    })
    const landed = writeReducer(resent, {
      type: 'receipt',
      run: second.run,
      receipt: { transactionHash: REPLACEMENT_HASH, status: 1 }
    })
    expect(readingOf(landed)).toBe('landed')
    expect(landed).toMatchObject({ transactionHash: REPLACEMENT_HASH, run: second.run })
  })

  it('the first hash still settles the write after a repriced hash was announced', () => {
    const sent = sentFor('cancel')
    const resent = writeReducer(sent, {
      type: 'sent',
      run: sent.run,
      transactionHash: REPLACEMENT_HASH
    })
    const landed = writeReducer(resent, {
      type: 'receipt',
      run: sent.run,
      receipt: { transactionHash: TX_HASH, status: 1 }
    })
    expect(readingOf(landed)).toBe('landed')
    expect(landed).toMatchObject({ transactionHash: TX_HASH, run: sent.run })
  })

  it('an error with no hash keeps every announced hash, so the first one still settles', () => {
    const sent = sentFor('cancel')
    const resent = writeReducer(sent, {
      type: 'sent',
      run: sent.run,
      transactionHash: REPLACEMENT_HASH
    })
    const timedOut = writeReducer(resent, {
      type: 'error',
      run: sent.run,
      error: new Error('timeout')
    })
    expect(timedOut.status).toBe('submitting')
    const settled = writeReducer(timedOut, {
      type: 'receipt',
      run: sent.run,
      receipt: { transactionHash: TX_HASH, status: 0 }
    })
    expect(settled).toMatchObject({ status: 'failedReverted', transactionHash: TX_HASH })
  })

  it('an error naming an earlier hash of the run keeps the latest hash active, with both tracked', () => {
    const sent = sentFor('cancel', HASH_A)
    const resent = writeReducer(sent, { type: 'sent', run: sent.run, transactionHash: HASH_B })
    const timedOut = writeReducer(resent, {
      type: 'error',
      run: sent.run,
      error: waitTimedOut(HASH_A)
    })
    expect(timedOut).toMatchObject({
      status: 'submitting',
      transactionHash: HASH_B,
      sentHashes: [HASH_A, HASH_B],
      run: sent.run
    })
    ;[HASH_A, HASH_B].forEach((transactionHash) =>
      expect(
        writeReducer(timedOut, {
          type: 'receipt',
          run: sent.run,
          receipt: { transactionHash, status: 1 }
        })
      ).toMatchObject({ status: 'landed', transactionHash })
    )
  })

  it('an error naming a new hash makes that hash active and tracked', () => {
    const sent = sentFor('cancel', HASH_A)
    const resent = writeReducer(sent, { type: 'sent', run: sent.run, transactionHash: HASH_B })
    const timedOut = writeReducer(resent, {
      type: 'error',
      run: sent.run,
      error: waitTimedOut(HASH_C)
    })
    expect(timedOut).toMatchObject({
      status: 'submitting',
      transactionHash: HASH_C,
      sentHashes: [HASH_A, HASH_B, HASH_C],
      run: sent.run
    })
    expect(
      writeReducer(timedOut, {
        type: 'receipt',
        run: sent.run,
        receipt: { transactionHash: HASH_C, status: 0 }
      })
    ).toMatchObject({ status: 'failedReverted', transactionHash: HASH_C })
  })

  it('an error naming a hash during the gas check makes that hash active and tracked', () => {
    const checking = writeReducer(initialWriteState('cancel'), { type: 'start' })
    const timedOut = writeReducer(checking, {
      type: 'error',
      run: checking.run,
      error: waitTimedOut(HASH_A)
    })
    expect(timedOut).toMatchObject({
      status: 'submitting',
      transactionHash: HASH_A,
      sentHashes: [HASH_A],
      run: checking.run
    })
    expect(
      writeReducer(timedOut, {
        type: 'receipt',
        run: checking.run,
        receipt: { transactionHash: HASH_A, status: 1 }
      })
    ).toMatchObject({ status: 'landed', transactionHash: HASH_A })
  })

  it('an announced hash settles whatever the case of its letters', () => {
    const upper: Hex = `0x${'AB'.repeat(32)}`
    const lower: Hex = `0x${'ab'.repeat(32)}`
    const sent = sentFor('cancel', upper)
    const landed = writeReducer(sent, {
      type: 'receipt',
      run: sent.run,
      receipt: { transactionHash: lower, status: 1 }
    })
    expect(readingOf(landed)).toBe('landed')
  })

  it('a receipt for a hash the run never announced is ignored, and the announced one still settles', () => {
    const { second } = cancelSentAgain()
    ;([0, 1] as const).forEach((status) =>
      expect(
        writeReducer(second, {
          type: 'receipt',
          run: second.run,
          receipt: { transactionHash: OTHER_HASH, status }
        })
      ).toBe(second)
    )
    const waiting = submittingFrom(initialWriteState('cancel'))
    expect(
      writeReducer(waiting, {
        type: 'receipt',
        run: waiting.run,
        receipt: { transactionHash: OTHER_HASH, status: 1 }
      })
    ).toBe(waiting)
    const settled = writeReducer(second, {
      type: 'receipt',
      run: second.run,
      receipt: { transactionHash: HASH_B, status: 0 }
    })
    expect(settled).toMatchObject({ status: 'failedReverted', transactionHash: HASH_B })
  })

  it('a second hash within the run replaces the first', () => {
    const { second } = cancelSentAgain()
    const resent = writeReducer(second, {
      type: 'sent',
      run: second.run,
      transactionHash: REPLACEMENT_HASH
    })
    expect(resent).toMatchObject({ status: 'submitting', transactionHash: REPLACEMENT_HASH })
  })

  it("the deposit step's recheck stays in the run, so the check it runs still answers", async () => {
    const checking = writeReducer(initialWriteState('cancel'), { type: 'start' })
    const step = await depositStepFor('cancel', false)
    const needsDeposit = writeReducer(checking, {
      type: 'gasChecked',
      run: checking.run,
      check: { kind: 'deposit', step }
    })
    expect(needsDeposit.status).toBe('needsDeposit')
    const rechecking = writeReducer(needsDeposit, { type: 'recheck' })
    expect(rechecking).toMatchObject({ status: 'checkingGas', run: checking.run })
    expect(
      writeReducer(rechecking, {
        type: 'gasChecked',
        run: checking.run,
        check: enoughCheck('cancel')
      }).status
    ).toBe('submitting')
  })
})
