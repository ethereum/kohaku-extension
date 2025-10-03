import { StyleSheet, ViewStyle } from 'react-native'

import spacings from '@common/styles/spacings'
import { THEME_TYPES, ThemeProps, ThemeType } from '@common/styles/themeConfig'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'

interface Style {
  footerContainer: ViewStyle
  container: ViewStyle
}

const getStyles = (theme: ThemeProps, themeType: ThemeType) =>
  StyleSheet.create<Style>({
    footerContainer: {
      ...spacings.phSm,
      ...spacings.pbSm,
      width: '100%'
    },
    container: {
      ...flexbox.flex1,
      backgroundColor: theme.secondaryBackground,
      ...spacings.phSm,
      ...spacings.pvSm,
      ...common.borderRadiusPrimary,
      shadowOffset: { width: 0, height: -3 },
      shadowColor: themeType === THEME_TYPES.DARK ? '#00000099' : '#CACDE699',
      shadowRadius: 6
    }
  })

export default getStyles
