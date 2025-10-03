import { StyleSheet, ViewStyle } from 'react-native'

import { ThemeProps } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'

interface Style {
  container: ViewStyle
}

export const NEUTRAL_BACKGROUND = '#1418333D'
export const NEUTRAL_BACKGROUND_HOVERED = '#14183352'
export const DASHBOARD_OVERVIEW_BACKGROUND = '#353d6e'

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    container: {
      ...flexbox.flex1,
      backgroundColor: theme.primaryBackground
    }
  })

export default getStyles
