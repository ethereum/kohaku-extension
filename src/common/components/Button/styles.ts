import { StyleSheet, TextStyle, ViewStyle } from 'react-native'

import { FONT_FAMILIES } from '@common/hooks/useFonts'
import spacings from '@common/styles/spacings'
import { THEME_TYPES, ThemeProps, ThemeType } from '@common/styles/themeConfig'
import commonStyles from '@common/styles/utils/common'
import text from '@common/styles/utils/text'

interface Style {
  buttonContainer: ViewStyle
  buttonText: TextStyle
  buttonTextUnderline: TextStyle

  buttonContainerPrimary: ViewStyle
  buttonContainerSecondary: ViewStyle
  buttonContainerTertiary: ViewStyle
  buttonContainerDanger: ViewStyle
  buttonContainerOutline: ViewStyle
  buttonContainerGhost: ViewStyle

  buttonContainerStylesSizeLarge: ViewStyle
  buttonContainerStylesSizeRegular: ViewStyle
  buttonContainerStylesSizeSmall: ViewStyle
  buttonContainerStylesSizeTiny: ViewStyle

  buttonTextStylesSizeLarge: TextStyle
  buttonTextStylesSizeRegular: TextStyle
  buttonTextStylesSizeSmall: TextStyle
  buttonTextStylesSizeTiny: TextStyle

  disabled: ViewStyle
}

const getStyles = (theme: ThemeProps, themeType: ThemeType) =>
  StyleSheet.create<Style>({
    // Default button container styles
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
      ...commonStyles.borderRadiusPrimary
    },

    buttonText: {
      fontFamily: FONT_FAMILIES.MEDIUM,
      ...text.center
    },

    buttonTextUnderline: {
      textDecorationLine: 'underline'
    },

    // Button container styles by type
    buttonContainerPrimary: {
      borderWidth: 0
    },
    buttonContainerSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      // borderColor: theme.primary
      borderColor: theme.accent
    },
    buttonContainerTertiary: {
      backgroundColor: 'transparent'
    },
    buttonContainerDanger: {
      // borderColor: theme.errorDecorative
      borderColor: 'transparent'
    },
    buttonContainerOutline: {
      borderColor: themeType === THEME_TYPES.DARK ? theme.primary : theme.successDecorative
    },
    buttonContainerGhost: {
      backgroundColor: 'transparent',
      minHeight: 'auto',
      ...spacings.pv0
    },

    // Button sizes (large/regular/small)
    buttonContainerStylesSizeLarge: {
      height: 56,
      ...spacings.pvMi,
      ...spacings.phXl,
      ...spacings.mbSm
    },
    buttonContainerStylesSizeRegular: {
      height: 48,
      ...spacings.pvMi,
      ...spacings.phSm,
      ...spacings.mbSm
    },
    buttonContainerStylesSizeSmall: {
      height: 36,
      ...spacings.pvMi,
      ...spacings.phSm,
      ...spacings.mbTy
    },
    buttonContainerStylesSizeTiny: {
      height: 20,
      ...spacings.pvMi,
      ...spacings.phSm,
      ...spacings.mbTy
    },

    // Button text sizes (regular/small)
    buttonTextStylesSizeRegular: {
      fontSize: 16
    },
    buttonTextStylesSizeLarge: {
      fontSize: 16
    },
    buttonTextStylesSizeSmall: {
      fontSize: 14,
      // On iOS no visual difference, but on Android, it vertically centers better
      lineHeight: 19
    },
    buttonTextStylesSizeTiny: {
      fontSize: 12,
      lineHeight: 19
    },

    // Default button disabled styles
    disabled: {
      opacity: 0.5
    }
  })

export default getStyles
