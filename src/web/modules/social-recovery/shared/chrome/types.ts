import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

export interface SetupChromeProps {
  /** The screen's view, already keyed and given its props. */
  children: ReactNode
  testID?: string
}

export interface PageTitleProps {
  title: string
  lead?: string
  titleTestID?: string
  /** A trailing link under the lead. */
  children?: ReactNode
  testID?: string
}

export interface SectionLabelProps {
  children: string
  testID?: string
}

export type SectionCardTone = 'plain' | 'muted'

export type SectionCardSpacing = 'block' | 'item' | 'none'

export interface SectionCardProps {
  label?: string
  tone?: SectionCardTone
  spacing?: SectionCardSpacing
  children: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}

export interface ActionsRowProps {
  primary: ReactNode
  secondary?: ReactNode
  note?: string
  noteTestID?: string
  testID?: string
}

export type StatusChipTone = 'default' | 'success' | 'warning' | 'error'

export interface StatusChipProps {
  text: string
  tone?: StatusChipTone
  style?: ViewStyle
  testID?: string
}

export interface RadioCardProps {
  selected: boolean
  onPress: () => void
  disabled?: boolean
  testID: string
  children: ReactNode
}

export interface PillChoiceProps {
  label: string
  selected: boolean
  onPress: () => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  testID: string
}

export interface NoteBoxProps {
  children: string
  testID?: string
}

export interface MethodRowProps {
  children: ReactNode
  /** A lighter border, for rows that only list. */
  quiet?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}
