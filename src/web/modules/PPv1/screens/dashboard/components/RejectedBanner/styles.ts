import { StyleSheet, ViewStyle } from 'react-native'

import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { ThemeProps } from '@common/styles/themeConfig'

interface Style {
  container: ViewStyle
  leftContent: ViewStyle
  rightContent: ViewStyle
  iconContainer: ViewStyle
  textContainer: ViewStyle
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    container: {
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      ...flexbox.justifySpaceBetween,
      ...spacings.phTy,
      ...spacings.pvSm,
      backgroundColor: theme.errorBackground,
      borderTopWidth: 1,
      borderTopColor: theme.errorDecorative,
      minHeight: 80
    },
    leftContent: {
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      ...flexbox.flex1
    },
    rightContent: {
      alignItems: 'flex-end'
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.errorBackground,
      ...flexbox.alignCenter,
      ...flexbox.justifyCenter,
      ...spacings.mrSm
    },
    textContainer: {
      ...flexbox.flex1
    }
  })

export default getStyles
