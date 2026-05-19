import { StyleSheet, ViewStyle } from 'react-native'

import spacings, { SPACING_SM } from '@common/styles/spacings'
import { THEME_TYPES, ThemeProps, ThemeType } from '@common/styles/themeConfig'
import common, { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'

interface Styles {
  container: ViewStyle
  content: ViewStyle
  contentHeader: ViewStyle
  contentBody: ViewStyle
  securityChecksContainer: ViewStyle
}

const getStyles = (theme: ThemeProps, themeType: ThemeType) =>
  StyleSheet.create<Styles>({
    container: {
      // ...flexbox.alignCenter,
      // marginHorizontal: 'auto',
      // ...flexbox.flex1,
      // maxWidth: 422
      width: '100%',
      maxWidth: '480px',
      height: '100%',
      maxHeight: 678,
      backgroundColor: theme.primaryBackground,
      borderRadius: BORDER_RADIUS_PRIMARY,
      overflow: 'hidden',
      shadowColor: themeType === THEME_TYPES.DARK ? '#00000052' : '#6770B3',
      shadowOffset: { width: 0, height: SPACING_SM },
      shadowOpacity: themeType === THEME_TYPES.DARK ? 1 : 0.3,
      shadowRadius: SPACING_SM,
      elevation: SPACING_SM
    },
    content: {
      // ...common.fullWidth,
      // borderRadius: BORDER_RADIUS_PRIMARY,
      // overflow: 'hidden',
      // shadowColor: themeType === THEME_TYPES.DARK ? '#00000052' : '#6770B3',
      // shadowOffset: { width: 0, height: SPACING_SM },
      // shadowOpacity: themeType === THEME_TYPES.DARK ? 1 : 0.3,
      // shadowRadius: SPACING_SM,
      // elevation: SPACING_SM
    },
    contentHeader: {
      ...flexbox.flex1,
      ...flexbox.alignStart
    },
    contentBody: {
      // backgroundColor: theme.primaryBackground,
      // backgroundColor:
      //   themeType === THEME_TYPES.DARK ? theme.tertiaryBackground : theme.primaryBackground
    },
    securityChecksContainer: {
      backgroundColor: theme.primaryBackground,
      // ...common.borderRadiusPrimary,
      ...spacings.phLg,
      ...spacings.pvMd
      // borderWidth: 1,
      // borderColor: theme.secondaryBackground
    }
  })

export default getStyles
