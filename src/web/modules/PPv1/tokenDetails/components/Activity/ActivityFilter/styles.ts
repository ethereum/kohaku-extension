import { StyleSheet, ViewStyle } from 'react-native'

import { ThemeProps } from '@common/styles/themeConfig'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import commonWebStyles from '@web/styles/utils/common'

interface Style {
  container: ViewStyle
  borderWrapper: ViewStyle
  searchInputWrapper: ViewStyle
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    container: {
      ...commonWebStyles.contentContainer,
      ...flexbox.directionRow,
      ...flexbox.justifySpaceBetween,
      ...flexbox.alignCenter,
      ...spacings.mbMi,
      ...spacings.mtTy,
      zIndex: 1000,
      // @ts-ignore - overflow is web only
      overflow: 'visible'
    },
    borderWrapper: {
      borderWidth: 1,
      borderColor: theme.secondaryBorder,
      borderRadius: 8
    },
    searchInputWrapper: {
      backgroundColor: theme.secondaryBackground,
      borderRadius: 8
    }
  })

export default getStyles
