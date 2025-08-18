import { StyleSheet, ViewStyle } from 'react-native'

import { SPACING, SPACING_XL } from '@common/styles/spacings'
import { ThemeProps } from '@common/styles/themeConfig'
import { BORDER_RADIUS_PRIMARY, BORDER_RADIUS_SECONDARY } from '@common/styles/utils/common'

interface Style {
  modal: ViewStyle
  button: ViewStyle
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    modal: {
      borderRadius: BORDER_RADIUS_SECONDARY,
      paddingTop: SPACING_XL,
      paddingHorizontal: SPACING,
      paddingBottom: SPACING,
      width: 400
    },
    button: {
      borderRadius: BORDER_RADIUS_PRIMARY,
      paddingVertical: SPACING,
      paddingHorizontal: SPACING_XL
    }
  })

export default getStyles
