import { StyleSheet, ViewStyle, TextStyle } from 'react-native'

import flexbox from '@common/styles/utils/flexbox'
import { ThemeProps } from '@common/styles/themeConfig'

interface Style {
  container: ViewStyle
  containerRejected: ViewStyle
  leftContent: ViewStyle
  rightContent: ViewStyle
  iconContainer: ViewStyle
  iconContainerRejected: ViewStyle
  amountContainer: ViewStyle
  tabsContainer: ViewStyle
  tabPill: ViewStyle
  tabPillRejectedActive: ViewStyle
  tabPillPendingActive: ViewStyle
  tabText: TextStyle
  withdrawButton: ViewStyle
  closeIconContainer: ViewStyle
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    container: {
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      ...flexbox.justifySpaceBetween,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.infoBackground,
      borderRadius: 8,
      marginBottom: 12,
      position: 'absolute',
      width: '100%',
      maxWidth: 576,
      bottom: 0,
      left: '50%',
      transform: [{ translateX: '-50%' }, { translateY: 0 }]
    },
    containerRejected: {
      backgroundColor: theme.errorBackground
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
    amountContainer: {
      ...flexbox.flex1,
      minWidth: 0,
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      flexWrap: 'wrap'
    },
    tabsContainer: {
      ...flexbox.directionRow,
      marginRight: 8
    },
    tabPill: {
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: theme.quaternaryBackground,
      marginLeft: 4,
      minWidth: 32
    },
    tabPillRejectedActive: {
      backgroundColor: theme.depositRejectedBackground
    },
    tabPillPendingActive: {
      backgroundColor: theme.infoBackground
    },
    tabText: {
      marginLeft: 4,
      lineHeight: 16
    },
    withdrawButton: {
      paddingHorizontal: 8,
      paddingVertical: 1,
      margin: 0,
      height: 24,
      backgroundColor: theme.depositRejectedBackground
    },
    closeIconContainer: {
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      ...flexbox.justifyCenter,
      borderRadius: 50,
      borderWidth: 1,
      borderColor: theme.depositRejectedText,
      width: 15,
      height: 15,
      padding: 1
    }
  })

export default getStyles
