import React, { FC, useCallback, useEffect, useState } from 'react'
import { Animated, Pressable, View } from 'react-native'

import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import SkeletonLoader from '@common/components/SkeletonLoader'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import DashboardHeader from '@web/modules/PPv1/screens/dashboard/components/DashboardHeader'
import Gradients from '@web/modules/PPv1/screens/dashboard/components/Gradients/Gradients'
import Routes from '@web/modules/PPv1/screens/dashboard/components/Routes'
import useBalanceAffectingErrors from '@web/modules/PPv1/screens/dashboard/hooks/useBalanceAffectingErrors'
import { OVERVIEW_CONTENT_MAX_HEIGHT } from '@web/modules/PPv1/screens/dashboard/screens/DashboardScreen'
import { DASHBOARD_OVERVIEW_BACKGROUND } from '@web/modules/PPv1/screens/dashboard/screens/styles'
import spacings, { SPACING, SPACING_TY, SPACING_XL } from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import useHover, { AnimatedPressable } from '@web/hooks/useHover'
import useMainControllerState from '@web/hooks/useMainControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import usePrivacyPoolsForm from '@web/modules/PPv1/hooks/usePrivacyPoolsForm'

import BalanceAffectingErrors from './BalanceAffectingErrors'
import RefreshIcon from './RefreshIcon'
import getStyles from './styles'

interface Props {
  openReceiveModal: () => void
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
}

// We create a reusable height constant for both the Balance line-height and the Balance skeleton.
// We want both components to have the same height; otherwise, clicking on the RefreshIcon causes a layout shift.
const BALANCE_HEIGHT = 34

const DashboardOverview: FC<Props> = ({
  animatedOverviewHeight,
  dashboardOverviewSize,
  setDashboardOverviewSize,
  onGasTankButtonPosition
}) => {
  const { t } = useTranslation()
  const { theme, styles, themeType } = useTheme(getStyles)
  const { isOffline } = useMainControllerState()
  const { portfolio } = useSelectedAccountControllerState()
  const { isLoading, isAccountLoaded, totalPrivatePortfolio, refreshPrivateAccount } =
    usePrivacyPoolsForm()

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

  const [totalPrivatePortfolioInteger, totalPrivatePortfolioDecimal] = formatDecimals(
    totalPrivatePortfolio,
    'value'
  ).split('.')

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
                  {isLoading || !isAccountLoaded ? (
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
                          testID="total-portfolio-amount-eth"
                        >
                          {totalPrivatePortfolioInteger}
                          {t('.')}
                          {totalPrivatePortfolioDecimal}
                        </Text>
                      </Text>
                    </Pressable>
                  )}
                  <AnimatedPressable
                    style={[spacings.mlTy, refreshButtonAnimStyle]}
                    onPress={() => refreshPrivateAccount(true)}
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
                  {/* {isLoading || !isAccountLoaded ? (
                    <SkeletonLoader
                      lowOpacity
                      width={150}
                      height={BALANCE_HEIGHT / 1.2}
                      borderRadius={8}
                    />
                  ) : (
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
                      {' '}
                      ({totalPrivatePortfolioInteger}
                      {t('.')}
                      {totalPrivatePortfolioDecimal})
                    </Text>
                  )} */}
                  <BalanceAffectingErrors
                    reloadAccount={refreshPrivateAccount}
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
              <Routes />
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    </View>
  )
}

export default React.memo(DashboardOverview)
