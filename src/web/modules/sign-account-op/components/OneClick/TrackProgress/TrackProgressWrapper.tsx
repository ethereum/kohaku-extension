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
import { TAB_WIDE_CONTENT_WIDTH } from '@web/constants/spacings'
import KohakuLogo from '@common/components/HokahuLogo'
import Text from '@common/components/Text'

const { isActionWindow, isTab } = getUiType()

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
      // backgroundColor={theme.primaryBackground}
      backgroundColor={theme.secondaryBackground}
      // header={
      //   <Header
      //     backgroundColor="primaryBackground"
      //     displayBackButtonIn="never"
      //     mode="custom-inner-content"
      //     withAmbireLogo
      //   />
      // }
      header={
        <Header mode="custom">
          <View
            style={[
              // headerStyles.widthContainer,
              {
                width: '100%',
                marginHorizontal: 'auto',
                ...flexbox.directionRow,
                ...flexbox.alignCenter,
                ...flexbox.flex1,
                maxWidth: TAB_WIDE_CONTENT_WIDTH,
                ...flexbox.justifySpaceBetween
              }
            ]}
          >
            <View
              style={[
                // styles.headerSideContainer,
                flexbox.justifySpaceBetween,
                flexbox.directionRow,
                flexbox.flex1,
                { width: isTab ? 300 : 170, minWidth: isTab ? 300 : 160 }
              ]}
            >
              <View>
                <KohakuLogo width={72} />
              </View>
              <Text fontSize={16} style={{ color: theme.textPrimary }}>
                How does Kohaku work?
              </Text>
              {/* {account && (
                <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                  <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                    <Avatar
                      pfp={account.preferences.pfp}
                      size={32}
                      isSmart={isSmartAccount(account)}
                    />
                    <View style={spacings.mlTy}>
                      <Text fontSize={16} weight="medium" numberOfLines={1}>
                        {account.preferences.label}
                      </Text>
                      <AnimatedPressable
                        style={[flexbox.directionRow, flexbox.alignCenter]}
                        onPress={handleCopyText}
                      >
                        <Text
                          fontSize={14}
                          appearance="secondaryText"
                          weight="medium"
                          style={spacings.mrMi}
                        >
                          {shortenAddress(account.addr, 13)}
                        </Text>
                        <CopyIcon width={16} height={16} />
                      </AnimatedPressable>
                    </View>
                  </View>
                </View>
              )} */}
              {/* <HeaderBackButton forceBack onGoBackPress={handleGoBack} /> */}
            </View>
            {/* <View style={[styles.headerSideContainer, { alignItems: 'flex-end' }]}>
              <HokahuLogo width={72} />
            </View> */}
          </View>
          {/* {title && (
            <View>
              <Text fontSize={isTab ? 24 : 20} weight="medium" style={{textAlign: "center"}}>
                {title}
              </Text>
              {description && (
                <Text fontSize={14} color={theme.muted} style={{textAlign: "center"}}>
                  {description}
                </Text>
              )}
            </View>
          )} */}
        </Header>
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
