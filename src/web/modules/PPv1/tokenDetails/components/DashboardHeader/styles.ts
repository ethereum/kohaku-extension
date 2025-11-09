import { ImageStyle, StyleSheet, ViewStyle } from 'react-native'

import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { getUiType } from '@web/utils/uiType'

interface Styles {
  accountButton: ViewStyle
  accountButtonRightIcon: ViewStyle
  accountButtonInfo: ViewStyle
  accountButtonInfoIcon: ImageStyle
  accountCopyIcon: ViewStyle
}

const { isTab } = getUiType()

const getStyles = () =>
  StyleSheet.create<Styles>({
    // Account
    accountButton: {
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      height: 40,
      maxWidth: isTab ? 412 : 324,
      ...spacings.phMi,
      ...common.borderRadiusPrimary,
      ...spacings.mrSm
    },
    accountButtonRightIcon: {
      borderColor: 'transparent',
      ...common.borderRadiusPrimary,
      ...spacings.mrTy
    },
    accountButtonInfo: {
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      ...flexbox.flex1,
      ...spacings.mrMi
    },
    accountButtonInfoIcon: { width: 32, height: 32, ...common.borderRadiusPrimary },
    accountCopyIcon: { backgroundColor: 'transparent', borderColor: 'transparent' }
  })

export default getStyles
