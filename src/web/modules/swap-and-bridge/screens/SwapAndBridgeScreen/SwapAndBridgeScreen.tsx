import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { EstimationStatus } from '@ambire-common/controllers/estimation/types'
import { SigningStatus } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { SwapAndBridgeFormStatus } from '@ambire-common/controllers/swapAndBridge/swapAndBridge'
import { Key } from '@ambire-common/interfaces/keystore'
import Alert from '@common/components/Alert'
import BackButton from '@common/components/BackButton'
import Spinner from '@common/components/Spinner'
import useNavigation from '@common/hooks/useNavigation'
import usePrevious from '@common/hooks/usePrevious'
import { ROUTES, WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { Content, Form, Wrapper } from '@web/components/TransactionsScreen'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useRequestsControllerState from '@web/hooks/useRequestsControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import useSwapAndBridgeControllerState from '@web/hooks/useSwapAndBridgeControllerState'
import BatchAdded from '@web/modules/sign-account-op/components/OneClick/BatchModal/BatchAdded'
import Buttons from '@web/modules/sign-account-op/components/OneClick/Buttons'
import Estimation from '@web/modules/sign-account-op/components/OneClick/Estimation'
import RoutesModal from '@web/modules/swap-and-bridge/components/RoutesModal'
import useSwapAndBridgeForm from '@web/modules/swap-and-bridge/hooks/useSwapAndBridgeForm'
import { getUiType } from '@web/utils/uiType'

import TrackProgress from '../../components/Estimation/TrackProgress'
import FromToken from '../../components/FromToken'
import PriceImpactWarningModal from '../../components/PriceImpactWarningModal'
import RouteInfo from '../../components/RouteInfo'
import ToToken from '../../components/ToToken'

const { isTab, isActionWindow } = getUiType()

const SwapAndBridgeScreen = () => {
  const { t } = useTranslation()
  const { navigate } = useNavigation()
  const {
    sessionId,
    fromAmountValue,
    onFromAmountChange,
    fromTokenOptions,
    fromTokenValue,
    fromTokenAmountSelectDisabled,
    handleSubmitForm,
    highPriceImpactOrSlippageWarning,
    priceImpactModalRef,
    closePriceImpactModal,
    acknowledgeHighPriceImpact,
    pendingRoutes,
    routesModalRef,
    openRoutesModal,
    closeRoutesModal,
    estimationModalRef,
    setHasBroadcasted,
    displayedView,
    closeEstimationModalWrapped,
    setIsAutoSelectRouteDisabled,
    isBridge,
    setShowAddedToBatch,
    networkUserRequests,
    isLocalStateOutOfSync
  } = useSwapAndBridgeForm()
  const {
    sessionIds,
    formStatus,
    isHealthy,
    shouldEnableRoutesSelection,
    updateQuoteStatus,
    signAccountOpController,
    isAutoSelectRouteDisabled,
    hasProceeded,
    swapSignErrors
  } = useSwapAndBridgeControllerState()
  const { portfolio } = useSelectedAccountControllerState()

  const { statuses: requestsCtrlStatuses } = useRequestsControllerState()
  const prevPendingRoutes: any[] | undefined = usePrevious(pendingRoutes)
  const scrollViewRef: any = useRef(null)
  const { dispatch } = useBackgroundService()

  useEffect(() => {
    if (!pendingRoutes || !prevPendingRoutes) return
    if (!pendingRoutes.length) return
    if (prevPendingRoutes.length < pendingRoutes.length) {
      // scroll to top when there is a new item in the active routes list
      scrollViewRef.current?.scrollTo({ y: 0 })
    }
  }, [pendingRoutes, prevPendingRoutes])

  // TODO: Disable tokens that are NOT supported
  // (not in the `fromTokenList` of the SwapAndBridge controller)

  // TODO: Confirmation modal (warn) if the diff in dollar amount between the
  // FROM and TO tokens is too high (therefore, user will lose money).

  const isEstimatingRoute =
    formStatus === SwapAndBridgeFormStatus.ReadyToEstimate &&
    (!signAccountOpController ||
      signAccountOpController.estimation.status === EstimationStatus.Loading)

  const isLoading = useMemo(() => {
    return (
      requestsCtrlStatuses.buildSwapAndBridgeUserRequest !== 'INITIAL' ||
      updateQuoteStatus === 'LOADING' ||
      isEstimatingRoute
    )
  }, [isEstimatingRoute, requestsCtrlStatuses.buildSwapAndBridgeUserRequest, updateQuoteStatus])

  const isNotReadyToProceed = useMemo(() => {
    return formStatus !== SwapAndBridgeFormStatus.ReadyToSubmit || isLoading
  }, [formStatus, isLoading])

  const onBatchAddedPrimaryButtonPress = useCallback(() => {
    navigate(WEB_ROUTES.dashboard)
  }, [navigate])
  const onBatchAddedSecondaryButtonPress = useCallback(() => {
    setShowAddedToBatch(false)
  }, [setShowAddedToBatch])

  const onBackButtonPress = useCallback(() => {
    dispatch({
      type: 'SWAP_AND_BRIDGE_CONTROLLER_UNLOAD_SCREEN',
      params: { sessionId, forceUnload: true }
    })
    if (isActionWindow) {
      dispatch({
        type: 'CLOSE_SIGNING_ACTION_WINDOW',
        params: {
          type: 'swapAndBridge'
        }
      })
    } else {
      navigate(ROUTES.dashboard)
    }
  }, [dispatch, navigate, sessionId])

  /**
   * Single click broadcast
   */
  const handleBroadcastAccountOp = useCallback(() => {
    dispatch({
      type: 'MAIN_CONTROLLER_HANDLE_SIGN_AND_BROADCAST_ACCOUNT_OP',
      params: {
        updateType: 'Swap&Bridge'
      }
    })
  }, [dispatch])

  const handleUpdateStatus = useCallback(
    (status: SigningStatus) => {
      dispatch({
        type: 'SWAP_AND_BRIDGE_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE_STATUS',
        params: {
          status
        }
      })
    },
    [dispatch]
  )
  const updateController = useCallback(
    (params: { signingKeyAddr?: Key['addr']; signingKeyType?: Key['type'] }) => {
      dispatch({
        type: 'SWAP_AND_BRIDGE_CONTROLLER_SIGN_ACCOUNT_OP_UPDATE',
        params
      })
    },
    [dispatch]
  )

  const buttons = useMemo(() => {
    return (
      <>
        {isTab && <BackButton onPress={onBackButtonPress} />}
        <Buttons
          signAccountOpErrors={swapSignErrors}
          isNotReadyToProceed={isNotReadyToProceed}
          isLoading={isLoading}
          handleSubmitForm={handleSubmitForm}
          isBridge={isBridge}
          networkUserRequests={networkUserRequests}
          isLocalStateOutOfSync={isLocalStateOutOfSync}
        />
      </>
    )
  }, [
    onBackButtonPress,
    swapSignErrors,
    isNotReadyToProceed,
    isLoading,
    handleSubmitForm,
    isBridge,
    networkUserRequests,
    isLocalStateOutOfSync
  ])

  if (!sessionIds.includes(sessionId)) {
    // If the portfolio has loaded we can skip the spinner as initializing the screen
    // takes a short time and the spinner will only flash.
    if (portfolio.isReadyToVisualize) return null

    return (
      <View style={[flexbox.flex1, flexbox.justifyCenter, flexbox.alignCenter]}>
        <Spinner />
      </View>
    )
  }

  if (displayedView === 'track') {
    return (
      <TrackProgress
        handleClose={() => {
          setHasBroadcasted(false)
        }}
      />
    )
  }

  if (displayedView === 'batch') {
    return (
      <BatchAdded
        title={t('Swap & Bridge')}
        primaryButtonText={t('Open dashboard')}
        secondaryButtonText={t('Add more')}
        onPrimaryButtonPress={onBatchAddedPrimaryButtonPress}
        onSecondaryButtonPress={onBatchAddedSecondaryButtonPress}
      />
    )
  }

  return (
    <Wrapper title={t('Swap & Bridge')} handleGoBack={onBackButtonPress} buttons={buttons}>
      <Content scrollViewRef={scrollViewRef} buttons={buttons}>
        {isHealthy === false && (
          <Alert
            type="error"
            title={t('Temporarily unavailable.')}
            text={t(
              "We're currently unable to initiate a swap or bridge request because our service provider's API is temporarily unavailable. Please try again later. If the issue persists, check for updates or contact support."
            )}
            style={spacings.mb}
          />
        )}
        <Form>
          <FromToken
            fromTokenOptions={fromTokenOptions}
            fromTokenValue={fromTokenValue}
            fromAmountValue={fromAmountValue}
            fromTokenAmountSelectDisabled={fromTokenAmountSelectDisabled}
            onFromAmountChange={onFromAmountChange}
            setIsAutoSelectRouteDisabled={setIsAutoSelectRouteDisabled}
          />
          <ToToken
            isAutoSelectRouteDisabled={isAutoSelectRouteDisabled}
            setIsAutoSelectRouteDisabled={setIsAutoSelectRouteDisabled}
          />
        </Form>
        <RouteInfo
          isEstimatingRoute={isEstimatingRoute}
          openRoutesModal={openRoutesModal}
          shouldEnableRoutesSelection={shouldEnableRoutesSelection}
          isAutoSelectRouteDisabled={isAutoSelectRouteDisabled}
        />
      </Content>
      <RoutesModal sheetRef={routesModalRef} closeBottomSheet={closeRoutesModal} />
      <Estimation
        updateType="Swap&Bridge"
        estimationModalRef={estimationModalRef}
        closeEstimationModal={closeEstimationModalWrapped}
        updateController={updateController}
        handleUpdateStatus={handleUpdateStatus}
        handleBroadcastAccountOp={handleBroadcastAccountOp}
        hasProceeded={hasProceeded}
        signAccountOpController={signAccountOpController}
      />
      <PriceImpactWarningModal
        sheetRef={priceImpactModalRef}
        closeBottomSheet={closePriceImpactModal}
        acknowledgeHighPriceImpact={acknowledgeHighPriceImpact}
        highPriceImpactOrSlippageWarning={highPriceImpactOrSlippageWarning}
      />
    </Wrapper>
  )
}

export default React.memo(SwapAndBridgeScreen)
