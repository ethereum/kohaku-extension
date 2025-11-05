import { StyleSheet, ViewStyle, TextStyle } from 'react-native'

import flexbox from '@common/styles/utils/flexbox'
import commonWebStyles from '@web/styles/utils/common'
import { ThemeProps } from '@common/styles/themeConfig'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'

interface Style {
  container: ViewStyle
  contentContainer: ViewStyle
  containerRejected: ViewStyle
  containerPending: ViewStyle
  leftContent: ViewStyle
  rightContent: ViewStyle
  iconContainer: ViewStyle
  iconContainerRejected: ViewStyle
  zeroBalanceContainer: ViewStyle
  amountContainer: ViewStyle
  tabsContainer: ViewStyle
  tabPill: ViewStyle
  tabPillRejectedActive: ViewStyle
  tabPillPendingActive: ViewStyle
  tabText: TextStyle
  withdrawButton: ViewStyle
  depositButton: ViewStyle
  closeIconContainer: ViewStyle
}

const getStyles = (theme: ThemeProps) => ({
  ...StyleSheet.create<Style>({
    contentContainer: commonWebStyles.contentContainer,
    container: {
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      ...flexbox.justifySpaceBetween,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS_PRIMARY,
      marginTop: 6,
      marginBottom: 3
    },
    containerRejected: {
      backgroundColor: theme.depositRejectedNotificationBackground
    },
    containerPending: {
      backgroundColor: theme.depositPendingNotificationBackground
    },
    leftContent: {
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      ...flexbox.flex1,
      minWidth: 0
    },
    rightContent: {
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      marginLeft: 8
    },
    iconContainer: {
      marginRight: 6
    },
    iconContainerRejected: {},
    zeroBalanceContainer: {
      ...flexbox.alignStart,
      flexWrap: 'wrap',
      flexDirection: 'column',
      marginTop: 1,
      minWidth: 0
    },
    amountContainer: {
      ...flexbox.flex1,
      minWidth: 0,
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      flexWrap: 'wrap',
      marginTop: 1
    },
    tabsContainer: {
      ...flexbox.directionRow
    },
    tabPill: {
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: theme.depositInactiveBackground,
      marginLeft: 4,
      minWidth: 32
    },
    tabPillRejectedActive: {
      backgroundColor: theme.depositRejectedBackground
    },
    tabPillPendingActive: {
      backgroundColor: theme.depositPendingBackground
    },
    tabText: {
      marginLeft: 4,
      lineHeight: 16
    },
    withdrawButton: {
      paddingHorizontal: 8,
      paddingVertical: 1,
      margin: 0,
      marginLeft: 8,
      height: 24,
      backgroundColor: theme.depositRejectedBackground
    },
    depositButton: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      margin: 0,
      marginLeft: 8,
      height: 28,
      backgroundColor: theme.depositPendingBackground
    },
    closeIconContainer: {
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      ...flexbox.justifyCenter,
      borderRadius: 50,
      borderWidth: 1,
      borderColor: theme.depositRejectedText,
      width: 16,
      height: 16,
      padding: 1
    }
  }),
  rejectedTooltip: {
    backgroundColor: String(theme.depositRejectedBackground),
    color: String(theme.depositRejectedText)
  },
  rejectedTooltipBorder: `1px solid ${String(theme.depositRejectedText)}`,
  pendingTooltip: {
    backgroundColor: String(theme.depositPendingBackground),
    color: String(theme.depositPendingText)
  },
  pendingTooltipBorder: `1px solid ${String(theme.depositPendingText)}`
})

export default getStyles
