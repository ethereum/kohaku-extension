import { StyleSheet, ViewStyle } from 'react-native'
import { ThemeProps } from '@common/styles/themeConfig'

type Style = {
  container: ViewStyle
  disclaimer: ViewStyle
  disclaimerText: ViewStyle
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    container: {
      paddingBottom: 0
    },
    disclaimer: {
      padding: 2,
      borderRadius: 9,
      backgroundColor: theme.secondaryBackgroundInverted
    },
    disclaimerText: {
      color: theme.primaryTextInverted
    }
  })

export default getStyles
