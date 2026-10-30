/**
 * Through the real en.json: the step names the sending key's address, the
 * amount and the network; it says a transfer out of the account the key
 * operates is itself an operation that key must pay for; the recovery call's
 * step says the execution after the waiting period is a second funding asked
 * for again at the fee of that day and promises nowhere that one funding
 * covers both; no string names a faucet; no string carries a banned word.
 *
 * The strings are the ones the two views lay out: `renderWriteState` and
 * `renderDepositStep` answer them and `WriteStateView` and `DepositStepView`
 * lay out every field (views.test.ts checks those fields one by one).
 */
import i18n from '@common/config/localization'

import {
  ACCOUNT_REF,
  ATTEMPT_ENDS,
  ATTEMPT_STILL_RUNNING,
  banHits,
  collectStrings,
  CONTROLLER,
  copyOfBlocker,
  copyOfState,
  copyOfStep,
  depositStepFor,
  failBeforeHash,
  failThrown,
  failWithReceipt,
  GAS_KEYS,
  gasReadErrorFor,
  GWEI,
  KEY,
  kitError,
  minedAndReverted,
  NETWORK,
  ONE_FUNDING_COVERS_BOTH,
  renderGasAmount,
  renderWriteState,
  replacedBy,
  STEP_CASES,
  submittingFor,
  text,
  UNRESOLVED,
  userRejected,
  WRITE_KINDS,
  WRITES_KEYS,
  WRITES_MODULE
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'

const TRANSFER_IS_AN_OPERATION =
  /\ba transfer out of the account (?:the|that) key operates is itself an operation that key must (?:send and )?pay for\b/i
const SECOND_FUNDING = /\bsecond (?:funding|transaction)\b/i
const ASKED_AGAIN = /\bagain\b/i
const FEE_OF_THAT_DAY = /\b(?:that day's fee|the fee of that day)\b/i
const CANNOT_PAY_FOR_ITSELF = /\bthe account cannot pay for itself until it is recovered\b/i
const FAUCET = /faucet/i
const LINK = /\bhttps?:\/\/|\bwww\./i

const TRANSFER_CASES = STEP_CASES.filter((c) => !c.fastTrack)
// The step before the submission says the execution is a second funding; the
// step at execution due is that second funding and does not say it again.
const SUBMISSION_CASES = STEP_CASES.filter((c) => c.write === 'submission')
const EXECUTION_CASES = STEP_CASES.filter((c) => c.write === 'execution')
const FAST_TRACK_CASES = STEP_CASES.filter((c) => c.fastTrack)

/** Every string the module renders: each variant of the step and its blocker, and every state of every write. */
const everyRenderedString = async (): Promise<string[]> => {
  const steps = await Promise.all(
    STEP_CASES.map(async ({ write, fastTrack }) => {
      const step = await depositStepFor(write, fastTrack)
      return [...copyOfStep(step), ...copyOfBlocker(step)]
    })
  )
  const states = WRITE_KINDS.flatMap((write) => [
    ...copyOfState(submittingFor(write)),
    ...copyOfState(gasReadErrorFor(write)),
    ...copyOfState(failBeforeHash(write, userRejected())),
    ...copyOfState(failThrown(write, replacedBy('cancelled'))),
    ...copyOfState(failWithReceipt(write, kitError('AttemptAlreadyActive'))),
    ...copyOfState(failWithReceipt(write, kitError('WaitNotOver'))),
    ...copyOfState(failWithReceipt(write, kitError('NotConsumable'))),
    ...copyOfState(failWithReceipt(write)),
    ...copyOfState(failThrown(write, minedAndReverted()))
  ])
  const cancels = [
    ...ATTEMPT_ENDS.flatMap((ended) =>
      copyOfState(
        failWithReceipt('cancel', kitError('NoActiveAttempt'), { ended, controller: CONTROLLER })
      )
    ),
    ...copyOfState(failWithReceipt('cancel', undefined, { ended: ATTEMPT_STILL_RUNNING })),
    ...copyOfState(failWithReceipt('cancel', kitError('NoSetup')))
  ]
  return [...steps.flat(), ...states, ...cancels]
}

describe('the deposit step, rendered through en.json', () => {
  STEP_CASES.forEach(({ name, write, fastTrack }) =>
    describe(name, () => {
      it("shows the sending key's address in full", async () => {
        const rendered = text(copyOfStep(await depositStepFor(write, fastTrack))).toLowerCase()
        expect(rendered).toContain(KEY.addr.toLowerCase())
      })

      it('shows the amount the check estimated, in the native unit', async () => {
        const step = await depositStepFor(write, fastTrack)
        expect(text(copyOfStep(step))).toContain(
          renderGasAmount(step.shortfall, NETWORK.nativeAssetSymbol)
        )
      })

      it('renders a different amount for a different estimate', async () => {
        const low = text(copyOfStep(await depositStepFor(write, fastTrack, 100_000n, GWEI)))
        const high = text(copyOfStep(await depositStepFor(write, fastTrack, 900_000n, 40n * GWEI)))
        expect(low).not.toEqual(high)
      })

      it('names the network the key must be funded on', async () => {
        expect(text(copyOfStep(await depositStepFor(write, fastTrack)))).toContain(NETWORK.name)
      })
    })
  )

  TRANSFER_CASES.forEach(({ name, write }) =>
    describe(`${name}: the two routes`, () => {
      it('says a transfer out of the account the key operates is itself an operation that key must pay for', async () => {
        expect(text(copyOfStep(await depositStepFor(write, false)))).toMatch(
          TRANSFER_IS_AN_OPERATION
        )
      })

      it('offers the transfer from the account this wallet holds and the deposit from outside', async () => {
        const rendered = text(copyOfStep(await depositStepFor(write, false)))
        expect(rendered).toMatch(new RegExp(`\\btransfer\\b.*\\b${ACCOUNT_REF.name}\\b`, 'i'))
        expect(rendered).toMatch(/\bfrom outside\b/i)
      })
    })
  )

  SUBMISSION_CASES.forEach(({ name, write, fastTrack }) =>
    describe(`${name}: the second funding`, () => {
      it('says the execution after the waiting period is a second funding', async () => {
        const rendered = text(copyOfStep(await depositStepFor(write, fastTrack)))
        expect(rendered).toMatch(SECOND_FUNDING)
        expect(rendered).toMatch(/\bwaiting period\b/i)
      })

      it('says the wallet asks for it again at the fee of that day', async () => {
        const rendered = text(copyOfStep(await depositStepFor(write, fastTrack)))
        expect(rendered).toMatch(ASKED_AGAIN)
        expect(rendered).toMatch(FEE_OF_THAT_DAY)
      })
    })
  )

  EXECUTION_CASES.forEach(({ name, write, fastTrack }) =>
    describe(`${name}: the step is the second funding itself`, () => {
      it('does not say again that the execution is a second funding', async () => {
        const lines = copyOfStep(await depositStepFor(write, fastTrack))
        expect(lines).not.toContain(i18n.t(GAS_KEYS.secondFunding))
        expect(text(lines)).not.toMatch(SECOND_FUNDING)
      })
    })
  )

  it('on the fast track at execution due, the amount is a minimum with room for the fee to rise', async () => {
    const rendered = text(copyOfStep(await depositStepFor('execution', true)))
    expect(rendered).toMatch(/\bsend at least\b/i)
    expect(rendered).toMatch(/\bnetwork fee to rise before you execute\b/i)
  })

  it('on the fast track before the submission, the amount is a minimum with room for the fee to rise', async () => {
    const rendered = text(copyOfStep(await depositStepFor('submission', true)))
    expect(rendered).toMatch(/\bsend at least\b/i)
    expect(rendered).toMatch(/\bnetwork fee to rise before you submit\b/i)
  })

  FAST_TRACK_CASES.forEach(({ name, write }) =>
    describe(name, () => {
      it('names the key as the sending key', async () => {
        expect(text(copyOfStep(await depositStepFor(write, true)))).toMatch(
          /\bthe key that sends\b/i
        )
      })

      it('says the account cannot pay for itself until it is recovered', async () => {
        expect(text(copyOfStep(await depositStepFor(write, true)))).toMatch(CANNOT_PAY_FOR_ITSELF)
      })
    })
  )
})

describe('the not-sent line, rendered through en.json', () => {
  const NOTHING_CHANGED =
    'The transaction was rejected before it reached the chain. Nothing changed.'
  const linesOf = (write: Parameters<typeof failBeforeHash>[0], error: unknown) =>
    renderWriteState(failThrown(write, error)).lines

  it("the editor's save rejected in the sign window says the edits are still here", () => {
    expect(linesOf('edit', userRejected())).toEqual([
      `${NOTHING_CHANGED} Your edits are still here.`
    ])
  })

  it('the setup save and the removal keep the plain line', () => {
    expect(linesOf('save', userRejected())).toEqual([NOTHING_CHANGED])
    expect(linesOf('ownerWrite', userRejected())).toEqual([NOTHING_CHANGED])
  })

  it("only the editor's save reads the edits line; every other write reads the plain line", () => {
    WRITE_KINDS.forEach((write) => {
      expect({ write, lines: linesOf(write, userRejected()) }).toEqual({
        write,
        lines: [i18n.t(write === 'edit' ? WRITES_KEYS.notSentEdit : WRITES_KEYS.notSent)]
      })
    })
  })

  it("a replaced transaction of the editor's save keeps the replaced line", () => {
    const replaced = renderWriteState(failThrown('save', replacedBy('cancelled'))).lines
    expect(replaced).toHaveLength(1)
    expect(replaced[0]).not.toBe(NOTHING_CHANGED)
    expect(linesOf('edit', replacedBy('cancelled'))).toEqual(replaced)
  })
})

describe('what no string of the module says', () => {
  it('no rendered string contains faucet or a link', async () => {
    const strings = await everyRenderedString()
    expect(strings.length).toBeGreaterThan(50)
    expect(strings.filter((s) => FAUCET.test(s))).toEqual([])
    expect(strings.filter((s) => LINK.test(s))).toEqual([])
  })

  it('no rendered string says one funding covers both', async () => {
    const strings = await everyRenderedString()
    expect(strings.filter((s) => ONE_FUNDING_COVERS_BOTH.test(s))).toEqual([])
  })

  it('no rendered string carries a banned word', async () => {
    expect(banHits(await everyRenderedString())).toEqual([])
  })

  it('no exported string of the module names a faucet, promises one funding or carries a banned word', () => {
    const exported = collectStrings(WRITES_MODULE)
    expect(exported).toEqual(expect.arrayContaining(['submitting', 'failedNotSent']))
    expect(exported.filter((s) => FAUCET.test(s))).toEqual([])
    expect(exported.filter((s) => ONE_FUNDING_COVERS_BOTH.test(s))).toEqual([])
    expect(banHits(exported)).toEqual([])
  })

  it('every rendered string resolves in en.json: no raw key and no unfilled placeholder', async () => {
    const unresolved = Array.from(
      new Set((await everyRenderedString()).filter((s) => UNRESOLVED.test(s)))
    ).sort()
    expect(unresolved).toEqual([])
  })
})
