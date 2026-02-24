import React, { FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { SwapAndBridgeActiveRoute } from '@ambire-common/interfaces/swapAndBridge'
import Button from '@common/components/Button'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import Header from '@common/modules/header/components/Header'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { TabLayoutContainer, TabLayoutWrapperMainContent } from '@web/components/TabLayoutWrapper'
import { getTabLayoutPadding } from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import { getUiType } from '@web/utils/uiType'

const { isActionWindow } = getUiType()

type TrackProgressProps = {
  handleClose: () => void
  onPrimaryButtonPress: () => void
  secondaryButtonText?: string
  children: React.ReactNode
  routeStatus?: SwapAndBridgeActiveRoute['routeStatus']
}

const TrackProgressWrapper: FC<TrackProgressProps> = ({
  handleClose,
  onPrimaryButtonPress,
  secondaryButtonText,
  children,
  routeStatus
}) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { maxWidthSize } = useWindowSize()
  const paddingHorizontalStyle = useMemo(() => getTabLayoutPadding(maxWidthSize), [maxWidthSize])

  return (
    <TabLayoutContainer
      backgroundColor={theme.primaryBackground}
      header={
        <Header
          backgroundColor="primaryBackground"
          displayBackButtonIn="never"
          mode="custom-inner-content"
          withAmbireLogo
        />
      }
      withHorizontalPadding={false}
      footer={null}
      style={{ ...flexbox.alignEnd, ...spacings.pb }}
    >
      <TabLayoutWrapperMainContent
        contentContainerStyle={{ ...spacings.pv0, ...paddingHorizontalStyle, ...flexbox.flex1 }}
        withScroll={false}
      >
        <View style={[flexbox.flex1, flexbox.justifyCenter]}>
          <View
            style={[
              flexbox.alignCenter,
              flexbox.justifyCenter,
              isActionWindow ? {} : flexbox.flex1,
              spacings.pt0
            ]}
          >
            {children}
          </View>

          {!isActionWindow && (
            <View style={{ height: 1, backgroundColor: theme.secondaryBorder, ...spacings.mvLg }} />
          )}

          <View
            style={[
              routeStatus !== 'failed' ? flexbox.directionRow : flexbox.directionRowReverse,
              flexbox.alignCenter,
              !isActionWindow ? flexbox.justifySpaceBetween : flexbox.justifyCenter,
              isActionWindow && spacings.pt2Xl
            ]}
          >
            {!isActionWindow && secondaryButtonText ? (
              <Button
                onPress={handleClose}
                hasBottomSpacing={false}
                type={routeStatus !== 'failed' ? 'secondary' : 'primary'}
                text={secondaryButtonText}
                testID="track-progress-secondary-button"
              />
            ) : (
              <View />
            )}
            <Button
              onPress={onPrimaryButtonPress}
              hasBottomSpacing={false}
              style={{ width: isActionWindow ? 240 : 160 }}
              text={t('Close')}
              type={routeStatus !== 'failed' ? 'primary' : 'secondary'}
              testID="track-progress-primary-button"
            />
          </View>
        </View>
      </TabLayoutWrapperMainContent>
    </TabLayoutContainer>
  )
}

export default TrackProgressWrapper
