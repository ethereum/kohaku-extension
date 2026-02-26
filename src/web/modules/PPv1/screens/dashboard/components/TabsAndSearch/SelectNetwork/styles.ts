import { StyleSheet, ViewStyle } from 'react-native'

import { ThemeProps } from '@common/styles/themeConfig'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'

interface Style {
  container: ViewStyle
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    container: {
      height: 32,
      width: '100%',
      backgroundColor: theme.secondaryBackground,
      borderRadius: BORDER_RADIUS_PRIMARY,
      borderWidth: 1,
      borderColor: theme.secondaryBorder
    }
  })

export default getStyles
