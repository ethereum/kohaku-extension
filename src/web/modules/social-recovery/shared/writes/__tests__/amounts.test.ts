/**
 * The native amounts the deposit step shows are ether, where one ether is
 * 10^18 wei: a known amount in wei renders as the screen shows it. The step
 * keeps six digits after the point: an amount to send rounds up, so what the
 * step shows covers it, and a balance rounds down, so the step never shows
 * more than the key holds. The strings come from en.json through the app's
 * i18next.
 */
import i18n from '@common/config/localization'

import {
  GAS_KEYS,
  GWEI,
  mockReads,
  NETWORK,
  renderDepositStep,
  renderGasAmount,
  renderGasBalance,
  runGasCheck,
  stepOf
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'

const ONE_AND_A_HALF_ETHER = 1_500_000_000_000_000_000n
const { nativeAssetSymbol: ETH } = NETWORK

/** A check whose estimate with its headroom asks for 0.0015 ETH: 250,000 gas at 5 gwei, plus 20%. */
const reads = (balance = 0n) => mockReads({ balance, gas: 250_000n, price: 5n * GWEI })

describe('the amount to send and the balance, in ether', () => {
  it('1.5 ether to send renders 1.50 with the native symbol', () => {
    expect(renderGasAmount(ONE_AND_A_HALF_ETHER, ETH)).toBe('1.50 ETH')
  })

  it('1.5 ether held renders 1.50 with the native symbol', () => {
    expect(renderGasBalance(ONE_AND_A_HALF_ETHER, ETH)).toBe('1.50 ETH')
  })

  it('one wei past 1.5 ether to send rounds up to the next millionth of an ether', () => {
    expect(renderGasAmount(ONE_AND_A_HALF_ETHER + 1n, ETH)).toBe('1.500001 ETH')
  })

  it('a balance just short of the next millionth of an ether rounds down', () => {
    expect(renderGasBalance(ONE_AND_A_HALF_ETHER + 999_999_999_999n, ETH)).toBe('1.50 ETH')
    expect(renderGasBalance(12_345_678_901_234_567n, ETH)).toBe('0.012345 ETH')
  })

  it('one gwei to send renders the smallest amount the step shows', () => {
    expect(renderGasAmount(GWEI, ETH)).toBe('0.000001 ETH')
  })
})

describe('the deposit step shows its amounts in ether', () => {
  it('the fast track: the amount to send from outside reads 0.0015 ETH', async () => {
    const step = stepOf(await runGasCheck({ write: 'submission', fastTrack: true, reads: reads() }))
    const rendered = renderDepositStep(step, {}, i18n.t)
    expect(rendered.routes.map((route) => route.line)).toEqual([
      i18n.t(GAS_KEYS.submissionAmount, { amount: '0.0015 ETH' })
    ])
  })

  it('a save: the shortfall reads 0.0015 ETH, and the transfer adds its own fee', async () => {
    const step = stepOf(await runGasCheck({ write: 'save', reads: reads() }))
    const rendered = renderDepositStep(step, {}, i18n.t)
    expect(rendered.lead).toEqual([i18n.t(GAS_KEYS.shortfallSave, { amount: '0.0015 ETH' })])
    // The transfer's own 284,000 gas at 5 gwei, plus 20%, is 0.001704 ETH.
    expect(rendered.routes.map((route) => route.line)).toEqual([
      i18n.t(GAS_KEYS.transferRoute, {
        amount: '0.003204 ETH',
        account: step.operates?.name
      }),
      i18n.t(GAS_KEYS.outsideRoute, { amount: '0.0015 ETH' })
    ])
  })

  it('a key that holds some: the balance rounds down and the amount it lacks rounds up', async () => {
    const balance = 1_234_567_890_123_456n
    const step = stepOf(await runGasCheck({ write: 'submission', reads: reads(balance) }))
    const rendered = renderDepositStep(step, {}, i18n.t)
    expect(rendered.waiting[0]).toBe(i18n.t(GAS_KEYS.balanceWaiting, { balance: '0.001234 ETH' }))
    expect(rendered.routes.find((route) => route.kind === 'outside')?.line).toBe(
      i18n.t(GAS_KEYS.outsideRoute, { amount: '0.000266 ETH' })
    )
  })
})
