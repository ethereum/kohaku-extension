import { StyleSheet, ViewStyle } from 'react-native'

import { ThemeProps } from '@common/styles/themeConfig'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'

interface Style {
  wrapper: ViewStyle
  pillsContainer: ViewStyle & { gap: number }
  pill: ViewStyle
  pillActive: ViewStyle
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    wrapper: {
      position: 'relative',
      width: 250,
      zIndex: 1001,
      // @ts-ignore - overflow is web only
      overflow: 'visible'
    },
    pillsContainer: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: 4,
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
      backgroundColor: theme.primaryBackground,
      borderRadius: BORDER_RADIUS_PRIMARY,
      borderWidth: 1,
      borderColor: theme.secondaryBorder,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      zIndex: 1002
    },
    pill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: theme.secondaryBackground,
      borderWidth: 1,
      borderColor: theme.secondaryBorder
    },
    pillActive: {
      color: '#000',
      borderColor: '#000'
    }
  })

export default getStyles
