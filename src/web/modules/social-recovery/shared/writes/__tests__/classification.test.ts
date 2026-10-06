/**
 * The failed state carries its two readings. A call the wallet never sent
 * reads that nothing reached the chain and the account stands as it did; a
 * call that reached the chain and reverted reads as a revert, names the cause
 * the receipt carries and says the gas it spent is gone. A reverted cancel may
 * read that the attempt is already gone, with the account's controller as it
 * now stands. Strings through the real en.json.
 */
import i18n from '@common/config/localization'
import { providerReadFailure, revertedCall } from '@web/modules/social-recovery/shared/client'

import {
  ATTEMPT_STILL_RUNNING,
  cancelGoneRoadKey,
  canRetry,
  causeKey,
  CONTROLLER,
  copyOfState,
  failBeforeHash,
  failThrown,
  failWithReceipt,
  initialWriteState,
  kitError,
  landWithReceipt,
  minedAndReverted,
  nodeRefused,
  offersMoveFunds,
  readingOf,
  sentFor,
  submittingFor,
  text,
  TX_HASH,
  UNRESOLVED,
  userRejected,
  waitTimedOut,
  walletFailed,
  withRun,
  WRITE_KINDS,
  writeReducer,
  WriteState
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'

// The not-sent reading: nothing reached the chain, and the account stands as it did.
const NOTHING_REACHED_THE_CHAIN = /\b(?:nothing reached the chain|before it reached the chain)\b/i
const STANDS_AS_IT_DID = /\b(?:nothing changed|stands as it did)\b/i
// The reverted reading: a revert, the gas it spent is gone.
const REVERTED = /\breverted\b/i
const REACHED_AND_REVERTED = /\breached the chain and reverted\b/i
const GAS_GONE = /\bthe gas it spent is gone\b/i
// The reverted cancel's reading when the attempt had already ended.
const ALREADY_GONE = /\bthe attempt (?:was|is) already gone\b/i

const ATTEMPT_ACTIVE = kitError('AttemptAlreadyActive')
const WAIT_NOT_OVER = kitError('WaitNotOver')
const EXECUTED = { ended: 'executed' as const, controller: CONTROLLER }
const STILL_RUNNING = { ended: ATTEMPT_STILL_RUNNING }

const rendered = (state: WriteState) => text(copyOfState(state))

describe('a call the wallet never sent, the first reading', () => {
  const errors: [string, () => unknown][] = [
    ['the holder rejected the request', userRejected],
    ['the node refused the transaction', nodeRefused],
    ['the wallet failed before broadcasting', walletFailed]
  ]

  WRITE_KINDS.forEach((write) =>
    describe(write, () => {
      errors.forEach(([name, error]) =>
        it(`an error before a hash reads never sent: ${name}`, () => {
          const state = failBeforeHash(write, error())
          expect(readingOf(state)).toBe('notSent')
          expect(rendered(state)).toMatch(NOTHING_REACHED_THE_CHAIN)
          expect(rendered(state)).toMatch(STANDS_AS_IT_DID)
        })
      )

      it('never reads as a revert and never says gas was spent', () => {
        const state = rendered(failBeforeHash(write, userRejected()))
        expect(state).not.toMatch(REVERTED)
        expect(state).not.toMatch(GAS_GONE)
        expect(state).not.toMatch(ALREADY_GONE)
      })

      it('a failure of the send, through the machine, reads never sent', () => {
        const submitting = submittingFor(write)
        const state = writeReducer(submitting, {
          type: 'error',
          run: submitting.run,
          error: userRejected()
        })
        expect(readingOf(state)).toBe('notSent')
      })

      it('a gas check whose estimate would revert reads never sent', () => {
        const checking = writeReducer(initialWriteState(write), { type: 'start' })
        const estimateReverts = writeReducer(checking, {
          type: 'error',
          run: checking.run,
          error: revertedCall('estimateGas', '0x')
        })
        expect(readingOf(estimateReverts)).toBe('notSent')
      })

      it('a gas check whose read could not run is gasReadError, not a failed reading', () => {
        const checking = writeReducer(initialWriteState(write), { type: 'start' })
        const readFailed = writeReducer(checking, {
          type: 'error',
          run: checking.run,
          error: providerReadFailure('nativeBalance', new Error('node down'))
        })
        expect(readFailed.status).toBe('gasReadError')
        expect(rendered(readFailed)).not.toMatch(NOTHING_REACHED_THE_CHAIN)
        expect(rendered(readFailed)).not.toMatch(REVERTED)
      })
    })
  )
})

describe('a call that reached the chain and reverted, the second reading', () => {
  WRITE_KINDS.forEach((write) =>
    describe(write, () => {
      it('a receipt with status zero reads reverted, with the gas gone', () => {
        const state = failWithReceipt(write, ATTEMPT_ACTIVE, EXECUTED)
        expect(readingOf(state)).toBe('reverted')
        expect(rendered(state)).toMatch(REVERTED)
        expect(rendered(state)).toMatch(GAS_GONE)
      })

      // A revert's reading may also say that nothing changed, as the edit's
      // does. What tells the readings apart is whether the call reached the
      // chain.
      it('never reads that nothing reached the chain', () => {
        const state = rendered(failWithReceipt(write, ATTEMPT_ACTIVE, EXECUTED))
        expect(state).not.toMatch(NOTHING_REACHED_THE_CHAIN)
        expect(state).toMatch(REACHED_AND_REVERTED)
      })

      // A revert misread as a call never sent has the holder retry a call that
      // cannot land. ethers' wait() throws on a mined revert, carrying the hash
      // and the status-zero receipt.
      it('an error that carries a hash and a status-zero receipt reads reverted, never not sent', () => {
        const state = failThrown(write, minedAndReverted(), EXECUTED)
        expect(readingOf(state)).toBe('reverted')
        expect(rendered(state)).toMatch(GAS_GONE)
        expect(rendered(state)).not.toMatch(NOTHING_REACHED_THE_CHAIN)
      })

      it('the same error through the machine reads reverted', () => {
        const sent = sentFor(write)
        const state = writeReducer(sent, {
          type: 'error',
          run: sent.run,
          error: minedAndReverted()
        })
        expect(readingOf(state)).toBe('reverted')
      })

      it('a hash with no receipt never reads that nothing was sent', () => {
        expect(readingOf(failThrown(write, waitTimedOut()))).not.toBe('notSent')
        const sent = sentFor(write)
        const state = writeReducer(sent, {
          type: 'error',
          run: sent.run,
          error: new Error('timeout')
        })
        expect(readingOf(state)).not.toBe('notSent')
      })

      it('a receipt with status zero through the machine reads reverted', () => {
        const sent = sentFor(write)
        const state = writeReducer(sent, {
          type: 'receipt',
          run: sent.run,
          receipt: { transactionHash: TX_HASH, status: 0 },
          cause: ATTEMPT_ACTIVE
        })
        expect(readingOf(state)).toBe('reverted')
      })

      it('a receipt with status one is no failure', () => {
        expect(readingOf(landWithReceipt(write))).toBe('landed')
      })
    })
  )

  // The cancel may name the attempt gone in place of a cause, below.
  WRITE_KINDS.filter((w) => w !== 'cancel').forEach((write) =>
    describe(`${write}: the cause the receipt carries`, () => {
      // A marker answers the cause slot, so the test sees which cause sentence
      // the module chose, whatever en.json holds.
      const marked = (key: string, options?: Record<string, unknown>) =>
        /\.causes\./.test(key) ? `<${key}>` : i18n.t(key, options)

      it('the reverted reading carries a sentence chosen by the cause the wallet decoded', () => {
        const active = text(copyOfState(failWithReceipt(write, ATTEMPT_ACTIVE), marked))
        const wait = text(copyOfState(failWithReceipt(write, WAIT_NOT_OVER), marked))
        expect(active).toMatch(/<[\w.]*AttemptAlreadyActive>/)
        expect(wait).toMatch(/<[\w.]*WaitNotOver>/)
        expect(active).toMatch(GAS_GONE)
      })

      it('through en.json, names the cause in words: no raw key, and each cause its own words', () => {
        const active = rendered(failWithReceipt(write, ATTEMPT_ACTIVE))
        const wait = rendered(failWithReceipt(write, WAIT_NOT_OVER))
        const unnamed = rendered(failWithReceipt(write))
        expect({ active, unresolved: UNRESOLVED.test(active) }).toEqual({
          active,
          unresolved: false
        })
        expect({ unnamed, unresolved: UNRESOLVED.test(unnamed) }).toEqual({
          unnamed,
          unresolved: false
        })
        expect(active).not.toEqual(wait)
      })
    })
  )
})

describe('the reverted cancel', () => {
  const nothingToCancel = kitError('NoActiveAttempt')

  it('is the reverted reading', () => {
    const state = failWithReceipt('cancel', nothingToCancel, EXECUTED)
    expect(readingOf(state)).toBe('reverted')
    expect(rendered(state)).toMatch(REVERTED)
    expect(rendered(state)).toMatch(GAS_GONE)
  })

  it('names the attempt as already gone on the attempt read, or on a decoded NoActiveAttempt', () => {
    expect(rendered(failWithReceipt('cancel', nothingToCancel, EXECUTED))).toMatch(ALREADY_GONE)
    expect(rendered(failWithReceipt('cancel', undefined, EXECUTED))).toMatch(ALREADY_GONE)
    expect(rendered(failWithReceipt('cancel', nothingToCancel))).toMatch(ALREADY_GONE)
  })

  // The gone reading rests only on the attempt read or a decoded cause, never
  // on an undecoded revert: a cancel that ran out of gas while the attack runs
  // must not read that nothing is left to cancel.
  describe('a cancel revert while the attempt may still run', () => {
    const plain = (state: WriteState) => {
      expect(readingOf(state)).toBe('reverted')
      expect(rendered(state)).not.toMatch(ALREADY_GONE)
      expect(rendered(state)).toMatch(REACHED_AND_REVERTED)
      expect(rendered(state)).toMatch(GAS_GONE)
      expect(canRetry(state)).toBe(true)
      expect(rendered(state)).toMatch(/\btry again\b/i)
      expect(offersMoveFunds(state)).toBe(true)
    }

    it('an undecoded revert with no attempt read yet reads the plain revert, with retry and move funds', () => {
      plain(failWithReceipt('cancel'))
      plain(failThrown('cancel', minedAndReverted()))
    })

    it('the attempt read that says the attempt still runs keeps the plain revert', () => {
      plain(failWithReceipt('cancel', undefined, STILL_RUNNING))
      plain(failWithReceipt('cancel', nothingToCancel, STILL_RUNNING))
      const reverted = withRun(failWithReceipt('cancel'))
      const read = writeReducer(reverted, {
        type: 'attemptRead',
        run: reverted.run,
        attemptAfter: STILL_RUNNING
      })
      plain(read)
    })

    it('a decoded cause other than NoActiveAttempt or NoSetup reads the plain revert with that cause', () => {
      const state = failWithReceipt('cancel', kitError('WrongAttemptId'))
      plain(state)
      expect(rendered(state)).toContain(i18n.t(causeKey('WrongAttemptId')))
    })

    it('the attempt read that says it executed turns the plain revert into the gone attempt', () => {
      const reverted = withRun(failWithReceipt('cancel'))
      const read = writeReducer(reverted, {
        type: 'attemptRead',
        run: reverted.run,
        attemptAfter: EXECUTED
      })
      expect(rendered(read)).toMatch(ALREADY_GONE)
      expect(rendered(read).toLowerCase()).toContain(CONTROLLER.toLowerCase())
      expect(canRetry(read)).toBe(false)
    })
  })

  it('NoSetup decoded on a cancel reads the gone attempt, naming the setup write as the road', () => {
    const state = failWithReceipt('cancel', kitError('NoSetup'))
    expect(rendered(state)).toMatch(ALREADY_GONE)
    expect(copyOfState(state)).toContain(i18n.t(cancelGoneRoadKey('setupWrite')))
    expect(canRetry(state)).toBe(false)
    expect(offersMoveFunds(state)).toBe(false)
  })

  it("names the account's controller as it now stands", () => {
    const state = rendered(failWithReceipt('cancel', nothingToCancel, EXECUTED)).toLowerCase()
    expect(state).toContain(CONTROLLER.toLowerCase())
  })

  it('names no controller it guessed before the attempt read returns', () => {
    const state = rendered(failWithReceipt('cancel', nothingToCancel)).toLowerCase()
    expect(state).toMatch(ALREADY_GONE)
    expect(state).not.toContain(CONTROLLER.toLowerCase())
  })

  it('names the controller once the attempt read returns', () => {
    const before = withRun(failWithReceipt('cancel', nothingToCancel))
    const after = writeReducer(before, {
      type: 'attemptRead',
      run: before.run,
      attemptAfter: EXECUTED
    })
    expect(rendered(after).toLowerCase()).toContain(CONTROLLER.toLowerCase())
  })

  it('an error from wait() on a mined cancel reads the same', () => {
    const state = failThrown('cancel', minedAndReverted(), EXECUTED)
    expect(readingOf(state)).toBe('reverted')
    expect(rendered(state)).toMatch(ALREADY_GONE)
    expect(rendered(state).toLowerCase()).toContain(CONTROLLER.toLowerCase())
  })

  it('offers no retry, since nothing is left to cancel', () => {
    const state = failWithReceipt('cancel', nothingToCancel, EXECUTED)
    expect(rendered(state)).not.toMatch(/\btry again\b/i)
  })

  it('a cancel never sent keeps the first reading, with no attempt named gone', () => {
    const state = failBeforeHash('cancel', userRejected())
    expect(readingOf(state)).toBe('notSent')
    expect(rendered(state)).not.toMatch(ALREADY_GONE)
  })

  WRITE_KINDS.filter((w) => w !== 'cancel').forEach((write) =>
    it(`is the cancel's reading alone: a reverted ${write} names no attempt gone`, () => {
      expect(rendered(failWithReceipt(write, nothingToCancel, EXECUTED))).not.toMatch(ALREADY_GONE)
      expect(rendered(failWithReceipt(write))).not.toMatch(ALREADY_GONE)
    })
  )
})
