import { StyleSheet, ViewStyle } from 'react-native'

import spacings from '@common/styles/spacings'
import { THEME_TYPES, ThemeProps, ThemeType } from '@common/styles/themeConfig'
import common from '@common/styles/utils/common'

interface Style {
  container: ViewStyle
  logCard: ViewStyle
  logInputRow: ViewStyle
  statusBadge: ViewStyle
  statusSuccess: ViewStyle
  statusReverted: ViewStyle
  tokenBadge: ViewStyle
  rawDataContainer: ViewStyle
}

const getStyles = (theme: ThemeProps, themeType: ThemeType) =>
  StyleSheet.create<Style>({
    container: {
      ...spacings.ptSm
    },
    logCard: {
      ...common.borderRadiusPrimary,
      ...spacings.ph,
      ...spacings.pvSm,
      ...spacings.mbTy,
      backgroundColor:
        themeType === THEME_TYPES.DARK ? theme.primaryBackground : theme.secondaryBackground,
      borderWidth: themeType === THEME_TYPES.DARK ? 0 : 1,
      borderColor: theme.secondaryBorder
    },
    logInputRow: {
      ...spacings.pvTy
    },
    statusBadge: {
      ...common.borderRadiusPrimary,
      ...spacings.phTy,
      ...spacings.pvMi
    },
    statusSuccess: {
      backgroundColor: 'rgba(22, 163, 74, 0.1)'
    },
    statusReverted: {
      backgroundColor: 'rgba(220, 38, 38, 0.1)'
    },
    tokenBadge: {
      ...common.borderRadiusPrimary,
      ...spacings.phTy,
      ...spacings.pvMi,
      ...spacings.mrMi,
      backgroundColor: theme.tertiaryBackground,
      borderWidth: 1,
      borderColor: theme.secondaryBorder
    },
    rawDataContainer: {
      ...common.borderRadiusPrimary,
      ...spacings.pTy,
      ...spacings.mtTy,
      backgroundColor: theme.tertiaryBackground
    }
  })

export default getStyles
