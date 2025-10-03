import React, { useCallback, useRef, useState } from 'react'
import { Animated, NativeScrollEvent, NativeSyntheticEvent, View } from 'react-native'
import { useModalize } from 'react-native-modalize'

import { isWeb } from '@common/config/env'
import useDebounce from '@common/hooks/useDebounce'
import useTheme from '@common/hooks/useTheme'
import PendingActionWindowModal from '@web/modules/PPv1/screens/dashboard/components/PendingActionWindowModal'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import ReceiveModal from '@web/components/ReceiveModal'
import { getUiType } from '@web/utils/uiType'

import DAppFooter from '../components/DAppFooter'
import DashboardOverview from '../components/DashboardOverview'
import DashboardPages from '../components/DashboardPages'
import getStyles from './styles'

const { isPopup } = getUiType()

export const OVERVIEW_CONTENT_MAX_HEIGHT = 120

const DashboardScreen = () => {
  const { styles } = useTheme(getStyles)
  const { ref: receiveModalRef, open: openReceiveModal, close: closeReceiveModal } = useModalize()
  const lastOffsetY = useRef(0)
  const scrollUpStartedAt = useRef(0)
  const [dashboardOverviewSize, setDashboardOverviewSize] = useState({
    width: 0,
    height: 0
  })
  const debouncedDashboardOverviewSize = useDebounce({ value: dashboardOverviewSize, delay: 100 })
  const animatedOverviewHeight = useRef(new Animated.Value(OVERVIEW_CONTENT_MAX_HEIGHT)).current

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

  return (
    <>
      <ReceiveModal modalRef={receiveModalRef} handleClose={closeReceiveModal} />

      <PendingActionWindowModal />
      <View style={styles.container}>
        <View style={[flexbox.flex1, spacings.ptSm]}>
          <DashboardOverview
            openReceiveModal={openReceiveModal}
            animatedOverviewHeight={animatedOverviewHeight}
            dashboardOverviewSize={debouncedDashboardOverviewSize}
            setDashboardOverviewSize={setDashboardOverviewSize}
            onGasTankButtonPosition={() => {}}
          />
          <DashboardPages onScroll={onScroll} animatedOverviewHeight={animatedOverviewHeight} />
        </View>
        <DAppFooter />
      </View>
    </>
  )
}

export default React.memo(DashboardScreen)
