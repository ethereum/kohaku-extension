import { ViewStyle } from 'react-native'

import { TextWeight } from '@common/components/Text'

type BadgeType = 'info' | 'warning' | 'default' | 'success' | 'error' | 'ok' | 'new' | 'new2'

type SpecialBadgeType = 'metamask'

type Props = {
  text: string
  weight?: TextWeight
  type?: BadgeType
  tooltipText?: string
  style?: ViewStyle
  withRightSpacing?: boolean
  nativeID?: string
  children?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  specialType?: SpecialBadgeType
  testId?: string
}

export type { BadgeType, Props, SpecialBadgeType }
