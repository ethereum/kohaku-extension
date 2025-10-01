import { StyleSheet, ViewStyle } from 'react-native'

import flexbox from '@common/styles/utils/flexbox'
import commonWebStyles from '@web/styles/utils/common'

interface Style {
  contentContainer: ViewStyle
  overview: ViewStyle
}

const getStyles = () =>
  StyleSheet.create<Style>({
    contentContainer: commonWebStyles.contentContainer,
    overview: {
      ...flexbox.directionRow,
      ...flexbox.justifySpaceBetween
    }
  })

export default getStyles
