import { formatUnits } from 'ethers'
import React, { Fragment, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  SwapAndBridgeActiveRoute,
  SwapAndBridgeStep
} from '@ambire-common/interfaces/swapAndBridge'
import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import WarningIcon from '@common/assets/svg/WarningIcon'
import Text from '@common/components/Text'
import TokenIcon from '@common/components/TokenIcon'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import formatTime from '@common/utils/formatTime'

import RouteStepsArrow from '../RouteStepsArrow'
import RouteStepsToken from '../RouteStepsToken'
import styles from './styles'

const RouteStepsPreview = ({
  steps,
  totalGasFeesInUsd,
  inputValueInUsd,
  outputValueInUsd,
  estimationInSeconds,
  currentStep = 0,
  loadingEnabled,
  isSelected,
  isDisabled,
  routeStatus
}: {
  steps: SwapAndBridgeStep[]
  totalGasFeesInUsd?: number
  inputValueInUsd?: number
  outputValueInUsd?: number
  estimationInSeconds?: number
  currentStep?: number
  loadingEnabled?: boolean
  isSelected?: boolean
  isDisabled?: boolean
  routeStatus?: SwapAndBridgeActiveRoute['routeStatus']
}) => {
  const { theme, themeType } = useTheme()
  const { t } = useTranslation()

  const shouldWarnForLongEstimation = useMemo(() => {
    if (!estimationInSeconds) return false
    return estimationInSeconds > 3600 // 1 hour in seconds
  }, [estimationInSeconds])

  const formattedFromAmount = useMemo(() => {
    const fromStep = steps?.[0]
    if (!fromStep) return ''

    const fromAmount = `${formatDecimals(
      Number(formatUnits(fromStep.fromAmount, fromStep.fromAsset.decimals)),
      'precise'
    )}`

    if (fromAmount.length > 10) {
      return `${fromAmount.slice(0, 10)}...`
    }

    return fromAmount
  }, [steps])

  const formattedRefundedAmount = useMemo(() => {
    if (!routeStatus || routeStatus !== 'refunded') return ''

    const fromStep = steps?.[0]
    if (!fromStep) return ''

    const toAmount = `${formatDecimals(
      Number(formatUnits(fromStep.toAmount, fromStep.toAsset.decimals)),
      'amount'
    )}`

    return toAmount
  }, [steps, routeStatus])

  const formattedToAmount = useMemo(() => {
    const toStep = steps?.[steps.length - 1]
    if (!toStep) return ''

    const toAmount = `${formatDecimals(
      Number(formatUnits(toStep.toAmount, toStep.toAsset.decimals)),
      'amount'
    )}`

    if (toAmount.length > 10) {
      return `${toAmount.slice(0, 10)}...`
    }

    return toAmount
  }, [steps])

  const getLastStepType = (step: SwapAndBridgeStep) => {
    if (step.userTxIndex && step.userTxIndex < currentStep) {
      return routeStatus && routeStatus === 'refunded' ? 'warning' : 'success'
    }

    return 'default'
  }

  return (
    <View style={[flexbox.flex1, common.fullWidth]}>
      <View style={[styles.container, spacings.mb]}>
        {steps.map((step, i) => {
          const isFirst = i === 0
          const isOnlyOneStep = steps.length === 1
          const isLast = i === steps.length - 1

          if (step.userTxIndex === undefined) {
            // eslint-disable-next-line no-param-reassign
            step.userTxIndex = 0
          }

          if (isLast) {
            return (
              <Fragment key={step.type}>
                <View style={[flexbox.flex1, flexbox.directionRow, flexbox.alignCenter]}>
                  <RouteStepsToken
                    amountInUsd={inputValueInUsd}
                    uri={step.fromAsset.icon}
                    chainId={BigInt(step.fromAsset.chainId)}
                    address={step.fromAsset.address}
                    symbol={step.fromAsset.symbol}
                    amount={isOnlyOneStep ? formattedFromAmount : formattedRefundedAmount}
                  />
                  <RouteStepsArrow
                    containerStyle={flexbox.flex1}
                    type={getLastStepType(step)}
                    badge={
                      <>
                        <TokenIcon
                          uri={step.protocol.icon}
                          width={16}
                          height={16}
                          containerStyle={spacings.mrMi}
                        />
                        <Text
                          fontSize={12}
                          weight="medium"
                          appearance="secondaryText"
                          numberOfLines={1}
                        >
                          {step.protocol.displayName}
                        </Text>
                      </>
                    }
                    isLoading={loadingEnabled && step.userTxIndex === currentStep}
                    badgePosition="top"
                  />
                </View>
                <RouteStepsToken
                  amountInUsd={outputValueInUsd}
                  address={step.toAsset.address}
                  chainId={BigInt(step.toAsset.chainId)}
                  uri={step.toAsset.icon}
                  symbol={step.toAsset.symbol}
                  amount={formattedToAmount}
                  isLast
                />
              </Fragment>
            )
          }

          return (
            <View
              key={step.type}
              style={[flexbox.flex1, flexbox.directionRow, flexbox.alignCenter]}
            >
              <RouteStepsToken
                address={step.fromAsset.address}
                chainId={BigInt(step.fromAsset.chainId)}
                uri={step.fromAsset.icon}
                symbol={step.fromAsset.symbol}
                amount={isFirst ? formattedFromAmount : ''}
              />
              <RouteStepsArrow
                containerStyle={flexbox.flex1}
                type={step.userTxIndex < currentStep ? 'success' : 'default'}
                badge={
                  <>
                    <TokenIcon
                      uri={step.protocol.icon}
                      width={16}
                      height={16}
                      containerStyle={spacings.mrMi}
                    />
                    <Text
                      fontSize={12}
                      weight="medium"
                      appearance="secondaryText"
                      numberOfLines={1}
                    >
                      {step.protocol.displayName}
                    </Text>
                  </>
                }
                isLoading={loadingEnabled && step.userTxIndex === currentStep}
                badgePosition="top"
              />
            </View>
          )
        })}
      </View>
      {(!!totalGasFeesInUsd || !!estimationInSeconds) && (
        <View style={[flexbox.directionRow, flexbox.justifySpaceBetween]}>
          {!!estimationInSeconds && (
            <View style={[flexbox.directionRow, flexbox.alignCenter]}>
              {!!shouldWarnForLongEstimation && (
                <WarningIcon
                  color={theme.warningDecorative}
                  width={14}
                  height={14}
                  style={spacings.mrMi}
                  strokeWidth={2.2}
                />
              )}
              <Text
                fontSize={12}
                weight={shouldWarnForLongEstimation ? 'semiBold' : 'medium'}
                appearance={shouldWarnForLongEstimation ? 'warningText' : 'primaryText'}
              >
                {t('Estimation: around {{time}}', {
                  time: formatTime(estimationInSeconds)
                })}
              </Text>
            </View>
          )}

          {(isSelected || isDisabled) && (
            <Text
              fontSize={12}
              weight="medium"
              color={
                !isDisabled
                  ? themeType === THEME_TYPES.DARK
                    ? theme.successDecorative
                    : theme.primary
                  : theme.warningText
              }
              style={[
                spacings.phTy,
                {
                  paddingVertical: 1,
                  backgroundColor: !isDisabled
                    ? themeType === THEME_TYPES.DARK
                      ? `${String(theme.successDecorative)}20`
                      : '#6000FF14'
                    : theme.warningBackground,
                  borderRadius: 12
                }
              ]}
            >
              {isSelected && isDisabled && t('Route failed. Please select another')}
              {isSelected && !isDisabled && t('Selected')}
              {!isSelected && isDisabled && t('Failed')}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}

export default React.memo(RouteStepsPreview)
