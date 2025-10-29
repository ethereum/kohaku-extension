import React, { FC, useCallback, useEffect, useMemo, useState } from 'react'
import { Animated, Pressable, View } from 'react-native'

import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import SkeletonLoader from '@common/components/SkeletonLoader'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import DashboardHeader from '@common/modules/dashboard/components/DashboardHeader'
import Gradients from '@common/modules/dashboard/components/Gradients/Gradients'
import Routes from '@common/modules/dashboard/components/Routes'
import useBalanceAffectingErrors from '@common/modules/dashboard/hooks/useBalanceAffectingErrors'
import { OVERVIEW_CONTENT_MAX_HEIGHT } from '@common/modules/dashboard/screens/DashboardScreen'
import { DASHBOARD_OVERVIEW_BACKGROUND } from '@common/modules/dashboard/screens/styles'
import spacings, { SPACING, SPACING_TY, SPACING_XL } from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useHover, { AnimatedPressable } from '@web/hooks/useHover'
import useMainControllerState from '@web/hooks/useMainControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

import Spinner from '@common/components/Spinner'
import BalanceAffectingErrors from './BalanceAffectingErrors'
import RefreshIcon from './RefreshIcon'
import getStyles from './styles'

interface Props {
  openReceiveModal: () => void
  openGasTankModal?: () => void
  animatedOverviewHeight: Animated.Value
  dashboardOverviewSize: {
    width: number
    height: number
  }
  setDashboardOverviewSize: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>
  onGasTankButtonPosition: (position: {
    x: number
    y: number
    width: number
    height: number
  }) => void
  isPrivateAccountLoading?: boolean
}

// We create a reusable height constant for both the Balance line-height and the Balance skeleton.
// We want both components to have the same height; otherwise, clicking on the RefreshIcon causes a layout shift.
const BALANCE_HEIGHT = 34

const DashboardOverview: FC<Props> = ({
  openReceiveModal,
  animatedOverviewHeight,
  dashboardOverviewSize,
  setDashboardOverviewSize,
  onGasTankButtonPosition,
  isPrivateAccountLoading
}) => {
  const { dispatch } = useBackgroundService()
  const { t } = useTranslation()
  const { theme, styles, themeType } = useTheme(getStyles)
  const { isOffline } = useMainControllerState()
  const { account, dashboardNetworkFilter, portfolio } = useSelectedAccountControllerState()

  const [bindRefreshButtonAnim, refreshButtonAnimStyle] = useHover({
    preset: 'opacity'
  })
  const {
    sheetRef,
    balanceAffectingErrorsSnapshot,
    warningMessage,
    onIconPress,
    closeBottomSheetWrapped,
    isLoadingTakingTooLong,
    networksWithErrors
  } = useBalanceAffectingErrors()

  const totalPortfolioAmount = useMemo(() => {
    if (!dashboardNetworkFilter) return portfolio?.totalBalance || 0

    if (!account) return 0

    return Number(portfolio.balancePerNetwork[dashboardNetworkFilter.toString()]) || 0
  }, [portfolio, dashboardNetworkFilter, account])

  const [totalPortfolioAmountInteger, totalPortfolioAmountDecimal] = formatDecimals(
    totalPortfolioAmount,
    'value'
  ).split('.')

  const reloadAccount = useCallback(() => {
    dispatch({
      type: 'MAIN_CONTROLLER_RELOAD_SELECTED_ACCOUNT',
      params: {
        chainId: dashboardNetworkFilter ?? undefined
      }
    })
  }, [dashboardNetworkFilter, dispatch])

  const [buttonPosition, setButtonPosition] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)

  const onGasTankButtonPositionWrapped = useCallback(
    (position: { x: number; y: number; width: number; height: number }) => {
      setButtonPosition(position)
      onGasTankButtonPosition(position)
    },
    [onGasTankButtonPosition]
  )

  useEffect(() => {
    if (buttonPosition) {
      onGasTankButtonPositionWrapped(buttonPosition)
    }
  }, [buttonPosition, onGasTankButtonPositionWrapped])

  return (
    <View style={[spacings.phSm, spacings.mbMi]}>
      <View style={[styles.contentContainer]}>
        <Animated.View
          style={[
            common.borderRadiusPrimary,
            spacings.ptTy,
            spacings.phSm,
            {
              paddingBottom: animatedOverviewHeight.interpolate({
                inputRange: [0, OVERVIEW_CONTENT_MAX_HEIGHT],
                outputRange: [SPACING_TY, SPACING],
                extrapolate: 'clamp'
              }),
              backgroundColor:
                themeType === THEME_TYPES.DARK
                  ? `${DASHBOARD_OVERVIEW_BACKGROUND}80`
                  : DASHBOARD_OVERVIEW_BACKGROUND,
              overflow: 'hidden'
            }
          ]}
          onLayout={(e) => {
            setDashboardOverviewSize({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height
            })
          }}
        >
          <Gradients width={dashboardOverviewSize.width} height={dashboardOverviewSize.height} />
          <View style={{ zIndex: 2 }}>
            <DashboardHeader />
            <Animated.View
              style={{
                ...styles.overview,
                paddingTop: animatedOverviewHeight.interpolate({
                  inputRange: [0, SPACING_XL],
                  outputRange: [0, SPACING],
                  extrapolate: 'clamp'
                }),
                maxHeight: animatedOverviewHeight,
                overflow: 'hidden'
              }}
            >
              <View>
                <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
                  {!portfolio?.isAllReady ? (
                    <SkeletonLoader
                      lowOpacity
                      width={200}
                      height={BALANCE_HEIGHT}
                      borderRadius={8}
                    />
                  ) : (
                    <Pressable
                      onPress={onIconPress}
                      disabled={!warningMessage || isLoadingTakingTooLong || isOffline}
                      testID="full-balance"
                      style={[flexbox.directionRow, flexbox.alignCenter]}
                    >
                      <Text selectable>
                        <Text
                          fontSize={32}
                          shouldScale={false}
                          style={{
                            lineHeight: BALANCE_HEIGHT
                          }}
                          weight="number_bold"
                          color={
                            networksWithErrors.length || isOffline
                              ? theme.warningDecorative2
                              : themeType === THEME_TYPES.DARK
                              ? theme.primaryBackgroundInverted
                              : theme.primaryBackground
                          }
                          selectable
                          testID="total-portfolio-amount-integer"
                        >
                          {totalPortfolioAmountInteger}
                        </Text>
                        <Text
                          fontSize={20}
                          shouldScale={false}
                          weight="number_bold"
                          color={
                            networksWithErrors.length || isOffline
                              ? theme.warningDecorative2
                              : themeType === THEME_TYPES.DARK
                              ? theme.primaryBackgroundInverted
                              : theme.primaryBackground
                          }
                          selectable
                        >
                          {t('.')}
                          {totalPortfolioAmountDecimal}
                        </Text>
                      </Text>
                    </Pressable>
                  )}
                  <AnimatedPressable
                    style={[spacings.mlTy, refreshButtonAnimStyle]}
                    onPress={reloadAccount}
                    {...bindRefreshButtonAnim}
                    disabled={!portfolio?.isAllReady}
                    testID="refresh-button"
                  >
                    <RefreshIcon
                      spin={!portfolio?.isAllReady}
                      color={
                        themeType === THEME_TYPES.DARK
                          ? theme.primaryBackgroundInverted
                          : theme.primaryBackground
                      }
                      width={16}
                      height={16}
                    />
                  </AnimatedPressable>
                </View>

                <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                  {isPrivateAccountLoading && (
                    <>
                      <Spinner
                        variant="white"
                        style={{
                          width: 24,
                          height: 24
                        }}
                      />
                      <Text
                        fontSize={16}
                        shouldScale={false}
                        weight="number_bold"
                        color={theme.primaryBackground}
                      >
                        Loading Private Account
                      </Text>
                    </>
                  )}
                  <BalanceAffectingErrors
                    reloadAccount={reloadAccount}
                    networksWithErrors={networksWithErrors}
                    sheetRef={sheetRef}
                    balanceAffectingErrorsSnapshot={balanceAffectingErrorsSnapshot}
                    warningMessage={warningMessage}
                    onIconPress={onIconPress}
                    closeBottomSheetWrapped={closeBottomSheetWrapped}
                    isLoadingTakingTooLong={isLoadingTakingTooLong}
                  />
                </View>
              </View>
              <Routes openReceiveModal={openReceiveModal} />
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    </View>
  )
}

export default React.memo(DashboardOverview)
