import React, { ReactNode } from 'react'
import { Pressable, StyleProp, TextStyle, View, ViewProps, ViewStyle } from 'react-native'

import LeftArrowIcon from '@common/assets/svg/LeftArrowIcon'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import { WindowSizes } from '@common/hooks/useWindowSize/types'
import spacings, { SPACING_3XL, SPACING_LG, SPACING_XL } from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import text from '@common/styles/utils/text'

import getStyles from './styles'

interface Props extends ViewProps {
  type?: 'default' | 'onboarding'
  title?: string | ReactNode
  spacingsSize?: 'small' | 'large'
  withBackButton?: boolean
  onBackButtonPress?: () => void
  step?: number
  totalSteps?: number
  panelWidth?: number
  panelRef?: React.MutableRefObject<any>
  showProgress?: boolean
  innerStyle?: StyleProp<ViewStyle>
}

export const getPanelPaddings = (
  maxWidthSize: (size: WindowSizes) => boolean,
  spacingsSize: 'small' | 'large' = 'large'
) => {
  return {
    paddingHorizontal: maxWidthSize('xl') && spacingsSize === 'large' ? SPACING_3XL : SPACING_LG,
    paddingVertical: maxWidthSize('xl') && spacingsSize === 'large' ? SPACING_XL : SPACING_LG
  }
}

const PanelBackButton = ({ onPress, style }: { onPress: () => void; style?: ViewStyle }) => {
  const { styles, theme } = useTheme(getStyles)
  return (
    <Pressable testID="panel-back-btn" onPress={onPress} style={[spacings.pvTy, style]}>
      {({ hovered }: any) => (
        <View
          style={[
            styles.backBtnWrapper,
            hovered && { backgroundColor: theme.quaternaryBackground }
          ]}
        >
          <LeftArrowIcon color={hovered ? theme.primaryBackgroundInverted : theme.iconPrimary} />
        </View>
      )}
    </Pressable>
  )
}

const PanelTitle = ({ title, style }: { title: string | ReactNode; style?: TextStyle }) => {
  const { maxWidthSize } = useWindowSize()

  return (
    <Text
      fontSize={maxWidthSize('xl') ? 20 : 18}
      weight="semiBold"
      appearance="primaryText"
      numberOfLines={1}
      style={[text.center, flexbox.flex1, style]}
    >
      {title}
    </Text>
  )
}

const Panel: React.FC<Props> = ({
  type = 'default',
  title,
  children,
  style,
  spacingsSize = 'large',
  withBackButton,
  onBackButtonPress = () => {},
  step = 0,
  totalSteps = 2,
  panelWidth = 400,
  panelRef,
  showProgress = true,
  innerStyle,
  ...rest
}) => {
  const { styles, theme } = useTheme(getStyles)
  const { maxWidthSize, minHeightSize } = useWindowSize()

  const renderProgress = () => (
    <View style={[flexbox.directionRow, { position: 'absolute', top: 0, width: '100%' }]}>
      {[...Array(totalSteps)].map((_, index) => (
        <View
          key={`step-${index.toString()}`}
          style={[
            styles.progress,
            index > 0 ? spacings.mlMi : undefined,
            {
              backgroundColor: index < step ? theme.successDecorative : theme.tertiaryBackground
            }
          ]}
        />
      ))}
    </View>
  )

  if (type === 'onboarding') {
    return (
      <View
        ref={panelRef}
        style={[
          styles.onboardingContainer,
          {
            width: '100%',
            minHeight: minHeightSize(620) ? 444 : 486,
            maxWidth: panelWidth,
            alignSelf: 'center',
            maxHeight: minHeightSize('l') ? '95%' : '92%',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: `${theme.accent.toString()}59`,
            backgroundColor: '#04364D'
          },
          style
        ]}
      >
        {step > 0 && showProgress && renderProgress()}
        <View
          style={[
            styles.innerContainer,
            getPanelPaddings(maxWidthSize, spacingsSize),
            {
              width: '100%',
              maxWidth: panelWidth,
              alignSelf: 'center'
            },
            innerStyle
          ]}
          {...rest}
        >
          {(!!title || !!withBackButton) && (
            <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbMd]}>
              {!!withBackButton && <PanelBackButton onPress={onBackButtonPress} />}
              {!!title && <PanelTitle title={title} />}
              <View style={{ width: 20 }} />
            </View>
          )}
          {children}
        </View>
      </View>
    )
  }

  return (
    <View
      ref={panelRef}
      style={[styles.container, getPanelPaddings(maxWidthSize, spacingsSize), style]}
      {...rest}
    >
      {!!title && (
        <Text
          fontSize={maxWidthSize('xl') ? 20 : 18}
          weight="medium"
          appearance="primaryText"
          style={maxWidthSize('xl') ? spacings.mbXl : spacings.mbMd}
          numberOfLines={1}
        >
          {title}
        </Text>
      )}
      {children}
    </View>
  )
}

export { PanelBackButton, PanelTitle }

export default React.memo(Panel)
