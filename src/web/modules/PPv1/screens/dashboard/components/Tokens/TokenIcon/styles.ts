import { StyleSheet, ViewStyle } from 'react-native'

import { ThemeProps } from '@common/styles/themeConfig'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'

interface Style {
  withContainerStyle: ViewStyle
  loader: ViewStyle
  networkIconWrapper: ViewStyle
  networkIcon: ViewStyle
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    withContainerStyle: {
      backgroundColor: theme.secondaryBackground,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: BORDER_RADIUS_PRIMARY
    },
    loader: {
      borderRadius: BORDER_RADIUS_PRIMARY
    },
    networkIconWrapper: {
      position: 'absolute',
      backgroundColor: theme.primaryBackground,
      borderRadius: 50
    },
    networkIcon: {
      borderWidth: 0
    }
  })

export default getStyles
