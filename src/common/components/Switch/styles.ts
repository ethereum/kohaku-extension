import { THEME_TYPES, ThemeProps, ThemeType } from '@common/styles/themeConfig'
import { StyleSheet } from 'react-native'

export interface SwitchColors {
  trackColorOff: string
  trackColorOn: string
  thumbColor: string
  borderColorOff: string
  borderColorOn: string
}

export const getSwitchColors = (themeType: ThemeType): SwitchColors => ({
  trackColorOff: `${themeType === THEME_TYPES.DARK ? '#097db2' : '#097db2'}14`,
  trackColorOn: `${themeType === THEME_TYPES.DARK ? '#097db2' : '#097db2'}`,
  thumbColor: `${themeType === THEME_TYPES.DARK ? '#F9F6E9' : '#021b26'}b3`,
  borderColorOff: `${themeType === THEME_TYPES.DARK ? '#097db2' : '#097db2'}80`,
  borderColorOn: 'transparent'
})

export const getStyles = (_theme: ThemeProps, themeType: ThemeType, colors: SwitchColors) =>
  StyleSheet.create({
    pressable: {
      alignSelf: 'flex-start'
    },
    track: {
      borderWidth: 1.5,
      justifyContent: 'center',
      overflow: 'hidden'
    },
    thumb: {
      position: 'absolute',
      backgroundColor: colors?.thumbColor,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 4,
      elevation: 4
    }
  })
