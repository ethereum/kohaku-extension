import { getAddress } from 'viem'

import {
  FeeSpeed,
  SignAccountOpController,
  SpeedCalc
} from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { FeePaymentOption } from '@ambire-common/libs/estimate/interfaces'
import { TokenResult } from '@ambire-common/libs/portfolio/interfaces'
import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'
import {
  getDefaultFeeOption,
  isFeeSpeedDisabled,
  mapFeeOptions,
  sortFeeOptions
} from '@web/modules/sign-account-op/components/Estimation/helpers'

// The row view reaches the browser and the theme, which the node environment has not.
jest.mock('@web/modules/sign-account-op/components/Estimation/components/PayOption', () => ({
  __esModule: true,
  default: () => null
}))

const SMART_ACCOUNT = getAddress('0x5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a')
const CONTROLLING_KEY = getAddress('0x1aaa1bbb1ccc1ddd1eee1fff1aaa1bbb1ccc1ddd')
const LISTED_A = getAddress('0x2222222222222222222222222222222222222222')
const LISTED_B = getAddress('0x3333333333333333333333333333333333333333')
const BASIC_ACCOUNT = getAddress('0x4444444444444444444444444444444444444444')
const USDC = getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')

const ETH_PRICE = 2000
const USDC_PRICE = 1

const token = (
  address: string,
  symbol: string,
  decimals: number,
  price: number,
  onGasTank = false
): TokenResult => ({
  symbol,
  name: symbol,
  decimals,
  address,
  chainId: 1n,
  amount: 0n,
  priceIn: [{ baseCurrency: 'usd', price }],
  flags: {
    onGasTank,
    rewardsType: null,
    canTopUpGasTank: false,
    isFeeToken: true
  }
})

const ETH = token(ZERO_ADDRESS, 'ETH', 18, ETH_PRICE)
const USDC_TOKEN = token(USDC, 'USDC', 6, USDC_PRICE)
const USDC_GAS_TANK = token(USDC, 'USDC', 6, USDC_PRICE, true)

const option = (
  paidBy: string,
  feeToken: TokenResult,
  availableAmount: bigint
): FeePaymentOption => ({
  paidBy,
  availableAmount,
  gasUsed: 0n,
  addedNative: 0n,
  token: feeToken
})

const speeds = (slow: bigint, available?: bigint): SpeedCalc[] =>
  [FeeSpeed.Slow, FeeSpeed.Medium, FeeSpeed.Fast, FeeSpeed.Ape].map((type, i) => {
    const amount = slow * BigInt(i + 1)
    return {
      type,
      amount,
      simulatedGasLimit: 21000n,
      amountFormatted: '',
      amountUsd: '1',
      gasPrice: 1n,
      disabled: available === undefined ? false : available < amount
    }
  })

// The identifiers the library gives the fee speeds: every native option of
// another payer shares one calculation.
const ETH_SLOW = 100n
const USDC_SLOW = 1_000_000n
const otherPayersNativeId = `EOA:${ZERO_ADDRESS}:eth:feeToken`
const ownNativeId = (accountAddr: string) => `${accountAddr}:${ZERO_ADDRESS}:eth:feeToken`
const ownUsdcId = (accountAddr: string) => `${accountAddr}:${USDC}:usdc:feeToken`
const gasTankId = (accountAddr: string) => `${accountAddr}:${USDC}:usdc:gasTank`

const signAccountOpState = (
  accountAddr: string,
  associatedKeys: string[],
  feeSpeeds: Record<string, SpeedCalc[]> = {
    [otherPayersNativeId]: speeds(ETH_SLOW),
    [ownNativeId(accountAddr)]: speeds(ETH_SLOW),
    [ownUsdcId(accountAddr)]: speeds(USDC_SLOW),
    [gasTankId(accountAddr)]: speeds(USDC_SLOW)
  }
) =>
  ({
    accountOp: { accountAddr },
    account: { addr: accountAddr, associatedKeys },
    rbfAccountOps: {},
    feeSpeeds,
    selectedFeeSpeed: FeeSpeed.Slow
  } as unknown as SignAccountOpController)

const sortWith = (
  options: FeePaymentOption[],
  state: SignAccountOpController,
  ownKeyAddrs?: string[]
) => [...options].sort((a, b) => sortFeeOptions(a, b, state, ownKeyAddrs))

const payers = (options: FeePaymentOption[]) =>
  options.map((o) => `${o.paidBy}:${o.token.symbol}${o.token.flags.onGasTank ? ':gasTank' : ''}`)

// How the sign screen builds its two lists and its default.
const screenOptions = (state: SignAccountOpController, all: FeePaymentOption[]) => {
  const { accountAddr } = state.accountOp
  const ownKeys = state.account.associatedKeys
  const own = all
    .filter((o) => o.paidBy === accountAddr)
    .sort((a, b) => sortFeeOptions(a, b, state, ownKeys))
    .map((o) => mapFeeOptions(o, state))
  const others = all
    .filter((o) => o.paidBy !== accountAddr)
    .sort((a, b) => sortFeeOptions(a, b, state, ownKeys))
    .map((o) => mapFeeOptions(o, state))
  return { own, others, defaultOption: getDefaultFeeOption(own, others) }
}

describe('the order and the default of the fee options', () => {
  const smartState = signAccountOpState(SMART_ACCOUNT, [CONTROLLING_KEY])

  it('puts the controlling key before a listed account that holds more, when the key can cover the fee', () => {
    const others = [
      option(LISTED_A, ETH, 1000n * ETH_SLOW),
      option(CONTROLLING_KEY, ETH, 2n * ETH_SLOW),
      option(LISTED_B, ETH, 10n * ETH_SLOW)
    ]

    expect(payers(sortWith(others, smartState, [CONTROLLING_KEY]))).toEqual([
      `${CONTROLLING_KEY}:ETH`,
      `${LISTED_A}:ETH`,
      `${LISTED_B}:ETH`
    ])
  })

  it('makes the controlling key the default when none of the account own options can cover the fee', () => {
    const all = [
      option(SMART_ACCOUNT, ETH, ETH_SLOW - 1n),
      option(SMART_ACCOUNT, USDC_GAS_TANK, 0n),
      option(LISTED_A, ETH, 1000n * ETH_SLOW),
      option(CONTROLLING_KEY, ETH, 2n * ETH_SLOW)
    ]

    const { defaultOption } = screenOptions(smartState, all)

    expect(defaultOption.paidBy).toBe(CONTROLLING_KEY)
    expect(defaultOption.disabled).toBe(false)
  })

  it('keeps the account own covering option as the default even when the controlling key can pay', () => {
    const all = [
      option(SMART_ACCOUNT, ETH, 3n * ETH_SLOW),
      option(LISTED_A, ETH, 1000n * ETH_SLOW),
      option(CONTROLLING_KEY, ETH, 2n * ETH_SLOW)
    ]

    const { defaultOption, others } = screenOptions(smartState, all)

    expect(defaultOption.paidBy).toBe(SMART_ACCOUNT)
    expect(others[0].paidBy).toBe(CONTROLLING_KEY)
  })

  it('makes the first covering option the default when the controlling key cannot cover the fee', () => {
    const all = [
      option(SMART_ACCOUNT, ETH, 0n),
      option(CONTROLLING_KEY, ETH, ETH_SLOW - 1n),
      option(LISTED_B, ETH, 10n * ETH_SLOW),
      option(LISTED_A, ETH, 1000n * ETH_SLOW)
    ]

    const { defaultOption, others } = screenOptions(smartState, all)

    expect(defaultOption.paidBy).toBe(LISTED_A)
    expect(others.map((o) => o.paidBy)).toEqual([LISTED_A, LISTED_B, CONTROLLING_KEY])
  })

  it('sorts payers that cannot cover the fee by value only, the controlling key included', () => {
    const others = [
      option(CONTROLLING_KEY, ETH, ETH_SLOW / 4n),
      option(LISTED_A, ETH, ETH_SLOW / 2n)
    ]

    expect(payers(sortWith(others, smartState, [CONTROLLING_KEY]))).toEqual([
      `${LISTED_A}:ETH`,
      `${CONTROLLING_KEY}:ETH`
    ])
  })

  it('matches the controlling key whatever the case of its address', () => {
    const others = [
      option(LISTED_A, ETH, 1000n * ETH_SLOW),
      option(CONTROLLING_KEY.toLowerCase(), ETH, 2n * ETH_SLOW)
    ]

    const upperCaseKey = `0x${CONTROLLING_KEY.slice(2).toUpperCase()}`

    expect(sortWith(others, smartState, [upperCaseKey])[0].paidBy).toBe(
      CONTROLLING_KEY.toLowerCase()
    )
  })

  it('puts a listed account that is also the controlling key before the other listed accounts', () => {
    const others = [option(LISTED_A, ETH, 1000n * ETH_SLOW), option(LISTED_B, ETH, 2n * ETH_SLOW)]

    expect(payers(sortWith(others, smartState, [LISTED_B]))).toEqual([
      `${LISTED_B}:ETH`,
      `${LISTED_A}:ETH`
    ])
  })

  it('keeps the gas tank first among the account own options and before the controlling key', () => {
    const own = [
      option(SMART_ACCOUNT, USDC_TOKEN, 5n * USDC_SLOW),
      option(SMART_ACCOUNT, ETH, 3n * ETH_SLOW),
      option(SMART_ACCOUNT, USDC_GAS_TANK, 2n * USDC_SLOW)
    ]
    // gas tank, then native, then the rest
    const expected = [
      `${SMART_ACCOUNT}:USDC:gasTank`,
      `${SMART_ACCOUNT}:ETH`,
      `${SMART_ACCOUNT}:USDC`
    ]

    expect(payers(sortWith(own, smartState, [CONTROLLING_KEY]))).toEqual(expected)
    expect(
      payers(
        sortWith([option(CONTROLLING_KEY, ETH, 2n * ETH_SLOW), ...own], smartState, [
          CONTROLLING_KEY
        ])
      )[0]
    ).toBe(`${SMART_ACCOUNT}:USDC:gasTank`)
  })

  describe('with no own key among the payers', () => {
    // can cover the fee first, then the gas tank, then native, then the higher value
    const own = [
      option(SMART_ACCOUNT, USDC_TOKEN, USDC_SLOW - 1n),
      option(SMART_ACCOUNT, USDC_TOKEN, 5n * USDC_SLOW),
      option(SMART_ACCOUNT, ETH, 3n * ETH_SLOW),
      option(SMART_ACCOUNT, USDC_GAS_TANK, 2n * USDC_SLOW)
    ]
    const others = [
      option(LISTED_B, ETH, ETH_SLOW / 2n),
      option(CONTROLLING_KEY, ETH, 2n * ETH_SLOW),
      option(LISTED_A, ETH, 1000n * ETH_SLOW)
    ]
    const expectedOthers = [`${LISTED_A}:ETH`, `${CONTROLLING_KEY}:ETH`, `${LISTED_B}:ETH`]

    it('sorts a smart account options as before when no own key is passed', () => {
      expect(payers(sortWith(own, smartState))).toEqual([
        `${SMART_ACCOUNT}:USDC:gasTank`,
        `${SMART_ACCOUNT}:ETH`,
        `${SMART_ACCOUNT}:USDC`,
        `${SMART_ACCOUNT}:USDC`
      ])
      expect(payers(sortWith(others, smartState))).toEqual(expectedOthers)
      expect(payers(sortWith(others, smartState, []))).toEqual(expectedOthers)
    })

    it('sorts a smart account options as before when its keys pay no option', () => {
      const unrelatedKey = getAddress('0x9999999999999999999999999999999999999999')
      expect(payers(sortWith(others, smartState, [unrelatedKey]))).toEqual(expectedOthers)
    })

    it('sorts a basic account operation as before, its own address being its only key', () => {
      const basicState = signAccountOpState(BASIC_ACCOUNT, [BASIC_ACCOUNT])
      const all = [
        option(LISTED_B, ETH, 2n * ETH_SLOW),
        option(BASIC_ACCOUNT, USDC_TOKEN, 5n * USDC_SLOW),
        option(LISTED_A, ETH, 1000n * ETH_SLOW),
        option(BASIC_ACCOUNT, ETH, 3n * ETH_SLOW)
      ]

      const {
        own: ownOptions,
        others: otherOptions,
        defaultOption
      } = screenOptions(basicState, all)

      expect(ownOptions.map((o) => `${o.paidBy}:${o.token.symbol}`)).toEqual([
        `${BASIC_ACCOUNT}:ETH`,
        `${BASIC_ACCOUNT}:USDC`
      ])
      expect(otherOptions.map((o) => o.paidBy)).toEqual([LISTED_A, LISTED_B])
      expect(defaultOption.paidBy).toBe(BASIC_ACCOUNT)
    })
  })
})

describe('the disabled state of a fee speed', () => {
  it('follows the selected payer coverage, not the shared calculation of another payer', () => {
    // the shared calculation was made with the first payer balance, which covers only slow
    const state = signAccountOpState(SMART_ACCOUNT, [CONTROLLING_KEY], {
      [otherPayersNativeId]: speeds(ETH_SLOW, ETH_SLOW)
    })
    const sharedSpeeds = state.feeSpeeds[otherPayersNativeId]
    const selected = mapFeeOptions(option(LISTED_A, ETH, 3n * ETH_SLOW), state)

    const disabled = sharedSpeeds.map((speed) => [
      speed.type,
      isFeeSpeedDisabled(speed, selected.speedCoverage)
    ])

    expect(disabled).toEqual([
      [FeeSpeed.Slow, false],
      [FeeSpeed.Medium, false],
      [FeeSpeed.Fast, false],
      [FeeSpeed.Ape, true]
    ])
  })

  it('disables a speed the selected payer cannot cover, though the shared calculation enables it', () => {
    const state = signAccountOpState(SMART_ACCOUNT, [CONTROLLING_KEY], {
      [otherPayersNativeId]: speeds(ETH_SLOW, 1000n * ETH_SLOW)
    })
    const sharedSpeeds = state.feeSpeeds[otherPayersNativeId]
    const selected = mapFeeOptions(option(CONTROLLING_KEY, ETH, 2n * ETH_SLOW), state)

    const disabled = sharedSpeeds.map((speed) => [
      speed.type,
      isFeeSpeedDisabled(speed, selected.speedCoverage)
    ])

    expect(disabled).toEqual([
      [FeeSpeed.Slow, false],
      [FeeSpeed.Medium, false],
      [FeeSpeed.Fast, true],
      [FeeSpeed.Ape, true]
    ])
  })

  it('reads the library flag when no option is selected', () => {
    const [slow, medium] = speeds(ETH_SLOW, ETH_SLOW)

    expect(isFeeSpeedDisabled(slow, undefined)).toBe(false)
    expect(isFeeSpeedDisabled(medium, undefined)).toBe(true)
  })
})
