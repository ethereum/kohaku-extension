import { StyleSheet, TextStyle, ViewStyle } from 'react-native'

import spacings from '@common/styles/spacings'
import { ThemeProps } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'

interface Style {
  container: ViewStyle
  dot: ViewStyle
  label: TextStyle
  labelHovered: TextStyle
  verifiedContainer: ViewStyle
  verifiedDot: ViewStyle
  unverifiedContainer: ViewStyle
  unverifiedDot: ViewStyle
  mixedContainer: ViewStyle
  mixedDot: ViewStyle
}

const baseContainer: ViewStyle = {
  ...flexbox.directionRow,
  ...flexbox.alignCenter,
  alignSelf: 'flex-start',
  marginTop: 'auto',
  paddingHorizontal: 6,
  paddingVertical: 2,
  borderRadius: 50,
  backgroundColor: 'rgba(0, 0, 0, 0.5)'
}

const baseDot: ViewStyle = {
  width: 6,
  height: 6,
  borderRadius: 3,
  ...spacings.mrTy
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    container: baseContainer,
    dot: baseDot,
    label: {
      color: '#fff'
    },
    labelHovered: {
      textDecorationLine: 'underline'
    },
    verifiedContainer: baseContainer,
    verifiedDot: {
      ...baseDot,
      backgroundColor: theme.successDecorative
    },
    unverifiedContainer: baseContainer,
    unverifiedDot: {
      ...baseDot,
      backgroundColor: theme.warningDecorative
    },
    mixedContainer: baseContainer,
    mixedDot: {
      ...baseDot,
      backgroundColor: theme.secondaryText
    }
  })

export default getStyles
