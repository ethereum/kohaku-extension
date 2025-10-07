import { StyleSheet, ViewStyle } from 'react-native'

import flexbox from '@common/styles/utils/flexbox'
import commonWebStyles from '@web/styles/utils/common'
import { ThemeProps } from '@common/styles/themeConfig'

interface Style {
  contentContainer: ViewStyle
  overview: ViewStyle
  pillBadge: ViewStyle
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    contentContainer: commonWebStyles.contentContainer,
    overview: {
      ...flexbox.directionRow,
      ...flexbox.justifySpaceBetween
    },
    pillBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 20,
      backgroundColor: theme.primaryBackgroundInverted
    }
  })

export default getStyles
