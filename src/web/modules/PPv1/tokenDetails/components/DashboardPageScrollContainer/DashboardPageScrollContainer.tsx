import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Dimensions, FlatList, FlatListProps, ViewStyle } from 'react-native'

import { isWeb } from '@common/config/env'
import { OVERVIEW_CONTENT_MAX_HEIGHT } from '@web/modules/PPv1/tokenDetails/screens/DashboardScreen'
import spacings from '@common/styles/spacings'
import commonWebStyles from '@web/styles/utils/common'
import { getUiType } from '@web/utils/uiType'

import useBanners from '../../hooks/useBanners'
import { TabType } from '../TabsAndSearch/Tabs/Tab/Tab'

interface Props extends FlatListProps<any> {
  tab: TabType
  openTab: TabType
  animatedOverviewHeight: Animated.Value
  resetScrollKey?: string
  disableStickyHeader?: boolean
}

// We do this instead of unmounting the component to prevent component rerendering when switching tabs.
const HIDDEN_STYLE: ViewStyle = {
  position: 'absolute',
  opacity: 0,
  display: 'none',
  // @ts-ignore
  pointerEvents: 'none'
}

const SCROLLBAR_TRIGGER_THRESHOLD = 4

const getFlatListStyle = (tab: TabType, openTab: TabType, allBannersLength: number) => [
  spacings.ph0,
  commonWebStyles.contentContainer,
  !allBannersLength && spacings.mtTy,
  openTab !== tab ? HIDDEN_STYLE : { zIndex: 1 }
]

const { isPopup } = getUiType()

const DashboardPageScrollContainer: FC<Props> = ({
  tab,
  openTab,
  animatedOverviewHeight,
  resetScrollKey,
  disableStickyHeader,
  ...rest
}) => {
  const [hasScrollBar, setHasScrollBar] = useState(false)
  const [controllerBanners] = useBanners()
  const flatlistRef = useRef<FlatList | null>(null)

  const style = useMemo(
    () => getFlatListStyle(tab, openTab, controllerBanners.length),
    [controllerBanners.length, openTab, tab]
  )

  const contentContainerStyle = useMemo(() => {
    const popUpPaddingRight = hasScrollBar ? spacings.prTy : spacings.prSm

    return [
      isPopup ? spacings.plSm : {},
      isPopup ? popUpPaddingRight : { paddingRight: 2 },
      controllerBanners.length ? spacings.ptTy : spacings.pt0,
      { flexGrow: 1 }
    ]
  }, [controllerBanners.length, hasScrollBar])

  // Reset scroll position when switching tabs (new)
  useEffect(() => {
    if (!flatlistRef.current) return

    if (openTab === tab) {
      // Scroll to top
      flatlistRef.current?.scrollToOffset({ offset: 0, animated: false })

      // Expand overview
      Animated.spring(animatedOverviewHeight, {
        toValue: OVERVIEW_CONTENT_MAX_HEIGHT,
        bounciness: 0,
        speed: 2.8,
        overshootClamping: true,
        useNativeDriver: !isWeb
      }).start()
    }
  }, [animatedOverviewHeight, openTab, tab])

  // Scroll to top when resetScrollKey changes (e.g., when filter changes)
  useEffect(() => {
    if (!flatlistRef.current || !resetScrollKey) return

    flatlistRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [resetScrollKey])

  const handleContentSizeChange = useCallback((contentWidth: number) => {
    const windowWidth = Dimensions.get('window').width

    if (windowWidth - contentWidth > SCROLLBAR_TRIGGER_THRESHOLD) return

    setHasScrollBar(contentWidth < windowWidth)
  }, [])

  return (
    <FlatList
      ref={flatlistRef}
      style={style}
      contentContainerStyle={contentContainerStyle}
      stickyHeaderIndices={disableStickyHeader ? [] : [0]} // Makes the header sticky (first item at index 0)
      removeClippedSubviews={false} // Disable to fix z-index issues with dropdowns
      bounces={false}
      alwaysBounceVertical={false}
      onContentSizeChange={handleContentSizeChange}
      {...rest}
    />
  )
}

export default DashboardPageScrollContainer
