/**
 * The deposit step says its amount is a minimum. On an owner write every line
 * that names an amount reads "at least" before it, and a note under the
 * amounts says the network fee can change before the send. The recovery calls
 * keep their own lines and carry no such note. The strings come from en.json
 * through the app's i18next.
 */
import en from '@common/config/localization/translations/en.json'
import i18n from '@common/config/localization'
import {
  ACCOUNT_REF,
  depositStepFor,
  depositStepOf,
  GAS_KEYS,
  gasEstimateOf,
  GWEI,
  KEY,
  NETWORK,
  OWNER_WRITES,
  RECOVERY_CALLS,
  renderDepositStep,
  renderGasAmount
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'
import type { DepositStep } from '@web/modules/social-recovery/shared/writes/__tests__/harness'

const { t } = i18n
const NOTE = t(GAS_KEYS.feeMayChange)
const amountOf = (wei: bigint) => renderGasAmount(wei, NETWORK.nativeAssetSymbol)

/** An owner write's step where the transfer could not be priced: the deposit from outside alone. */
const outsideAloneStep = (write: typeof OWNER_WRITES[number]): DepositStep =>
  depositStepOf({
    write,
    key: KEY.addr,
    network: NETWORK,
    estimate: gasEstimateOf(240_000n, 2n * GWEI),
    balance: 0n,
    operates: ACCOUNT_REF
  })

describe('the strings that name an amount to send', () => {
  const gas = en.socialRecovery.writes.gas
  ;(
    [
      ['shortfall', gas.shortfall],
      ['shortfallSave', gas.shortfallSave],
      ['transferRoute', gas.transferRoute],
      ['outsideRoute', gas.outsideRoute],
      ['outsideRouteAlone', gas.outsideRouteAlone],
      ['submissionAmount', gas.submissionAmount],
      ['executionAmount', gas.executionAmount]
    ] as const
  ).forEach(([key, text]) =>
    it(`${key} reads "at least" before the amount`, () => {
      expect(text).toContain('at least {{amount}}')
    })
  )

  it('the note says the fee can change before the send', () => {
    expect(NOTE).toBe(gas.feeMayChange)
    expect(NOTE).toContain('can change before the send')
  })
})

describe('an owner write', () => {
  OWNER_WRITES.forEach((write) =>
    describe(write, () => {
      it('with both routes: each route line reads "at least" its own amount, and the note comes first', async () => {
        const step = await depositStepFor(write, false)
        const rendered = renderDepositStep(step, {}, t)

        expect(rendered.routes.map((route) => route.kind)).toEqual(['transfer', 'outside'])
        step.routes.forEach((route, index) =>
          expect(rendered.routes[index].line).toContain(`at least ${amountOf(route.amount)}`)
        )
        expect(rendered.notes[0]).toBe(NOTE)
        expect(rendered.notes.filter((note) => note === NOTE)).toHaveLength(1)
      })

      it('with the deposit from outside alone: its line reads "at least" the shortfall, and the note stays', () => {
        const step = outsideAloneStep(write)
        const rendered = renderDepositStep(step, {}, t)

        expect(rendered.routes).toHaveLength(1)
        expect(rendered.routes[0].line).toBe(
          t(GAS_KEYS.outsideRouteAlone, { amount: amountOf(step.shortfall) })
        )
        expect(rendered.routes[0].line).toContain(`at least ${amountOf(step.shortfall)}`)
        expect(rendered.notes[0]).toBe(NOTE)
      })
    })
  )
  ;(['save', 'edit', 'ownerWrite'] as const).forEach((write) =>
    it(`${write}: the shortfall line reads "at least" the shortfall`, async () => {
      const step = await depositStepFor(write, false)
      const rendered = renderDepositStep(step, {}, t)
      expect(rendered.lead[0]).toContain(`at least ${amountOf(step.shortfall)}`)
      expect(rendered.blocker.line).toContain(`at least ${amountOf(step.shortfall)}`)
    })
  )
})

describe('a recovery call', () => {
  RECOVERY_CALLS.forEach((write) => {
    it(`${write} on the logged-in route: the route lines read "at least", with no note on the fee`, async () => {
      const step = await depositStepFor(write, false)
      const rendered = renderDepositStep(step, {}, t)

      step.routes.forEach((route, index) =>
        expect(rendered.routes[index].line).toContain(`at least ${amountOf(route.amount)}`)
      )
      expect(rendered.notes).not.toContain(NOTE)
    })

    it(`${write} on the fast track: the amount line reads "at least" the shortfall and leaves room for the fee to rise`, async () => {
      const step = await depositStepFor(write, true)
      const rendered = renderDepositStep(step, {}, t)
      const key = write === 'execution' ? GAS_KEYS.executionAmount : GAS_KEYS.submissionAmount

      expect(rendered.routes).toHaveLength(1)
      expect(rendered.routes[0].line).toBe(t(key, { amount: amountOf(step.shortfall) }))
      expect(rendered.routes[0].line).toContain(`at least ${amountOf(step.shortfall)}`)
      expect(rendered.routes[0].line).not.toMatch(/\bat most\b/i)
      expect(rendered.routes[0].line).toMatch(
        write === 'execution'
          ? /\bfee to rise before you execute\.$/
          : /\bfee to rise before you submit\.$/
      )
    })

    it(`${write} on the logged-in route with the deposit from outside alone: the same minimum line`, () => {
      const step = depositStepOf({
        write,
        key: KEY.addr,
        network: NETWORK,
        estimate: gasEstimateOf(240_000n, 2n * GWEI),
        balance: 0n,
        operates: ACCOUNT_REF
      })
      const rendered = renderDepositStep(step, {}, t)

      expect(rendered.routes).toHaveLength(1)
      expect(rendered.routes[0].line).toContain(`at least ${amountOf(step.shortfall)}`)
      expect(rendered.routes[0].line).not.toMatch(/\bat most\b/i)
      expect(rendered.notes).not.toContain(NOTE)
    })

    it(`${write} on the fast track: no note on the fee`, async () => {
      const rendered = renderDepositStep(await depositStepFor(write, true), {}, t)
      expect(rendered.notes).not.toContain(NOTE)
      expect([...rendered.lead, ...rendered.waiting]).not.toContain(NOTE)
    })
  })
})
