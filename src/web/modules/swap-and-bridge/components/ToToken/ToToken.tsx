import { formatUnits, isAddress } from 'ethers'
import React, { FC, memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { EstimationStatus } from '@ambire-common/controllers/estimation/types'
import { SwapAndBridgeFormStatus } from '@ambire-common/controllers/swapAndBridge/swapAndBridge'
import { getIsNetworkSupported } from '@ambire-common/libs/swapAndBridge/swapAndBridge'
import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import WalletFilledIcon from '@common/assets/svg/WalletFilledIcon'
import NetworkIcon from '@common/components/NetworkIcon'
import Select from '@common/components/Select'
import { SelectValue } from '@common/components/Select/types'
import getStyles from '@common/components/SendToken/styles'
import SkeletonLoader from '@common/components/SkeletonLoader'
import Text from '@common/components/Text'
import Tooltip from '@common/components/Tooltip'
import useGetTokenSelectProps from '@common/hooks/useGetTokenSelectProps'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import useSwapAndBridgeControllerState from '@web/hooks/useSwapAndBridgeControllerState'
import SwitchTokensButton from '@web/modules/swap-and-bridge/components/SwitchTokensButton'
import ToTokenSelect from '@web/modules/swap-and-bridge/components/ToToken/ToTokenSelect'
import useSwapAndBridgeForm from '@web/modules/swap-and-bridge/hooks/useSwapAndBridgeForm'
import { getTokenId } from '@web/utils/token'

import NotSupportedNetworkTooltip from '../NotSupportedNetworkTooltip'

type Props = Pick<ReturnType<typeof useSwapAndBridgeForm>, 'setIsAutoSelectRouteDisabled'> & {
  isAutoSelectRouteDisabled: boolean
}

const ToToken: FC<Props> = ({ isAutoSelectRouteDisabled, setIsAutoSelectRouteDisabled }) => {
  const { theme, styles, themeType } = useTheme(getStyles)
  const { t } = useTranslation()
  const {
    statuses: swapAndBridgeCtrlStatuses,
    toSelectedToken,
    updateQuoteStatus,
    toTokenShortList,
    toTokenSearchResults,
    toTokenSearchTerm,
    fromSelectedToken,
    quote,
    formStatus,
    toChainId,
    updateToTokenListStatus,
    switchTokensStatus,
    supportedChainIds,
    signAccountOpController
  } = useSwapAndBridgeControllerState()

  const { networks } = useNetworksControllerState()
  const { account } = useSelectedAccountControllerState()
  const { dispatch } = useBackgroundService()

  const handleSwitchFromAndToTokens = useCallback(
    () =>
      dispatch({
        type: 'SWAP_AND_BRIDGE_CONTROLLER_SWITCH_FROM_AND_TO_TOKENS'
      }),
    [dispatch]
  )

  const handleSetToNetworkValue = useCallback(
    (networkOption: SelectValue) => {
      dispatch({
        type: 'SWAP_AND_BRIDGE_CONTROLLER_UPDATE_FORM',
        params: {
          formValues: {
            toChainId: networks.filter((n) => String(n.chainId) === networkOption.value)[0].chainId
          }
        }
      })
    },
    [networks, dispatch]
  )

  const tokensInToTokenSelect = useMemo(() => {
    if (toTokenSearchTerm) return toTokenSearchResults

    // Token might not be in the short list (if it's pulled from search for example)
    const isSelectTokenMissingInToTokenShortList =
      toSelectedToken &&
      !toTokenShortList.some(
        (tk) => tk.address === toSelectedToken.address && tk.chainId === toSelectedToken.chainId
      )

    return isSelectTokenMissingInToTokenShortList
      ? [toSelectedToken, ...toTokenShortList]
      : toTokenShortList
  }, [toTokenSearchTerm, toTokenSearchResults, toSelectedToken, toTokenShortList])

  const {
    options: toTokenOptions,
    value: toTokenValue,
    amountSelectDisabled: toTokenAmountSelectDisabled
  } = useGetTokenSelectProps({
    tokens: tokensInToTokenSelect,
    token: toSelectedToken ? getTokenId(toSelectedToken) : '',
    networks,
    supportedChainIds,
    isLoading: !toTokenShortList.length && updateToTokenListStatus !== 'INITIAL',
    isToToken: true
  })

  const shouldShowAmountOnEstimationFailure = useMemo(() => {
    return (
      isAutoSelectRouteDisabled &&
      signAccountOpController?.estimation.status === EstimationStatus.Error
    )
  }, [isAutoSelectRouteDisabled, signAccountOpController?.estimation.status])

  const isReadyToDisplayAmounts =
    (formStatus === SwapAndBridgeFormStatus.Empty ||
      formStatus === SwapAndBridgeFormStatus.Invalid ||
      formStatus === SwapAndBridgeFormStatus.NoRoutesFound ||
      formStatus === SwapAndBridgeFormStatus.ReadyToSubmit ||
      formStatus === SwapAndBridgeFormStatus.Proceeded ||
      shouldShowAmountOnEstimationFailure) &&
    updateQuoteStatus !== 'LOADING'

  const toNetworksOptions: SelectValue[] = useMemo(
    () =>
      networks
        .sort((a, b) => {
          const aIsSupported = getIsNetworkSupported(supportedChainIds, a)
          const bIsSupported = getIsNetworkSupported(supportedChainIds, b)
          if (aIsSupported && !bIsSupported) return -1
          if (!aIsSupported && bIsSupported) return 1
          return 0
        })
        .map((n) => {
          const tooltipId = `network-${n.chainId}-not-supported-tooltip`
          const isNetworkSupported = getIsNetworkSupported(supportedChainIds, n)

          return {
            value: String(n.chainId),
            extraSearchProps: [n.name],
            disabled: !isNetworkSupported,
            label: (
              <>
                <Text
                  fontSize={14}
                  weight="medium"
                  dataSet={{ tooltipId }}
                  style={flexbox.flex1}
                  numberOfLines={1}
                >
                  {n.name}
                </Text>
                {!isNetworkSupported && (
                  <NotSupportedNetworkTooltip tooltipId={tooltipId} network={n} account={account} />
                )}
              </>
            ),
            icon: <NetworkIcon key={n.chainId.toString()} id={n.chainId.toString()} size={28} />
          }
        }),
    [account, networks, supportedChainIds]
  )

  const getToNetworkSelectValue = useMemo(() => {
    const network = networks.find((n) => Number(n.chainId) === toChainId)
    if (!network) return toNetworksOptions[0]

    return toNetworksOptions.filter((opt) => opt.value === String(network.chainId))[0]
  }, [networks, toChainId, toNetworksOptions])

  const handleChangeToToken = useCallback(
    ({ address: toSelectedTokenAddr }: SelectValue) => {
      setIsAutoSelectRouteDisabled(false)
      const isSameAsFromToken =
        !!fromSelectedToken &&
        !!toChainId &&
        toSelectedTokenAddr === fromSelectedToken.address &&
        BigInt(toChainId) === fromSelectedToken.chainId

      dispatch({
        type: 'SWAP_AND_BRIDGE_CONTROLLER_UPDATE_FORM',
        params: {
          formValues: {
            toSelectedTokenAddr,
            // Reset the from token if it's the same. undefined acts as "do nothing", null as reset
            fromSelectedToken: isSameAsFromToken ? null : undefined
          }
        }
      })
    },
    [setIsAutoSelectRouteDisabled, fromSelectedToken, toChainId, dispatch]
  )

  const handleAddToTokenByAddress = useCallback(
    (searchTerm: string) => {
      const isValidTokenAddress = isAddress(searchTerm)
      if (!isValidTokenAddress) return

      dispatch({
        type: 'SWAP_AND_BRIDGE_CONTROLLER_ADD_TO_TOKEN_BY_ADDRESS',
        params: { address: searchTerm }
      })
    },
    [dispatch]
  )

  const toAmount = useMemo(() => {
    if (
      !quote ||
      !quote.selectedRoute ||
      !quote?.toAsset?.decimals ||
      signAccountOpController?.estimation.status === EstimationStatus.Error
    )
      return '0'

    return formatUnits(quote.selectedRoute.toAmount, quote.toAsset.decimals)
  }, [quote, signAccountOpController?.estimation.status])

  const formattedToAmount = useMemo(() => {
    if (toAmount === '0') return '0'

    return `${formatDecimals(Number(toAmount), 'precise')}`
  }, [toAmount])

  const hasSelectedToToken =
    toTokenValue &&
    typeof toTokenValue === 'object' &&
    'symbol' in toTokenValue &&
    'isPending' in toTokenValue &&
    'pendingBalanceFormatted' in toTokenValue &&
    'balanceFormatted' in toTokenValue

  return (
    <View>
      <View
        style={[
          flexbox.directionRow,
          flexbox.alignCenter,
          flexbox.justifySpaceBetween,
          spacings.mbTy
        ]}
      >
        <SwitchTokensButton
          onPress={handleSwitchFromAndToTokens}
          disabled={
            switchTokensStatus === 'LOADING' ||
            updateQuoteStatus === 'LOADING' ||
            updateToTokenListStatus === 'LOADING'
          }
        />
        <Text appearance="secondaryText" fontSize={16} weight="medium">
          {t('Receive')}
        </Text>
        <Select
          setValue={handleSetToNetworkValue}
          containerStyle={{ ...spacings.mb0, width: 160 }}
          options={toNetworksOptions}
          size="sm"
          value={getToNetworkSelectValue}
          mode="bottomSheet"
          bottomSheetTitle={t('Receive token network')}
          selectStyle={{
            backgroundColor:
              themeType === THEME_TYPES.DARK ? theme.secondaryBackground : '#54597A14',
            borderWidth: 0
          }}
        />
      </View>
      <View style={[styles.container, spacings.prXl]}>
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
          <ToTokenSelect
            toTokenOptions={toTokenOptions}
            toTokenValue={toTokenValue}
            handleChangeToToken={handleChangeToToken}
            toTokenAmountSelectDisabled={toTokenAmountSelectDisabled}
            addToTokenByAddressStatus={swapAndBridgeCtrlStatuses.addToTokenByAddress}
            handleAddToTokenByAddress={handleAddToTokenByAddress}
          />
          <View style={[spacings.plSm, flexbox.flex1]}>
            {isReadyToDisplayAmounts ? (
              <>
                <Text
                  fontSize={20}
                  weight="medium"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  appearance={
                    formattedToAmount && formattedToAmount !== '0' ? 'primaryText' : 'secondaryText'
                  }
                  dataSet={{ tooltipId: 'to-amount' }}
                  style={{ textAlign: 'right' }}
                >
                  {formattedToAmount}
                </Text>
                {formattedToAmount !== '0' && <Tooltip id="to-amount" content={toAmount} />}
              </>
            ) : (
              <SkeletonLoader
                appearance="tertiaryBackground"
                width={100}
                height={32}
                style={{ marginLeft: 'auto' }}
              />
            )}
          </View>
        </View>
        <View
          style={[
            flexbox.directionRow,
            flexbox.alignCenter,
            flexbox.justifySpaceBetween,
            spacings.ptSm,
            {
              height: 32 // Prevents layout shifts
            }
          ]}
        >
          {hasSelectedToToken && (
            <View style={[flexbox.directionRow, flexbox.alignCenter]}>
              <WalletFilledIcon width={14} height={14} color={theme.tertiaryText} />
              <Text
                testID="max-available-amount"
                numberOfLines={1}
                fontSize={12}
                style={spacings.mlMi}
                weight="medium"
                appearance="tertiaryText"
                ellipsizeMode="tail"
              >
                {`${
                  toTokenValue.isPending
                    ? toTokenValue.pendingBalanceFormatted
                    : toTokenValue.balanceFormatted
                } ${toTokenValue.symbol}`}
              </Text>
            </View>
          )}
          {!!quote?.selectedRoute && isReadyToDisplayAmounts && (
            <Text
              fontSize={12}
              color={themeType === THEME_TYPES.DARK ? theme.linkText : theme.primary}
              weight="medium"
              testID="switch-currency-sab"
              style={{ marginLeft: 'auto' }}
            >
              {formatDecimals(quote.selectedRoute.outputValueInUsd || 0, 'price')}
            </Text>
          )}
        </View>
      </View>
    </View>
  )
}

export default memo(ToToken)
