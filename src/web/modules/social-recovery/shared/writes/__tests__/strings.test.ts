/**
 * Every sentence the states and the step read is a key of
 * `socialRecovery.writes` in en.json, and each write reads its own.
 *
 * - Every kit error has a cause sentence, and the reverted reading carries it:
 *   the wallet writes the string the screen renders.
 * - Each write reads its own reverted sentence: the save, the edit, the
 *   submission and the execution their own, any other owner write the generic
 *   one.
 * - A reverted cancel reads the gone attempt and names the road that ended
 *   it, or the controller after an execution.
 * - The deposit step's lines: on the logged-in route the key of the chosen
 *   account and that the account holds the funds; an owner write's network
 *   line; on the fast track the sending key pays and, at execution due, the
 *   execution's own amount.
 * - `edit`, the management editor's save, is an owner write.
 */
import i18n from '@common/config/localization'
import en from '@common/config/localization/translations/en.json'
import { KIT_ERROR_NAMES, type KitErrorName } from '@web/modules/social-recovery/sdk-interfaces'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'

import {
  ACCOUNT_REF,
  assertWriteDoor,
  ATTEMPT_ENDS,
  cancelGoneRoadKey,
  causeKey,
  CONTROLLER,
  copyOfState,
  copyOfStep,
  depositStepFor,
  failWithReceipt,
  isOwnerWrite,
  kitError,
  NETWORK,
  offersMoveFunds,
  payerOf,
  REVERTED_KEYS,
  renderGasAmount,
  renderRevertCause,
  renderDepositStep,
  runGasCheck,
  mockReads,
  SAVE,
  stepOf,
  SUBMISSION,
  text,
  UNNAMED_CAUSE_KEY,
  UNRESOLVED,
  WRITE_KINDS,
  WriteKind,
  WRITES_KEYS,
  GAS_KEYS
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'

/** The value at a dotted key of en.json, or undefined. */
const lookup = (key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      en
    )

const resolves = (key: string) => ({ key, isString: typeof lookup(key) === 'string' })

const ROADS = ATTEMPT_ENDS.filter(
  (end): end is Exclude<typeof end, 'executed'> => end !== 'executed'
)

describe('the cause of a revert', () => {
  it('every kit error has a cause sentence in en.json, and so has the unnamed revert', () => {
    expect(KIT_ERROR_NAMES.length).toBeGreaterThan(0)
    KIT_ERROR_NAMES.forEach((name) =>
      expect(resolves(causeKey(name))).toEqual({ key: causeKey(name), isString: true })
    )
    expect(resolves(UNNAMED_CAUSE_KEY)).toEqual({ key: UNNAMED_CAUSE_KEY, isString: true })
  })

  it('the cause sentences are distinct: each kit error is named in its own words', () => {
    const sentences = KIT_ERROR_NAMES.map((name) => i18n.t(causeKey(name)))
    expect(new Set(sentences).size).toBe(KIT_ERROR_NAMES.length)
    expect(sentences).not.toContain(i18n.t(UNNAMED_CAUSE_KEY))
  })

  WRITE_KINDS.filter((w) => w !== 'cancel').forEach((write) =>
    it(`${write}: the rendered reverted reading carries the sentence of every kit error`, () => {
      expect(KIT_ERROR_NAMES.length).toBeGreaterThan(0)
      KIT_ERROR_NAMES.forEach((name) => {
        const reading = text(copyOfState(failWithReceipt(write, kitError(name))))
        const sentence = String(lookup(causeKey(name)))
        expect({ name, carries: reading.includes(sentence) }).toEqual({ name, carries: true })
        expect({ name, unresolved: UNRESOLVED.test(reading) }).toEqual({
          name,
          unresolved: false
        })
      })
      const unnamed = text(copyOfState(failWithReceipt(write)))
      expect(unnamed).toContain(String(lookup(UNNAMED_CAUSE_KEY)))
    })
  )

  it('a cause the wallet decoded as unknown reads the unnamed sentence', () => {
    expect(renderRevertCause({ kind: 'unnamed', data: '0xdeadbeef' })).toBe(
      i18n.t(UNNAMED_CAUSE_KEY)
    )
  })
})

describe('each write reads its own reverted sentence', () => {
  // The execution reads that the recovery is still ready only for a cause
  // that leaves the attempt ready, and revertedExecuteGone otherwise.
  const OWN: [WriteKind, string, KitErrorName][] = [
    ['save', 'revertedSave', 'WrongSetupNonce'],
    ['edit', 'revertedEdit', 'WrongSetupNonce'],
    ['submission', 'revertedSubmit', 'WrongSetupNonce'],
    ['execution', 'revertedExecute', 'WaitNotOver'],
    ['execution', 'revertedExecuteGone', 'WrongSetupNonce'],
    ['ownerWrite', 'reverted', 'WrongSetupNonce']
  ]

  it('maps every write to a reverted key en.json holds', () => {
    WRITE_KINDS.forEach((write) =>
      expect(resolves(REVERTED_KEYS[write])).toEqual({ key: REVERTED_KEYS[write], isString: true })
    )
  })

  OWN.forEach(([write, key, name]) =>
    it(`${write} with ${name} renders socialRecovery.writes.${key} with the cause in its slot`, () => {
      const expected = i18n.t(`socialRecovery.writes.${key}`, {
        cause: i18n.t(causeKey(name))
      })
      expect(copyOfState(failWithReceipt(write, kitError(name)))).toContain(expected)
    })
  )

  it('the save, the edit, the submission and the execution each read words the others do not', () => {
    const readings = ['save', 'edit', 'submission', 'execution'].map((write) =>
      text(copyOfState(failWithReceipt(write as typeof WRITE_KINDS[number])))
    )
    expect(new Set(readings).size).toBe(4)
  })

  it('a cancel whose decoded cause names another kit error reads the generic sentence with that cause', () => {
    const state = failWithReceipt('cancel', kitError('WrongSetupNonce'))
    expect(copyOfState(state)).toContain(
      i18n.t(WRITES_KEYS.reverted, { cause: i18n.t(causeKey('WrongSetupNonce')) })
    )
  })
})

describe('the reverted cancel names the road that ended the attempt', () => {
  it('has a sentence in en.json for every road', () => {
    ROADS.forEach((road) =>
      expect(resolves(cancelGoneRoadKey(road))).toEqual({
        key: cancelGoneRoadKey(road),
        isString: true
      })
    )
  })

  ROADS.forEach((road) =>
    it(`${road}: reads the gone attempt and names the road, with control unchanged and no move-funds action`, () => {
      const state = failWithReceipt('cancel', kitError('NoActiveAttempt'), {
        ended: road,
        controller: CONTROLLER
      })
      const rendered = copyOfState(state)
      expect(rendered).toContain(i18n.t(WRITES_KEYS.cancelRevertedTitle))
      expect(rendered).toContain(i18n.t(WRITES_KEYS.cancelReverted))
      expect(rendered).toContain(i18n.t(cancelGoneRoadKey(road)))
      expect(text(rendered).toLowerCase()).not.toContain(CONTROLLER.toLowerCase())
      expect(offersMoveFunds(state)).toBe(false)
    })
  )

  it('executed: reads the gone attempt and names the controller in full, with the move-funds action', () => {
    const state = failWithReceipt('cancel', kitError('NoActiveAttempt'), {
      ended: 'executed',
      controller: CONTROLLER
    })
    const rendered = copyOfState(state)
    expect(rendered).toContain(i18n.t(WRITES_KEYS.cancelReverted))
    expect(rendered).toContain(i18n.t(WRITES_KEYS.nowControlledBy))
    expect(rendered).toContain(renderFullAddress(CONTROLLER))
    ROADS.forEach((road) => expect(rendered).not.toContain(i18n.t(cancelGoneRoadKey(road))))
    expect(offersMoveFunds(state)).toBe(true)
  })
})

describe('the deposit step reads its registered lines', () => {
  it('holds every gas key the step reads in en.json', () => {
    Object.values(GAS_KEYS).forEach((key) => expect(resolves(key)).toEqual({ key, isString: true }))
    Object.values(WRITES_KEYS).forEach((key) =>
      expect(resolves(key)).toEqual({ key, isString: true })
    )
  })
  ;(['submission', 'execution'] as const).forEach((write) =>
    describe(`${write} on the logged-in route`, () => {
      it('names the key of the chosen account (keyOf)', async () => {
        const step = renderDepositStep(await depositStepFor(write, false))
        expect(step.keyLabel).toBe(i18n.t(GAS_KEYS.keyOf, { account: ACCOUNT_REF.name }))
      })

      it('says the account holds the funds and its key sends (accountHoldsFunds)', async () => {
        expect(copyOfStep(await depositStepFor(write, false))).toContain(
          i18n.t(GAS_KEYS.accountHoldsFunds)
        )
      })
    })
  )
  ;(['save', 'edit', 'ownerWrite', 'cancel'] as const).forEach((write) =>
    it(`${write}: names the network of this account (networkOwner)`, async () => {
      expect(copyOfStep(await depositStepFor(write, false))).toContain(
        i18n.t(GAS_KEYS.networkOwner, { network: NETWORK.name })
      )
    })
  )

  it('the fast track says the sending key pays and the account cannot pay for itself (sendingKeyPays)', async () => {
    const steps = await Promise.all(
      (['submission', 'execution'] as const).map(async (write) =>
        renderDepositStep(await depositStepFor(write, true))
      )
    )
    steps.forEach((step) => {
      expect(step.lead).toEqual([i18n.t(GAS_KEYS.sendingKeyPays)])
      expect(step.keyLabel).toBe(i18n.t(GAS_KEYS.sendingKey))
    })
  })

  it('the fast track at execution due asks for the execution amount (executionAmount)', async () => {
    const step = await depositStepFor('execution', true)
    const amount = renderGasAmount(step.shortfall, NETWORK.nativeAssetSymbol)
    const lines = copyOfStep(step)
    expect(lines).toContain(i18n.t(GAS_KEYS.executionAmount, { amount }))
    expect(lines).not.toContain(i18n.t(GAS_KEYS.submissionAmount, { amount }))
  })

  it('the fast track before submission asks for the submission amount', async () => {
    const step = await depositStepFor('submission', true)
    const amount = renderGasAmount(step.shortfall, NETWORK.nativeAssetSymbol)
    expect(copyOfStep(step)).toContain(i18n.t(GAS_KEYS.submissionAmount, { amount }))
  })

  it("the execution's blocker reads its own line (shortfallExecute), the submission's its own", async () => {
    const execution = renderDepositStep(await depositStepFor('execution', false))
    const submission = renderDepositStep(await depositStepFor('submission', false))
    expect(execution.blocker.line).toBe(i18n.t(GAS_KEYS.shortfallExecute))
    expect(submission.blocker.line).toBe(i18n.t(GAS_KEYS.shortfallSubmit))
  })
})

describe("edit, the management editor's save, is an owner write", () => {
  it('is an owner write, paid by the account key', () => {
    expect(isOwnerWrite('edit')).toBe(true)
    expect(payerOf('edit')).toBe('accountKey')
  })

  it('comes through the account door: a batch or an account call, never a call anyone may send', () => {
    expect(() => assertWriteDoor('edit', SAVE)).not.toThrow()
    expect(() => assertWriteDoor('edit', SUBMISSION)).toThrow(TypeError)
  })

  it("its gas step is the owner write's: the account key's blocker, both routes and the transfer sentence", async () => {
    const step = stepOf(
      await runGasCheck({ write: 'edit', reads: mockReads({ balance: 0n, gas: 200_000n }) })
    )
    expect(step.payer).toBe('accountKey')
    expect(step.routes.map((route) => route.kind).sort()).toEqual(['outside', 'transfer'])
    const rendered = renderDepositStep(step)
    expect(rendered.title).toBe(i18n.t(GAS_KEYS.notEnoughGasAccountKey))
    expect(rendered.notes).toContain(i18n.t(GAS_KEYS.transferIsAnOperation))
    expect(rendered.notes).not.toContain(i18n.t(GAS_KEYS.secondFunding))
  })
})
