/**
 * What the two views show: `WriteStateView` and `DepositStepView` lay out what
 * `renderWriteState` and `renderDepositStep` answer, since the rules live in
 * the functions. This file checks that answer, the rendered output, state by
 * state and variant by variant, through the real en.json. It also checks that
 * no view source opens a link (the step renders no faucet link), since a link
 * a view added would bypass the renderers.
 *
 * The views are not mounted here. The deposit step keeps one state of its own,
 * the result of copying the key's address, which deposit-step-copy.test.ts
 * checks on the mounted view.
 */
import fs from 'fs'
import path from 'path'

import i18n from '@common/config/localization'
import { renderChip } from '@web/modules/social-recovery/shared/display'

import {
  ACCOUNT_REF,
  CONTROLLER,
  depositStepFor,
  failBeforeHash,
  failWithReceipt,
  GAS_KEYS,
  gasReadErrorFor,
  initialWriteState,
  KEY,
  kitError,
  landWithReceipt,
  NETWORK,
  renderDepositStep,
  renderGasAmount,
  renderGasBalance,
  renderWriteState,
  STEP_CASES,
  submittingFor,
  userRejected,
  WRITE_KINDS,
  writeReducer,
  WRITES_KEYS
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'

const t = i18n.t
const LINK = /\bhttps?:\/\/|\bwww\.|faucet/i
const VIEWS = path.resolve(__dirname, '..', 'components')

describe('WriteStateView: what renderWriteState answers', () => {
  WRITE_KINDS.forEach((write) =>
    describe(write, () => {
      it('the submitting state: the in-progress chip, its title, the sending line, no retry', () => {
        const r = renderWriteState(submittingFor(write))
        expect(r.status).toBe('submitting')
        expect(r.chip).toBe(renderChip('method', 'inProgress'))
        expect(r.title).toBe(
          t(write === 'submission' ? WRITES_KEYS.submittingRecovery : WRITES_KEYS.submitting)
        )
        expect(r.lines).toEqual([t(WRITES_KEYS.submittingBody)])
        expect(r.retry).toBeUndefined()
        expect(r.controller).toBeUndefined()
      })

      it('the not-sent reading: its one line and the retry', () => {
        const r = renderWriteState(failBeforeHash(write, userRejected()))
        expect(r.lines).toEqual([t(WRITES_KEYS.notSent)])
        expect(r.retry).toBe(t(WRITES_KEYS.tryAgain))
        expect(r.chip).toBeUndefined()
        expect(r.offersMoveFunds).toBe(write === 'cancel')
      })

      it('a failed gas read: the gasCheckFailed line and the retry', () => {
        const r = renderWriteState(gasReadErrorFor(write))
        expect(r.lines).toEqual([t(WRITES_KEYS.gasCheckFailed)])
        expect(r.retry).toBe(t(WRITES_KEYS.tryAgain))
      })

      it('the states that carry no copy of this module render nothing', () => {
        const idle = initialWriteState(write)
        const checking = writeReducer(idle, { type: 'start' })
        ;[idle, checking, landWithReceipt(write)].forEach((state) => {
          const r = renderWriteState(state)
          expect({ status: r.status, lines: r.lines, retry: r.retry, title: r.title }).toEqual({
            status: state.status,
            lines: [],
            retry: undefined,
            title: undefined
          })
        })
      })
    })
  )

  it('the reverted reading: one line with the cause in it, the retry where a retry can fix it', () => {
    const fixable = renderWriteState(failWithReceipt('save', kitError('WrongSetupNonce')))
    expect(fixable.lines).toHaveLength(1)
    expect(fixable.lines[0]).toContain(t('socialRecovery.writes.causes.WrongSetupNonce'))
    expect(fixable.retry).toBe(t(WRITES_KEYS.tryAgain))

    const unfixable = renderWriteState(failWithReceipt('save', kitError('InvalidCommitment')))
    expect(unfixable.retry).toBeUndefined()
  })

  it('the reverted cancel after an execution: its title, the gone attempt, the controller in full, move funds, no retry', () => {
    const r = renderWriteState(
      failWithReceipt('cancel', kitError('NoActiveAttempt'), {
        ended: 'executed',
        controller: CONTROLLER
      })
    )
    expect(r.title).toBe(t(WRITES_KEYS.cancelRevertedTitle))
    expect(r.lines).toEqual([t(WRITES_KEYS.cancelReverted)])
    expect(r.controller?.label).toBe(t(WRITES_KEYS.nowControlledBy))
    expect(r.controller?.address.toLowerCase()).toBe(CONTROLLER.toLowerCase())
    expect(r.offersMoveFunds).toBe(true)
    expect(r.retry).toBeUndefined()
  })

  it('no state renders a link', () => {
    const states = WRITE_KINDS.flatMap((write) => [
      submittingFor(write),
      gasReadErrorFor(write),
      failBeforeHash(write, userRejected()),
      failWithReceipt(write)
    ])
    states.forEach((state) => {
      const r = renderWriteState(state)
      ;[r.chip, r.title, ...r.lines, r.retry].forEach((s) => expect(s ?? '').not.toMatch(LINK))
    })
  })
})

describe('DepositStepView: what renderDepositStep answers', () => {
  ;(['save', 'edit', 'ownerWrite', 'cancel'] as const).forEach((write) =>
    it(`${write}: the account key's blocker, the key in full, both routes, the transfer sentence and the network`, async () => {
      const step = await depositStepFor(write, false)
      const r = renderDepositStep(step)
      expect(r.title).toBe(t(GAS_KEYS.notEnoughGasAccountKey))
      expect(r.eyebrow).toBe(write === 'save' ? t(GAS_KEYS.notEnoughGas) : undefined)
      expect(r.keyAddress.toLowerCase()).toBe(KEY.addr.toLowerCase())
      expect(r.copyLabel).toBe(t(GAS_KEYS.copy))
      expect(r.routes.map((route) => route.kind)).toEqual(['transfer', 'outside'])
      expect(r.notes).toEqual([
        t(GAS_KEYS.transferIsAnOperation),
        t(GAS_KEYS.networkOwner, { network: NETWORK.name })
      ])
      expect(r.waiting).toEqual([])
      expect(r.actionHint).toBeUndefined()
      expect(r.blocker.title).toBe(r.title)
      expect(r.blocker.line).toBe(r.lead[0])
    })
  )

  STEP_CASES.filter((c) => c.write === 'submission' || c.write === 'execution').forEach(
    ({ name, write, fastTrack }) =>
      it(`${name}: the title, the key, the routes, the notes in order and the waiting lines`, async () => {
        const step = await depositStepFor(write, fastTrack)
        const r = renderDepositStep(step)
        expect(r.title).toBe(t(GAS_KEYS.fundTitle))
        expect(r.lead).toEqual([
          t(fastTrack ? GAS_KEYS.sendingKeyPays : GAS_KEYS.accountHoldsFunds)
        ])
        expect(r.keyLabel).toBe(
          fastTrack ? t(GAS_KEYS.sendingKey) : t(GAS_KEYS.keyOf, { account: ACCOUNT_REF.name })
        )
        expect(r.keyAddress.toLowerCase()).toBe(KEY.addr.toLowerCase())
        expect(r.routes.map((route) => route.kind)).toEqual(
          fastTrack ? ['outside'] : ['transfer', 'outside']
        )
        expect(r.notes).toEqual([
          ...(fastTrack ? [] : [t(GAS_KEYS.transferIsAnOperation)]),
          ...(write === 'submission' ? [t(GAS_KEYS.secondFunding)] : []),
          t(GAS_KEYS.network, { network: NETWORK.name })
        ])
        expect(r.waiting).toEqual([
          t(GAS_KEYS.balanceWaiting, {
            balance: renderGasBalance(step.balance, NETWORK.nativeAssetSymbol)
          }),
          t(GAS_KEYS.continuesOnItsOwn),
          t(GAS_KEYS.alreadyFunded)
        ])
        expect(r.actionHint).toBe(t(GAS_KEYS.continueUnlocks))
        expect(r.blocker).toEqual({
          title: t(GAS_KEYS.notEnoughGasSendingKey),
          line: t(write === 'execution' ? GAS_KEYS.shortfallExecute : GAS_KEYS.shortfallSubmit)
        })
      })
  )

  it("each route shows its own amount: the transfer's with its fee, the deposit from outside the shortfall", async () => {
    const step = await depositStepFor('submission', false)
    const r = renderDepositStep(step)
    step.routes.forEach((route, i) => {
      expect(r.routes[i].kind).toBe(route.kind)
      expect(r.routes[i].line).toContain(renderGasAmount(route.amount, NETWORK.nativeAssetSymbol))
    })
    const transfer = r.routes.find((route) => route.kind === 'transfer')
    expect(transfer?.line).toContain(ACCOUNT_REF.name)
    expect(transfer?.note).toBe(t(GAS_KEYS.transferRouteNote))
  })

  it('the waiting line shows the latest balance the screen polled', async () => {
    const step = await depositStepFor('submission', true)
    const r = renderDepositStep(step, { balance: 5n * 10n ** 15n })
    expect(r.waiting[0]).toBe(
      t(GAS_KEYS.balanceWaiting, {
        balance: renderGasBalance(5n * 10n ** 15n, NETWORK.nativeAssetSymbol)
      })
    )
  })

  it('no field of any variant renders a link or a faucet', async () => {
    const steps = await Promise.all(
      STEP_CASES.map(({ write, fastTrack }) => depositStepFor(write, fastTrack))
    )
    steps.forEach((step) => {
      const r = renderDepositStep(step)
      ;[
        r.eyebrow,
        r.title,
        ...r.lead,
        r.keyLabel,
        r.keyAddress,
        r.copyLabel,
        r.copyFailed,
        ...r.routes.flatMap((route) => [route.line, route.note]),
        ...r.notes,
        ...r.waiting,
        r.actionHint,
        r.blocker.title,
        r.blocker.line
      ].forEach((s) => expect(s ?? '').not.toMatch(LINK))
    })
  })
})

describe('no view opens a link', () => {
  const viewFiles = fs.readdirSync(VIEWS).filter((file) => /\.tsx$/.test(file))

  it('scans every view in the folder, the write state view and the deposit step view among them', () => {
    expect(viewFiles).toEqual(expect.arrayContaining(['DepositStepView.tsx', 'WriteStateView.tsx']))
  })

  viewFiles.forEach((file) =>
    it(`${file} calls no Linking, sets no href and names no faucet`, () => {
      const source = fs.readFileSync(path.join(VIEWS, file), 'utf8')
      expect(source).not.toMatch(/\bLinking\b/)
      expect(source).not.toMatch(/\bhref\b/)
      expect(source).not.toMatch(/\bopenURL\b|\bwindow\.open\b|\bhttps?:\/\//)
      expect(source).not.toMatch(/faucet/i)
    })
  )
})
