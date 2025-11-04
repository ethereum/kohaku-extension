import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, NativeScrollEvent, NativeSyntheticEvent, View } from 'react-native'
import { useModalize } from 'react-native-modalize'

import { isWeb } from '@common/config/env'
import useDebounce from '@common/hooks/useDebounce'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import PendingActionWindowModal from '@common/modules/dashboard/components/PendingActionWindowModal'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import GasTankModal from '@web/components/GasTankModal'
import ReceiveModal from '@web/components/ReceiveModal'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { getUiType } from '@web/utils/uiType'

import usePrivacyPoolsForm from '@web/modules/PPv1/hooks/usePrivacyPoolsForm'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useNavigation from '@common/hooks/useNavigation'
import DAppFooter from '../components/DAppFooter'
import DashboardOverview from '../components/DashboardOverview'
import CongratsFirstCashbackModal from '../components/DashboardOverview/CongratsFirstCashbackModal'
import DashboardPages from '../components/DashboardPages'
import getStyles from './styles'
import DepositStatusBanner from '../components/DepositStatusBanner/DepositStatusBanner'

const { isPopup } = getUiType()

export const OVERVIEW_CONTENT_MAX_HEIGHT = 120

const DashboardScreen = () => {
  const { styles } = useTheme(getStyles)
  const { dispatch } = useBackgroundService()
  const { navigate } = useNavigation()
  const { addToast } = useToast()
  const { ref: receiveModalRef, open: openReceiveModal, close: closeReceiveModal } = useModalize()
  const { ref: gasTankModalRef, open: openGasTankModal, close: closeGasTankModal } = useModalize()
  const lastOffsetY = useRef(0)
  const scrollUpStartedAt = useRef(0)
  const [dashboardOverviewSize, setDashboardOverviewSize] = useState({
    width: 0,
    height: 0
  })
  const debouncedDashboardOverviewSize = useDebounce({ value: dashboardOverviewSize, delay: 100 })
  const animatedOverviewHeight = useRef(new Animated.Value(OVERVIEW_CONTENT_MAX_HEIGHT)).current

  const { account, portfolio, cashbackStatus } = useSelectedAccountControllerState()

  const { loadPrivateAccount, isAccountLoaded, isReadyToLoad } = usePrivacyPoolsForm()

  const onWithdrawBack = useCallback(() => {
    navigate(WEB_ROUTES.pp1Ragequit)
  }, [navigate])

  const onDeposit = useCallback(() => {
    navigate(WEB_ROUTES.pp1Deposit)
  }, [navigate])

  useEffect(() => {
    if (!isAccountLoaded && isReadyToLoad) {
      loadPrivateAccount().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load private account:', error)
        addToast('Failed to load your privacy account. Please try again.', { type: 'error' })
      })
    }
  }, [loadPrivateAccount, isAccountLoaded, isReadyToLoad, addToast])

  const hasUnseenFirstCashback = useMemo(
    () => cashbackStatus === 'cashback-modal',
    [cashbackStatus]
  )

  const [gasTankButtonPosition, setGasTankButtonPosition] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!isPopup) return

      const {
        contentOffset: { y }
      } = event.nativeEvent

      if (scrollUpStartedAt.current === 0 && lastOffsetY.current > y) {
        scrollUpStartedAt.current = y
      } else if (scrollUpStartedAt.current > 0 && y > lastOffsetY.current) {
        scrollUpStartedAt.current = 0
      }
      lastOffsetY.current = y

      // The user has to scroll down the height of the overview container in order make it smaller.
      // This is done, because hiding the overview will subtract the height of the overview from the height of the
      // scroll view, thus a shorter scroll container may no longer be scrollable after hiding the overview
      // and if that happens, the user will not be able to scroll up to expand the overview again.
      const scrollDownThreshold = dashboardOverviewSize.height
      // scrollUpThreshold must be a constant value and not dependent on the height of the overview,
      // because the height will change as the overview animates from small to large.
      const scrollUpThreshold = 200
      const isOverviewExpanded =
        y < scrollDownThreshold || y < scrollUpStartedAt.current - scrollUpThreshold

      Animated.spring(animatedOverviewHeight, {
        toValue: isOverviewExpanded ? OVERVIEW_CONTENT_MAX_HEIGHT : 0,
        bounciness: 0,
        speed: 2.8,
        overshootClamping: true,
        useNativeDriver: !isWeb
      }).start()
    },
    [animatedOverviewHeight, dashboardOverviewSize.height, lastOffsetY, scrollUpStartedAt]
  )

  const handleGasTankButtonPosition = useCallback(
    (bPosition: { x: number; y: number; width: number; height: number } | null) => {
      if (bPosition) {
        setGasTankButtonPosition(bPosition)
      }
    },
    []
  )

  const handleCongratsModalBtnPressed = useCallback(() => {
    dispatch({
      type: 'SELECTED_ACCOUNT_CONTROLLER_UPDATE_CASHBACK_STATUS',
      params: 'seen-cashback'
    })
  }, [dispatch])

  return (
    <>
      <ReceiveModal modalRef={receiveModalRef} handleClose={closeReceiveModal} />
      <GasTankModal
        modalRef={gasTankModalRef}
        handleClose={closeGasTankModal}
        portfolio={portfolio}
        account={account}
      />

      <PendingActionWindowModal />
      <View style={styles.container}>
        <View style={[flexbox.flex1, spacings.ptSm]}>
          <DashboardOverview
            openReceiveModal={openReceiveModal}
            openGasTankModal={openGasTankModal}
            animatedOverviewHeight={animatedOverviewHeight}
            dashboardOverviewSize={debouncedDashboardOverviewSize}
            setDashboardOverviewSize={setDashboardOverviewSize}
            onGasTankButtonPosition={handleGasTankButtonPosition}
            isPrivateAccountLoading={!isAccountLoaded}
          />
          <DepositStatusBanner onWithdrawBack={onWithdrawBack} onDeposit={onDeposit} />
          <DashboardPages onScroll={onScroll} animatedOverviewHeight={animatedOverviewHeight} />
        </View>
        <DAppFooter />
      </View>
      {hasUnseenFirstCashback && (
        <CongratsFirstCashbackModal
          onPress={handleCongratsModalBtnPressed}
          position={gasTankButtonPosition}
          portfolio={portfolio}
          account={account}
        />
      )}
    </>
  )
}

export default React.memo(DashboardScreen)
