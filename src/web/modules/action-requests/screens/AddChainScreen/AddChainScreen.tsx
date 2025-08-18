/* eslint-disable react/jsx-no-useless-fragment */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { AddNetworkRequestParams, Network, NetworkFeature } from '@ambire-common/interfaces/network'
import { isDappRequestAction } from '@ambire-common/libs/actions/actions'
import { getFeatures } from '@ambire-common/libs/networks/networks'
import ManifestFallbackIcon from '@common/assets/svg/ManifestFallbackIcon'
import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import NetworkIcon from '@common/components/NetworkIcon'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import SuccessAnimation from '@common/components/SuccessAnimation'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import HeaderAccountAndNetworkInfo from '@web/components/HeaderAccountAndNetworkInfo'
import ManifestImage from '@web/components/ManifestImage'
import NetworkAvailableFeatures from '@web/components/NetworkAvailableFeatures'
import NetworkDetails from '@web/components/NetworkDetails'
import {
  TabLayoutContainer,
  TabLayoutWrapperMainContent
} from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import useActionsControllerState from '@web/hooks/useActionsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import ActionFooter from '@web/modules/action-requests/components/ActionFooter'
import validateRequestParams from '@web/modules/action-requests/screens/AddChainScreen/validateRequestParams'

import getStyles from './styles'

/**
 * This screen is used to add a new network to the wallet. If the network is already in the wallet
 * but disabled, it will be enabled. The configuration usually comes from the dApp, but in the case
 * that it already exists, the dApp configuration is ignored.
 */
const AddChainScreen = () => {
  const { t } = useTranslation()
  const { styles, theme, themeType } = useTheme(getStyles)
  const { dispatch } = useBackgroundService()
  const state = useActionsControllerState()
  const [areParamsValid, setAreParamsValid] = useState<boolean | null>(null)
  const { statuses, networkToAddOrUpdate, disabledNetworks, networks } =
    useNetworksControllerState()
  const [features, setFeatures] = useState<NetworkFeature[]>(getFeatures(undefined, undefined))
  const [rpcUrlIndex, setRpcUrlIndex] = useState<number>(0)
  const [existingNetwork, setExistingNetwork] = useState<Network | null | undefined>(undefined)
  const actionButtonPressedRef = useRef(false)
  const [successStateText, setSuccessStateText] = useState<string>(
    t('already added to your wallet.')
  )

  const dappAction = useMemo(
    () => (isDappRequestAction(state.currentAction) ? state.currentAction : null),
    [state.currentAction]
  )

  const userRequest = useMemo(() => {
    if (!dappAction) return undefined
    if (dappAction.userRequest.action.kind !== 'walletAddEthereumChain') return undefined

    return dappAction.userRequest
  }, [dappAction])

  const requestData = useMemo(() => userRequest?.action?.params?.[0], [userRequest])

  const requestKind = useMemo(() => userRequest?.action?.kind, [userRequest?.action?.kind])

  const requestSession = useMemo(() => userRequest?.session, [userRequest?.session])

  const networkAlreadyAdded = useMemo(
    () =>
      networks.find(
        (network) => requestData?.chainId && network.chainId === BigInt(requestData.chainId)
      ) || null,
    [networks, requestData?.chainId]
  )

  // existingNetwork must be set in a useEffect and can't be a useMemo. That is because we must
  // set its value only once and never change it. Otherwise the screen rerenders when a network is
  // added/enabled with the wrong state.
  useEffect(() => {
    if (existingNetwork || existingNetwork === null || !requestData?.chainId) return
    const matchingNetwork =
      disabledNetworks.find((network) => network.chainId === BigInt(requestData.chainId)) || null

    setExistingNetwork(matchingNetwork)
  }, [disabledNetworks, existingNetwork, requestData?.chainId])

  useEffect(() => {
    setAreParamsValid(validateRequestParams(requestKind, requestData))
  }, [requestKind, requestData])

  const rpcUrls: string[] = useMemo(() => {
    if (existingNetwork) return existingNetwork.rpcUrls
    if (!requestData || !requestData?.rpcUrls) return []

    return requestData.rpcUrls.filter((url: string) => !!url && url.startsWith('http'))
  }, [requestData, existingNetwork])

  const networkDetails: AddNetworkRequestParams | undefined = useMemo(() => {
    if (!areParamsValid || !requestData) return undefined
    if (!requestData.rpcUrls) return
    if (existingNetwork) {
      return {
        ...existingNetwork,
        iconUrls: existingNetwork.iconUrls || requestData.iconUrls || []
      }
    }

    const name = requestData.chainName
    const nativeAssetSymbol = requestData.nativeCurrency?.symbol
    const nativeAssetName = requestData.nativeCurrency?.name

    try {
      return {
        name,
        rpcUrls,
        selectedRpcUrl: rpcUrls[rpcUrlIndex],
        chainId: BigInt(requestData.chainId),
        nativeAssetSymbol,
        nativeAssetName,
        explorerUrl: requestData.blockExplorerUrls?.[0],
        iconUrls: requestData.iconUrls || []
      }
    } catch (error) {
      console.error(error)
      return undefined
    }
  }, [areParamsValid, requestData, existingNetwork, rpcUrls, rpcUrlIndex])

  useEffect(() => {
    // Don't set the network to add or update if the network is already in the extension
    if (!networkDetails || existingNetwork) return

    dispatch({
      type: 'SETTINGS_CONTROLLER_SET_NETWORK_TO_ADD_OR_UPDATE',
      params: { chainId: networkDetails.chainId, rpcUrl: networkDetails.selectedRpcUrl }
    })
  }, [dispatch, rpcUrlIndex, networkDetails, existingNetwork, networkToAddOrUpdate?.chainId])

  useEffect(() => {
    if (existingNetwork) {
      setFeatures(
        getFeatures(
          {
            ...existingNetwork,
            isOptimistic: !!existingNetwork.isOptimistic,
            flagged: !!existingNetwork.flagged
          },
          existingNetwork
        )
      )

      return
    }

    setFeatures(getFeatures(networkToAddOrUpdate?.info, undefined))
  }, [networkToAddOrUpdate?.info, networkDetails, existingNetwork])

  useEffect(() => {
    if (!dappAction) return
    if (statuses.addNetwork === 'SUCCESS') {
      setSuccessStateText(t('successfully added to your wallet.'))
    } else if (statuses.updateNetwork === 'SUCCESS') {
      setSuccessStateText(t('successfully enabled.'))
    } else if (statuses.addNetwork === 'ERROR' || statuses.updateNetwork === 'ERROR') {
      actionButtonPressedRef.current = false
    }
  }, [dispatch, t, statuses.addNetwork, dappAction, statuses.updateNetwork])

  const handleDenyButtonPress = useCallback(() => {
    if (!dappAction) return

    actionButtonPressedRef.current = true
    dispatch({
      type: 'REQUESTS_CONTROLLER_REJECT_USER_REQUEST',
      params: { err: t('User rejected the request.'), id: dappAction.id }
    })
  }, [dappAction, t, dispatch])

  const handleCloseOnAlreadyAdded = useCallback(() => {
    if (!dappAction) return

    actionButtonPressedRef.current = true
    dispatch({
      type: 'REQUESTS_CONTROLLER_RESOLVE_USER_REQUEST',
      params: { data: null, id: dappAction.id }
    })
  }, [dappAction, dispatch])

  const handlePrimaryButtonPress = useCallback(() => {
    if (!networkDetails) return
    actionButtonPressedRef.current = true
    if (existingNetwork) {
      dispatch({
        type: 'MAIN_CONTROLLER_UPDATE_NETWORK',
        params: {
          chainId: existingNetwork.chainId,
          network: {
            disabled: false
          }
        }
      })
    } else {
      dispatch({
        type: 'MAIN_CONTROLLER_ADD_NETWORK',
        params: networkDetails
      })
    }
  }, [dispatch, existingNetwork, networkDetails])

  const handleRetryWithDifferentRpcUrl = useCallback(() => {
    setRpcUrlIndex((prev) => prev + 1)
  }, [])

  const resolveButtonText = useMemo(() => {
    if (
      existingNetwork &&
      (statuses.updateNetwork === 'LOADING' || actionButtonPressedRef.current)
    ) {
      return t('Enabling network...')
    }
    if (!existingNetwork && (statuses.addNetwork === 'LOADING' || actionButtonPressedRef.current)) {
      return t('Adding network...')
    }

    return existingNetwork ? t('Enable network') : t('Add network')
  }, [existingNetwork, statuses.addNetwork, statuses.updateNetwork, t])

  return (
    <TabLayoutContainer
      width="full"
      header={
        <HeaderAccountAndNetworkInfo
          backgroundColor={
            themeType === THEME_TYPES.DARK
              ? (theme.tertiaryBackground as string)
              : (theme.primaryBackground as string)
          }
        />
      }
      footer={
        networkAlreadyAdded ? (
          <View style={flexbox.flex1}>
            <Button
              testID="added-network-close-button"
              style={{ ...spacings.phLg, ...flexbox.alignSelfEnd, minWidth: 128 }}
              size="large"
              hasBottomSpacing={false}
              onPress={handleCloseOnAlreadyAdded}
              text={t('Close')}
              type="primary"
              disabled={statuses.addNetwork === 'LOADING' || statuses.updateNetwork === 'LOADING'}
            />
          </View>
        ) : (
          <ActionFooter
            onReject={handleDenyButtonPress}
            onResolve={handlePrimaryButtonPress}
            resolveButtonText={resolveButtonText}
            resolveDisabled={
              !areParamsValid ||
              statuses.addNetwork === 'LOADING' ||
              statuses.updateNetwork === 'LOADING' ||
              (features &&
                (features.some((f) => f.level === 'loading') ||
                  !!features.filter((f) => f.id === 'flagged')[0])) ||
              actionButtonPressedRef.current
            }
          />
        )
      }
      backgroundColor={theme.quinaryBackground}
    >
      <TabLayoutWrapperMainContent style={spacings.mbLg} withScroll={false}>
        {networkAlreadyAdded ? (
          <View style={[flexbox.flex1, flexbox.alignCenter, spacings.mt2Xl]}>
            <SuccessAnimation>
              <Text fontSize={20} weight="medium" style={spacings.mb}>
                {networkAlreadyAdded.name} {t('Network')}
              </Text>
              <Text fontSize={15} appearance="secondaryText">
                {successStateText}
              </Text>
            </SuccessAnimation>
          </View>
        ) : (
          <>
            <Text weight="medium" fontSize={20} style={spacings.mbMd}>
              {t('Add new network')}
            </Text>

            <View style={styles.dappInfoContainer}>
              {!existingNetwork && (
                <ManifestImage
                  uri={requestSession?.icon}
                  size={50}
                  fallback={() => <ManifestFallbackIcon />}
                  containerStyle={spacings.mrMd}
                />
              )}

              {!existingNetwork ? (
                <Trans values={{ name: requestSession?.name || 'The App' }}>
                  <Text>
                    <Text fontSize={20} appearance="secondaryText">
                      {t('Allow ')}
                    </Text>
                    <Text fontSize={20} weight="semiBold">
                      {'{{name}} '}
                    </Text>
                    <Text fontSize={20} appearance="secondaryText">
                      {t('to add a network')}
                    </Text>
                  </Text>
                </Trans>
              ) : (
                <View style={[flexbox.flex1, flexbox.directionRow, flexbox.alignCenter]}>
                  <NetworkIcon
                    id={String(existingNetwork.chainId)}
                    size={50}
                    style={spacings.mrMd}
                  />

                  <View style={flexbox.flex1}>
                    <Text fontSize={20} weight="semiBold">
                      {existingNetwork.name}
                    </Text>
                    <Text appearance="secondaryText" weight="medium" numberOfLines={2}>
                      {t("found in Ambire Wallet but it's disabled. Do you wish to enable it?")}
                    </Text>
                  </View>
                </View>
              )}
            </View>
            {!existingNetwork && (
              <Text fontSize={14} weight="medium" appearance="secondaryText" style={spacings.mb}>
                {t('Ambire Wallet does not verify custom networks.')}
              </Text>
            )}
            {!!areParamsValid && !!networkDetails && (
              <View style={[flexbox.directionRow, flexbox.flex1]}>
                <View style={styles.boxWrapper}>
                  <ScrollableWrapper style={flexbox.flex1} contentContainerStyle={{ flexGrow: 1 }}>
                    <NetworkDetails
                      name={networkDetails.name || userRequest?.action?.params?.[0]?.chainName}
                      iconUrls={networkDetails?.iconUrls || []}
                      chainId={networkDetails.chainId}
                      rpcUrls={networkDetails.rpcUrls}
                      selectedRpcUrl={rpcUrls[rpcUrlIndex]}
                      nativeAssetSymbol={networkDetails.nativeAssetSymbol}
                      nativeAssetName={networkDetails.nativeAssetName}
                      explorerUrl={networkDetails.explorerUrl}
                      style={{
                        backgroundColor:
                          themeType === THEME_TYPES.DARK
                            ? theme.secondaryBackground
                            : theme.primaryBackground
                      }}
                      type="vertical"
                    />
                  </ScrollableWrapper>
                </View>
                <View style={styles.separator} />
                <ScrollableWrapper style={flexbox.flex1} contentContainerStyle={{ flexGrow: 1 }}>
                  {!!networkDetails && (
                    <NetworkAvailableFeatures
                      features={features}
                      chainId={networkDetails.chainId}
                      withRetryButton={!!rpcUrls.length && rpcUrlIndex < rpcUrls.length - 1}
                      handleRetry={handleRetryWithDifferentRpcUrl}
                    />
                  )}
                </ScrollableWrapper>
              </View>
            )}
            {!areParamsValid && areParamsValid !== null && !actionButtonPressedRef.current && (
              <View style={[flexbox.flex1, flexbox.alignCenter, flexbox.justifyCenter]}>
                <Alert
                  title={t('Invalid Request Params')}
                  text={t(
                    `${
                      userRequest?.session?.name || 'The App'
                    } provided invalid params for adding a new network.`
                  )}
                  type="error"
                />
              </View>
            )}
          </>
        )}
      </TabLayoutWrapperMainContent>
    </TabLayoutContainer>
  )
}

export default React.memo(AddChainScreen)
