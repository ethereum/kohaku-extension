import { StyleSheet } from 'react-native'

import spacings from '@common/styles/spacings'
import { ThemeProps } from '@common/styles/themeConfig'
import common from '@common/styles/utils/common'

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create({
    outerContainer: {
      borderWidth: 2,
      borderRadius: 8,
      borderColor: 'transparent'
    },
    outerContainerWarning: {
      borderColor: theme.errorBackground
    },
    container: {
      backgroundColor: theme.secondaryBackground,
      ...common.borderRadiusPrimary,
      ...spacings.pt,
      ...spacings.pr,
      ...spacings.pbSm,
      ...spacings.pl
    },
    containerWarning: {
      borderWidth: 1,
      borderColor: theme.errorDecorative
    }
  })
export default getStyles
