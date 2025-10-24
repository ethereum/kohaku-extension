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
    [THEME_TYPES.DARK]: '#FFFFFF',
    [THEME_TYPES.LIGHT]: '#000000'
  },
  primary20: {
    [THEME_TYPES.DARK]: '#FFFFFF20',
    [THEME_TYPES.LIGHT]: '#00000020'
  },
  primaryLight: {
    [THEME_TYPES.DARK]: '#2A2A2A',
    [THEME_TYPES.LIGHT]: '#1A1A1A'
  },
  primaryLight80: {
    [THEME_TYPES.DARK]: '#2A2A2A80',
    [THEME_TYPES.LIGHT]: '#1A1A1A80'
  },
  primaryText: {
    [THEME_TYPES.DARK]: '#FFFFFF',
    [THEME_TYPES.LIGHT]: '#000000'
  },
  primaryTextInverted: {
    [THEME_TYPES.DARK]: '#000000',
    [THEME_TYPES.LIGHT]: '#FFFFFF'
  },
  secondaryText: {
    [THEME_TYPES.DARK]: '#A6A6A7',
    [THEME_TYPES.LIGHT]: '#4A4A4A'
  },
  tertiaryText: {
    [THEME_TYPES.DARK]: '#818181',
    [THEME_TYPES.LIGHT]: '#6B6B6B'
  },
  kohakuAccent: {
    [THEME_TYPES.DARK]: '#F9F6E9',
    [THEME_TYPES.LIGHT]: '#F9F6E9'
  },
  linkText: {
    [THEME_TYPES.DARK]: '#D01C15',
    [THEME_TYPES.LIGHT]: '#D01C15'
  },
  primaryBorder: {
    [THEME_TYPES.DARK]: '#FFFFFF1F',
    [THEME_TYPES.LIGHT]: '#00000030'
  },
  secondaryBorder: {
    [THEME_TYPES.DARK]: '#FFFFFF52',
    [THEME_TYPES.LIGHT]: '#00000050'
  },
  primaryBackground: {
    [THEME_TYPES.DARK]: '#000000',
    [THEME_TYPES.LIGHT]: '#FFFFFF'
  },
  primaryBackgroundInverted: {
    [THEME_TYPES.DARK]: '#FFFFFF',
    [THEME_TYPES.LIGHT]: '#000000'
  },
  secondaryBackground: {
    [THEME_TYPES.DARK]: '#1A1A1A',
    [THEME_TYPES.LIGHT]: '#f1f1f1'
  },
  secondaryBackgroundInverted: {
    [THEME_TYPES.DARK]: '#F9F6E9',
    [THEME_TYPES.LIGHT]: '#1A1A1A'
  },
  tertiaryBackground: {
    [THEME_TYPES.DARK]: '#2A2A2A',
    [THEME_TYPES.LIGHT]: '#9E9E9F'
  },
  quaternaryBackground: {
    [THEME_TYPES.DARK]: '#FFFFFF20',
    [THEME_TYPES.LIGHT]: '#00000010'
  },
  quaternaryBackgroundSolid: {
    [THEME_TYPES.DARK]: '#2A2A2A',
    [THEME_TYPES.LIGHT]: '#FAFAF8'
  },
  quinaryBackground: {
    [THEME_TYPES.DARK]: '#0D0D0D',
    [THEME_TYPES.LIGHT]: '#FCFCFA'
  },
  backdrop: {
    [THEME_TYPES.DARK]: '#00000095',
    [THEME_TYPES.LIGHT]: '#000000CC'
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
    [THEME_TYPES.DARK]: '#D01C15',
    [THEME_TYPES.LIGHT]: '#8B1510'
  },
  infoDecorative: {
    [THEME_TYPES.DARK]: '#D01C15',
    [THEME_TYPES.LIGHT]: '#D01C15'
  },
  infoBackground: {
    [THEME_TYPES.DARK]: '#2a1b1b',
    [THEME_TYPES.LIGHT]: '#FFF5F5'
  },
  // Info 2
  info2Text: {
    [THEME_TYPES.DARK]: '#D01C15',
    [THEME_TYPES.LIGHT]: '#8B1510'
  },
  info2Decorative: {
    [THEME_TYPES.DARK]: '#D01C15',
    [THEME_TYPES.LIGHT]: '#D01C15'
  },
  info2Background: {
    [THEME_TYPES.DARK]: '#D01C151F',
    [THEME_TYPES.LIGHT]: '#D01C1514'
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
    [THEME_TYPES.DARK]: '#D01C15',
    [THEME_TYPES.LIGHT]: '#D01C15'
  },
  featureBackground: {
    [THEME_TYPES.DARK]: '#D01C151F',
    [THEME_TYPES.LIGHT]: '#FFF5F5'
  },
  iconPrimary: {
    [THEME_TYPES.DARK]: '#9E9E9F',
    [THEME_TYPES.LIGHT]: '#4A4A4A'
  },
  iconSecondary: {
    [THEME_TYPES.DARK]: '#9E9E9F',
    [THEME_TYPES.LIGHT]: '#2D2D2D'
  },
  iconPrimary2: {
    [THEME_TYPES.DARK]: '#D01C15',
    [THEME_TYPES.LIGHT]: '#D01C15'
  },
  depositRejectedNotificationBackground: {
    [THEME_TYPES.DARK]: '#FEF2F2',
    [THEME_TYPES.LIGHT]: '#FEF2F2'
  },
  depositRejectedBackground: {
    [THEME_TYPES.DARK]: '#FECACA',
    [THEME_TYPES.LIGHT]: '#FECACA'
  },
  depositRejectedText: {
    [THEME_TYPES.DARK]: '#9b2c2c',
    [THEME_TYPES.LIGHT]: '#9b2c2c'
  },
  depositPendingNotificationBackground: {
    [THEME_TYPES.DARK]: '#EFF6FF',
    [THEME_TYPES.LIGHT]: '#EFF6FF'
  },
  depositPendingBackground: {
    [THEME_TYPES.DARK]: '#bee3f8',
    [THEME_TYPES.LIGHT]: '#bee3f8'
  },
  depositPendingText: {
    [THEME_TYPES.DARK]: '#2c5282',
    [THEME_TYPES.LIGHT]: '#2c5282'
  },
  depositInactiveBackground: {
    [THEME_TYPES.DARK]: '#f7fafc',
    [THEME_TYPES.LIGHT]: '#f7fafc'
  },
  depositInactiveText: {
    [THEME_TYPES.DARK]: '#4a5568',
    [THEME_TYPES.LIGHT]: '#4a5568'
  }
}

export default ThemeColors
