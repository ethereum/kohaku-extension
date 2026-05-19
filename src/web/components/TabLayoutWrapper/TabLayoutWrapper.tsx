import React, { ReactElement, ReactNode, useMemo } from 'react'
import { ColorValue, ScrollView, StyleProp, View, ViewStyle } from 'react-native'

import ScrollableWrapper, { WrapperProps } from '@common/components/ScrollableWrapper'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import { breakpointsByWindowWidth } from '@common/hooks/useWindowSize/breakpoints'
import { WindowSizes } from '@common/hooks/useWindowSize/types'
import useOnboardingNavigation from '@common/modules/auth/hooks/useOnboardingNavigation'
import spacings, { SPACING_3XL, SPACING_MD } from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { TAB_CONTENT_WIDTH, TAB_WIDE_CONTENT_WIDTH } from '@web/constants/spacings'
import { getUiType } from '@web/utils/uiType'

import getStyles from './styles'

type Width = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full'

const { isTab, isActionWindow } = getUiType()

export const tabLayoutWidths = {
  xs: 420,
  sm: breakpointsByWindowWidth.s,
  md: 830,
  lg: TAB_CONTENT_WIDTH,
  xl: TAB_WIDE_CONTENT_WIDTH,
  full: '100%'
}

type TabLayoutContainerProps = {
  backgroundColor?: ColorValue
  header?: React.ReactNode
  footer?: React.ReactNode
  footerStyle?: ViewStyle
  hideFooterInPopup?: boolean
  width?: Width
  children: ReactElement | ReactElement[] | ReactNode | ReactNode[]
  renderDirectChildren?: () => React.ReactNode
  style?: ViewStyle
  withHorizontalPadding?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

export const getTabLayoutPadding = (maxWidthSize: (size: WindowSizes) => boolean) => {
  if (isTab || isActionWindow) {
    return {
      paddingHorizontal: maxWidthSize('xl') ? SPACING_3XL : SPACING_MD
    }
  }

  return spacings.ph
}

export const TabLayoutContainer = ({
  backgroundColor,
  header,
  footer,
  footerStyle,
  hideFooterInPopup = false,
  width = 'xl',
  children,
  renderDirectChildren,
  style,
  withHorizontalPadding = true,
  containerStyle
}: TabLayoutContainerProps) => {
  const { theme, styles } = useTheme(getStyles)
  const { maxWidthSize } = useWindowSize()
  const isFooterHiddenInPopup = hideFooterInPopup && !isTab

  const paddingHorizontalStyle = useMemo(() => getTabLayoutPadding(maxWidthSize), [maxWidthSize])

  return (
    <View
      style={[
        flexbox.flex1,
        { backgroundColor: backgroundColor || theme.primaryBackground },
        containerStyle
      ]}
    >
      {!!header && header}
      {/* <View style={[flexbox.flex1, withHorizontalPadding && paddingHorizontalStyle]}>
        <View
          style={[
            flexbox.directionRow,
            flexbox.flex1,
            width !== 'full' ? flexbox.alignSelfCenter : {},
            {
              backgroundColor: backgroundColor || theme.primaryBackground,
              maxWidth: tabLayoutWidths[width],
              width: '100%'
            },
            style
          ]}
        >
          {children}
        </View>
      </View> */}
      <ScrollView
        style={[flexbox.flex1, withHorizontalPadding && paddingHorizontalStyle, { width: '100%' }]}
        contentContainerStyle={[
          flexbox.directionRow,
          // flexbox.flexGrow1,
          width !== 'full' ? flexbox.alignSelfCenter : {},
          {
            backgroundColor: backgroundColor || theme.primaryBackground,
            maxWidth: tabLayoutWidths[width],
            width: '100%'
          },
          style
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {!!footer && !isFooterHiddenInPopup && (
        <View style={[styles.footerContainer, paddingHorizontalStyle]}>
          <View
            style={[
              styles.footer,
              {
                // Must be TAB_WIDE_CONTENT_WIDTH for every width except 'full'
                maxWidth: width === 'full' ? '100%' : TAB_WIDE_CONTENT_WIDTH
              },
              footerStyle
            ]}
          >
            {footer}
          </View>
        </View>
      )}
      {renderDirectChildren && renderDirectChildren()}
    </View>
  )
}

interface TabLayoutWrapperMainContentProps extends WrapperProps {
  children: React.ReactNode
  withScroll?: boolean
  wrapperRef?: any
}

export const TabLayoutWrapperMainContent: React.FC<TabLayoutWrapperMainContentProps> = ({
  children,
  wrapperRef,
  contentContainerStyle = {},
  withScroll = true,
  ...rest
}: TabLayoutWrapperMainContentProps) => {
  const { styles } = useTheme(getStyles)
  const { isOnboardingRoute } = useOnboardingNavigation()
  const { minHeightSize } = useWindowSize()

  if (withScroll && !isOnboardingRoute) {
    return (
      <ScrollableWrapper
        contentContainerStyle={[
          styles.contentContainer,
          isOnboardingRoute && (minHeightSize('l') ? spacings.pv0 : spacings.pt2Xl),
          isTab && minHeightSize('m') && spacings.mt0,
          contentContainerStyle
        ]}
        showsVerticalScrollIndicator={false}
        wrapperRef={wrapperRef}
        {...rest}
      >
        {children}
      </ScrollableWrapper>
    )
  }

  return (
    <View
      ref={wrapperRef}
      style={[
        styles.contentContainer,
        isOnboardingRoute && (minHeightSize('l') ? spacings.pv0 : spacings.pt2Xl),
        isTab && minHeightSize('m') && spacings.mt0,
        contentContainerStyle
      ]}
    >
      {children}
    </View>
  )
}
