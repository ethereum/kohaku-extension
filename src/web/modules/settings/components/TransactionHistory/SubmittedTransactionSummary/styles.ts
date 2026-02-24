import { StyleSheet, ViewStyle } from 'react-native'

import spacings from '@common/styles/spacings'
import { THEME_TYPES, ThemeProps, ThemeType } from '@common/styles/themeConfig'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'

interface Style {
  container: ViewStyle
  summaryItem: ViewStyle
  footer: ViewStyle
  feeColumn: ViewStyle
}

const getStyles = (theme: ThemeProps, themeType: ThemeType) =>
  StyleSheet.create<Style>({
    container: {
      ...common.borderRadiusPrimary,
      borderWidth: themeType === THEME_TYPES.DARK ? 0 : 1,
      borderColor: theme.secondaryBorder,
      backgroundColor: theme.secondaryBackground
    },
    summaryItem: {
      ...spacings.phTy,
      backgroundColor: 'transparent',
      borderWidth: 0
    },
    footer: {
      ...flexbox.directionRow,
      ...flexbox.justifySpaceBetween,
      ...flexbox.flex1,
      ...flexbox.alignCenter,
      borderTopColor: theme.secondaryBorder,
      borderTopWidth: 1,
      ...spacings.pvSm
    },
    feeColumn: {
      width: 100,
      ...spacings.mrMd
    }
  })

export default getStyles
