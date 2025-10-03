import { StyleSheet, ViewStyle } from 'react-native'

import spacings from '@common/styles/spacings'
import { THEME_TYPES, ThemeProps, ThemeType } from '@common/styles/themeConfig'
import common, { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import commonWebStyles from '@web/styles/utils/common'

type Style = {
  container: ViewStyle
  searchContainer: ViewStyle
  searchIconWrapper: ViewStyle
  searchInputWrapper: ViewStyle
  borderWrapper: ViewStyle
}

const getStyles = (theme: ThemeProps, themeType: ThemeType) =>
  StyleSheet.create<Style>({
    container: {
      ...commonWebStyles.contentContainer,
      ...flexbox.directionRow,
      ...flexbox.justifySpaceBetween,
      ...flexbox.alignCenter,
      ...spacings.mb,
      zIndex: 1
    },
    searchIconWrapper: {
      ...flexbox.center,
      height: 32,
      width: 32,
      borderRadius: BORDER_RADIUS_PRIMARY,
      borderWidth: themeType === THEME_TYPES.DARK ? 0 : 1,
      borderColor: theme.secondaryBorder,
      backgroundColor: theme.secondaryBackground
    },
    searchContainer: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: 5,
      borderColor: theme.primaryBorder,
      ...common.borderRadiusPrimary,
      ...common.shadowPrimary
    },
    searchInputWrapper: {
      backgroundColor: theme.primaryBackground
    },
    borderWrapper: {
      borderWidth: 0,
      borderRadius: 0
    }
  })

export default getStyles
