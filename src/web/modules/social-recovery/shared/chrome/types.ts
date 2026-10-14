import type { ReactNode, RefObject } from 'react'
import type { StyleProp, View, ViewStyle } from 'react-native'
import type { Address } from 'viem'

import type { InputProps } from '@common/components/Input'
import type {
  RecoveryEntryRecord,
  RecoveryRoute
} from '@web/modules/social-recovery/shared/records'

export interface SetupChromeProps {
  /** The screen's view, already keyed and given its props. */
  children: ReactNode
  /** A last breadcrumb step, shown after the settings breadcrumb. */
  breadcrumbTail?: string
  /**
   * Leaves the setup tab's account alone: no latch of the wallet's selected
   * account and no notice when the selection changes.
   */
  skipAccountLatch?: boolean
  testID?: string
}

/** The stage a recovery screen shows on its counter, and the counter's test id. */
export interface RecoveryStage {
  step: number
  testID: string
}

export interface RecoveryChromeProps {
  /** The recovery's route; a screen that does not know it passes null. */
  route: RecoveryRoute | null
  /** The string key of the plain header's words on the fresh install. */
  titleKey: string
  /** The counter on the settings chrome; a screen with none passes nothing. */
  stage?: RecoveryStage
  children: ReactNode
  testID?: string
}

/** A recovery screen's read of its entry record; a present one keeps the account it was read for. */
export type RecoveryEntryReading =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'absent' }
  | { status: 'present'; account: Address; entry: RecoveryEntryRecord }

export interface RecoveryEntryRead {
  reading: RecoveryEntryReading
  /** Reads the entry record again. */
  retry: () => void
}

export interface EntryReadFallbackProps {
  /** The screen's test id prefix: the chrome is `<prefix>-screen`, the states `<prefix>-entry-*`. */
  testPrefix: string
  /** The string keys of the failed read's title and line. */
  titleKey: string
  bodyKey: string
  failed: boolean
  onRetry: () => void
}

export interface ReadFailedBlockProps {
  title: string
  body?: string
  onRetry: () => void
  testID: string
  /** The retry's test id, where it is not the block's own with `-retry` after it. */
  retryTestID?: string
  /** Lines under the body, above the retry. */
  children?: ReactNode
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

export interface PlainHeaderProps {
  /** The words beside the extension's name; a header with none draws the name alone. */
  title?: string
  testID?: string
}

export interface PlainChromeProps {
  /** The header's words, passed on to the plain header. */
  title?: string
  children: ReactNode
  testID?: string
}

export interface StepCounterProps {
  /** The string key of the counter line; the line takes the step and the total. */
  labelKey: string
  step: number
  total: number
  testID?: string
}

export type FieldInputProps = InputProps

export interface SetupAccount {
  /** The account the setup tab works on: the latched one, else the wallet's selected one. */
  account: Address | undefined
  /** Whether the wallet's selected account is now another account. */
  differs: boolean
  /** The wallet's selected account, only while it differs from the tab's account. */
  selected: Address | undefined
  /** Latches the wallet's selected account in place of the tab's account. */
  switchToSelected: () => void
}

/** A location a setup visit settled, as the tab's session storage keeps it. */
export interface VisitedLocation {
  key: string
  pathname: string
}

/** How a location stands to the setup visit: already in it, a new step in it, or the start of a new one. */
export type VisitDecision = 'settled' | 'inside' | 'arrival'

export interface OtherAccountNoticeProps {
  /** The account the setup tab works on. */
  account: Address
  onSwitch: () => void
  testID?: string
}
/**
 * How a path tree's line crosses one node: not at all, from the node's top
 * down to its tick, from its tick down to its bottom, or its whole height.
 */
export type PathTreeSegment = 'none' | 'top' | 'bottom' | 'full'

/**
 * A node of a path tree: a branch the line ticks into, a node the line only
 * passes beside, or a junction that shows the tree's label on the line.
 */
export type PathTreeNodeVariant = 'branch' | 'through' | 'junction'

export interface PathTreeProps {
  /** The tree's nodes, each a `PathTreeNode`, in the order the path reads. */
  children: ReactNode
  /** The word a junction node shows on the line. */
  label?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

export interface PathTreeNodeProps {
  /** A junction shows the tree's label and needs no children. */
  children?: ReactNode
  variant?: PathTreeNodeVariant
  /**
   * How far below the node's top the tick meets the line, for a branch, until
   * a `PathTreeHeader` inside it has been laid out, and for a branch with none.
   */
  anchor?: number
  testID?: string
}

/** What a branch hands the header inside it: itself, and where to report the header's middle. */
export interface PathTreeHeaderTarget {
  node: RefObject<View>
  onMiddle: (middle: number) => void
}

export interface PathTreeHeaderProps {
  /** The part of a branch the tick points at, for example a group's title row. */
  children: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}
