import { formatUnits } from 'ethers'

import { getFeeSpeedIdentifier } from '@ambire-common/controllers/signAccountOp/helper'
import {
  FeeSpeed,
  SignAccountOpController,
  SpeedCalc
} from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { FeePaymentOption } from '@ambire-common/libs/estimate/interfaces'

import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'
import PayOption from './components/PayOption'
import { NO_FEE_OPTIONS } from './consts'
import { FeeOption } from './types'

const sortBasedOnUSDValue = (a: FeePaymentOption, b: FeePaymentOption) => {
  if (!a || !b) return 0

  const aPrice = a.token?.priceIn?.[0]?.price
  const bPrice = b.token?.priceIn?.[0]?.price

  if (!aPrice || !bPrice) return 0
  const aBalance = formatUnits(a.availableAmount, a.token.decimals)
  const bBalance = formatUnits(b.availableAmount, b.token.decimals)
  const aValue = parseFloat(aBalance) * aPrice
  const bValue = parseFloat(bBalance) * bPrice

  if (aValue > bValue) return -1
  if (aValue < bValue) return 1
  return 0
}

const isPaidByOwnKey = (feeOption: FeePaymentOption, ownKeyAddrs: string[]) =>
  ownKeyAddrs.some((addr) => addr.toLowerCase() === feeOption.paidBy.toLowerCase())

/**
 * Sorts fee options by the following criteria:
 * - Options that can cover the fee first
 * - Gas tank options first
 * - Native options second, those paid by one of the account's own keys
 *   before those paid by other accounts
 * - USD value
 */
const sortFeeOptions = (
  a: FeePaymentOption,
  b: FeePaymentOption,
  signAccountOpState: SignAccountOpController,
  ownKeyAddrs: string[] = []
) => {
  const aId = getFeeSpeedIdentifier(
    a,
    signAccountOpState.accountOp.accountAddr,
    signAccountOpState.rbfAccountOps[a.paidBy]
  )
  const aSlow = signAccountOpState.feeSpeeds[aId]?.find((speed) => speed.type === 'slow')
  if (!aSlow) return 1
  const aCanCoverFee = a.availableAmount >= aSlow.amount

  const bId = getFeeSpeedIdentifier(
    b,
    signAccountOpState.accountOp.accountAddr,
    signAccountOpState.rbfAccountOps[b.paidBy]
  )
  const bSlow = signAccountOpState.feeSpeeds[bId]?.find((speed) => speed.type === 'slow')
  if (!bSlow) return -1
  const bCanCoverFee = b.availableAmount >= bSlow.amount

  if (aCanCoverFee && !bCanCoverFee) return -1
  if (!aCanCoverFee && bCanCoverFee) return 1
  if (!signAccountOpState) sortBasedOnUSDValue(a, b)

  // gas tank first
  if (a.token.flags.onGasTank && !b.token.flags.onGasTank) return -1
  if (!a.token.flags.onGasTank && b.token.flags.onGasTank) return 1

  // native second
  if (a.token.address === ZERO_ADDRESS && b.token.address !== ZERO_ADDRESS) return -1
  if (a.token.address !== ZERO_ADDRESS && b.token.address === ZERO_ADDRESS) return 1

  // among native options that can cover the fee, the account's own key first
  if (aCanCoverFee && a.token.address === ZERO_ADDRESS) {
    const aIsOwnKey = isPaidByOwnKey(a, ownKeyAddrs)
    const bIsOwnKey = isPaidByOwnKey(b, ownKeyAddrs)
    if (aIsOwnKey && !bIsOwnKey) {
      return -1
    }
    if (!aIsOwnKey && bIsOwnKey) {
      return 1
    }
  }

  // based on value after
  return sortBasedOnUSDValue(a, b)
}

const mapFeeOptions = (
  feeOption: FeePaymentOption,
  signAccountOpState: SignAccountOpController
) => {
  let disabledReason: string | undefined
  const gasTankKey = feeOption.token.flags.onGasTank ? 'gasTank' : ''
  const speedCoverage: FeeSpeed[] = []
  const id = getFeeSpeedIdentifier(
    feeOption,
    signAccountOpState.accountOp.accountAddr,
    signAccountOpState.rbfAccountOps[feeOption.paidBy]
  )

  signAccountOpState.feeSpeeds[id]?.forEach((speed) => {
    if (feeOption.availableAmount >= speed.amount) speedCoverage.push(speed.type)
  })

  const feeSpeed = signAccountOpState.feeSpeeds[id]?.find(
    (speed) => speed.type === signAccountOpState.selectedFeeSpeed
  )
  const feeSpeedAmount = feeSpeed?.amount || 0n
  const feeSpeedUsd = feeSpeed?.amountUsd || '0'

  if (!speedCoverage.includes(FeeSpeed.Slow)) {
    if (!feeOption.token.priceIn.length) {
      disabledReason = 'No price data'
    } else {
      disabledReason = 'Insufficient amount'
    }
  }

  return {
    value:
      feeOption.paidBy +
      feeOption.token.address +
      feeOption.token.symbol.toLowerCase() +
      gasTankKey,
    label: (
      <PayOption
        amount={feeSpeedAmount}
        amountUsd={feeSpeedUsd}
        feeOption={feeOption}
        disabledReason={disabledReason}
      />
    ),
    paidBy: feeOption.paidBy,
    token: feeOption.token,
    disabled: !!disabledReason,
    speedCoverage
  }
}

/**
 * A speed is disabled when the selected option's own balance cannot cover it.
 * The speeds of several payers can share one calculation, so their own
 * disabled flag may come from another payer's balance.
 */
const isFeeSpeedDisabled = (
  speed: Pick<SpeedCalc, 'type' | 'disabled'>,
  selectedSpeedCoverage: FeeSpeed[] | undefined
) => {
  if (!selectedSpeedCoverage) {
    return speed.disabled
  }

  return !selectedSpeedCoverage.includes(speed.type)
}

const getDefaultFeeOption = (
  payOptionsPaidByUsOrGasTank: FeeOption[],
  payOptionsPaidByEOA: FeeOption[]
) => {
  if (payOptionsPaidByUsOrGasTank.length > 0 && !payOptionsPaidByUsOrGasTank[0].disabled)
    return payOptionsPaidByUsOrGasTank[0]

  if (payOptionsPaidByEOA.length > 0 && !payOptionsPaidByEOA[0].disabled)
    return payOptionsPaidByEOA[0]

  // if there's nothing to cover the fee, select a disabled option
  if (payOptionsPaidByUsOrGasTank.length) return payOptionsPaidByUsOrGasTank[0]
  if (payOptionsPaidByEOA.length) return payOptionsPaidByEOA[0]

  return NO_FEE_OPTIONS as FeeOption
}

export { getDefaultFeeOption, isFeeSpeedDisabled, mapFeeOptions, sortFeeOptions }
