import { ColorValue } from 'react-native'

// eslint-disable-next-line @typescript-eslint/naming-convention
export enum THEME_TYPES {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system'
}

export type ThemeType = THEME_TYPES.LIGHT | THEME_TYPES.DARK | THEME_TYPES.SYSTEM

export const DEFAULT_THEME = THEME_TYPES.LIGHT

export type ThemeProps = {
  [key in keyof typeof ThemeColors]: ColorValue
}

const ThemeColors = {
  primary: {
    [THEME_TYPES.DARK]: '#39F7EF',
    [THEME_TYPES.LIGHT]: '#6000FF'
  },
  primary20: {
    [THEME_TYPES.DARK]: '#39F7EF20',
    [THEME_TYPES.LIGHT]: '#6000FF20'
  },
  primaryLight: {
    [THEME_TYPES.DARK]: '#0B3230',
    [THEME_TYPES.LIGHT]: '#8B3DFF'
  },
  primaryLight80: {
    [THEME_TYPES.DARK]: '#AD8FFF80',
    [THEME_TYPES.LIGHT]: '#8B3DFF80'
  },
  primaryText: {
    [THEME_TYPES.DARK]: '#FFFFFF',
    [THEME_TYPES.LIGHT]: '#141833'
  },
  secondaryText: {
    [THEME_TYPES.DARK]: '#A6A6A7',
    [THEME_TYPES.LIGHT]: '#54597A'
  },
  tertiaryText: {
    [THEME_TYPES.DARK]: '#818181',
    [THEME_TYPES.LIGHT]: '#767DAD'
  },
  linkText: {
    [THEME_TYPES.DARK]: '#9D7AFF',
    [THEME_TYPES.LIGHT]: '#6000FF'
  },
  primaryBorder: {
    [THEME_TYPES.DARK]: '#FFFFFF1F',
    [THEME_TYPES.LIGHT]: '#767DAD'
  },
  secondaryBorder: {
    [THEME_TYPES.DARK]: '#FFFFFF52',
    [THEME_TYPES.LIGHT]: '#CACDE6'
  },
  primaryBackground: {
    [THEME_TYPES.DARK]: '#0D0D0F',
    [THEME_TYPES.LIGHT]: '#FFFFFF'
  },
  primaryBackgroundInverted: {
    [THEME_TYPES.DARK]: '#FFFFFF',
    [THEME_TYPES.LIGHT]: '#141833'
  },
  secondaryBackground: {
    [THEME_TYPES.DARK]: '#2A2A2C',
    [THEME_TYPES.LIGHT]: '#F2F3FA'
  },
  secondaryBackgroundInverted: {
    [THEME_TYPES.DARK]: '#F2F3FA',
    [THEME_TYPES.LIGHT]: '#2A2A2C'
  },
  tertiaryBackground: {
    [THEME_TYPES.DARK]: '#202022',
    [THEME_TYPES.LIGHT]: '#E7E9FB'
  },
  quaternaryBackground: {
    [THEME_TYPES.DARK]: '#FFFFFF20',
    [THEME_TYPES.LIGHT]: '#767DAD16'
  },
  quaternaryBackgroundSolid: {
    [THEME_TYPES.DARK]: '#2A2A2C',
    [THEME_TYPES.LIGHT]: '#F4F5F8'
  },
  quinaryBackground: {
    [THEME_TYPES.DARK]: '#0D0D0F',
    [THEME_TYPES.LIGHT]: '#F7F8FC'
  },
  backdrop: {
    [THEME_TYPES.DARK]: '#0D0D0F95',
    [THEME_TYPES.LIGHT]: '#54597ACC'
  },
  // Success
  successText: {
    [THEME_TYPES.DARK]: '#70FF8E',
    [THEME_TYPES.LIGHT]: '#006D3F'
  },
  successDecorative: {
    [THEME_TYPES.DARK]: '#70FF8D',
    [THEME_TYPES.LIGHT]: '#018649'
  },
  successBackground: {
    [THEME_TYPES.DARK]: '#1d2a1f',
    [THEME_TYPES.LIGHT]: '#EBF5F0'
  },
  // Info
  infoText: {
    [THEME_TYPES.DARK]: '#70B4FF',
    [THEME_TYPES.LIGHT]: '#35058E'
  },
  infoDecorative: {
    [THEME_TYPES.DARK]: '#70B4FF',
    [THEME_TYPES.LIGHT]: '#8B3DFF'
  },
  infoBackground: {
    [THEME_TYPES.DARK]: '#1b212b',
    [THEME_TYPES.LIGHT]: '#F6F0FF'
  },
  // Info 2
  info2Text: {
    [THEME_TYPES.DARK]: '#70B4FF',
    [THEME_TYPES.LIGHT]: '#0750A1'
  },
  info2Decorative: {
    [THEME_TYPES.DARK]: '#70B4FF',
    [THEME_TYPES.LIGHT]: '#0079FF'
  },
  info2Background: {
    [THEME_TYPES.DARK]: '#70B4FF1F',
    [THEME_TYPES.LIGHT]: '#0079FF14'
  },
  // Warning
  warningText: {
    [THEME_TYPES.DARK]: '#FFD970',
    [THEME_TYPES.LIGHT]: '#944901'
  },
  warningDecorative: {
    [THEME_TYPES.DARK]: '#FFD970',
    [THEME_TYPES.LIGHT]: '#CA7E04'
  },
  warningDecorative2: {
    [THEME_TYPES.DARK]: '#FBBA27',
    [THEME_TYPES.LIGHT]: '#FBBA27'
  },
  warningBackground: {
    [THEME_TYPES.DARK]: '#29251c',
    [THEME_TYPES.LIGHT]: '#FBF5EB'
  },
  // Error
  errorText: {
    [THEME_TYPES.DARK]: '#FF7089',
    [THEME_TYPES.LIGHT]: '#A10119'
  },
  errorDecorative: {
    [THEME_TYPES.DARK]: '#FF7089',
    [THEME_TYPES.LIGHT]: '#EA0129'
  },
  errorBackground: {
    [THEME_TYPES.DARK]: '#281a1e',
    [THEME_TYPES.LIGHT]: '#FEEBEE'
  },
  featureDecorative: {
    [THEME_TYPES.DARK]: '#70B4FF',
    [THEME_TYPES.LIGHT]: '#3851FF'
  },
  featureBackground: {
    [THEME_TYPES.DARK]: '#70B4FF1F',
    [THEME_TYPES.LIGHT]: '#ECF4FD'
  },
  iconPrimary: {
    [THEME_TYPES.DARK]: '#9E9E9F',
    [THEME_TYPES.LIGHT]: '#54597A'
  },
  iconSecondary: {
    [THEME_TYPES.DARK]: '#9E9E9F',
    [THEME_TYPES.LIGHT]: '#2D314D'
  },
  iconPrimary2: {
    [THEME_TYPES.DARK]: '#6000FF',
    [THEME_TYPES.LIGHT]: '#6000FF'
  },
  depositRejectedBackground: {
    [THEME_TYPES.DARK]: '#FF7089',
    [THEME_TYPES.LIGHT]: '#FECACA'
  },
  depositRejectedText: {
    [THEME_TYPES.DARK]: '#FF7089',
    [THEME_TYPES.LIGHT]: '#9b2c2c'
  }
}

export default ThemeColors
