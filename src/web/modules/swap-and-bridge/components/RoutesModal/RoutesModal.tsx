import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'

import { EstimationStatus } from '@ambire-common/controllers/estimation/types'
import { SwapAndBridgeRoute } from '@ambire-common/interfaces/swapAndBridge'
import LeftArrowIcon from '@common/assets/svg/LeftArrowIcon'
import BottomSheet from '@common/components/BottomSheet'
import ScrollableWrapper, { WRAPPER_TYPES } from '@common/components/ScrollableWrapper'
import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import spacings, { SPACING_LG } from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { TRANSACTION_FORM_WIDTH } from '@web/components/TransactionsScreen/styles'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSwapAndBridgeControllerState from '@web/hooks/useSwapAndBridgeControllerState'
import RouteStepsPreview from '@web/modules/swap-and-bridge/components/RouteStepsPreview'
import { getUiType } from '@web/utils/uiType'

import getStyles from './styles'

const FLAT_LIST_ITEM_HEIGHT = 138.5

const { isPopup } = getUiType()

const RoutesModal = ({
  sheetRef,
  closeBottomSheet
}: {
  sheetRef: React.RefObject<any>
  closeBottomSheet: (dest?: 'default' | 'alwaysOpen' | undefined) => void
}) => {
  const { t } = useTranslation()
  const { styles, theme } = useTheme(getStyles)
  const { quote, shouldEnableRoutesSelection, signAccountOpController } =
    useSwapAndBridgeControllerState()
  const { dispatch } = useBackgroundService()
  const scrollRef: any = useRef(null)
  const { height } = useWindowSize()
  // there's a small discrepancy between ticks and we want to capture that
  const [userSelectedRoute, setUserSelectedRoute] = useState<SwapAndBridgeRoute | undefined>(
    undefined
  )
  const [isEstimationLoading, setIsEstimationLoading] = useState<boolean>(false)
  const [disabledRoutes, setDisabledRoutes] = useState<string[]>([])

  const persistedSelectedRoute = useMemo(() => {
    return quote?.selectedRoute
  }, [quote?.selectedRoute])

  useEffect(() => {
    setUserSelectedRoute(persistedSelectedRoute)
  }, [persistedSelectedRoute])

  const handleSelectRoute = useCallback(
    (route: SwapAndBridgeRoute) => {
      if (!route) return
      if (disabledRoutes.indexOf(route.routeId) !== -1) return

      if (route.routeId === persistedSelectedRoute?.routeId) {
        closeBottomSheet()
        return
      }

      dispatch({
        type: 'SWAP_AND_BRIDGE_CONTROLLER_SELECT_ROUTE',
        params: { route, isAutoSelectDisabled: true }
      })
      setUserSelectedRoute(route)
      setIsEstimationLoading(true)
    },
    [closeBottomSheet, dispatch, persistedSelectedRoute, disabledRoutes]
  )

  useEffect(() => {
    if (!signAccountOpController) return
    if (!isEstimationLoading) return
    if (!userSelectedRoute || !persistedSelectedRoute) return

    if (
      userSelectedRoute.routeId === persistedSelectedRoute.routeId &&
      signAccountOpController.estimation.status === EstimationStatus.Error
    ) {
      setIsEstimationLoading(false)
      disabledRoutes.push(persistedSelectedRoute.routeId)
      setDisabledRoutes(disabledRoutes)
      dispatch({
        type: 'SWAP_AND_BRIDGE_CONTROLLER_MARK_SELECTED_ROUTE_AS_FAILED'
      })
    }

    if (
      userSelectedRoute.routeId === persistedSelectedRoute.routeId &&
      signAccountOpController.estimation.status === EstimationStatus.Success
    ) {
      setIsEstimationLoading(false)
      closeBottomSheet()
    }
  }, [
    userSelectedRoute,
    signAccountOpController,
    closeBottomSheet,
    persistedSelectedRoute,
    isEstimationLoading,
    disabledRoutes,
    dispatch
  ])

  const renderItem = useCallback(
    // eslint-disable-next-line react/no-unused-prop-types
    ({ item, index }: { item: SwapAndBridgeRoute; index: number }) => {
      const { steps, inputValueInUsd, outputValueInUsd } = item
      const isDisabled = disabledRoutes.indexOf(item.routeId) !== -1
      const isEstimatingRoute = isEstimationLoading && item.routeId === userSelectedRoute?.routeId
      const isSelected = item.routeId === userSelectedRoute?.routeId && !isEstimatingRoute

      return (
        <Pressable
          key={item.routeId}
          style={({ hovered }: any) => [
            styles.itemContainer,
            index + 1 === quote?.routes?.length && spacings.mb0,
            isDisabled && styles.disabledItem,
            (isSelected || hovered) && styles.selectedItem,
            isEstimationLoading && !isEstimatingRoute && styles.otherItemLoading
          ]}
          onPress={() => handleSelectRoute(item)}
          // Disable route selection if any route is being estimated
          disabled={isEstimationLoading || isDisabled}
        >
          {isEstimatingRoute && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 2,
                backgroundColor: theme.backdrop,
                ...flexbox.alignCenter,
                ...flexbox.justifyCenter,
                ...common.borderRadiusPrimary
              }}
            >
              <Spinner style={{ width: 64, height: 64 }} variant="white" />
            </View>
          )}
          <RouteStepsPreview
            steps={steps}
            inputValueInUsd={inputValueInUsd}
            outputValueInUsd={outputValueInUsd}
            totalGasFeesInUsd={item.totalGasFeesInUsd}
            estimationInSeconds={item.serviceTime}
            isSelected={item.routeId === userSelectedRoute?.routeId && !isEstimatingRoute}
            isDisabled={isDisabled}
          />
        </Pressable>
      )
    },
    [
      disabledRoutes,
      isEstimationLoading,
      userSelectedRoute?.routeId,
      styles.itemContainer,
      styles.disabledItem,
      styles.selectedItem,
      styles.otherItemLoading,
      quote?.routes?.length,
      handleSelectRoute,
      theme
    ]
  )

  const selectedRouteIndex = useMemo(() => {
    if (!quote?.routes || !quote.routes.length) return 0
    if (!userSelectedRoute) return 0
    const selectedRouteIdx = quote.routes.findIndex((r) => r.routeId === userSelectedRoute.routeId)

    if (selectedRouteIdx === -1) return 0

    return selectedRouteIdx
  }, [quote?.routes, userSelectedRoute])

  if (!quote?.routes || !quote.routes.length || !shouldEnableRoutesSelection) return null

  return (
    <BottomSheet
      id="select-routes-modal"
      sheetRef={sheetRef}
      closeBottomSheet={closeBottomSheet}
      backgroundColor="secondaryBackground"
      style={{
        overflow: 'hidden',
        width: !isPopup ? TRANSACTION_FORM_WIDTH : '100%',
        minHeight: height * 0.7
      }}
      scrollViewProps={{
        contentContainerStyle: { flex: 1 },
        scrollEnabled: false
      }}
      onOpen={() => {
        if (!selectedRouteIndex) return

        // @TODO: Fix this
        setTimeout(() => {
          scrollRef?.current?.scrollTo({
            x: 0,
            y: selectedRouteIndex * FLAT_LIST_ITEM_HEIGHT - SPACING_LG
          })
        }, 100)
      }}
      containerInnerWrapperStyles={flexbox.flex1}
    >
      <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbXl]}>
        <Pressable
          onPress={() => closeBottomSheet()}
          style={{
            width: 28,
            height: 28,
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <LeftArrowIcon width={16} height={16} />
        </Pressable>
        <Text fontSize={20} weight="semiBold" numberOfLines={1} style={spacings.mlTy}>
          {t('Select route')}
        </Text>
      </View>
      <ScrollableWrapper
        type={WRAPPER_TYPES.FLAT_LIST}
        data={quote.routes}
        wrapperRef={scrollRef}
        keyExtractor={(r: SwapAndBridgeRoute) => r.routeId.toString()}
        renderItem={renderItem}
        initialNumToRender={6}
        windowSize={6}
        maxToRenderPerBatch={6}
        removeClippedSubviews
      />
    </BottomSheet>
  )
}

export default React.memo(RoutesModal)
