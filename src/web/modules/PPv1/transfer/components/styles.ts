import { StyleSheet, ViewStyle } from 'react-native'

import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

interface Style {
  container: ViewStyle
  topUpContainer: ViewStyle
  tokenSelect: ViewStyle
}

const styles = StyleSheet.create<Style>({
  container: {
    ...flexbox.flex1
  },
  topUpContainer: {
    maxWidth: '100%',
    width: '100%'
  },
  tokenSelect: spacings.mbLg
})

export default styles
