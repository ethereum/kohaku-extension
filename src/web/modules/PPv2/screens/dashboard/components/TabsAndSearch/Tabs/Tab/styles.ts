import { StyleSheet, ViewStyle } from 'react-native'

import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

interface Style {
  toggleItem: ViewStyle
}

const getStyles = () =>
  StyleSheet.create<Style>({
    toggleItem: {
      ...spacings.phMd,
      ...flexbox.alignCenter,
      ...flexbox.justifyCenter,
      borderRadius: 14,
      height: 28
    }
  })

export default getStyles
