import { getAddress } from 'ethers'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'

import { isDappRequestAction } from '@ambire-common/libs/actions/actions'
import { getNetworksWithFailedRPC } from '@ambire-common/libs/networks/networks'
import { TokenResult } from '@ambire-common/libs/portfolio'
import AmountIcon from '@common/assets/svg/AmountIcon'
import DollarIcon from '@common/assets/svg/DollarIcon'
import ValueIcon from '@common/assets/svg/ValueIcon'
import Alert from '@common/components/Alert/Alert'
import CoingeckoConfirmedBadge from '@common/components/CoingeckoConfirmedBadge'
import NetworkBadge from '@common/components/NetworkBadge'
import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text'
import TokenIcon from '@common/components/TokenIcon'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import getAndFormatTokenDetails from '@common/modules/dashboard/helpers/getTokenDetails'
import Header from '@common/modules/header/components/Header'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import { TabLayoutContainer } from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import useActionsControllerState from '@web/hooks/useActionsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import usePortfolioControllerState from '@web/hooks/usePortfolioControllerState/usePortfolioControllerState'
import useProvidersControllerState from '@web/hooks/useProvidersControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import ActionFooter from '@web/modules/action-requests/components/ActionFooter'
import {
  getTokenEligibility,
  getTokenFromPortfolio,
  getTokenFromTemporaryTokens,
  handleTokenIsInPortfolio,
  selectNetwork
} from '@web/modules/action-requests/screens/WatchTokenRequestScreen/utils'

import getStyles from './styles'

export type TokenData = {
  address: string
  name: string
  symbol: string
  decimals: number
  image: string
}

const WatchTokenRequestScreen = () => {
  const { t } = useTranslation()
  const { theme, styles, themeType } = useTheme(getStyles)

  const { dispatch } = useBackgroundService()
  const state = useActionsControllerState()
  const { temporaryTokens, validTokens, customTokens } = usePortfolioControllerState()
  const { portfolio: selectedAccountPortfolio } = useSelectedAccountControllerState()
  const { networks } = useNetworksControllerState()
  const { providers } = useProvidersControllerState()

  const dappAction = useMemo(
    () => (isDappRequestAction(state.currentAction) ? state.currentAction : null),
    [state.currentAction]
  )

  const userRequest = useMemo(() => {
    if (!dappAction) return undefined
    if (dappAction.userRequest.action.kind !== 'walletWatchAsset') return undefined

    return dappAction.userRequest
  }, [dappAction])

  const tokenData = userRequest?.action?.params?.options
  const origin = userRequest?.session?.origin
  const network =
    networks.find((n) => n.explorerUrl === origin) ||
    networks.find((n) => n.chainId === tokenData?.chainId)
  const [showAlreadyInPortfolioMessage, setShowAlreadyInPortfolioMessage] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState(true)
  const [tokenNetwork, setTokenNetwork] = useState(network)
  const [isTemporaryTokenRequested, setTemporaryTokenRequested] = useState(false)

  const isLoadingTemporaryToken = useMemo(
    () => tokenNetwork?.chainId && temporaryTokens?.[tokenNetwork?.chainId.toString()]?.isLoading,
    [tokenNetwork?.chainId, temporaryTokens]
  )

  const networkWithFailedRPC =
    tokenNetwork?.chainId &&
    getNetworksWithFailedRPC({ providers }).filter(
      (chainId: string) => tokenNetwork?.chainId.toString() === chainId
    )

  const tokenTypeEligibility = useMemo(
    () => getTokenEligibility(tokenData, validTokens, tokenNetwork),
    [validTokens, tokenData, tokenNetwork]
  )
  const handleCancel = useCallback(() => {
    if (!dappAction) return

    dispatch({
      type: 'REQUESTS_CONTROLLER_REJECT_USER_REQUEST',
      params: { err: t('User rejected the request.'), id: dappAction.id }
    })
  }, [dappAction, t, dispatch])

  // Handle the case its already in token preferences
  const isTokenCustom = !!customTokens.find(
    (token) =>
      token.address.toLowerCase() === tokenData?.address.toLowerCase() &&
      token.chainId === tokenNetwork?.chainId
  )

  const temporaryToken = useMemo(
    () => getTokenFromTemporaryTokens(temporaryTokens, tokenData, tokenNetwork),
    [temporaryTokens, tokenData, tokenNetwork]
  )

  const portfolioToken = useMemo(
    () => getTokenFromPortfolio(tokenData, tokenNetwork, selectedAccountPortfolio),
    [selectedAccountPortfolio, tokenNetwork, tokenData]
  )

  const handleTokenType = (chainId: bigint) => {
    dispatch({
      type: 'PORTFOLIO_CONTROLLER_CHECK_TOKEN',
      params: { token: { address: tokenData?.address, chainId } }
    })
  }

  const handleSelectNetwork = useCallback(async () => {
    await selectNetwork(
      network,
      tokenNetwork,
      tokenData,
      networks,
      validTokens,
      setIsLoading,
      setTokenNetwork,
      handleTokenType,
      providers
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    network,
    tokenNetwork,
    tokenData,
    networks,
    validTokens,
    setIsLoading,
    setTokenNetwork,
    handleTokenType,
    providers,
    tokenTypeEligibility
  ])

  useEffect(() => {
    const handleEffect = async () => {
      handleSelectNetwork()
      if (tokenNetwork) {
        // Check if token is already in portfolio
        const isTokenInHints = await handleTokenIsInPortfolio(
          isTokenCustom,
          selectedAccountPortfolio,
          tokenNetwork,
          tokenData
        )
        if (isTokenInHints) {
          setIsLoading(false)
          setShowAlreadyInPortfolioMessage(true)
        }
        if (!temporaryToken) {
          // Check if token is eligible to add in portfolio
          if (tokenData && !tokenTypeEligibility) {
            handleTokenType(tokenNetwork?.chainId)
          }

          if (tokenTypeEligibility && !isTokenInHints && !isTemporaryTokenRequested) {
            setTemporaryTokenRequested(true)
            dispatch({
              type: 'PORTFOLIO_CONTROLLER_GET_TEMPORARY_TOKENS',
              params: {
                chainId: tokenNetwork?.chainId,
                additionalHint: getAddress(tokenData?.address)
              }
            })
          }
        }
      }
    }

    handleEffect().catch(() => setIsLoading(false))

    if (tokenTypeEligibility === false || !!temporaryToken) {
      setIsLoading(false)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    network,
    tokenData,
    tokenNetwork,
    networks,
    tokenTypeEligibility,
    temporaryToken,
    isTokenCustom,
    selectedAccountPortfolio,
    validTokens
  ])

  const handleAddToken = useCallback(async () => {
    if (!dappAction) return
    if (!tokenNetwork?.chainId) return

    dispatch({
      type: 'PORTFOLIO_CONTROLLER_ADD_CUSTOM_TOKEN',
      params: {
        token: {
          address: getAddress(tokenData.address),
          standard: 'ERC20',
          chainId: tokenNetwork?.chainId
        },
        shouldUpdatePortfolio: true
      }
    })

    dispatch({
      type: 'REQUESTS_CONTROLLER_RESOLVE_USER_REQUEST',
      params: { data: null, id: dappAction.id }
    })
  }, [dispatch, dappAction, tokenData, tokenNetwork])

  const tokenDetails = useMemo(() => {
    const token = portfolioToken || temporaryToken

    return token && token?.flags && getAndFormatTokenDetails(token as TokenResult, networks)
  }, [temporaryToken, portfolioToken, networks])

  if (networkWithFailedRPC && networkWithFailedRPC?.length > 0 && !!temporaryToken) {
    return <Alert type="error" title={t('This network RPC is failing')} />
  }
  if (isLoading && tokenTypeEligibility === undefined) {
    return (
      <View style={[flexbox.flex1, flexbox.alignCenter, flexbox.justifyCenter]}>
        <Spinner />
      </View>
    )
  }

  return (
    <TabLayoutContainer
      width="full"
      backgroundColor={theme.quinaryBackground}
      header={
        <Header
          mode="custom-inner-content"
          withAmbireLogo
          backgroundColor={theme.quinaryBackground as string}
        />
      }
      footer={
        <ActionFooter
          onReject={handleCancel}
          onResolve={handleAddToken}
          resolveButtonText={isLoading ? t('Adding token...') : t('Add token')}
          resolveDisabled={
            isLoading || showAlreadyInPortfolioMessage || (!tokenTypeEligibility && !temporaryToken)
          }
        />
      }
    >
      {(!tokenTypeEligibility &&
        tokenTypeEligibility !== undefined &&
        !temporaryToken &&
        !isLoadingTemporaryToken) ||
      (!tokenNetwork && !isLoading) ? (
        <View style={[flexbox.flex1, flexbox.alignCenter, flexbox.justifyCenter]}>
          <Alert type="error" title={t('This token type is not supported.')} />
        </View>
      ) : (
        <View style={[styles.container]}>
          <View style={styles.content}>
            <View style={styles.contentHeader}>
              <Text weight="medium" fontSize={20} style={spacings.mbLg} numberOfLines={1}>
                {t('Add suggested token')}
              </Text>
              <View style={spacings.mb}>
                <TokenIcon
                  withContainer
                  chainId={tokenNetwork?.chainId}
                  containerHeight={56}
                  containerWidth={56}
                  networkSize={20}
                  address={tokenData?.address}
                  width={50}
                  height={50}
                  networkWrapperStyle={{
                    left: -8,
                    top: -4
                  }}
                />
              </View>
              <Text weight="semiBold" fontSize={20} numberOfLines={1}>
                {tokenData?.symbol}
              </Text>
              <NetworkBadge
                withOnPrefix
                chainId={tokenNetwork?.chainId}
                fontSize={14}
                iconSize={20}
                style={{
                  backgroundColor: theme.quaternaryBackground,
                  ...spacings.mb,
                  ...spacings.pr
                }}
                withIcon={false}
              />
              {temporaryToken?.priceIn?.length ? (
                <View style={[flexbox.alignEnd, { flex: 0.5 }]}>
                  {tokenData && (
                    <CoingeckoConfirmedBadge
                      text={t('Confirmed')}
                      address={tokenData.address}
                      network={tokenNetwork}
                    />
                  )}
                </View>
              ) : null}
            </View>

            <View style={styles.contentBody}>
              <Text fontSize={14} weight="medium" style={spacings.mbTy}>
                {t('Token info')}
              </Text>
              <View style={[styles.tokenInfoContainer, spacings.mbTy]}>
                <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mr]}>
                  <View style={styles.tokenInfoIconWrapper}>
                    <AmountIcon
                      color={
                        themeType === THEME_TYPES.DARK ? theme.secondaryText : theme.tertiaryText
                      }
                    />
                  </View>
                  <Text
                    fontSize={14}
                    color={
                      themeType === THEME_TYPES.DARK ? theme.secondaryText : theme.tertiaryText
                    }
                  >
                    {t('Amount')}
                  </Text>
                </View>
                <Text
                  weight="medium"
                  fontSize={14}
                  color={themeType === THEME_TYPES.DARK ? theme.secondaryText : theme.tertiaryText}
                  numberOfLines={1}
                >
                  {tokenDetails?.balance || '0.00'} {tokenData?.symbol}
                </Text>
              </View>
              <View style={[styles.tokenInfoContainer, spacings.mbTy]}>
                <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mr]}>
                  <View style={styles.tokenInfoIconWrapper}>
                    <DollarIcon
                      color={
                        themeType === THEME_TYPES.DARK ? theme.secondaryText : theme.tertiaryText
                      }
                    />
                  </View>
                  <Text
                    fontSize={14}
                    color={
                      themeType === THEME_TYPES.DARK ? theme.secondaryText : theme.tertiaryText
                    }
                  >
                    {t('Price')}
                  </Text>
                </View>
                <Text
                  weight="medium"
                  fontSize={14}
                  color={themeType === THEME_TYPES.DARK ? theme.secondaryText : theme.tertiaryText}
                >
                  {isLoading ? (
                    <View style={[flexbox.flex1, flexbox.alignCenter, flexbox.justifyCenter]}>
                      <Spinner style={{ width: 18, height: 18 }} />
                    </View>
                  ) : (
                    tokenDetails?.priceUSDFormatted
                  )}
                </Text>
              </View>
              <View style={[styles.tokenInfoContainer]}>
                <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mr]}>
                  <View style={styles.tokenInfoIconWrapper}>
                    <ValueIcon
                      color={
                        themeType === THEME_TYPES.DARK ? theme.secondaryText : theme.tertiaryText
                      }
                    />
                  </View>
                  <Text
                    fontSize={14}
                    color={
                      themeType === THEME_TYPES.DARK ? theme.secondaryText : theme.tertiaryText
                    }
                  >
                    {t('Value')}
                  </Text>
                </View>
                <Text
                  weight="medium"
                  fontSize={14}
                  color={themeType === THEME_TYPES.DARK ? theme.secondaryText : theme.tertiaryText}
                >
                  {tokenDetails?.balanceUSDFormatted || '-'}
                </Text>
              </View>

              {!!showAlreadyInPortfolioMessage && (
                <View style={spacings.ptMd}>
                  <Alert
                    size="sm"
                    type="info2"
                    title={
                      isTokenCustom
                        ? t('This token is already added as a custom token.')
                        : t('This token is already in your portfolio.')
                    }
                  />
                </View>
              )}
            </View>
          </View>
        </View>
      )}
    </TabLayoutContainer>
  )
}

export default React.memo(WatchTokenRequestScreen)
